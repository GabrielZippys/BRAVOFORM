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

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Truck, CheckCircle2, XCircle, AlertCircle, RefreshCw, Filter,
  PackageCheck, Printer, User, Clock,
} from 'lucide-react';
import RetiradaActionModal from './RetiradaActionModal';

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
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [actionModal, setActionModal] = useState<{
    open: boolean;
    action: 'approve' | 'reject' | 'route' | 'pickup' | 'cancel' | null;
    instance: Instance | null;
  }>({ open: false, action: null, instance: null });

  const loadInstances = useCallback(async () => {
    setLoading(true);
    try {
      // workflowOnly=true filtra no SQL: só respostas de forms com workflow
      // habilitado, ou que já tenham dados de roteirização/aprovação.
      const res = await fetch('/api/dataconnect/responses?workflowOnly=true&limit=500');
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      const mapped: Instance[] = (json.data || []).map((r: any) => ({
        id: r.id,
        formTitle: r.formTitle,
        solicitante: r.collaboratorUsername,
        status: r.status,
        currentStageId: r.current_stage_fb_id,
        motorista: r.motorista,
        placa: r.placa,
        setorEntrega: r.setor_entrega,
        enderecoEntrega: r.endereco_entrega,
        diasEntrega: r.dias_entrega,
        boletim: r.boletim,
        protocoloCancelamento: r.protocolo_cancelamento,
        motivoCancelamento: r.motivo_cancelamento,
        replicaCount: r.replica_count || 0,
        parentResponseId: r.parent_response_fb_id,
        submittedAt: r.submittedAt,
        approvedAt: r.approved_at,
        rejectionReason: r.rejection_reason,
      }));
      setInstances(mapped);
    } catch (e) {
      console.error('Erro ao carregar instâncias:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInstances();
    const interval = setInterval(loadInstances, 60_000);
    return () => clearInterval(interval);
  }, [loadInstances]);

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
    if (refresh) loadInstances();
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
          onClick={loadInstances}
          style={{
            padding: '8px 14px', background: '#3b82f6', color: '#fff', border: 'none',
            borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14,
          }}
        >
          <RefreshCw size={16} /> Atualizar
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: '#6b7280' }}>
          {filtered.length} instância{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>Carregando...</div>
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
            return (
              <div key={r.id} style={{
                background: '#fff',
                borderRadius: 12,
                padding: '1.25rem',
                border: '1px solid #e5e7eb',
                borderLeft: `4px solid ${cfg.color}`,
                boxShadow: '0 1px 3px rgba(0,0,0,.05)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
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
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                    background: `${cfg.color}20`, color: cfg.color,
                  }}>
                    <StatusIcon size={12} /> {cfg.label}
                  </span>
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
