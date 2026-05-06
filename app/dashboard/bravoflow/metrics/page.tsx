'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
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
    currentStageId: string;
    motorista: string;
    placa: string;
    replicaCount: number;
    submittedAt: string;
    rejectionReason?: string;
  }>;
  sla: Array<{ stageName: string; avgMinutes: number; transitions: number }>;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:        { label: 'Pendente',         color: '#f59e0b' },
  approved:       { label: 'Aprovada',         color: '#10b981' },
  rejected:       { label: 'Reprovada',        color: '#ef4444' },
  cancelled:      { label: 'Cancelada',        color: '#6b7280' },
  in_routing:     { label: 'Em roteirização',  color: '#3b82f6' },
  in_pickup:      { label: 'Em retirada',      color: '#8b5cf6' },
  completed:      { label: 'Finalizada',       color: '#059669' },
  submitted:      { label: 'Submetida',        color: '#64748b' },
};

export default function WorkflowMetricsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [formIdFilter, setFormIdFilter] = useState('');

  useEffect(() => {
    if (!authLoading && !user) router.push('/');
  }, [user, authLoading, router]);

  const loadMetrics = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to)   qs.set('to', to);
      if (formIdFilter) qs.set('formId', formIdFilter);
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
    if (user) loadMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (authLoading || !user) return null;

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
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>
          {label}
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#111827', lineHeight: 1.1 }}>
          {value ?? 0}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ padding: '2rem', background: '#f9fafb', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
        padding: '2rem',
        borderRadius: 12,
        marginBottom: '2rem',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Activity size={28} /> Métricas BravoFlow
          </h1>
          <p style={{ margin: '6px 0 0', color: '#cbd5e1', fontSize: 14 }}>
            Acompanhe quantos fluxos iniciaram, status atual e SLA por etapa
          </p>
        </div>
        <button
          onClick={loadMetrics}
          style={{
            background: 'rgba(255,255,255,.1)',
            border: '1px solid rgba(255,255,255,.2)',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: 8,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          <RefreshCw size={16} /> Atualizar
        </button>
      </div>

      {/* Filtros */}
      <div style={{
        background: '#fff',
        padding: '1.25rem',
        borderRadius: 10,
        marginBottom: '1.5rem',
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>Form ID (opcional)</label>
          <input type="text" value={formIdFilter} onChange={(e) => setFormIdFilter(e.target.value)}
                 placeholder="firebase_id do formulário"
                 style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
        </div>
        <button onClick={loadMetrics}
                style={{ padding: '9px 18px', background: '#3b82f6', color: '#fff', border: 'none',
                         borderRadius: 6, fontWeight: 500, cursor: 'pointer', fontSize: 14 }}>
          Aplicar filtros
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
            marginBottom: '2rem',
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
          <section style={{ background: '#fff', padding: 24, borderRadius: 12, marginBottom: 24, border: '1px solid #e5e7eb' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 18, color: '#111827' }}>Distribuição por status</h2>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {data.byStatus.map(s => {
                const cfg = STATUS_LABELS[s.status] || { label: s.status, color: '#64748b' };
                return (
                  <div key={s.status} style={{
                    padding: '10px 16px', borderRadius: 8,
                    background: `${cfg.color}15`, color: cfg.color, fontWeight: 600, fontSize: 14,
                    border: `1px solid ${cfg.color}30`,
                  }}>
                    {cfg.label}: <strong>{s.count}</strong>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Por formulário */}
          <section style={{ background: '#fff', padding: 24, borderRadius: 12, marginBottom: 24, border: '1px solid #e5e7eb' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 18, color: '#111827' }}>Por formulário</h2>
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
          <section style={{ background: '#fff', padding: 24, borderRadius: 12, marginBottom: 24, border: '1px solid #e5e7eb' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 18, color: '#111827' }}>SLA médio por etapa</h2>
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

          {/* Recentes */}
          <section style={{ background: '#fff', padding: 24, borderRadius: 12, border: '1px solid #e5e7eb' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 18, color: '#111827' }}>Últimas instâncias</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                    <th style={{ textAlign: 'left', padding: 10 }}>Formulário</th>
                    <th style={{ textAlign: 'left', padding: 10 }}>Solicitante</th>
                    <th style={{ textAlign: 'left', padding: 10 }}>Status</th>
                    <th style={{ textAlign: 'left', padding: 10 }}>Motorista</th>
                    <th style={{ textAlign: 'left', padding: 10 }}>Placa</th>
                    <th style={{ textAlign: 'right', padding: 10 }}>Réplicas</th>
                    <th style={{ textAlign: 'left', padding: 10 }}>Submetida em</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map(r => {
                    const cfg = STATUS_LABELS[r.status] || { label: r.status, color: '#64748b' };
                    return (
                      <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: 10 }}>{r.formTitle || '—'}</td>
                        <td style={{ padding: 10 }}>{r.solicitante || '—'}</td>
                        <td style={{ padding: 10 }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                            background: `${cfg.color}20`, color: cfg.color,
                          }}>{cfg.label}</span>
                        </td>
                        <td style={{ padding: 10 }}>{r.motorista || '—'}</td>
                        <td style={{ padding: 10 }}>{r.placa || '—'}</td>
                        <td style={{ padding: 10, textAlign: 'right' }}>{r.replicaCount || 0}</td>
                        <td style={{ padding: 10, color: '#6b7280', fontSize: 13 }}>
                          {r.submittedAt ? new Date(r.submittedAt).toLocaleString('pt-BR') : '—'}
                        </td>
                      </tr>
                    );
                  })}
                  {data.recent.length === 0 && (
                    <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Sem instâncias recentes.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
