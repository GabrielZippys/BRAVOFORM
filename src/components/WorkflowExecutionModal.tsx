'use client';

import React, { useState, useEffect } from 'react';
import { WorkflowInstanceService } from '@/services/workflowInstanceService';
import { WorkflowService } from '@/services/workflowService';
import { CheckCircle, XCircle, Clock, Send } from 'lucide-react';
import type { WorkflowInstance, WorkflowDocument, WorkflowStage } from '@/types';

interface WorkflowExecutionModalProps {
  instanceId: string;
  userId: string;
  userName: string;
  onClose: () => void;
  onComplete?: () => void;
}

export default function WorkflowExecutionModal({
  instanceId,
  userId,
  userName,
  onClose,
  onComplete
}: WorkflowExecutionModalProps) {
  const [instance, setInstance] = useState<WorkflowInstance | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowDocument | null>(null);
  const [currentStage, setCurrentStage] = useState<WorkflowStage | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [fieldData, setFieldData] = useState<Record<string, any>>({});
  const [comment, setComment] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);

  useEffect(() => {
    loadData();
  }, [instanceId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const instanceData = await WorkflowInstanceService.getInstance(instanceId);
      if (!instanceData) {
        alert('Instância não encontrada');
        onClose();
        return;
      }

      if (instanceData.assignedTo !== userId) {
        alert('Você não tem permissão para acessar esta instância');
        onClose();
        return;
      }

      setInstance(instanceData);

      const workflowData = await WorkflowService.loadWorkflow(instanceData.workflowId);
      if (!workflowData) {
        alert('Workflow não encontrado');
        onClose();
        return;
      }

      setWorkflow(workflowData);
      const stage = workflowData.stages[instanceData.currentStageIndex];
      setCurrentStage(stage);
      setFieldData(instanceData.fieldData || {});
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      alert('Erro ao carregar workflow');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleValidate = async () => {
    if (!instance || !currentStage) return;

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
        userId,
        userName,
        'validated',
        fieldData,
        comment || undefined,
        attachments.length > 0 ? attachments : undefined
      );

      await loadData();
      setComment('');
      setAttachments([]);

      alert('Etapa validada com sucesso!');
      if (onComplete) onComplete();
    } catch (error) {
      console.error('Erro ao validar etapa:', error);
      alert('Erro ao validar etapa. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!instance) return;

    if (!confirm('Deseja realmente rejeitar esta etapa?')) return;

    setSubmitting(true);
    try {
      await WorkflowInstanceService.advanceStage(
        instanceId,
        userId,
        userName,
        'rejected',
        fieldData,
        comment || 'Etapa rejeitada',
        attachments.length > 0 ? attachments : undefined
      );

      await loadData();
      alert('Etapa rejeitada. Voltando para etapa anterior.');
      if (onComplete) onComplete();
    } catch (error) {
      console.error('Erro ao rejeitar etapa:', error);
      alert('Erro ao rejeitar etapa. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={overlayStyle}>
        <div style={modalStyle}>
          <div style={{ textAlign: 'center', padding: '40px', color: '#fff' }}>
            <div style={{ marginBottom: '16px' }}>Carregando workflow...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!instance || !workflow || !currentStage) {
    return (
      <div style={overlayStyle}>
        <div style={modalStyle}>
          <div style={{ textAlign: 'center', padding: '40px', color: '#fff' }}>
            <p>Erro ao carregar workflow</p>
            <button onClick={onClose} style={buttonStyle}>Fechar</button>
          </div>
        </div>
      </div>
    );
  }

  if (instance.status === 'completed') {
    return (
      <div style={overlayStyle}>
        <div style={modalStyle}>
          <div style={{ textAlign: 'center', padding: '40px', color: '#fff' }}>
            <CheckCircle size={64} color="#10B981" style={{ margin: '0 auto 16px' }} />
            <h2 style={{ margin: '0 0 8px 0' }}>Workflow Concluído!</h2>
            <p style={{ margin: '0 0 24px 0', color: '#94a3b8' }}>Este workflow foi finalizado com sucesso.</p>
            <button onClick={onClose} style={buttonStyle}>Fechar</button>
          </div>
        </div>
      </div>
    );
  }

  const progress = ((instance.currentStageIndex + 1) / workflow.stages.length) * 100;

  return (
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, maxWidth: '800px', maxHeight: '90vh', overflow: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #334155' }}>
          <div>
            <h2 style={{ margin: 0, color: '#fff', fontSize: '24px' }}>{instance.workflowName}</h2>
            <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '14px' }}>
              Etapa {instance.currentStageIndex + 1} de {workflow.stages.length}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '24px', cursor: 'pointer', padding: 0 }}>
            ✕
          </button>
        </div>

        {/* Progress Bar */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ background: '#0f172a', borderRadius: '8px', height: '8px', overflow: 'hidden' }}>
            <div style={{ background: '#8b5cf6', height: '100%', width: `${progress}%`, transition: 'width 0.3s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', gap: '8px' }}>
            {workflow.stages.map((stage, index) => (
              <div key={stage.id} style={{ flex: 1, textAlign: 'center', fontSize: '12px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  margin: '0 auto 4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: index < instance.currentStageIndex ? '#10b981' : index === instance.currentStageIndex ? '#8b5cf6' : '#334155',
                  color: '#fff'
                }}>
                  {index < instance.currentStageIndex ? <CheckCircle size={16} /> : index === instance.currentStageIndex ? <Clock size={16} /> : index + 1}
                </div>
                <span style={{ color: index === instance.currentStageIndex ? '#fff' : '#64748b', fontSize: '11px' }}>{stage.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Current Stage */}
        <div style={{ background: '#0f172a', borderRadius: '12px', padding: '24px', marginBottom: '24px', border: '2px solid #8b5cf6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, color: '#fff', fontSize: '20px' }}>{currentStage.name}</h3>
            <span style={{ background: currentStage.color || '#8b5cf6', color: '#fff', padding: '4px 12px', borderRadius: '12px', fontSize: '12px' }}>
              Etapa Atual
            </span>
          </div>

          {currentStage.description && (
            <p style={{ color: '#cbd5e1', margin: '0 0 20px 0', fontSize: '14px' }}>{currentStage.description}</p>
          )}

          {/* Comentário */}
          {currentStage.requireComment && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: '#fff', marginBottom: '8px', fontSize: '14px' }}>
                Comentário {currentStage.requireComment && <span style={{ color: '#ef4444' }}>*</span>}
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Digite seu comentário sobre esta etapa..."
                rows={4}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '14px',
                  resize: 'vertical'
                }}
              />
            </div>
          )}

          {/* Anexos */}
          {currentStage.requireAttachments && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: '#fff', marginBottom: '8px', fontSize: '14px' }}>
                Anexos {currentStage.requireAttachments && <span style={{ color: '#ef4444' }}>*</span>}
              </label>
              <input
                type="file"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  setAttachments(files.map(f => f.name));
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '14px'
                }}
              />
              {attachments.length > 0 && (
                <div style={{ marginTop: '8px' }}>
                  {attachments.map((name, i) => (
                    <div key={i} style={{ background: '#1e293b', padding: '8px 12px', borderRadius: '4px', marginBottom: '4px', fontSize: '12px', color: '#cbd5e1' }}>
                      {name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={handleReject}
            disabled={submitting}
            style={{
              padding: '12px 24px',
              background: '#ef4444',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              opacity: submitting ? 0.5 : 1
            }}
          >
            Rejeitar Etapa
          </button>
          <button
            onClick={handleValidate}
            disabled={submitting}
            style={{
              padding: '12px 24px',
              background: '#10b981',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              opacity: submitting ? 0.5 : 1
            }}
          >
            {submitting ? 'Processando...' : (
              <>
                <Send size={16} />
                Validar e Avançar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0, 0, 0, 0.8)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  background: '#1e293b',
  borderRadius: '12px',
  padding: '32px',
  maxWidth: '600px',
  width: '90%',
  border: '2px solid #8b5cf6',
};

const buttonStyle: React.CSSProperties = {
  padding: '10px 20px',
  background: '#8b5cf6',
  border: 'none',
  borderRadius: '6px',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '14px',
};
