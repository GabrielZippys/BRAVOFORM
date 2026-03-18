'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { useAuth } from '@/hooks/useAuth';
import { WorkflowInstanceService } from '@/services/workflowInstanceService';
import { Play, Clock, CheckCircle, FileText, ArrowRight } from 'lucide-react';
import type { WorkflowDocument, WorkflowInstance } from '@/types';
import styles from './workflows.module.css';

export default function ColaboradorWorkflowsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [availableWorkflows, setAvailableWorkflows] = useState<WorkflowDocument[]>([]);
  const [myInstances, setMyInstances] = useState<WorkflowInstance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Carregar workflows ativos
      const workflowsSnapshot = await getDocs(
        query(collection(db, 'workflows'), where('isActive', '==', true))
      );
      const workflows = workflowsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as WorkflowDocument));

      setAvailableWorkflows(workflows);

      // Carregar minhas instâncias em andamento
      const instances = await WorkflowInstanceService.listInstances({
        assignedTo: user.uid,
        status: 'in_progress'
      });

      setMyInstances(instances);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartWorkflow = async (workflow: WorkflowDocument) => {
    if (!user) return;

    try {
      // TODO: Obter empresa e departamento do colaborador
      const companyId = 'default-company';
      const departmentId = 'default-department';

      const instanceId = await WorkflowInstanceService.createInstance(
        workflow.id,
        user.uid,
        user.displayName || user.email || 'Colaborador',
        companyId,
        departmentId
      );

      // Redirecionar para execução
      router.push(`/colaborador/workflows/${instanceId}`);
    } catch (error) {
      console.error('Erro ao iniciar workflow:', error);
      alert('Erro ao iniciar workflow. Tente novamente.');
    }
  };

  const handleContinueWorkflow = (instanceId: string) => {
    router.push(`/colaborador/workflows/${instanceId}`);
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const getCurrentStageName = (instance: WorkflowInstance) => {
    const currentEntry = instance.stageHistory.find(
      entry => entry.stageId === instance.currentStageId
    );
    return currentEntry?.stageName || 'Etapa Desconhecida';
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>Carregando workflows...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Meus Workflows</h1>
        <p>Gerencie e execute seus workflows atribuídos</p>
      </div>

      {/* Workflows em Andamento */}
      {myInstances.length > 0 && (
        <div className={styles.section}>
          <h2>
            <Clock size={24} />
            Em Andamento
          </h2>
          <div className={styles.grid}>
            {myInstances.map(instance => (
              <div key={instance.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3>{instance.workflowName}</h3>
                  <span className={styles.badgeInProgress}>Em Andamento</span>
                </div>
                <div className={styles.cardContent}>
                  <div className={styles.infoRow}>
                    <FileText size={16} />
                    <span>Etapa: {getCurrentStageName(instance)}</span>
                  </div>
                  <div className={styles.infoRow}>
                    <Clock size={16} />
                    <span>Iniciado em: {formatDate(instance.startedAt)}</span>
                  </div>
                  <div className={styles.progress}>
                    <div className={styles.progressBar}>
                      <div
                        className={styles.progressFill}
                        style={{
                          width: `${((instance.currentStageIndex + 1) / instance.stageHistory.length) * 100}%`
                        }}
                      />
                    </div>
                    <span className={styles.progressText}>
                      Etapa {instance.currentStageIndex + 1} de {instance.stageHistory.length}
                    </span>
                  </div>
                </div>
                <div className={styles.cardFooter}>
                  <button
                    onClick={() => handleContinueWorkflow(instance.id)}
                    className={styles.btnContinue}
                  >
                    Continuar
                    <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Workflows Disponíveis */}
      <div className={styles.section}>
        <h2>
          <Play size={24} />
          Workflows Disponíveis
        </h2>
        {availableWorkflows.length === 0 ? (
          <div className={styles.emptyState}>
            <CheckCircle size={48} color="#6B7280" />
            <h3>Nenhum workflow disponível</h3>
            <p>Não há workflows ativos no momento.</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {availableWorkflows.map(workflow => (
              <div key={workflow.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3>{workflow.name}</h3>
                  <span className={styles.badgeAvailable}>Disponível</span>
                </div>
                <div className={styles.cardContent}>
                  {workflow.description && (
                    <p className={styles.description}>{workflow.description}</p>
                  )}
                  <div className={styles.infoRow}>
                    <FileText size={16} />
                    <span>{workflow.stages.length} etapas</span>
                  </div>
                </div>
                <div className={styles.cardFooter}>
                  <button
                    onClick={() => handleStartWorkflow(workflow)}
                    className={styles.btnStart}
                  >
                    <Play size={18} />
                    Iniciar Workflow
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
