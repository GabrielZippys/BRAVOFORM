'use client';

/**
 * InstanceDetailsModal — abre o detalhamento completo de uma instância de
 * workflow: identidade, histórico de cada etapa, dados operacionais,
 * comentários, motivos de reprovação.
 *
 * Aberto pelo botão "Ver detalhes" nos cards do WorkflowInstancesPanel.
 */

import { useEffect, useState } from 'react';
import {
  X, User, MapPin, Truck, FileText, CheckCircle2, XCircle, AlertCircle,
  Clock, Loader2, ListChecks,
} from 'lucide-react';
import { logger } from '@/lib/logger';

interface HistoryEntry {
  id: number;
  stageName: string;
  actionType: string;
  performedByName: string | null;
  comment: string | null;
  enteredAt: string | null;
  completedAt: string | null;
  durationMinutes: number | null;
}

interface StageSummary {
  id: string;
  name: string;
  description: string;
  stageType: string;
  order: number;
  isCurrent: boolean;
}

interface IdentityInfo {
  label: string;
  table: string;
  searchValue: string;
  data: Record<string, { value: any; label: string }>;
  validatedAt: string | null;
}

interface InstanceDetail {
  id: string;
  formTitle: string;
  status: string;
  submittedAt: string;
  currentStageId: string | null;
  isPublicLink: boolean;
  collaboratorUsername: string;
  identity: IdentityInfo | null;
  operational: {
    motorista: string | null;
    placa: string | null;
    boletim: string | null;
    setorEntrega: string | null;
    enderecoEntrega: string | null;
    diasEntrega: string | null;
    protocoloCancelamento: string | null;
    motivoCancelamento: string | null;
  };
  approval: {
    rejectionReason: string | null;
    rejectedAt: string | null;
    approvedAt: string | null;
  };
  replica: {
    count: number;
    parentResponseId: string | null;
  };
  workflow: { firebase_id: string; name: string; description: string } | null;
  stages: StageSummary[];
  history: HistoryEntry[];
}

const ACTION_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  forward:            { label: 'Avançou',           color: '#3B82F6', icon: ListChecks },
  approved:           { label: 'Aprovou',           color: '#10B981', icon: CheckCircle2 },
  rejected:           { label: 'Reprovou',          color: '#EF4444', icon: XCircle },
  completed:          { label: 'Concluiu',          color: '#059669', icon: CheckCircle2 },
  identity_confirmed: { label: 'Identidade OK',     color: '#8B5CF6', icon: User },
  cancelled:          { label: 'Cancelou',          color: '#6B7280', icon: AlertCircle },
  picked_up:          { label: 'Retirou',           color: '#059669', icon: Truck },
  routed:             { label: 'Roteirizou',        color: '#3B82F6', icon: Truck },
  replicated:         { label: 'Replicou',          color: '#A855F7', icon: ListChecks },
};

interface Props {
  instanceId: string;
  onClose: () => void;
}

export default function InstanceDetailsModal({ instanceId, onClose }: Props) {
  const [data, setData] = useState<InstanceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/dataconnect/instance-detail/${encodeURIComponent(instanceId)}`);
        const j = await r.json();
        if (cancelled) return;
        if (!j.success) {
          setError(j.error || 'Erro ao carregar detalhes');
        } else {
          setData(j.data);
        }
      } catch (e: any) {
        logger.error('Failed to load instance detail', e);
        if (!cancelled) setError('Falha de rede. Tente novamente.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [instanceId]);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15,23,42,0.5)',
        backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '60px 20px',
        zIndex: 100,
        overflowY: 'auto',
      }}
    >
      <div style={{
        background: '#fff',
        width: '100%',
        maxWidth: 820,
        borderRadius: 14,
        boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid #E5E7EB',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #F0F9FF 0%, #FFFFFF 100%)',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}>
              Detalhes da instância
            </h2>
            <code style={{ fontSize: 11, color: '#6B7280' }}>{instanceId}</code>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: 6, borderRadius: 6, color: '#6B7280',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: '#6B7280' }}>
              <Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} />
              <p style={{ marginTop: 12, fontSize: 13 }}>Carregando detalhes…</p>
            </div>
          )}

          {error && (
            <div style={{
              padding: 16, background: '#FEF2F2',
              border: '1px solid #FCA5A5', borderRadius: 8,
              color: '#991B1B', fontSize: 13,
            }}>
              <AlertCircle size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
              {error}
            </div>
          )}

          {data && (
            <>
              {/* Workflow / título */}
              <Section title="Workflow" icon={ListChecks}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#111827' }}>
                  {data.workflow?.name || data.formTitle}
                </h3>
                {data.workflow?.description && (
                  <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6B7280' }}>
                    {data.workflow.description}
                  </p>
                )}
                <Meta items={[
                  ['Status', <StatusBadge status={data.status} />],
                  ['Submetida em', fmtDate(data.submittedAt)],
                  ['Origem', data.isPublicLink ? 'Link público (sem login)' : 'Sistema interno'],
                  data.replica.count > 0 && ['Réplica', `${data.replica.count}ª (parent: ${data.replica.parentResponseId || '—'})`],
                ]} />
              </Section>

              {/* Identidade */}
              {data.identity && (
                <Section title="Identidade do executor" icon={User}>
                  <div style={{
                    padding: 12, background: '#F0F9FF',
                    border: '1px solid #BAE6FD', borderRadius: 8,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <strong style={{ fontSize: 14, color: '#0C4A6E' }}>{data.identity.label}</strong>
                      {data.identity.validatedAt && (
                        <span style={{ fontSize: 11, color: '#0C4A6E', opacity: 0.7 }}>
                          validada em {fmtDate(data.identity.validatedAt)}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#0C4A6E', opacity: 0.8 }}>
                      Tabela: <code>{data.identity.table}</code> · Buscado:{' '}
                      <code>{data.identity.searchValue}</code>
                    </div>
                    {Object.keys(data.identity.data).length > 0 && (
                      <div style={{
                        marginTop: 10, paddingTop: 10,
                        borderTop: '1px solid #BAE6FD',
                        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6,
                      }}>
                        {Object.entries(data.identity.data).map(([k, v]) => (
                          <div key={k} style={{ fontSize: 12 }}>
                            <div style={{ color: '#6B7280', textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.4 }}>
                              {v.label}
                            </div>
                            <div style={{ color: '#111827', fontWeight: 500 }}>{String(v.value ?? '—')}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {/* Dados operacionais */}
              {hasOperational(data.operational) && (
                <Section title="Dados operacionais" icon={Truck}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                    {data.operational.motorista && <KV label="Motorista" value={data.operational.motorista} />}
                    {data.operational.placa && <KV label="Placa" value={data.operational.placa} />}
                    {data.operational.boletim && <KV label="Boletim" value={data.operational.boletim} />}
                    {data.operational.setorEntrega && <KV label="Setor de entrega" value={data.operational.setorEntrega} />}
                    {data.operational.enderecoEntrega && <KV label="Endereço" value={data.operational.enderecoEntrega} />}
                    {data.operational.diasEntrega && <KV label="Dias de entrega" value={data.operational.diasEntrega} />}
                    {data.operational.protocoloCancelamento && <KV label="Protocolo de cancelamento" value={data.operational.protocoloCancelamento} />}
                    {data.operational.motivoCancelamento && <KV label="Motivo do cancelamento" value={data.operational.motivoCancelamento} />}
                  </div>
                </Section>
              )}

              {/* Reprovação */}
              {data.approval.rejectionReason && (
                <Section title="Reprovação" icon={XCircle}>
                  <div style={{
                    padding: 12, background: '#FEF2F2',
                    border: '1px solid #FCA5A5', borderRadius: 8,
                    color: '#991B1B', fontSize: 13,
                  }}>
                    <strong>Motivo:</strong> {data.approval.rejectionReason}
                    {data.approval.rejectedAt && (
                      <div style={{ marginTop: 6, fontSize: 11, opacity: 0.8 }}>
                        em {fmtDate(data.approval.rejectedAt)}
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {/* Stages do workflow */}
              {data.stages.length > 0 && (
                <Section title={`Etapas do workflow (${data.stages.length})`} icon={ListChecks}>
                  <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                    {data.stages.map((s) => (
                      <li
                        key={s.id}
                        style={{
                          display: 'flex',
                          gap: 12,
                          padding: '8px 10px',
                          borderRadius: 6,
                          background: s.isCurrent ? '#EFF6FF' : 'transparent',
                          border: s.isCurrent ? '1px solid #BFDBFE' : '1px solid transparent',
                          marginBottom: 4,
                        }}
                      >
                        <div style={{
                          width: 24, height: 24, borderRadius: '50%',
                          background: s.isCurrent ? '#3B82F6' : '#E5E7EB',
                          color: s.isCurrent ? '#fff' : '#6B7280',
                          fontSize: 12, fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          {s.order}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <strong style={{ fontSize: 13, color: '#111827' }}>{s.name}</strong>
                            <span style={{
                              fontSize: 10, padding: '1px 6px', borderRadius: 4,
                              background: '#F3F4F6', color: '#6B7280',
                              textTransform: 'uppercase', letterSpacing: 0.4,
                            }}>
                              {s.stageType}
                            </span>
                            {s.isCurrent && (
                              <span style={{
                                fontSize: 10, padding: '1px 6px', borderRadius: 4,
                                background: '#3B82F6', color: '#fff', fontWeight: 600,
                                textTransform: 'uppercase', letterSpacing: 0.4,
                              }}>
                                atual
                              </span>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </Section>
              )}

              {/* Histórico */}
              <Section title={`Histórico (${data.history.length})`} icon={Clock}>
                {data.history.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#6B7280', fontStyle: 'italic' }}>
                    Nenhuma transição registrada ainda.
                  </p>
                ) : (
                  <ol style={{ margin: 0, padding: 0, listStyle: 'none', position: 'relative' }}>
                    <div style={{
                      position: 'absolute',
                      left: 11, top: 16, bottom: 16,
                      width: 2, background: '#E5E7EB',
                    }} />
                    {data.history.map((h) => {
                      const cfg = ACTION_LABELS[h.actionType] || { label: h.actionType, color: '#64748B', icon: ListChecks };
                      const Icon = cfg.icon;
                      return (
                        <li
                          key={h.id}
                          style={{
                            position: 'relative',
                            paddingLeft: 36,
                            paddingBottom: 16,
                          }}
                        >
                          <div style={{
                            position: 'absolute',
                            left: 0, top: 0,
                            width: 24, height: 24, borderRadius: '50%',
                            background: cfg.color, color: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: '3px solid #fff', boxShadow: '0 0 0 1px #E5E7EB',
                          }}>
                            <Icon size={12} />
                          </div>
                          <div style={{ paddingTop: 2 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <strong style={{ fontSize: 13, color: '#111827' }}>{h.stageName}</strong>
                              <span style={{
                                fontSize: 10, padding: '2px 6px', borderRadius: 4,
                                background: `${cfg.color}20`, color: cfg.color,
                                fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4,
                              }}>
                                {cfg.label}
                              </span>
                              {h.durationMinutes !== null && h.durationMinutes !== undefined && (
                                <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                                  • {fmtDuration(h.durationMinutes)}
                                </span>
                              )}
                            </div>
                            {h.performedByName && (
                              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                                por <strong>{h.performedByName}</strong>
                              </div>
                            )}
                            {h.comment && (
                              <div style={{
                                marginTop: 6, padding: '8px 10px',
                                background: '#F9FAFB', borderRadius: 6,
                                fontSize: 12, color: '#374151',
                                whiteSpace: 'pre-wrap',
                                border: '1px solid #E5E7EB',
                              }}>
                                {h.comment}
                              </div>
                            )}
                            <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                              {fmtDate(h.completedAt || h.enteredAt)}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </Section>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

function Section({
  title, icon: Icon, children,
}: {
  title: string;
  icon: any;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 22 }}>
      <h4 style={{
        display: 'flex', alignItems: 'center', gap: 8,
        margin: '0 0 10px', fontSize: 12, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: 0.6, color: '#374151',
      }}>
        <Icon size={14} />
        {title}
      </h4>
      {children}
    </section>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{
        fontSize: 10, color: '#6B7280',
        textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: '#111827', fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function Meta({ items }: { items: Array<[string, React.ReactNode] | false | undefined> }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
      gap: 10, marginTop: 10,
    }}>
      {items.filter(Boolean).map(([k, v], i) => (
        <div key={i}>
          <div style={{
            fontSize: 10, color: '#6B7280',
            textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2,
          }}>
            {k as string}
          </div>
          <div style={{ fontSize: 13, color: '#111827' }}>{v as React.ReactNode}</div>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; color: string }> = {
    pending:     { label: 'Aguardando', color: '#F59E0B' },
    in_progress: { label: 'Em andamento', color: '#3B82F6' },
    approved:    { label: 'Aprovada',   color: '#10B981' },
    rejected:    { label: 'Reprovada',  color: '#EF4444' },
    completed:   { label: 'Finalizada', color: '#059669' },
    cancelled:   { label: 'Cancelada',  color: '#6B7280' },
    in_routing:  { label: 'Em roteirização', color: '#3B82F6' },
    in_pickup:   { label: 'Em retirada', color: '#8B5CF6' },
  };
  const c = cfg[status] || { label: status, color: '#64748B' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 10px', borderRadius: 999,
      fontSize: 11, fontWeight: 600,
      background: `${c.color}20`, color: c.color,
    }}>
      {c.label}
    </span>
  );
}

function hasOperational(o: InstanceDetail['operational']) {
  return Object.values(o).some((v) => v !== null && v !== '');
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('pt-BR'); } catch { return String(d); }
}

function fmtDuration(min: number) {
  if (min < 1) return '< 1 min';
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}
