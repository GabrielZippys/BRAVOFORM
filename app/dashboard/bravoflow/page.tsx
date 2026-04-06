'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Edit, Trash2, Eye, Copy } from 'lucide-react';
import { WorkflowServicePg } from '@/services/workflowServicePg';
import { useAuth } from '@/hooks/useAuth';
import type { WorkflowStage } from '@/types';
import WorkflowSetupModal from '@/components/WorkflowSetupModal';
import styles from '../../styles/BravoFlow.module.css';

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
  const router = useRouter();
  const { user, appUser, loading } = useAuth();
  const [workflows, setWorkflows] = useState<WorkflowTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowTemplate | null>(null);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{ show: boolean; workflowId: string | null }>({ show: false, workflowId: null });
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

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
      console.error('Erro ao carregar workflows:', error);
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
      console.error('Erro ao atualizar workflow:', error);
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
      console.error('Erro ao excluir workflow:', error);
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
      console.error('Erro ao atualizar status:', error);
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
      console.error('Erro ao duplicar workflow:', error);
      alert('Erro ao duplicar workflow');
    }
  };

  if (loading || isLoading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>Carregando workflows...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>BravoFlow</h1>
        <button onClick={handleCreateNew} className={styles.btnCreate}>
          <Plus size={20} />
          Novo Workflow
        </button>
      </div>

      {workflows.length === 0 ? (
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
                    className={styles.actionButton}
                    title={workflow.isActive ? 'Desativar Workflow' : 'Ativar Workflow'}
                    style={{
                      background: workflow.isActive ? '#10B981' : '#6B7280',
                      color: 'white',
                      borderRadius: '0.375rem',
                      padding: '0.5rem'
                    }}
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
                <div style={{ 
                  marginTop: '0.75rem', 
                  padding: '0.75rem', 
                  background: '#F9FAFB', 
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  color: '#6B7280'
                }}>
                  {(workflow as any).activationSettings.mode === 'automatic' && (
                    <>
                      <div style={{ fontWeight: 500, color: '#3B82F6', marginBottom: '0.25rem' }}>
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
                    <div style={{ fontWeight: 500, color: '#6B7280' }}>
                      👤 Criação Manual
                    </div>
                  )}
                  {(workflow as any).activationSettings.mode === 'on_request' && (
                    <div style={{ fontWeight: 500, color: '#F59E0B' }}>
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
      )}

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

      {/* Modal de confirmação de exclusão */}
      {deleteConfirmModal.show && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: '#1F2937',
            borderRadius: '1rem',
            padding: '2rem',
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
          }}>
            <p style={{
              margin: '0 0 2rem 0',
              color: '#D1D5DB',
              fontSize: '1rem',
              lineHeight: '1.5'
            }}>
              Tem certeza que deseja excluir este workflow?
            </p>
            <div style={{
              display: 'flex',
              gap: '1rem',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => setDeleteConfirmModal({ show: false, workflowId: null })}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: 'transparent',
                  color: '#9CA3AF',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  fontWeight: '500'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#EC4899',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  fontWeight: '600'
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
