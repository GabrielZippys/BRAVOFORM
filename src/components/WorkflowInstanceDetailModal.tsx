'use client';

import React, { useState, useEffect } from 'react';
import { X, CheckCircle, XCircle, Clock, User, Calendar, FileText, Paperclip, Download } from 'lucide-react';
import type { WorkflowInstance, WorkflowDocument, StageHistoryEntry } from '@/types';
import { WorkflowServicePg as WorkflowService } from '@/services/workflowServicePg';
import styles from '../../app/styles/WorkflowInstanceDetailModal.module.css';

interface WorkflowInstanceDetailModalProps {
  instance: WorkflowInstance;
  onClose: () => void;
}

export default function WorkflowInstanceDetailModal({
  instance,
  onClose
}: WorkflowInstanceDetailModalProps) {
  const [workflow, setWorkflow] = useState<WorkflowDocument | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWorkflow();
  }, [instance.workflowId]);

  const loadWorkflow = async () => {
    try {
      const workflowData = await WorkflowService.loadWorkflow(instance.workflowId);
      setWorkflow(workflowData);
    } catch (error) {
      console.error('Erro ao carregar workflow:', error);
    } finally {
      setLoading(false);
    }
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

  const formatDuration = (milliseconds?: number) => {
    if (!milliseconds) return '-';
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={20} color="#10B981" />;
      case 'rejected':
      case 'cancelled':
        return <XCircle size={20} color="#EF4444" />;
      case 'in_progress':
        return <Clock size={20} color="#F59E0B" />;
      default:
        return <Clock size={20} color="#6B7280" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Concluído';
      case 'rejected':
        return 'Rejeitado';
      case 'cancelled':
        return 'Cancelado';
      case 'in_progress':
        return 'Em Andamento';
      default:
        return status;
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'validated':
        return 'Validado';
      case 'rejected':
        return 'Rejeitado';
      case 'cancelled':
        return 'Cancelado';
      default:
        return action;
    }
  };

  const handleExportPDF = () => {
    // TODO: Implementar exportação em PDF
    alert('Exportação em PDF será implementada em breve');
  };

  const handleExportExcel = () => {
    // TODO: Implementar exportação em Excel
    alert('Exportação em Excel será implementada em breve');
  };

  if (loading) {
    return (
      <div className={styles.overlay}>
        <div className={styles.modal}>
          <div className={styles.loading}>Carregando detalhes...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <div>
            <h2>{instance.workflowName}</h2>
            <p className={styles.instanceId}>ID: {instance.id}</p>
          </div>
          <div className={styles.headerActions}>
            <button onClick={handleExportPDF} className={styles.btnExport} title="Exportar PDF">
              <Download size={18} />
              PDF
            </button>
            <button onClick={handleExportExcel} className={styles.btnExport} title="Exportar Excel">
              <Download size={18} />
              Excel
            </button>
            <button onClick={onClose} className={styles.closeButton}>
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className={styles.content}>
          {/* Informações Gerais */}
          <div className={styles.section}>
            <h3>Informações Gerais</h3>
            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <User size={18} />
                <div>
                  <label>Atribuído a</label>
                  <span>{instance.assignedToName}</span>
                </div>
              </div>
              <div className={styles.infoItem}>
                <div className={styles.statusBadge}>
                  {getStatusIcon(instance.status)}
                  <span>{getStatusLabel(instance.status)}</span>
                </div>
              </div>
              <div className={styles.infoItem}>
                <Calendar size={18} />
                <div>
                  <label>Iniciado em</label>
                  <span>{formatDate(instance.startedAt)}</span>
                </div>
              </div>
              {instance.completedAt && (
                <div className={styles.infoItem}>
                  <Calendar size={18} />
                  <div>
                    <label>Concluído em</label>
                    <span>{formatDate(instance.completedAt)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Timeline de Etapas */}
          <div className={styles.section}>
            <h3>Timeline de Etapas</h3>
            <div className={styles.timeline}>
              {instance.stageHistory.map((entry, index) => {
                const isLast = index === instance.stageHistory.length - 1;
                const isCurrent = entry.stageId === instance.currentStageId;

                return (
                  <div key={index} className={`${styles.timelineItem} ${isCurrent ? styles.current : ''}`}>
                    <div className={styles.timelineMarker}>
                      {entry.completedAt ? (
                        <CheckCircle size={24} color="#10B981" />
                      ) : (
                        <Clock size={24} color={isCurrent ? '#3B82F6' : '#6B7280'} />
                      )}
                    </div>
                    {!isLast && <div className={styles.timelineLine} />}
                    <div className={styles.timelineContent}>
                      <div className={styles.timelineHeader}>
                        <h4>{entry.stageName}</h4>
                        {entry.action && (
                          <span className={`${styles.actionBadge} ${styles[entry.action]}`}>
                            {getActionLabel(entry.action)}
                          </span>
                        )}
                      </div>
                      <div className={styles.timelineDetails}>
                        <div className={styles.timelineDate}>
                          <Calendar size={14} />
                          <span>Entrada: {formatDate(entry.enteredAt)}</span>
                        </div>
                        {entry.completedAt && (
                          <div className={styles.timelineDate}>
                            <Calendar size={14} />
                            <span>Conclusão: {formatDate(entry.completedAt)}</span>
                          </div>
                        )}
                        {entry.duration && (
                          <div className={styles.timelineDuration}>
                            <Clock size={14} />
                            <span>Duração: {formatDuration(entry.duration)}</span>
                          </div>
                        )}
                        {entry.completedByName && (
                          <div className={styles.timelineUser}>
                            <User size={14} />
                            <span>{entry.completedByName}</span>
                          </div>
                        )}
                      </div>
                      {entry.comment && (
                        <div className={styles.timelineComment}>
                          <FileText size={14} />
                          <p>{entry.comment}</p>
                        </div>
                      )}
                      {entry.attachments && entry.attachments.length > 0 && (
                        <div className={styles.timelineAttachments}>
                          <Paperclip size={14} />
                          <div className={styles.attachmentList}>
                            {entry.attachments.map((attachment, i) => (
                              <a key={i} href={attachment} target="_blank" rel="noopener noreferrer">
                                Anexo {i + 1}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Dados Preenchidos */}
          {Object.keys(instance.fieldData).length > 0 && (
            <div className={styles.section}>
              <h3>Dados Preenchidos</h3>
              <div className={styles.fieldDataGrid}>
                {Object.entries(instance.fieldData).map(([key, value]) => (
                  <div key={key} className={styles.fieldDataItem}>
                    <label>{key}</label>
                    <span>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button onClick={onClose} className={styles.btnClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
