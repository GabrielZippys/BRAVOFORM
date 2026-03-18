'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { WorkflowInstanceService } from '@/services/workflowInstanceService';
import { WorkflowService } from '@/services/workflowService';
import { useAuth } from '@/hooks/useAuth';
import { CheckCircle, XCircle, Clock, ArrowLeft, Send } from 'lucide-react';
import type { WorkflowInstance, WorkflowDocument, WorkflowStage } from '@/types';
import styles from './execution.module.css';

export default function WorkflowExecutionPage() {
  const router = useRouter();
  const params = useParams();
  const { user } = useAuth();
  const instanceId = params.id as string;

  const [instance, setInstance] = useState<WorkflowInstance | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowDocument | null>(null);
  const [currentStage, setCurrentStage] = useState<WorkflowStage | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Estados para campos da etapa
  const [fieldData, setFieldData] = useState<Record<string, any>>({});
  const [comment, setComment] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);

  useEffect(() => {
    loadData();
  }, [instanceId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Carregar instância
      const instanceData = await WorkflowInstanceService.getInstance(instanceId);
      if (!instanceData) {
        alert('Instância não encontrada');
        router.push('/colaborador/workflows');
        return;
      }

      // Verificar se o usuário é o atribuído
      if (user && instanceData.assignedTo !== user.uid) {
        alert('Você não tem permissão para acessar esta instância');
        router.push('/colaborador/workflows');
        return;
      }

      setInstance(instanceData);

      // Carregar workflow
      const workflowData = await WorkflowService.loadWorkflow(instanceData.workflowId);
      if (!workflowData) {
        alert('Workflow não encontrado');
        router.push('/colaborador/workflows');
        return;
      }

      setWorkflow(workflowData);

      // Definir etapa atual
      const stage = workflowData.stages[instanceData.currentStageIndex];
      setCurrentStage(stage);

      // Carregar dados já preenchidos
      setFieldData(instanceData.fieldData || {});
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      alert('Erro ao carregar workflow');
      router.push('/colaborador/workflows');
    } finally {
      setLoading(false);
    }
  };

  const handleValidate = async () => {
    if (!instance || !user || !currentStage) return;

    // Validar campos obrigatórios
    if (currentStage.requireComment && !comment.trim()) {
      alert('Comentário é obrigatório para esta etapa');
      return;
    }

    if (currentStage.requireAttachments && attachments.length === 0) {
      alert('Anexos são obrigatórios para esta etapa');
      return;
    }

    setSubmitting(true);
    try {
      await WorkflowInstanceService.advanceStage(
        instanceId,
        user.uid,
        user.displayName || user.email || 'Colaborador',
        'validated',
        fieldData,
        comment || undefined,
        attachments.length > 0 ? attachments : undefined
      );

      // Recarregar dados
      await loadData();

      // Limpar campos
      setComment('');
      setAttachments([]);

      alert('Etapa validada com sucesso!');
    } catch (error) {
      console.error('Erro ao validar etapa:', error);
      alert('Erro ao validar etapa. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!instance || !user) return;

    if (!confirm('Deseja realmente rejeitar esta etapa?')) return;

    setSubmitting(true);
    try {
      await WorkflowInstanceService.advanceStage(
        instanceId,
        user.uid,
        user.displayName || user.email || 'Colaborador',
        'rejected',
        fieldData,
        comment || 'Etapa rejeitada',
        attachments.length > 0 ? attachments : undefined
      );

      await loadData();
      alert('Etapa rejeitada. Voltando para etapa anterior.');
    } catch (error) {
      console.error('Erro ao rejeitar etapa:', error);
      alert('Erro ao rejeitar etapa. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!instance || !user) return;

    if (!confirm('Deseja realmente cancelar este workflow?')) return;

    setSubmitting(true);
    try {
      await WorkflowInstanceService.advanceStage(
        instanceId,
        user.uid,
        user.displayName || user.email || 'Colaborador',
        'cancelled',
        fieldData,
        comment || 'Workflow cancelado'
      );

      alert('Workflow cancelado com sucesso');
      router.push('/colaborador/workflows');
    } catch (error) {
      console.error('Erro ao cancelar workflow:', error);
      alert('Erro ao cancelar workflow. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>Carregando workflow...</p>
        </div>
      </div>
    );
  }

  if (!instance || !workflow || !currentStage) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>Erro ao carregar workflow</p>
          <button onClick={() => router.push('/colaborador/workflows')}>
            Voltar
          </button>
        </div>
      </div>
    );
  }

  // Verificar se workflow foi concluído
  if (instance.status === 'completed') {
    return (
      <div className={styles.container}>
        <div className={styles.completed}>
          <CheckCircle size={64} color="#10B981" />
          <h2>Workflow Concluído!</h2>
          <p>Este workflow foi finalizado com sucesso.</p>
          <button onClick={() => router.push('/colaborador/workflows')} className={styles.btnBack}>
            <ArrowLeft size={18} />
            Voltar para Workflows
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <button onClick={() => router.push('/colaborador/workflows')} className={styles.btnBack}>
          <ArrowLeft size={18} />
          Voltar
        </button>
        <div className={styles.headerInfo}>
          <h1>{instance.workflowName}</h1>
          <p>Etapa {instance.currentStageIndex + 1} de {workflow.stages.length}</p>
        </div>
      </div>

      {/* Progress */}
      <div className={styles.progressSection}>
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{
              width: `${((instance.currentStageIndex + 1) / workflow.stages.length) * 100}%`
            }}
          />
        </div>
        <div className={styles.stagesTimeline}>
          {workflow.stages.map((stage, index) => (
            <div
              key={stage.id}
              className={`${styles.stageMarker} ${
                index < instance.currentStageIndex
                  ? styles.completed
                  : index === instance.currentStageIndex
                  ? styles.current
                  : styles.pending
              }`}
            >
              {index < instance.currentStageIndex ? (
                <CheckCircle size={20} />
              ) : index === instance.currentStageIndex ? (
                <Clock size={20} />
              ) : (
                <div className={styles.dot} />
              )}
              <span>{stage.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Current Stage */}
      <div className={styles.stageCard}>
        <div className={styles.stageHeader}>
          <h2>{currentStage.name}</h2>
          <span className={styles.stageBadge} style={{ background: currentStage.color }}>
            Etapa Atual
          </span>
        </div>

        {currentStage.description && (
          <p className={styles.stageDescription}>{currentStage.description}</p>
        )}

        {/* Campos da Etapa */}
        <div className={styles.fieldsSection}>
          {/* Comentário */}
          {currentStage.requireComment && (
            <div className={styles.field}>
              <label>
                Comentário {currentStage.requireComment && <span className={styles.required}>*</span>}
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Digite seu comentário sobre esta etapa..."
                rows={4}
                className={styles.textarea}
              />
            </div>
          )}

          {/* Anexos */}
          {currentStage.requireAttachments && (
            <div className={styles.field}>
              <label>
                Anexos {currentStage.requireAttachments && <span className={styles.required}>*</span>}
              </label>
              <input
                type="file"
                multiple
                onChange={(e) => {
                  // TODO: Implementar upload de arquivos
                  const files = Array.from(e.target.files || []);
                  setAttachments(files.map(f => f.name));
                }}
                className={styles.fileInput}
              />
              {attachments.length > 0 && (
                <div className={styles.attachmentList}>
                  {attachments.map((name, i) => (
                    <div key={i} className={styles.attachmentItem}>
                      {name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className={styles.actions}>
          <button
            onClick={handleCancel}
            className={styles.btnCancel}
            disabled={submitting}
          >
            <XCircle size={18} />
            Cancelar Workflow
          </button>
          <button
            onClick={handleReject}
            className={styles.btnReject}
            disabled={submitting}
          >
            Rejeitar Etapa
          </button>
          <button
            onClick={handleValidate}
            className={styles.btnValidate}
            disabled={submitting}
          >
            {submitting ? (
              'Processando...'
            ) : (
              <>
                <Send size={18} />
                Validar e Avançar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
