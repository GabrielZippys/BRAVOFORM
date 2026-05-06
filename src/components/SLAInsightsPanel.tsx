'use client';

/**
 * SLAInsightsPanel
 *
 * Painel preditivo que mostra instâncias em risco de estourar SLA,
 * com sugestões de ação (reatribuir, escalar, etc.).
 *
 * Usado como aba dentro de /dashboard/bravoflow/metrics ou como modal
 * acionado pelo WorkflowInstancesPanel.
 *
 * Atualiza a cada 30s via polling (não usa SSE para não duplicar
 * conexões — predições são leves, polling é suficiente).
 *
 * Diferencial competitivo: nenhum BPM brasileiro tem isso. Pipefy mostra
 * "atrasado" reativo, aqui é preditivo (avisa ANTES de estourar).
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  AlertTriangle, AlertCircle, CheckCircle2, Clock, RefreshCw,
  TrendingUp, Zap, User, Lightbulb,
} from 'lucide-react';
import { logger } from '@/lib/logger';

interface SlaPrediction {
  responseId: string;
  status: 'ok' | 'at_risk' | 'critical' | 'breached' | 'no_target';
  elapsedMinutes: number;
  predictedMinutes: number;
  targetMinutes: number | null;
  minutesUntilBreach: number | null;
  percentOfTarget: number;
  reasoning: string;
  baselineSource: 'history' | 'operator' | 'target_only' | 'none';
  suggestion?: string;
}

interface ForecastSummary {
  total: number;
  ok: number;
  at_risk: number;
  critical: number;
  breached: number;
  no_target: number;
}

const STATUS_CONFIG = {
  ok:        { label: 'No prazo',  color: '#059669', bg: '#D1FAE5', icon: CheckCircle2 },
  at_risk:   { label: 'Em risco',  color: '#D97706', bg: '#FEF3C7', icon: AlertTriangle },
  critical:  { label: 'Crítico',   color: '#DC2626', bg: '#FEE2E2', icon: AlertCircle },
  breached:  { label: 'Estourado', color: '#7F1D1D', bg: '#FECACA', icon: Zap },
  no_target: { label: 'Sem SLA',   color: '#6B7280', bg: '#F3F4F6', icon: Clock },
} as const;

function formatMinutes(min: number): string {
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

interface Props {
  /** Atualizar a cada N ms (default 30s) */
  refreshIntervalMs?: number;
}

export default function SLAInsightsPanel({ refreshIntervalMs = 30_000 }: Props) {
  const [predictions, setPredictions] = useState<SlaPrediction[]>([]);
  const [summary, setSummary] = useState<ForecastSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [recomputing, setRecomputing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    try {
      const res = await fetch('/api/sla/forecast?status=at_risk,critical,breached');
      const json = await res.json();
      if (json.success) {
        setPredictions(json.data || []);
        setSummary(json.summary);
        setGeneratedAt(json.generatedAt);
      } else {
        logger.warn('SLA forecast failed', { error: json.error });
      }
    } catch (e) {
      logger.error('Falha ao carregar SLA forecast', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), refreshIntervalMs);
    return () => clearInterval(t);
  }, [load, refreshIntervalMs]);

  const handleRecompute = async () => {
    setRecomputing(true);
    try {
      const res = await fetch('/api/sla/forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (json.success) {
        await load();
      }
    } catch (e) {
      logger.error('Recompute failed', e);
    } finally {
      setRecomputing(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: 'var(--font-size-xl)',
              fontWeight: 'var(--font-weight-bold)',
              color: 'var(--color-text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
            }}
          >
            <TrendingUp size={22} color="var(--color-brand-500)" />
            Predictive SLA
          </h2>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-secondary)',
            }}
          >
            Previsão de estouro baseada no histórico de execução
            {generatedAt && (
              <>
                {' '}· atualizado {new Date(generatedAt).toLocaleTimeString('pt-BR')}
              </>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button
            onClick={handleRecompute}
            disabled={recomputing}
            style={{
              padding: 'var(--space-2) var(--space-3)',
              background: 'var(--color-brand-500)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 'var(--font-weight-semibold)',
              cursor: recomputing ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              opacity: recomputing ? 0.6 : 1,
            }}
            title="Recalcula predições e dispara escalations"
          >
            {recomputing ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={14} />}
            {recomputing ? 'Recalculando…' : 'Recalcular tudo'}
          </button>
          <button
            onClick={() => load()}
            disabled={refreshing}
            style={{
              padding: 'var(--space-2) var(--space-3)',
              background: 'var(--surface-card)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--font-size-sm)',
              cursor: refreshing ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
            }}
          >
            <RefreshCw size={14} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
            Atualizar
          </button>
        </div>
      </header>

      {/* Summary cards */}
      {summary && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 'var(--space-3)',
          }}
        >
          <SummaryCard label="Total ativas" value={summary.total} color="var(--color-text-primary)" bg="var(--surface-card)" />
          <SummaryCard label="No prazo"     value={summary.ok}        color="var(--color-success-700)" bg="var(--color-success-50)" />
          <SummaryCard label="Em risco"     value={summary.at_risk}   color="var(--color-warning-700)" bg="var(--color-warning-50)" />
          <SummaryCard label="Crítico"      value={summary.critical}  color="var(--color-danger-700)"  bg="var(--color-danger-50)"  />
          <SummaryCard label="Estourado"    value={summary.breached}  color="#7F1D1D"                  bg="#FECACA"                 />
        </div>
      )}

      {/* Lista de predictions em risco */}
      {loading ? (
        <div
          style={{
            background: 'var(--surface-card)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-8)',
            textAlign: 'center',
            color: 'var(--color-text-tertiary)',
          }}
        >
          Carregando predições…
        </div>
      ) : predictions.length === 0 ? (
        <div
          style={{
            background: 'var(--color-success-50)',
            border: '1px solid var(--color-success-100)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-8)',
            textAlign: 'center',
            color: 'var(--color-success-700)',
          }}
        >
          <CheckCircle2 size={32} />
          <h3 style={{ margin: 'var(--space-3) 0 var(--space-1)', fontSize: 'var(--font-size-base)' }}>
            Tudo no prazo
          </h3>
          <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-success-700)' }}>
            Nenhuma instância em risco de estouro de SLA neste momento.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {predictions.map((p) => (
            <PredictionRow key={p.responseId} prediction={p} />
          ))}
        </div>
      )}

      <style jsx>{`@keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── SummaryCard ────────────────────────────────────────────────────────
function SummaryCard({
  label, value, color, bg,
}: {
  label: string;
  value: number;
  color: string;
  bg: string;
}) {
  return (
    <div
      style={{
        background: bg,
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-3) var(--space-4)',
      }}
    >
      <div
        style={{
          fontSize: 'var(--font-size-xs)',
          color: 'var(--color-text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          fontWeight: 'var(--font-weight-medium)',
        }}
      >
        {label}
      </div>
      <div style={{ marginTop: 4, fontSize: 'var(--font-size-2xl)', fontWeight: 'var(--font-weight-bold)', color }}>
        {value}
      </div>
    </div>
  );
}

// ─── PredictionRow ──────────────────────────────────────────────────────
function PredictionRow({ prediction }: { prediction: SlaPrediction }) {
  const cfg = STATUS_CONFIG[prediction.status];
  const Icon = cfg.icon;

  // Barra de progresso visual com gradient by percentage
  const pct = Math.min(100, Math.max(0, prediction.percentOfTarget));

  return (
    <div
      style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--color-border-subtle)',
        borderLeft: `4px solid ${cfg.color}`,
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)',
      }}
    >
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 'var(--radius-md)',
            background: cfg.bg,
            color: cfg.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon size={18} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 'var(--space-2)',
              flexWrap: 'wrap',
            }}
          >
            <strong style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
              {prediction.responseId.slice(0, 12)}…
            </strong>
            <span
              style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                background: cfg.bg,
                color: cfg.color,
                fontWeight: 'var(--font-weight-bold)',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              {cfg.label}
            </span>
            <span
              style={{
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-tertiary)',
              }}
            >
              {pct.toFixed(0)}% do alvo
            </span>
          </div>

          {/* Barra visual */}
          <div
            style={{
              marginTop: 'var(--space-2)',
              height: 6,
              background: 'var(--color-gray-200)',
              borderRadius: 'var(--radius-full)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, pct)}%`,
                background: cfg.color,
                borderRadius: 'var(--radius-full)',
                transition: 'width var(--duration-base) var(--ease-out)',
              }}
            />
          </div>

          {/* Detalhes técnicos */}
          <div
            style={{
              marginTop: 'var(--space-2)',
              display: 'flex',
              gap: 'var(--space-4)',
              flexWrap: 'wrap',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <span>
              <Clock size={11} style={{ verticalAlign: 'middle' }} />{' '}
              <strong>Decorrido:</strong> {formatMinutes(prediction.elapsedMinutes)}
            </span>
            {prediction.targetMinutes && (
              <span>
                <strong>Alvo:</strong> {formatMinutes(prediction.targetMinutes)}
              </span>
            )}
            <span>
              <strong>Predição:</strong> {formatMinutes(prediction.predictedMinutes)}
            </span>
            {prediction.minutesUntilBreach !== null && (
              <span style={{ color: prediction.minutesUntilBreach < 0 ? cfg.color : 'inherit', fontWeight: prediction.minutesUntilBreach < 0 ? 600 : 400 }}>
                <strong>{prediction.minutesUntilBreach < 0 ? 'Excedeu em:' : 'Resta:'}</strong>{' '}
                {formatMinutes(Math.abs(prediction.minutesUntilBreach))}
              </span>
            )}
          </div>

          {/* Reasoning (colapsável visualmente) */}
          <p
            style={{
              margin: 'var(--space-2) 0 0',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-tertiary)',
              lineHeight: 'var(--line-height-relaxed)',
              fontStyle: 'italic',
            }}
          >
            {prediction.reasoning}
          </p>

          {/* Suggestion box */}
          {prediction.suggestion && (
            <div
              style={{
                marginTop: 'var(--space-3)',
                padding: 'var(--space-3)',
                background: 'var(--color-info-50)',
                border: '1px solid var(--color-info-100)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                gap: 'var(--space-2)',
                alignItems: 'flex-start',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-info-700)',
              }}
            >
              <Lightbulb size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>Sugestão:</strong> {prediction.suggestion}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
