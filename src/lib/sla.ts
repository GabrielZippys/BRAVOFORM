/**
 * BravoForm — Predictive SLA Engine
 *
 * Diferencial #3 do plano de mercado: aplica predição de breach SLA em BPM
 * industrial. Concorrentes (Pipefy/Kissflow) só fazem comparação reativa
 * ("já estourou ou não"). Aqui é proativo.
 *
 * Modelo simples, sem ML pesado — usa estatísticas do `fact_workflow_history`:
 *
 *   1. Para cada instance ativa (não completed/cancelled/rejected):
 *      • elapsedMinutes = NOW() - submittedAt (ou entered_at da etapa atual)
 *      • baselineMedian = mediana de duração HISTÓRICA dessa etapa (mesmo formId)
 *      • operatorMedian = mediana específica do operador atribuído (se houver)
 *      • predictedTotal = elapsedMinutes + max(baselineMedian, operatorMedian) * factor
 *
 *   2. Compara com SLA configurado na etapa:
 *      • predictedTotal <= 80% do target  → status=ok
 *      • 80%-100%                          → status=at_risk
 *      • 100%-150%                         → status=critical
 *      • > 150%                            → status=breached
 *
 *   3. Se status mudou desde a última avaliação, dispara escalation:
 *      • at_risk → notifica supervisor (e-mail)
 *      • critical → notifica supervisor + cria audit event severity=warn
 *      • breached → audit severity=critical + sugere reatribuição
 *
 * Calibração:
 *   • factor padrão = 1.15 (margem de segurança 15%)
 *   • SUFFICIENT_HISTORY_MIN = 5 (precisa de 5+ eventos passados para predizer;
 *     senão usa apenas o sla_target da etapa como referência)
 *
 * Esse modelo é EXPLICÁVEL e DEPURÁVEL — admins entendem a lógica e podem
 * ajustar thresholds. Ideal pra primeira versão; ML mais sofisticado pode
 * vir depois (gradient boosting sobre features de SKU, hora, dia da semana).
 */

import { logger } from '@/lib/logger';

const SAFETY_FACTOR = 1.15;
const SUFFICIENT_HISTORY_MIN = 5;

export type SlaStatus = 'ok' | 'at_risk' | 'critical' | 'breached' | 'no_target';

export interface SlaPrediction {
  responseId: string;
  status: SlaStatus;
  elapsedMinutes: number;
  predictedMinutes: number;
  targetMinutes: number | null;
  /** Tempo restante até estourar SLA (negativo = já estourou previsto) */
  minutesUntilBreach: number | null;
  /** % do alvo já consumido (ou previsto consumir) */
  percentOfTarget: number;
  /** Razão da predição em texto pt-BR */
  reasoning: string;
  /** Fonte do baseline (history mediana / operatorMedian / target apenas) */
  baselineSource: 'history' | 'operator' | 'target_only' | 'none';
  /** Sugestão de ação (se aplicável) */
  suggestion?: string;
}

interface BuildPredictionInput {
  responseId: string;
  stageId: string | null;
  formKey: number | null;
  status: string;
  motorista?: string | null;
  /** Em que momento entrou na etapa atual */
  stageEnteredAt: Date;
  targetMinutes: number | null;
  warnThreshold: number;
  criticalThreshold: number;
  breachThreshold: number;
}

/**
 * Lê estatísticas históricas da etapa (mediana + qtd. de samples).
 * Usa percentile_disc PostgreSQL — caro, mas o forecast roda async.
 */
async function fetchHistoryStats(
  client: any,
  formKey: number,
  stageNameSnap: string | null,
  motorista: string | null
): Promise<{ baselineMedian: number | null; operatorMedian: number | null; sampleSize: number }> {
  const baselineQuery = `
    SELECT
      percentile_disc(0.5) WITHIN GROUP (ORDER BY wh.duration_minutes)::numeric AS p50,
      COUNT(*)::int AS samples
    FROM fact_workflow_history wh
    JOIN fact_form_response fr ON fr.response_key = wh.response_key
    WHERE fr.form_key = $1
      AND wh.duration_minutes IS NOT NULL
      AND wh.duration_minutes > 0
      AND wh.duration_minutes < 7 * 24 * 60  -- ignora outliers > 7 dias
      ${stageNameSnap ? 'AND wh.stage_name_snap = $2' : ''}
  `;

  const baselineParams = stageNameSnap ? [formKey, stageNameSnap] : [formKey];
  const baselineRes = await client.query(baselineQuery, baselineParams);

  const baselineMedian = baselineRes.rows[0]?.p50 ? Number(baselineRes.rows[0].p50) : null;
  const sampleSize = baselineRes.rows[0]?.samples || 0;

  let operatorMedian: number | null = null;
  if (motorista) {
    const operatorRes = await client.query(
      `
      SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY wh.duration_minutes)::numeric AS p50
      FROM fact_workflow_history wh
      JOIN fact_form_response fr ON fr.response_key = wh.response_key
      WHERE fr.form_key = $1
        AND wh.duration_minutes IS NOT NULL
        AND wh.duration_minutes > 0
        AND wh.performed_by_name = $2
      `,
      [formKey, motorista]
    );
    operatorMedian = operatorRes.rows[0]?.p50 ? Number(operatorRes.rows[0].p50) : null;
  }

  return { baselineMedian, operatorMedian, sampleSize };
}

/**
 * Calcula a predição para uma única instance.
 * Caller deve passar o pool client + dados pré-carregados.
 */
export async function computePrediction(
  client: any,
  input: BuildPredictionInput
): Promise<SlaPrediction> {
  const now = Date.now();
  const elapsedMs = now - input.stageEnteredAt.getTime();
  const elapsedMinutes = Math.max(0, elapsedMs / 60_000);

  // Sem SLA target configurado: retorna no_target (não escala, mas mostra elapsed)
  if (!input.targetMinutes || input.targetMinutes <= 0) {
    return {
      responseId: input.responseId,
      status: 'no_target',
      elapsedMinutes,
      predictedMinutes: elapsedMinutes,
      targetMinutes: null,
      minutesUntilBreach: null,
      percentOfTarget: 0,
      reasoning: 'Etapa sem SLA configurado',
      baselineSource: 'none',
    };
  }

  // Busca estatísticas históricas (best-effort)
  let stats: Awaited<ReturnType<typeof fetchHistoryStats>> = {
    baselineMedian: null,
    operatorMedian: null,
    sampleSize: 0,
  };
  if (input.formKey) {
    try {
      stats = await fetchHistoryStats(client, input.formKey, null, input.motorista || null);
    } catch (e) {
      logger.warn('SLA: failed to fetch history stats', { responseId: input.responseId, error: (e as Error).message });
    }
  }

  // Determina baseline e fonte
  let baseline: number;
  let baselineSource: SlaPrediction['baselineSource'];

  if (stats.operatorMedian && stats.sampleSize >= SUFFICIENT_HISTORY_MIN) {
    baseline = stats.operatorMedian;
    baselineSource = 'operator';
  } else if (stats.baselineMedian && stats.sampleSize >= SUFFICIENT_HISTORY_MIN) {
    baseline = stats.baselineMedian;
    baselineSource = 'history';
  } else {
    baseline = input.targetMinutes;
    baselineSource = 'target_only';
  }

  // Predição = elapsed + (baseline restante esperado * fator de segurança)
  // Se já estamos além do baseline, predição = elapsed * fator
  const remainingExpected = Math.max(0, baseline - elapsedMinutes);
  const predictedMinutes =
    baselineSource === 'target_only'
      ? Math.max(elapsedMinutes, baseline) * SAFETY_FACTOR
      : elapsedMinutes + remainingExpected * SAFETY_FACTOR;

  const percentOfTarget = (predictedMinutes / input.targetMinutes) * 100;
  const minutesUntilBreach = input.targetMinutes - predictedMinutes;

  // Determina status
  let status: SlaStatus;
  if (percentOfTarget < input.warnThreshold) status = 'ok';
  else if (percentOfTarget < input.criticalThreshold) status = 'at_risk';
  else if (percentOfTarget < input.breachThreshold) status = 'critical';
  else status = 'breached';

  // Reasoning legível em pt-BR
  const reasoningParts: string[] = [];
  reasoningParts.push(
    `Em andamento há ${formatMinutes(elapsedMinutes)} de ${formatMinutes(input.targetMinutes)} previstos.`
  );
  if (baselineSource === 'operator') {
    reasoningParts.push(
      `Baseado em ${stats.sampleSize} execuções históricas (mediana do operador "${input.motorista}": ${formatMinutes(stats.operatorMedian!)}).`
    );
  } else if (baselineSource === 'history') {
    reasoningParts.push(
      `Baseado em ${stats.sampleSize} execuções históricas deste formulário (mediana: ${formatMinutes(stats.baselineMedian!)}).`
    );
  } else {
    reasoningParts.push(
      `Histórico insuficiente (${stats.sampleSize} amostras). Predição usa apenas o SLA configurado.`
    );
  }
  reasoningParts.push(`Predição: total ≈ ${formatMinutes(predictedMinutes)} (${percentOfTarget.toFixed(0)}% do alvo).`);

  // Sugestão por status
  let suggestion: string | undefined;
  if (status === 'at_risk') {
    suggestion = `Notifique o operador. Restam ${formatMinutes(Math.max(0, minutesUntilBreach))} antes do estouro previsto.`;
  } else if (status === 'critical') {
    suggestion = baselineSource === 'operator'
      ? `Considere reatribuir para outro operador — ${input.motorista || 'o atual'} está ${(percentOfTarget / 100).toFixed(1)}x mais lento que a mediana histórica.`
      : `Escalonar para o supervisor. Predição indica estouro iminente.`;
  } else if (status === 'breached') {
    suggestion = `Tomar ação imediata. SLA excederá em ${formatMinutes(Math.abs(minutesUntilBreach))}.`;
  }

  return {
    responseId: input.responseId,
    status,
    elapsedMinutes,
    predictedMinutes,
    targetMinutes: input.targetMinutes,
    minutesUntilBreach,
    percentOfTarget,
    reasoning: reasoningParts.join(' '),
    baselineSource,
    suggestion,
  };
}

/** Formata minutos em "Xh Ymin" / "Xmin" / "Xd Yh" */
export function formatMinutes(min: number): string {
  if (!isFinite(min)) return '—';
  const m = Math.round(min);
  if (m < 1) return '<1min';
  if (m < 60) return `${m}min`;
  const hours = Math.floor(m / 60);
  const remMin = m % 60;
  if (hours < 24) return remMin > 0 ? `${hours}h ${remMin}min` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

/** Cor visual + label por status (use no UI) */
export const SLA_STATUS_CONFIG: Record<SlaStatus, { label: string; color: string; bg: string; icon: string }> = {
  ok:        { label: 'No prazo',  color: '#059669', bg: '#D1FAE5', icon: '✓' },
  at_risk:   { label: 'Em risco',  color: '#D97706', bg: '#FEF3C7', icon: '⚠️' },
  critical:  { label: 'Crítico',   color: '#DC2626', bg: '#FEE2E2', icon: '🔥' },
  breached:  { label: 'Estourado', color: '#7F1D1D', bg: '#FECACA', icon: '🚨' },
  no_target: { label: 'Sem SLA',   color: '#6B7280', bg: '#F3F4F6', icon: '–' },
};
