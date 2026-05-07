/**
 * GET /api/instances/stream
 *
 * Server-Sent Events (SSE) — substitui o polling de 60s do frontend.
 *
 * O servidor mantém a conexão aberta e empurra atualizações ao cliente
 * sempre que detectar mudança no conjunto de instâncias workflow-only.
 *
 * Vantagens vs polling cliente:
 *   • UX em tempo real (sub-segundo) ao invés de até 60s de atraso
 *   • Servidor consulta o banco UMA vez por ciclo e multiplexa para N clientes
 *     futuramente (atualmente 1:1 mas a estrutura permite extensão)
 *   • Cliente reconecta automaticamente em caso de desconexão (browser nativo)
 *   • Headers HTTP/2 são reusados — sem overhead de TCP handshake repetido
 *
 * Estratégia de detecção de mudança:
 *   • Snapshot por ciclo: faz a mesma query do GET /api/dataconnect/responses
 *     com workflowOnly=true e gera um hash determinístico das linhas relevantes
 *     (id + status + currentStageId + motorista + boletim + replicaCount)
 *   • Se o hash mudou desde o último ciclo, envia evento `update` com snapshot
 *     completo. Se não, envia apenas `heartbeat` para manter a conexão viva
 *     (proxies derrubam conexões silenciosas após ~60s)
 *
 * Frequência:
 *   • POLL_INTERVAL_MS = 5000 (5s) — balanço entre responsividade e custo DB
 *   • HEARTBEAT_INTERVAL_MS = 25_000 — força keep-alive no proxy
 *   • MAX_DURATION_MS = 240_000 (4min) — abaixo do limit Vercel; cliente
 *     reconecta após esse tempo automaticamente
 *
 * Formato dos eventos (text/event-stream):
 *
 *   event: connected
 *   data: {"clientId":"abc","intervalMs":5000}
 *
 *   event: update
 *   data: { instances: [...], snapshotAt: "2026-..." }
 *
 *   event: heartbeat
 *   data: {"t":1706...}
 *
 *   event: error
 *   data: {"error":"..."}
 *
 * Cliente consome via EventSource:
 *
 *   const es = new EventSource('/api/instances/stream');
 *   es.addEventListener('update', (e) => { ... });
 */

import type { NextRequest } from 'next/server';
import { getPool } from '@/lib/db/postgresql';
import { ensureWorkflowSchema } from '@/lib/db/workflowMigration';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

// Necessário para streaming (Edge runtime não suporta pg, então usa Node)
export const runtime = 'nodejs';
// Sem cache — cada conexão é única
export const dynamic = 'force-dynamic';

// Em produção (Vercel + pool max=3), polling agressivo de 5s satura o pool
// quando vários clientes estão conectados. 15s é o sweet spot entre UX
// "real-time" e custo de DB.
const POLL_INTERVAL_MS      = 15_000;
const HEARTBEAT_INTERVAL_MS = 25_000;
const MAX_DURATION_MS       = 240_000;
// Timeout específico para pegar conexão do pool dentro do SSE.
// Se não pegar em 8s, pula o ciclo silenciosamente (evita 60s de espera).
const POOL_ACQUIRE_TIMEOUT_MS = 8_000;
// Circuit breaker: depois de N erros consecutivos, fecha a stream
// para o cliente reconectar (recupera melhor que ficar em loop ruim).
const MAX_CONSECUTIVE_ERRORS = 5;

interface InstanceRow {
  id: string;
  formTitle: string | null;
  collaboratorUsername: string | null;
  status: string;
  currentStageId: string | null;
  motorista: string | null;
  placa: string | null;
  boletim: string | null;
  replicaCount: number | null;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  setorEntrega: string | null;
  enderecoEntrega: string | null;
  // SLA fields (do recompute periódico)
  slaStatus: string | null;
  slaPredictedMinutes: number | null;
  slaTargetMinutes: number | null;
  slaPercentOfTarget: number | null;
}

/**
 * Pega conexão do pool com timeout próprio.
 * Em vez de esperar 60s do connectionTimeoutMillis, abort em 8s e
 * retorna erro pra o caller pular o ciclo.
 */
async function acquireClientWithTimeout(timeoutMs: number) {
  const pool = getPool();
  return Promise.race<any>([
    pool.connect(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('pool acquire timeout')), timeoutMs)
    ),
  ]);
}

async function fetchSnapshot(): Promise<InstanceRow[]> {
  const client = await acquireClientWithTimeout(POOL_ACQUIRE_TIMEOUT_MS);
  try {
    await ensureWorkflowSchema(client);

    const result = await client.query<InstanceRow>(`
      SELECT
        fr.firebase_id            AS id,
        COALESCE(fr.form_title, df.title, '') AS "formTitle",
        fr.collaborator_username  AS "collaboratorUsername",
        fr.status,
        fr.current_stage_fb_id    AS "currentStageId",
        fr.motorista,
        fr.placa,
        fr.boletim,
        fr.replica_count          AS "replicaCount",
        fr.submitted_at           AS "submittedAt",
        fr.approved_at            AS "approvedAt",
        fr.rejection_reason       AS "rejectionReason",
        fr.setor_entrega          AS "setorEntrega",
        fr.endereco_entrega       AS "enderecoEntrega",
        fr.sla_status             AS "slaStatus",
        fr.sla_predicted_minutes  AS "slaPredictedMinutes",
        fr.sla_target_minutes     AS "slaTargetMinutes",
        CASE
          WHEN fr.sla_target_minutes > 0 AND fr.sla_predicted_minutes IS NOT NULL
          THEN (fr.sla_predicted_minutes / fr.sla_target_minutes * 100)::numeric(10,1)
          ELSE NULL
        END                       AS "slaPercentOfTarget"
      FROM fact_form_response fr
      LEFT JOIN dim_forms df ON df.form_key = fr.form_key
      WHERE fr.deleted_at IS NULL
        AND (
          fr.current_stage_fb_id IS NOT NULL
          OR fr.motorista IS NOT NULL
          OR fr.placa IS NOT NULL
          OR fr.boletim IS NOT NULL
          OR fr.protocolo_cancelamento IS NOT NULL
          OR fr.approved_at IS NOT NULL
          OR fr.rejected_at IS NOT NULL
          OR (df.fields_json IS NOT NULL AND (
                df.fields_json->>'isWorkflowEnabled' = 'true'
                OR (df.fields_json->>'defaultWorkflowId' IS NOT NULL
                    AND df.fields_json->>'defaultWorkflowId' <> '')
              ))
        )
      ORDER BY COALESCE(fr.submitted_at, fr.created_at) DESC
      LIMIT 500
    `);

    return result.rows;
  } finally {
    client.release();
  }
}

function hashSnapshot(rows: InstanceRow[]): string {
  // Hash dos campos que importam — ignora timestamps de leitura
  const sig = rows.map((r) =>
    `${r.id}|${r.status}|${r.currentStageId ?? ''}|${r.motorista ?? ''}|${r.boletim ?? ''}|${r.replicaCount ?? 0}`
  ).join(';');
  return crypto.createHash('sha256').update(sig).digest('hex').slice(0, 16);
}

export async function GET(request: NextRequest) {
  const clientId = crypto.randomBytes(8).toString('hex');
  const startedAt = Date.now();

  logger.info('SSE: client connected', { clientId });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (event: string, data: any) => {
        try {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch (e) {
          // controller pode estar fechado se o cliente desconectou
          logger.debug('SSE: enqueue failed (client likely disconnected)', { clientId });
        }
      };

      // Evento inicial
      send('connected', { clientId, intervalMs: POLL_INTERVAL_MS });

      let lastHash = '';
      let pollTimer: NodeJS.Timeout | null = null;
      let heartbeatTimer: NodeJS.Timeout | null = null;
      let closed = false;
      let consecutiveErrors = 0;

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (pollTimer) clearInterval(pollTimer);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        try {
          controller.close();
        } catch {
          /* já fechado */
        }
        logger.info('SSE: client disconnected', {
          clientId,
          durationMs: Date.now() - startedAt,
        });
      };

      // Detecta desconexão do cliente (request abort)
      request.signal.addEventListener('abort', cleanup);

      // Snapshot inicial — se falhar, NÃO envia error (cliente vê conexão
      // estabelecida mas sem dados; próximo ciclo tenta de novo).
      try {
        const rows = await fetchSnapshot();
        lastHash = hashSnapshot(rows);
        send('update', {
          instances: rows,
          snapshotAt: new Date().toISOString(),
          count: rows.length,
        });
      } catch (e: any) {
        // Não envia evento de erro pro cliente — UX fica sem flash de erro
        // se o pool estiver temporariamente saturado. Loop tenta de novo.
        logger.warn('SSE: initial snapshot failed (will retry)', { clientId, error: e.message });
        consecutiveErrors = 1;
      }

      // Loop de polling com circuit breaker
      pollTimer = setInterval(async () => {
        if (closed) return;
        try {
          const rows = await fetchSnapshot();
          consecutiveErrors = 0;  // reset no sucesso

          const hash = hashSnapshot(rows);
          if (hash !== lastHash) {
            lastHash = hash;
            send('update', {
              instances: rows,
              snapshotAt: new Date().toISOString(),
              count: rows.length,
            });
          }
        } catch (e: any) {
          consecutiveErrors++;
          logger.warn('SSE: poll cycle error', {
            clientId,
            error: e.message,
            consecutiveErrors,
          });

          // Circuit breaker: depois de N erros seguidos, fecha a stream.
          // O EventSource do cliente reconecta automaticamente — mais
          // resiliente que ficar em loop ruim consumindo recursos.
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            logger.error('SSE: circuit breaker open — closing stream', undefined, {
              clientId,
              consecutiveErrors,
            });
            cleanup();
            return;
          }

          // NÃO envia error event para o cliente em erros transitórios
          // (timeout do pool em produção é comum quando muitos clients).
          // O cliente continua mostrando dados antigos até o próximo update.
        }
      }, POLL_INTERVAL_MS);

      // Heartbeat keep-alive (proxies derrubam conexões silenciosas)
      heartbeatTimer = setInterval(() => {
        if (closed) return;
        send('heartbeat', { t: Date.now() });
      }, HEARTBEAT_INTERVAL_MS);

      // Auto-close depois de MAX_DURATION_MS — cliente reconecta sozinho
      setTimeout(cleanup, MAX_DURATION_MS);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':       'text/event-stream',
      'Cache-Control':      'no-cache, no-transform',
      'Connection':         'keep-alive',
      'X-Accel-Buffering':  'no',         // nginx: desabilita buffer
    },
  });
}
