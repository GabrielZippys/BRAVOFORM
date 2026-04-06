'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { WorkflowServicePg } from '@/services/workflowServicePg';
import { useAuth } from '@/hooks/useAuth';
import WorkflowBuilder from '@/components/WorkflowBuilder';
import ConfirmModal from '@/components/ConfirmModal';
import { useConfirm } from '@/hooks/useConfirm';
import type { WorkflowStage } from '@/types';
import styles from '../../../../styles/BravoFlowCreate.module.css';

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  companies: string[];
  departments: string[];
  stages: WorkflowStage[];
  isActive: boolean;
}

export default function EditWorkflowPage() {
  const router = useRouter();
  const params = useParams();
  const { user } = useAuth();
  const [workflow, setWorkflow] = useState<WorkflowTemplate | null>(null);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { alert, confirmState } = useConfirm();

  useEffect(() => {
    if (params.id) {
      loadWorkflow(params.id as string);
    }
  }, [params.id]);

  const loadWorkflow = async (workflowId: string) => {
    try {
      const workflowData = await WorkflowServicePg.loadWorkflow(workflowId);
      
      if (workflowData) {
        setWorkflow(workflowData as WorkflowTemplate);
        setWorkflowName(workflowData.name);
        setWorkflowDescription(workflowData.description || '');
      } else {
        console.log('Workflow não encontrado, redirecionando...');
        router.push('/dashboard/bravoflow');
        return;
      }
    } catch (error) {
      console.error('Erro ao carregar workflow:', error);
      await alert('Erro', 'Erro ao carregar workflow');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (stages: WorkflowStage[]) => {
    if (!workflowName.trim()) {
      await alert('Atenção', 'Por favor, insira um nome para o workflow');
      return;
    }

    if (stages.length === 0) {
      await alert('Atenção', 'Por favor, adicione pelo menos uma etapa ao workflow');
      return;
    }

    if (!workflow) return;

    setIsSaving(true);
    try {
      await WorkflowServicePg.updateWorkflow(workflow.id, {
        name: workflowName,
        description: workflowDescription,
        stages: stages
      });

      router.push('/dashboard/bravoflow');
    } catch (error) {
      console.error('Erro ao salvar workflow:', error);
      await alert('Erro', 'Erro ao salvar workflow. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingContainer}>
          <p>Carregando workflow...</p>
        </div>
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingContainer}>
          <p>Workflow não encontrado. Redirecionando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => router.back()} className={styles.btnBack}>
          <ArrowLeft size={20} />
          Voltar
        </button>
        <h1>{workflowName}</h1>
      </div>

      <div className={styles.builderSection}>
        <WorkflowBuilder
          formId={workflow.id}
          initialStages={workflow.stages}
          onSave={handleSave}
          workflowCompanies={workflow.companies || []}
          workflowDepartments={workflow.departments || []}
          workflowName={workflowName}
          workflowDescription={workflowDescription}
          workflowId={workflow.id}
          initialIsActive={workflow.isActive}
        />
      </div>

      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        cancelText={confirmState.cancelText}
        onConfirm={confirmState.onConfirm}
        onCancel={confirmState.onCancel}
        isDanger={confirmState.isDanger}
      />
    </div>
  );
}
