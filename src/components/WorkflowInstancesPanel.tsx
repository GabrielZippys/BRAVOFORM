'use client';

/**
 * WorkflowInstancesPanel — fila de execução de instâncias.
 *
 * Embedável em /dashboard/bravoflow (aba "Instâncias"). Substitui a página
 * standalone /dashboard/retiradas — agora tudo de workflow vive dentro do
 * BravoFlow.
 *
 * Mostra todas as respostas (instances) com status workflow-relevante e
 * permite ações contextuais por papel (aprovar, reprovar, roteirizar,
 * marcar retirado, cancelar). Auto-refresh a cada 60s.
 */

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Truck, CheckCircle2, XCircle, AlertCircle, RefreshCw, Filter,
  PackageCheck, Printer, User, Clock, Wifi, WifiOff,
} from 'lucide-react';
import RetiradaActionModal from './RetiradaActionModal';
import { SkeletonList } from './Skeleton';
import BulkActionsBar from './BulkActionsBar';
import { logger } from '@/lib/logger';
import { useInstancesStream, StreamStatus } from '@/hooks/useInstancesStream';
import { useAuth } from '@/hooks/useAuth';

interface Instance {
  id: string;
  formTitle: string;
  solicitante: string;
  status: string;
  currentStageId?: string;
  motorista?: string;
  placa?: string;
  setorEntrega?: string;
  enderecoEntrega?: string;
  diasEntrega?: string;
  boletim?: string;
  protocoloCancelamento?: string;
  motivoCancelamento?: string;
  replicaCount?: number;
  parentResponseId?: string;
  submittedAt: string;
  approvedAt?: string;
  rejectionReason?: string;
  // SLA preditivo
  slaStatus?: 'ok' | 'at_risk' | 'critical' | 'breached' | 'no_target' | null;
  slaPercentOfTarget?: number | null;
  slaTargetMinutes?: number | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending:    { label: 'Aguardando aprovação', color: '#f59e0b', icon: Clock },
  approved:   { label: 'Aprovada',             color: '#10b981', icon: CheckCircle2 },
  rejected:   { label: 'Reprovada',            color: '#ef4444', icon: XCircle },
  in_routing: { label: 'Em roteirização',      color: '#3b82f6', icon: Truck },
  in_pickup:  { label: 'Em retirada',          color: '#8b5cf6', icon: PackageCheck },
  completed:  { label: 'Finalizada',           color: '#059669', icon: CheckCircle2 },
  cancelled:  { label: 'Cancelada',            color: '#6b7280', icon: AlertCircle },
};

interface Props {
  /**
   * Quando definido, filtra apenas instâncias do workflow especificado.
   * Útil quando este painel é embedado dentro do detalhe de um workflow.
   */
  workflowId?: string;
}

export default function WorkflowInstancesPanel({ workflowId: _workflowId }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionModal, setActionModal] = useState<{
    open: boolean;
    action: 'approve' | 'reject' | 'route' | 'pickup' | 'cancel' | null;
    instance: Instance | null;
  }>({ open: false, action: null, instance: null });

  // ─── Stream em tempo real (SSE) com fallback automático ────────────────
  const { instances: streamInstances, status: streamStatus, lastUpdate, reconnect } =
    useInstancesStream();

  // Mapeia o formato do stream para o Instance esperado pelo componente
  const instances: Instance[] = useMemo(
    () =>
      streamInstances.map((r) => ({
        id: r.id,
        formTitle: r.formTitle || '',
        solicitante: r.collaboratorUsername || '',
        status: r.status,
        currentStageId: r.currentStageId || undefined,
        motorista: r.motorista || undefined,
        placa: r.placa || undefined,
        setorEntrega: r.setorEntrega || undefined,
        enderecoEntrega: r.enderecoEntrega || undefined,
        boletim: r.boletim || undefined,
        replicaCount: r.replicaCount || 0,
        submittedAt: r.submittedAt || '',
        approvedAt: r.approvedAt || undefined,
        rejectionReason: r.rejectionReason || undefined,
        slaStatus: r.slaStatus || undefined,
        slaPercentOfTarget: r.slaPercentOfTarget || undefined,
        slaTargetMinutes: r.slaTargetMinutes || undefined,
      })),
    [streamInstances]
  );

  // Loading: enquanto não recebemos primeiro snapshot
  const loading = streamStatus === 'connecting' && instances.length === 0;

  const filtered = instances.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      const hay = [r.formTitle, r.solicitante, r.motorista, r.placa].join(' ').toLowerCase();
      if (!hay.includes(t)) return false;
    }
    return true;
  });

  const openAction = (action: typeof actionModal.action, instance: Instance) => {
    setActionModal({ open: true, action, instance });
  };

  const closeAction = (refresh = false) => {
    setActionModal({ open: false, action: null, instance: null });
    // SSE refresca automaticamente — apenas força reconexão se solicitado
    if (refresh) reconnect();
  };

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
        alignItems: 'center',
      }}>
        <Filter size={18} color="#6b7280" />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
        >
          <option value="all">Todos os status</option>
          <option value="pending">Aguardando aprovação</option>
          <option value="approved">Aprovada</option>
          <option value="in_routing">Em roteirização</option>
          <option value="in_pickup">Em retirada</option>
          <option value="completed">Finalizada</option>
          <option value="cancelled">Cancelada</option>
          <option value="rejected">Reprovada</option>
        </select>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar por solicitante, motorista, placa..."
          style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, flex: 1, minWidth: 220 }}
        />
        <button
          onClick={reconnect}
          title="Forçar reconexão do stream"
          style={{
            padding: '8px 14px', background: '#3b82f6', color: '#fff', border: 'none',
            borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14,
          }}
        >
          <RefreshCw size={16} /> Atualizar
        </button>
        <StreamStatusBadge status={streamStatus} lastUpdate={lastUpdate} />
        <span style={{ marginLeft: 'auto', fontSize: 13, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 12 }}>
          {filtered.length > 0 && (
            <button
              onClick={() => {
                const allVisible = filtered.every(r => selectedIds.has(r.id));
                if (allVisible) {
                  // Desmarca apenas os visíveis
                  const next = new Set(selectedIds);
                  filtered.forEach(r => next.delete(r.id));
                  setSelectedIds(next);
                } else {
                  // Marca todos os visíveis
                  const next = new Set(selectedIds);
                  filtered.forEach(r => next.add(r.id));
                  setSelectedIds(next);
                }
              }}
              style={{
                background: 'transparent',
                border: '1px solid #d1d5db',
                color: '#374151',
                padding: '4px 10px',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {filtered.every(r => selectedIds.has(r.id))
                ? 'Desmarcar todos'
                : `Selecionar ${filtered.length} visíveis`}
            </button>
          )}
          <span>{filtered.length} instância{filtered.length !== 1 ? 's' : ''}</span>
        </span>
      </div>

      {/* Lista */}
      {loading ? (
        <SkeletonList count={6} variant="card" />
      ) : filtered.length === 0 ? (
        <div style={{ background: '#fff', padding: 60, borderRadius: 12, textAlign: 'center', color: '#9ca3af', border: '1px solid #e5e7eb' }}>
          <PackageCheck size={48} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
          <p style={{ margin: '0 0 6px', fontWeight: 500, color: '#6b7280' }}>
            {instances.length === 0
              ? 'Nenhuma instância de workflow ainda.'
              : 'Nenhuma instância encontrada com os filtros atuais.'}
          </p>
          {instances.length === 0 && (
            <p style={{ margin: 0, fontSize: 13, color: '#9ca3af', maxWidth: 480, marginInline: 'auto' }}>
              Esta aba mostra apenas respostas de formulários que tenham um workflow vinculado
              (campo "Workflow" habilitado nas configurações do formulário).
            </p>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16 }}>
          {filtered.map(r => {
            const cfg = STATUS_CONFIG[r.status] || { label: r.status, color: '#64748b', icon: AlertCircle };
            const StatusIcon = cfg.icon;
            const isSelected = selectedIds.has(r.id);
            return (
              <div key={r.id} style={{
                background: '#fff',
                borderRadius: 12,
                padding: '1.25rem',
                border: isSelected ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                borderLeft: `4px solid ${cfg.color}`,
                boxShadow: isSelected
                  ? '0 0 0 3px rgba(59,130,246,0.15), 0 1px 3px rgba(0,0,0,.05)'
                  : '0 1px 3px rgba(0,0,0,.05)',
                transition: 'border 0.15s, box-shadow 0.15s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ display: 'flex', gap: 10, flex: 1 }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        const next = new Set(selectedIds);
                        if (e.target.checked) next.add(r.id);
                        else next.delete(r.id);
                        setSelectedIds(next);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      title="Selecionar para ações em lote"
                      aria-label={`Selecionar ${r.formTitle}`}
                      style={{
                        width: 18, height: 18,
                        marginTop: 2,
                        cursor: 'pointer',
                        accentColor: '#3b82f6',
                      }}
                    />
                    <div style={{ flex: 1 }}>
                    <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: '#111827' }}>
                      {r.formTitle}
                    </h3>
                    <div style={{ fontSize: 13, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <User size={12} /> {r.solicitante}
                      {(r.replicaCount || 0) > 0 && (
                        <span style={{ background: '#f3e8ff', color: '#a855f7', padding: '1px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, marginLeft: 6 }}>
                          {r.replicaCount}ª réplica
                        </span>
                      )}
                    </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                      background: `${cfg.color}20`, color: cfg.color,
                    }}>
                      <StatusIcon size={12} /> {cfg.label}
                    </span>
                    {r.slaStatus && r.slaStatus !== 'ok' && r.slaStatus !== 'no_target' && (
                      <SlaBadge status={r.slaStatus} percent={r.slaPercentOfTarget ?? null} />
                    )}
                  </div>
                </div>

                {(r.motorista || r.placa) && (
                  <div style={{ background: '#fffbeb', borderRadius: 6, padding: '8px 10px', marginBottom: 10, fontSize: 13, color: '#92400e' }}>
                    🚚 <strong>{r.motorista || '—'}</strong> • Placa <strong>{r.placa || '—'}</strong>
                  </div>
                )}
                {r.setorEntrega && (
                  <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>
                    📍 {r.setorEntrega} {r.enderecoEntrega ? `— ${r.enderecoEntrega}` : ''}
                  </div>
                )}
                {r.rejectionReason && (
                  <div style={{ background: '#fef2f2', borderRadius: 6, padding: '8px 10px', marginBottom: 10, fontSize: 12, color: '#991b1b' }}>
                    <strong>Motivo da reprovação:</strong> {r.rejectionReason}
                  </div>
                )}
                {r.boletim && (
                  <div style={{ fontSize: 12, color: '#059669', marginBottom: 4 }}>
                    📋 Boletim: {r.boletim}
                  </div>
                )}
                {r.protocoloCancelamento && (
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                    🚫 Protocolo: {r.protocoloCancelamento}
                  </div>
                )}

                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>
                  Submetida em {r.submittedAt ? new Date(r.submittedAt).toLocaleString('pt-BR') : '—'}
                </div>

                <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                  {r.status === 'pending' && (
                    <>
                      <button onClick={() => openAction('approve', r)} style={btnStyle('#10b981')}>
                        <CheckCircle2 size={14} /> Aprovar
                      </button>
                      <button onClick={() => openAction('reject', r)} style={btnStyle('#ef4444')}>
                        <XCircle size={14} /> Reprovar
                      </button>
                    </>
                  )}
                  {(r.status === 'approved' || r.status === 'in_routing') && (
                    <button onClick={() => openAction('route', r)} style={btnStyle('#3b82f6')}>
                      <Truck size={14} /> {r.motorista ? 'Re-roteirizar' : 'Roteirizar'}
                    </button>
                  )}
                  {(r.status === 'in_routing' || r.status === 'in_pickup') && (
                    <>
                      <button onClick={() => openAction('pickup', r)} style={btnStyle('#059669')}>
                        <PackageCheck size={14} /> Marcar retirado
                      </button>
                      <button onClick={() => openAction('cancel', r)} style={btnStyle('#6b7280')}>
                        <AlertCircle size={14} /> Cancelar
                      </button>
                    </>
                  )}
                  {(r.status === 'approved' || r.status === 'in_routing') && (
                    <button
                      onClick={() => router.push(`/dashboard/retiradas/${r.id}/ordem-retirada`)}
                      style={btnStyle('#8b5cf6')}
                      title="Imprimir ordem de retirada"
                    >
                      <Printer size={14} /> Imprimir OR
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {actionModal.open && actionModal.instance && actionModal.action && (
        <RetiradaActionModal
          action={actionModal.action}
          retirada={actionModal.instance}
          onClose={closeAction}
        />
      )}

      {/* Bulk Actions Bar — aparece quando ≥1 selecionada */}
      {user && (
        <BulkActionsBar
          selectedIds={Array.from(selectedIds)}
          onClear={() => setSelectedIds(new Set())}
          onComplete={() => reconnect()}
          currentUser={{
            id: user.uid,
            username: user.email?.split('@')[0],
            name: user.displayName || user.email || 'Admin',
          }}
        />
      )}
    </div>
  );
}

function btnStyle(color: string): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '5px 10px',
    background: color,
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
  };
}

/**
 * Badge que mostra o status da conexão SSE em tempo real.
 * Padrão dos SaaS modernos (Linear, Notion) — dá confiança ao usuário
 * de que os dados estão atualizados.
 */
/**
 * Badge de SLA preditivo no card.
 * Visualmente destacado para chamar atenção sem poluir.
 */
function SlaBadge({
  status,
  percent,
}: {
  status: 'at_risk' | 'critical' | 'breached' | 'ok' | 'no_target';
  percent: number | null;
}) {
  const config = {
    at_risk:   { label: 'SLA em risco',  color: '#D97706', bg: '#FEF3C7', icon: '⚠️' },
    critical:  { label: 'SLA crítico',   color: '#DC2626', bg: '#FEE2E2', icon: '🔥' },
    breached:  { label: 'SLA estourado', color: '#7F1D1D', bg: '#FECACA', icon: '🚨' },
    ok:        { label: 'No prazo',      color: '#059669', bg: '#D1FAE5', icon: '✓' },
    no_target: { label: '',              color: '',        bg: '',        icon: '' },
  }[status];

  if (!config.label) return null;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        background: config.bg,
        color: config.color,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
      title={percent ? `Predição: ${percent.toFixed(0)}% do tempo alvo` : config.label}
    >
      <span style={{ fontSize: 12 }}>{config.icon}</span>
      {config.label}
      {percent !== null && (
        <span style={{ opacity: 0.7, fontWeight: 500 }}>· {percent.toFixed(0)}%</span>
      )}
    </span>
  );
}

function StreamStatusBadge({
  status,
  lastUpdate,
}: {
  status: StreamStatus;
  lastUpdate: string | null;
}) {
  const config = {
    connecting: { color: '#9CA3AF', bg: '#F3F4F6', icon: Wifi,    label: 'Conectando…', pulse: true },
    connected:  { color: '#059669', bg: '#D1FAE5', icon: Wifi,    label: 'Tempo real',  pulse: true },
    fallback:   { color: '#D97706', bg: '#FEF3C7', icon: Wifi,    label: 'Polling',     pulse: false },
    disconnected: { color: '#9CA3AF', bg: '#F3F4F6', icon: WifiOff, label: 'Reconectando…', pulse: true },
    error:      { color: '#B91C1C', bg: '#FEE2E2', icon: WifiOff, label: 'Erro',        pulse: false },
  }[status];

  const Icon = config.icon;

  // "há X seg" — atualiza visualmente a percepção de "vivo"
  const ago = lastUpdate ? Math.floor((Date.now() - new Date(lastUpdate).getTime()) / 1000) : null;
  const agoLabel = ago === null ? '' : ago < 5 ? 'agora' : ago < 60 ? `há ${ago}s` : `há ${Math.floor(ago / 60)}min`;

  return (
    <span
      title={lastUpdate ? `Última atualização: ${new Date(lastUpdate).toLocaleString('pt-BR')}` : ''}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 10px',
        background: config.bg,
        color: config.color,
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        position: 'relative',
      }}
    >
      <Icon size={12} />
      {config.pulse && (
        <span
          style={{
            width: 6, height: 6, borderRadius: '50%',
            background: config.color,
            animation: 'sse-pulse 1.5s ease-in-out infinite',
          }}
        />
      )}
      {config.label}
      {agoLabel && status === 'connected' && (
        <span style={{ opacity: 0.7, marginLeft: 4, fontWeight: 400 }}>· {agoLabel}</span>
      )}
      <style jsx>{`
        @keyframes sse-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }
      `}</style>
    </span>
  );
}
