'use client';

import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { Settings, Trash2 } from 'lucide-react';
import type { WorkflowStage } from '@/types';
import { getStageTypeDefinition } from '@/utils/stageTypes';
import styles from '../../app/styles/StageNode.module.css';

interface StageNodeProps {
  data: {
    stage: WorkflowStage;
    onDelete: (id: string, name: string) => void;
    onEdit: (id: string) => void;
    onConfigureRouting: () => void;
    hasMultiplePaths: boolean;
  };
  selected?: boolean;
}

function StageNode({ data, selected }: StageNodeProps) {
  const { stage, onDelete, onEdit, hasMultiplePaths, onConfigureRouting } = data;
  const stageTypeDef = getStageTypeDefinition(stage.stageType);

  return (
    <div 
      className={`${styles.stageNode} ${selected ? styles.selected : ''}`}
      onClick={() => {
        console.log('StageNode clicked:', stage.id);
        onEdit(stage.id);
      }}
    >
      <Handle type="target" position={Position.Left} className={styles.handle} />
      
      <div className={styles.header} style={{ backgroundColor: stage.color }}>
        <div className={styles.headerContent}>
          <span className={styles.stageIcon}>{stageTypeDef.icon}</span>
          <span className={styles.stageName}>{stage.name}</span>
          <div className={styles.actions}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(stage.id);
              }}
              className={styles.btnAction}
              title="Configurar"
            >
              <Settings size={14} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(stage.id, stage.name);
              }}
              className={styles.btnDelete}
              title="Excluir"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.badges}>
          <span className={styles.badge} style={{ background: '#F3F4F6', color: '#374151' }}>
            {stageTypeDef.label}
          </span>
          {stage.isInitialStage && (
            <span className={styles.badge} style={{ background: '#DBEAFE', color: '#1E40AF' }}>
              Inicial
            </span>
          )}
          {stage.isFinalStage && (
            <span className={styles.badge} style={{ background: '#D1FAE5', color: '#065F46' }}>
              FINAL
            </span>
          )}
          {stage.requireComment && (
            <span className={styles.badge} style={{ background: '#FEF3C7', color: '#92400E' }}>
              Comentário
            </span>
          )}
          {stage.requireAttachments && (
            <span className={styles.badge} style={{ background: '#E0E7FF', color: '#3730A3' }}>
              Anexos
            </span>
          )}
        </div>

        <div className={styles.info}>
          {stage.allowedRoles.length > 0 && (
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Departamentos:</span>
              <span className={styles.infoValue}>{stage.allowedRoles.length}</span>
            </div>
          )}
          {stage.allowedUsers.length > 0 && (
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Usuários:</span>
              <span className={styles.infoValue}>{stage.allowedUsers.length}</span>
            </div>
          )}
          {(stage.autoNotifications.email || stage.autoNotifications.whatsapp) && (
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Notificações:</span>
              <span className={styles.infoValue}>
                {stage.autoNotifications.email ? '📧' : ''} 
                {stage.autoNotifications.whatsapp ? '📱' : ''}
              </span>
            </div>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} className={styles.handle} />
    </div>
  );
}

export default memo(StageNode);
