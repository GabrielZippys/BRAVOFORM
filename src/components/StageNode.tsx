'use client';

import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { Settings, Trash2, ArrowLeft, ArrowRight } from 'lucide-react';
import type { WorkflowStage } from '@/types';
import { getStageTypeDefinition } from '@/utils/stageTypes';
import styles from '../../app/styles/StageNode.module.css';

interface StageNodeProps {
  data: {
    stage: WorkflowStage;
    onDelete: (id: string, name: string) => void;
    onEdit: (id: string) => void;
    onConfigureRouting: () => void;
    onReorder?: (id: string, direction: 'left' | 'right') => void;
    hasMultiplePaths: boolean;
    /** Posição da etapa no fluxo (1-indexed) — calculada pela posição X no canvas */
    stagePosition?: number;
    /** Total de etapas no fluxo */
    totalStages?: number;
    /** Indica se esta é a primeira etapa (entrada do workflow) */
    isFirstStage?: boolean;
    /** Indica se esta é a última etapa (sem saída) */
    isLastStage?: boolean;
  };
  selected?: boolean;
}

function StageNode({ data, selected }: StageNodeProps) {
  const {
    stage, onDelete, onEdit, onReorder,
    stagePosition, totalStages, isFirstStage, isLastStage,
  } = data;
  const stageTypeDef = getStageTypeDefinition(stage.stageType);

  const canMoveLeft  = !!onReorder && (stagePosition ?? 1) > 1;
  const canMoveRight = !!onReorder && (stagePosition ?? 0) < (totalStages ?? 0);

  return (
    <div
      className={`${styles.stageNode} ${selected ? styles.selected : ''} ${isFirstStage ? styles.firstStage : ''}`}
      onClick={() => {
        console.log('StageNode clicked:', stage.id);
        onEdit(stage.id);
      }}
    >
      <Handle type="target" position={Position.Left} className={styles.handle} />

      {/* Badge de posição (sempre visível, fora do header) */}
      {stagePosition && (
        <div
          className={styles.positionMarker}
          title={isFirstStage ? 'Etapa de entrada — toda nova instância começa aqui' : `Etapa ${stagePosition} de ${totalStages}`}
          style={{ background: isFirstStage ? '#10B981' : stage.color }}
        >
          {isFirstStage ? '🏁' : `${stagePosition}º`}
        </div>
      )}

      <div className={styles.header} style={{ backgroundColor: stage.color }}>
        <div className={styles.headerContent}>
          <span className={styles.stageIcon}>{stageTypeDef.icon}</span>
          <span className={styles.stageName}>{stage.name}</span>
          <div className={styles.actions}>
            {/* Setas de reordenação */}
            {onReorder && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canMoveLeft) onReorder(stage.id, 'left');
                  }}
                  className={styles.btnAction}
                  disabled={!canMoveLeft}
                  title="Mover para a esquerda (etapa mais cedo)"
                  style={{ opacity: canMoveLeft ? 1 : 0.3, cursor: canMoveLeft ? 'pointer' : 'not-allowed' }}
                >
                  <ArrowLeft size={14} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canMoveRight) onReorder(stage.id, 'right');
                  }}
                  className={styles.btnAction}
                  disabled={!canMoveRight}
                  title="Mover para a direita (etapa mais tarde)"
                  style={{ opacity: canMoveRight ? 1 : 0.3, cursor: canMoveRight ? 'pointer' : 'not-allowed' }}
                >
                  <ArrowRight size={14} />
                </button>
              </>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(stage.id);
              }}
              className={styles.btnAction}
              title="Configurar etapa"
            >
              <Settings size={14} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(stage.id, stage.name);
              }}
              className={styles.btnDelete}
              title={isFirstStage ? 'Excluir (próxima etapa virará a inicial)' : 'Excluir'}
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
          {isFirstStage && (
            <span className={styles.badge} style={{ background: '#D1FAE5', color: '#065F46', fontWeight: 700 }}>
              🏁 INÍCIO
            </span>
          )}
          {isLastStage && !isFirstStage && (
            <span className={styles.badge} style={{ background: '#DBEAFE', color: '#1E40AF', fontWeight: 700 }}>
              🎯 FIM
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
          {stage.requireForms && (
            <span className={styles.badge} style={{ background: '#FCE7F3', color: '#9D174D' }}>
              Formulários
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
