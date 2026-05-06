'use client';

/**
 * WorkflowMetricsPanel — embedável no /dashboard/bravoflow (aba "Métricas").
 * Mesmas KPIs e tabelas da página standalone /dashboard/bravoflow/metrics,
 * mas sem header próprio (o header é da página pai).
 */

import { useEffect, useState } from 'react';
import {
  Activity, CheckCircle2, XCircle, Clock, Truck, PackageCheck,
  AlertTriangle, RefreshCw, Repeat,
} from 'lucide-react';

interface MetricsData {
  totals: {
    iniciados: number;
    pendentes: number;
    aprovadas: number;
    reprovadas: number;
    canceladas: number;
    em_roteirizacao: number;
    em_retirada: number;
    finalizadas: number;
    replicas: number;
  };
  byForm: Array<{
    formId: string;
    formTitle: string;
    total: number;
    pendentes: number;
    aprovadas: number;
    reprovadas: number;
    finalizadas: number;
  }>;
  byStage: Array<{ stageId: string; count: number }>;
  byStatus: Array<{ status: string; count: number }>;
  recent: Array<{
    id: string;
    formTitle: string;
    solicitante: string;
    status: string;
    motorista: string;
    placa: string;
    replicaCount: number;
    submittedAt: string;
  }>;
  sla: Array<{ stageName: string; avgMinutes: number; transitions: number }>;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:    { label: 'Pendente',         color: '#f59e0b' },
  approved:   { label: 'Aprovada',         color: '#10b981' },
  rejected:   { label: 'Reprovada',        color: '#ef4444' },
  cancelled:  { label: 'Cancelada',        color: '#6b7280' },
  in_routing: { label: 'Em roteirização',  color: '#3b82f6' },
  in_pickup:  { label: 'Em retirada',      color: '#8b5cf6' },
  completed:  { label: 'Finalizada',       color: '#059669' },
  submitted:  { label: 'Submetida',        color: '#64748b' },
};

interface Props {
  workflowId?: string;
}

export default function WorkflowMetricsPanel({ workflowId: _workflowId }: Props) {
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const loadMetrics = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to)   qs.set('to', to);
      const res = await fetch(`/api/dataconnect/workflow-metrics?${qs}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (e) {
      console.error('Erro ao carregar métricas:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const KPI = ({ icon, label, value, color }: any) => (
    <div style={{
      background: '#fff',
      borderRadius: 12,
      padding: '20px',
      boxShadow: '0 1px 3px rgba(0,0,0,.06)',
      border: '1px solid #e5e7eb',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
    }}>
      <div style={{
        width: 48,
        height: 48,
        borderRadius: 10,
        background: `${color}1a`,
        color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#111827', lineHeight: 1.1 }}>{value ?? 0}</div>
      </div>
    </div>
  );

  return (
    <div>
      {/* Filtros */}
      <div style={{
        background: '#fff',
        padding: '1rem 1.25rem',
        borderRadius: 10,
        marginBottom: '1.25rem',
        border: '1px solid #e5e7eb',
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        alignItems: 'flex-end',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>Data inicial</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                 style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>Data final</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                 style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
        </div>
        <button onClick={loadMetrics}
                style={{ padding: '9px 16px', background: '#3b82f6', color: '#fff', border: 'none',
                         borderRadius: 6, fontWeight: 500, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} /> Aplicar / Atualizar
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>Carregando métricas…</div>
      ) : !data ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#ef4444' }}>Não foi possível carregar.</div>
      ) : (
        <>
          {/* KPIs */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 16,
            marginBottom: '1.5rem',
          }}>
            <KPI icon={<Activity size={22} />}      label="Fluxos iniciados"   value={data.totals.iniciados}        color="#3b82f6" />
            <KPI icon={<Clock size={22} />}         label="Pendentes"          value={data.totals.pendentes}        color="#f59e0b" />
            <KPI icon={<CheckCircle2 size={22} />}  label="Aprovadas"          value={data.totals.aprovadas}        color="#10b981" />
            <KPI icon={<XCircle size={22} />}       label="Reprovadas"         value={data.totals.reprovadas}       color="#ef4444" />
            <KPI icon={<Truck size={22} />}         label="Em roteirização"    value={data.totals.em_roteirizacao}  color="#3b82f6" />
            <KPI icon={<PackageCheck size={22} />}  label="Em retirada"        value={data.totals.em_retirada}      color="#8b5cf6" />
            <KPI icon={<CheckCircle2 size={22} />}  label="Finalizadas"        value={data.totals.finalizadas}      color="#059669" />
            <KPI icon={<AlertTriangle size={22} />} label="Canceladas"         value={data.totals.canceladas}       color="#6b7280" />
            <KPI icon={<Repeat size={22} />}        label="Réplicas"           value={data.totals.replicas}         color="#a855f7" />
          </div>

          {/* Por status */}
          <section style={{ background: '#fff', padding: 20, borderRadius: 12, marginBottom: 20, border: '1px solid #e5e7eb' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, color: '#111827' }}>Distribuição por status</h3>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {data.byStatus.map(s => {
                const cfg = STATUS_LABELS[s.status] || { label: s.status, color: '#64748b' };
                return (
                  <div key={s.status} style={{
                    padding: '8px 14px', borderRadius: 8,
                    background: `${cfg.color}15`, color: cfg.color, fontWeight: 600, fontSize: 13,
                    border: `1px solid ${cfg.color}30`,
                  }}>{cfg.label}: <strong>{s.count}</strong></div>
                );
              })}
            </div>
          </section>

          {/* Por formulário */}
          <section style={{ background: '#fff', padding: 20, borderRadius: 12, marginBottom: 20, border: '1px solid #e5e7eb' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, color: '#111827' }}>Por formulário</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                    <th style={{ textAlign: 'left',  padding: 10, color: '#374151', fontWeight: 600 }}>Formulário</th>
                    <th style={{ textAlign: 'right', padding: 10, color: '#374151', fontWeight: 600 }}>Total</th>
                    <th style={{ textAlign: 'right', padding: 10, color: '#f59e0b' }}>Pendentes</th>
                    <th style={{ textAlign: 'right', padding: 10, color: '#10b981' }}>Aprovadas</th>
                    <th style={{ textAlign: 'right', padding: 10, color: '#ef4444' }}>Reprovadas</th>
                    <th style={{ textAlign: 'right', padding: 10, color: '#059669' }}>Finalizadas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byForm.map(f => (
                    <tr key={f.formId} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: 10, color: '#111827', fontWeight: 500 }}>{f.formTitle}</td>
                      <td style={{ padding: 10, textAlign: 'right', fontWeight: 700 }}>{f.total}</td>
                      <td style={{ padding: 10, textAlign: 'right' }}>{f.pendentes}</td>
                      <td style={{ padding: 10, textAlign: 'right' }}>{f.aprovadas}</td>
                      <td style={{ padding: 10, textAlign: 'right' }}>{f.reprovadas}</td>
                      <td style={{ padding: 10, textAlign: 'right' }}>{f.finalizadas}</td>
                    </tr>
                  ))}
                  {data.byForm.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Sem dados.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* SLA */}
          <section style={{ background: '#fff', padding: 20, borderRadius: 12, marginBottom: 20, border: '1px solid #e5e7eb' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, color: '#111827' }}>SLA médio por etapa</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.sla.map(s => {
                const min = s.avgMinutes || 0;
                const isFast   = min <= 60;
                const isMedium = min > 60 && min <= 1440;
                const c = isFast ? '#10b981' : isMedium ? '#f59e0b' : '#ef4444';
                const label = min < 60 ? `${Math.round(min)} min` : `${(min / 60).toFixed(1)} h`;
                return (
                  <div key={s.stageName} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', background: '#f9fafb', borderRadius: 6,
                  }}>
                    <span style={{ fontWeight: 500, color: '#111827' }}>{s.stageName}</span>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span style={{ color: '#6b7280', fontSize: 12 }}>{s.transitions} transições</span>
                      <span style={{ color: c, fontWeight: 700 }}>{label}</span>
                    </div>
                  </div>
                );
              })}
              {data.sla.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>
                  Sem histórico de SLA ainda. Os dados aparecem conforme as transições do workflow forem registradas.
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
