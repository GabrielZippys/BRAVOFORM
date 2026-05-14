'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Edit, Trash2, Eye, Copy, BarChart3, Workflow as WorkflowIcon, ListChecks, TrendingUp, Link2, Users } from 'lucide-react';
import { WorkflowServicePg } from '@/services/workflowServicePg';
import { useAuth } from '@/hooks/useAuth';
import type { WorkflowStage } from '@/types';
import WorkflowSetupModal from '@/components/WorkflowSetupModal';
import WorkflowInstancesPanel from '@/components/WorkflowInstancesPanel';
import WorkflowMetricsPanel from '@/components/WorkflowMetricsPanel';
import SLAInsightsPanel from '@/components/SLAInsightsPanel';
import WorkflowPublicLinkModal from '@/components/WorkflowPublicLinkModal';
import WorkflowViewersModal from '@/components/WorkflowViewersModal';
import ErrorBoundary from '@/components/ErrorBoundary';
import { SkeletonList } from '@/components/Skeleton';
import { logger } from '@/lib/logger';
import styles from '../../styles/BravoFlow.module.css';

type TabId = 'workflows' | 'instances' | 'sla' | 'metrics';

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  companies: string[];
  departments: string[];
  stages: WorkflowStage[];
  createdAt: Date;
  createdBy: string;
  isActive: boolean;
}

export default function BravoFlowPage() {
  // useSearchParams() exige Suspense boundary no pre-render do Next 16.
  return (
    <Suspense fallback={<SkeletonList count={6} variant="card" />}>
      <BravoFlowPageInner />
    </Suspense>
  );
}

function BravoFlowPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, appUser, loading } = useAuth();
  const [workflows, setWorkflows] = useState<WorkflowTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowTemplate | null>(null);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{ show: boolean; workflowId: string | null }>({ show: false, workflowId: null });
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const t = searchParams?.get('tab');
    return (t === 'instances' || t === 'sla' || t === 'metrics') ? t as TabId : 'workflows';
  });
  const initialWorkflowFilter = searchParams?.get('workflow') || undefined;
  const [publicLinkModal, setPublicLinkModal] = useState<{ open: boolean; workflowId: string; workflowName: string } | null>(null);
  const [viewersModal, setViewersModal] = useState<{ open: boolean; workflowId: string; workflowName: string; viewers: Array<{ id: string; username: string; name: string }> } | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      loadWorkflows();
    }
  }, [user]);

  const loadWorkflows = async () => {
    try {
      const workflowsData = await WorkflowServicePg.listWorkflows();
      setWorkflows(workflowsData as WorkflowTemplate[]);
    } catch (error) {
      logger.error('Erro ao carregar workflows', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNew = () => {
    router.push('/dashboard/bravoflow/create');
  };

  const handleEdit = (e: React.MouseEvent, workflow: WorkflowTemplate) => {
    e.stopPropagation(); // Evitar que o clique no botão acione o clique no card
    setEditingWorkflow(workflow);
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (config: { name: string; description?: string; companies: string[]; departments: string[] }) => {
    if (!editingWorkflow) return;

    try {
      await WorkflowServicePg.updateWorkflow(editingWorkflow.id, {
        name: config.name,
        description: config.description || '',
        companies: config.companies,
        departments: config.departments
      });
      
      setIsEditModalOpen(false);
      setEditingWorkflow(null);
      loadWorkflows();
    } catch (error) {
      logger.error('Erro ao atualizar workflow', error);
      alert('Erro ao atualizar workflow');
    }
  };

  const handleCardClick = (workflowId: string) => {
    router.push(`/dashboard/bravoflow/edit/${workflowId}`);
  };

  const handleDelete = (workflowId: string) => {
    setDeleteConfirmModal({ show: true, workflowId });
  };

  const confirmDelete = async () => {
    if (!deleteConfirmModal.workflowId) return;

    try {
      await WorkflowServicePg.deleteWorkflow(deleteConfirmModal.workflowId);
      setWorkflows(workflows.filter(w => w.id !== deleteConfirmModal.workflowId));
      setDeleteConfirmModal({ show: false, workflowId: null });
    } catch (error) {
      logger.error('Erro ao excluir workflow', error);
      alert('Erro ao excluir workflow');
    }
  };

  const handleToggleActive = async (e: React.MouseEvent, workflowId: string, currentStatus: boolean) => {
    e.stopPropagation();
    try {
      await WorkflowServicePg.toggleWorkflowActive(workflowId, !currentStatus);
      setWorkflows(workflows.map(w => 
        w.id === workflowId ? { ...w, isActive: !currentStatus } : w
      ));
    } catch (error) {
      logger.error('Erro ao atualizar status do workflow', error);
      alert('Erro ao atualizar status do workflow');
    }
  };

  const handleDuplicate = async (workflow: WorkflowTemplate) => {
    try {
      await WorkflowServicePg.saveWorkflow(
        {
          name: `${workflow.name} (Cópia)`,
          description: workflow.description,
          stages: workflow.stages || [],
          companies: workflow.companies,
          departments: workflow.departments,
          isActive: false
        },
        user?.uid || '',
        user?.email || 'Admin'
      );
      loadWorkflows();
    } catch (error) {
      logger.error('Erro ao duplicar workflow', error);
      alert('Erro ao duplicar workflow');
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h1>BravoFlow</h1>
        </div>
        <SkeletonList count={6} variant="card" />
      </div>
    );
  }

  const TABS = [
    { id: 'workflows' as const, label: 'Workflows', icon: WorkflowIcon, hint: 'Templates de fluxo' },
    { id: 'instances' as const, label: 'Instâncias', icon: ListChecks, hint: 'Fila de execução com ações' },
    { id: 'sla'       as const, label: 'SLA Preditivo', icon: TrendingUp, hint: 'Predição de estouro + sugestões' },
    { id: 'metrics'   as const, label: 'Métricas',   icon: BarChart3,  hint: 'KPIs históricos' },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>BravoFlow</h1>
        {activeTab === 'workflows' && (
          <button onClick={handleCreateNew} className={styles.btnCreate}>
            <Plus size={20} />
            Novo Workflow
          </button>
        )}
      </div>

      {/* Tabs: Workflows | Instâncias | Métricas */}
      <div className={styles.tabs} role="tablist" aria-label="Seções do BravoFlow">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={active}
              aria-controls={`tabpanel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              title={tab.hint}
              className={`${styles.tab} ${active ? styles.tabActive : ''}`}
            >
              <Icon size={16} /> {tab.label}
            </button>
          );
        })}
      </div>

      <ErrorBoundary>
        {activeTab === 'instances' && (
          <div role="tabpanel" id="tabpanel-instances">
            <WorkflowInstancesPanel workflowId={initialWorkflowFilter} />
          </div>
        )}
        {activeTab === 'sla' && (
          <div role="tabpanel" id="tabpanel-sla">
            <SLAInsightsPanel />
          </div>
        )}
        {activeTab === 'metrics' && (
          <div role="tabpanel" id="tabpanel-metrics">
            <WorkflowMetricsPanel />
          </div>
        )}
      </ErrorBoundary>

      {activeTab === 'workflows' && (workflows.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📊</div>
            <h2>Nenhum workflow criado ainda</h2>
            <p>Crie seu primeiro workflow para começar a gerenciar processos de forma visual e eficiente.</p>
            <button onClick={handleCreateNew} className={styles.btnCreateEmpty}>
              <Plus size={20} />
              Criar Primeiro Workflow
            </button>
          </div>
        ) : (
          <div className={styles.grid}>
          {workflows
            .filter(w => w.id && w.id.trim() !== '') // Filtrar workflows sem ID
            .map((workflow, index) => (
            <div 
              key={workflow.id || `workflow-${index}`} 
              className={styles.card}
              onClick={() => handleCardClick(workflow.id)}
              style={{ cursor: 'pointer' }}
            >
              <div className={styles.cardHeader}>
                <h3>{workflow.name}</h3>
                <div className={styles.cardActions}>
                  <button
                    onClick={(e) => handleToggleActive(e, workflow.id, workflow.isActive)}
                    className={`${styles.toggleActiveBtn} ${workflow.isActive ? styles.toggleActive : styles.toggleInactive}`}
                    title={workflow.isActive ? 'Desativar Workflow' : 'Ativar Workflow'}
                    aria-label={workflow.isActive ? 'Desativar Workflow' : 'Ativar Workflow'}
                  >
                    <Eye size={18} />
                  </button>
                  <button
                    onClick={(e) => handleEdit(e, workflow)}
                    className={styles.actionButton}
                    title="Editar configurações"
                  >
                    <Edit size={18} />
                  </button>
                  <button
                    onClick={(e) => handleDuplicate(workflow)}
                    className={styles.actionButton}
                    title="Duplicar workflow"
                  >
                    <Copy size={18} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPublicLinkModal({
                        open: true,
                        workflowId: workflow.id,
                        workflowName: workflow.name,
                      });
                    }}
                    className={styles.actionButton}
                    title="Compartilhar link público (acesso sem login)"
                    style={{ color: '#06B6D4' }}
                  >
                    <Link2 size={18} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewersModal({
                        open: true,
                        workflowId: workflow.id,
                        workflowName: workflow.name,
                        viewers: (workflow as any).viewers || [],
                      });
                    }}
                    className={styles.actionButton}
                    title="Quem pode acompanhar este workflow"
                    style={{ color: '#3B82F6' }}
                  >
                    <Users size={18} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(workflow.id);
                    }}
                    className={styles.actionButton}
                    title="Excluir"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              {workflow.description && (
                <p className={styles.cardDescription}>{workflow.description}</p>
              )}

              {/* Resumo de Ativação */}
              {(workflow as any).activationSettings && (
                <div className={styles.activationBox}>
                  {(workflow as any).activationSettings.mode === 'automatic' && (
                    <>
                      <div className={`${styles.activationLabel} ${styles.modeAuto}`}>
                        🕐 Automático
                      </div>
                      <div>
                        {(workflow as any).activationSettings.automaticSchedule?.time || '09:00'} • {
                          ((workflow as any).activationSettings.automaticSchedule?.daysOfWeek || []).length === 7
                            ? 'Todos os dias'
                            : ((workflow as any).activationSettings.automaticSchedule?.daysOfWeek || []).length === 5
                            ? 'Dias úteis'
                            : `${((workflow as any).activationSettings.automaticSchedule?.daysOfWeek || []).length} dias/semana`
                        }
                      </div>
                    </>
                  )}
                  {(workflow as any).activationSettings.mode === 'manual' && (
                    <div className={`${styles.activationLabel} ${styles.modeManual}`}>
                      👤 Criação Manual
                    </div>
                  )}
                  {(workflow as any).activationSettings.mode === 'on_request' && (
                    <div className={`${styles.activationLabel} ${styles.modeOnRequest}`}>
                      📋 Por Requisição
                    </div>
                  )}
                </div>
              )}

              <div className={styles.cardFooter}>
                <span className={styles.stageCount}>
                  {((workflow as any).stageCount ?? workflow.stages?.length ?? 0)} etapa{((workflow as any).stageCount ?? workflow.stages?.length ?? 0) !== 1 ? 's' : ''}
                </span>
                <span className={`${styles.status} ${workflow.isActive ? styles.active : styles.inactive}`}>
                  {workflow.isActive ? 'Ativo' : 'Inativo'}
                </span>
              </div>
            </div>
          ))}
        </div>
      ))}

      {isEditModalOpen && editingWorkflow && (
        <WorkflowSetupModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingWorkflow(null);
          }}
          onSave={handleSaveEdit}
          initialData={{
            name: editingWorkflow.name,
            description: editingWorkflow.description,
            companies: editingWorkflow.companies || [],
            departments: editingWorkflow.departments || []
          }}
          isEditMode={true}
        />
      )}

      {publicLinkModal?.open && user && (
        <WorkflowPublicLinkModal
          isOpen={publicLinkModal.open}
          onClose={() => setPublicLinkModal(null)}
          workflowId={publicLinkModal.workflowId}
          workflowName={publicLinkModal.workflowName}
          currentUser={{
            id: user.uid,
            name: user.displayName || user.email || 'Admin',
            username: user.email?.split('@')[0],
          }}
        />
      )}

      {viewersModal?.open && (
        <WorkflowViewersModal
          isOpen={viewersModal.open}
          onClose={() => {
            setViewersModal(null);
            // Refresca lista para refletir mudanças
            (async () => {
              try {
                const r = await fetch('/api/dataconnect/workflows');
                const j = await r.json();
                if (j.success) setWorkflows(j.data);
              } catch {}
            })();
          }}
          workflowId={viewersModal.workflowId}
          workflowName={viewersModal.workflowName}
          initialViewers={viewersModal.viewers}
        />
      )}

      {/* Modal de confirmação de exclusão */}
      {deleteConfirmModal.show && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
          onClick={() => setDeleteConfirmModal({ show: false, workflowId: null })}
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 id="delete-modal-title" className={styles.modalTitle}>
              Excluir workflow?
            </h2>
            <p className={styles.modalBody}>
              Tem certeza que deseja excluir este workflow? Todas as instâncias em
              andamento serão preservadas no histórico, mas o template será removido
              permanentemente.
            </p>
            <div className={styles.modalActions}>
              <button
                onClick={() => setDeleteConfirmModal({ show: false, workflowId: null })}
                className={styles.btnSecondary}
              >
                Cancelar
              </button>
              <button onClick={confirmDelete} className={styles.btnDanger}>
                Sim, excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
