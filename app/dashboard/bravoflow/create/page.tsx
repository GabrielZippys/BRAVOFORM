'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../../../firebase/config';
import { useAuth } from '@/hooks/useAuth';
import WorkflowBuilder from '@/components/WorkflowBuilder';
import WorkflowSetupModal from '@/components/WorkflowSetupModal';
import ConfirmModal from '@/components/ConfirmModal';
import { useConfirm } from '@/hooks/useConfirm';
import type { WorkflowStage } from '@/types';
import styles from '../../../styles/BravoFlowCreate.module.css';

export default function CreateWorkflowPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [workflowCompanies, setWorkflowCompanies] = useState<string[]>([]);
  const [workflowDepartments, setWorkflowDepartments] = useState<string[]>([]);
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(true);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { alert, confirmState } = useConfirm();

  const handleSetupSave = async (config: {
    name: string;
    companies: string[];
    departments: string[];
  }) => {
    try {
      // Salvar workflow inicial no Firestore
      const docRef = await addDoc(collection(db, 'workflows'), {
        name: config.name,
        description: '',
        companies: config.companies,
        departments: config.departments,
        stages: [], // Inicialmente vazio, será preenchido ao adicionar etapas
        createdAt: new Date(),
        createdBy: user?.uid || '',
        isActive: false
      });

      // Redirecionar para página de edição
      router.push(`/dashboard/bravoflow/edit/${docRef.id}`);
    } catch (error) {
      console.error('Erro ao criar workflow:', error);
      await alert('Erro', 'Erro ao criar workflow. Tente novamente.');
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

    setIsSaving(true);
    try {
      await addDoc(collection(db, 'workflows'), {
        name: workflowName,
        description: workflowDescription,
        companies: workflowCompanies,
        departments: workflowDepartments,
        stages: stages,
        createdAt: new Date(),
        createdBy: user?.uid || '',
        isActive: false
      });

      router.push('/dashboard/bravoflow');
    } catch (error) {
      console.error('Erro ao salvar workflow:', error);
      await alert('Erro', 'Erro ao salvar workflow. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <WorkflowSetupModal
        isOpen={isSetupModalOpen}
        onClose={() => router.back()}
        onSave={handleSetupSave}
      />

      {isConfigured && (
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
              formId="new"
              initialStages={[]}
              onSave={handleSave}
            />
          </div>
        </div>
      )}

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
    </>
  );
}
