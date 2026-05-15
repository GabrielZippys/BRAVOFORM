'use client';

import React, { useState, useEffect } from 'react';
import { X, Tag, Type, Palette, MessageSquare, Paperclip, CheckCircle, Users, Building2, Mail, MessageCircle, FileText, Clock, AlertCircle } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import type { WorkflowStage, Department, Collaborator } from '@/types';
import { STAGE_TYPES, getDefaultColorForType, getStageTypeDefinition, getAdvanceLabel } from '@/utils/stageTypes';
import FormSelectionModal from './FormSelectionModal';
import TriggerConfigPanel from './TriggerConfigPanel';
import StageCommentsPanel from './StageCommentsPanel';
import SubWorkflowSelector from './SubWorkflowSelector';
import IdentityLookupConfig from './IdentityLookupConfig';
import ExecutionFormBuilder from './ExecutionFormBuilder';
import { useAuth } from '@/hooks/useAuth';
import styles from '../../app/styles/StageConfigPanel.module.css';

interface StageConfigPanelProps {
  stage: WorkflowStage;
  onUpdate: (updates: Partial<WorkflowStage>) => void;
  onClose: () => void;
  workflowCompanies?: string[];
  workflowDepartments?: string[];
  /** ID do workflow — usado para os comentários colaborativos. */
  workflowId?: string;
  /** Posição da etapa no workflow (1-indexed). Usado para exibir "Etapa 1 de N". */
  stagePosition?: number;
  /** Total de etapas no workflow. */
  totalStages?: number;
  /** Indica se esta é a primeira etapa (entrada do workflow). */
  isFirstStage?: boolean;
  /** Indica se esta é a última etapa (sem saída). */
  isLastStage?: boolean;
}

export default function StageConfigPanel({
  stage,
  onUpdate,
  onClose,
  workflowCompanies = [],
  workflowDepartments = [],
  workflowId,
  stagePosition,
  totalStages,
  isFirstStage,
  isLastStage,
}: StageConfigPanelProps) {
  const { user, appUser } = useAuth();
  const [forms, setForms] = useState<any[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);

  useEffect(() => {
    loadDepartmentsAndUsers();
  }, []);

  // Inicializar timer para etapas de aguardo
  useEffect(() => {
    const stageTypeDef = STAGE_TYPES.find(t => t.type === stage.stageType);
    if (stageTypeDef?.fields.showTimer && !stage.timer) {
      onUpdate({
        timer: {
          type: 'hours',
          value: 1,
          autoAdvance: true
        }
      });
    }
  }, [stage.stageType]);

  const loadDepartmentsAndUsers = async () => {
    try {
      console.log('🔍 Carregando dados do workflow...');
      console.log('Companies:', workflowCompanies);
      console.log('Departments IDs:', workflowDepartments);

      // Carregar departamentos do workflow
      const allDepts: Department[] = [];
      for (const companyId of workflowCompanies) {
        const deptsSnapshot = await getDocs(collection(db, `companies/${companyId}/departments`));
        const depts = deptsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Department[];
        allDepts.push(...depts.filter(d => workflowDepartments.includes(d.id)));
      }
      console.log('📁 Departamentos carregados:', allDepts);
      setDepartments(allDepts);

      // Carregar formulários dos departamentos do workflow
      const formsData: any[] = [];
      for (const deptId of workflowDepartments) {
        const formsSnapshot = await getDocs(
          query(collection(db, 'forms'), where('departmentId', '==', deptId))
        );
        formsSnapshot.docs.forEach(doc => {
          formsData.push({ id: doc.id, ...doc.data() });
        });
      }
      console.log('📄 Formulários carregados:', formsData.length);
      console.log('📋 Dados dos formulários:', formsData.map(f => ({
        id: f.id,
        name: f.name,
        title: f.title,
        departmentId: f.departmentId
      })));
      setForms(formsData);

      // Carregar colaboradores dos departamentos do workflow
      const deptIds = allDepts.map(d => d.id);
      console.log('🔑 IDs dos departamentos para filtrar:', deptIds);
      
      const collabsSnapshot = await getDocs(collection(db, 'collaborators'));
      console.log('👥 Total de colaboradores no Firestore:', collabsSnapshot.docs.length);
      
      const allCollabs = collabsSnapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      })) as Collaborator[];
      
      console.log('📊 Amostra de colaboradores:', allCollabs.slice(0, 3).map(c => ({
        id: c.id,
        username: c.username,
        departmentId: c.departmentId,
        department: (c as any).department
      })));

      // Criar lista de nomes dos departamentos
      const deptNames = allDepts.map(d => d.name);
      
      const collabsData = allCollabs.filter(c => {
        // Prioridade 1: Filtrar por department (nome) - é o que existe no Firestore
        const deptName = (c as any).department;
        if (deptName && deptNames.includes(deptName)) {
          console.log(`✅ ${c.username} - department: ${deptName}`);
          return true;
        }
        
        // Fallback: Filtrar por departmentId se existir
        if (c.departmentId && deptIds.includes(c.departmentId)) {
          console.log(`✅ ${c.username} - departmentId: ${c.departmentId}`);
          return true;
        }
        
        return false;
      });
      
      console.log('✅ Colaboradores filtrados:', collabsData.length);
      console.log('👤 Usuários:', collabsData.map(c => c.username));
      setCollaborators(collabsData);
    } catch (error) {
      console.error('❌ Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };


  const handleDepartmentToggle = (deptId: string) => {
    const newRoles = stage.allowedRoles.includes(deptId)
      ? stage.allowedRoles.filter(id => id !== deptId)
      : [...stage.allowedRoles, deptId];
    onUpdate({ allowedRoles: newRoles });
  };

  const handleUserToggle = (userId: string) => {
    const newUsers = stage.allowedUsers.includes(userId)
      ? stage.allowedUsers.filter(id => id !== userId)
      : [...stage.allowedUsers, userId];
    // Salvar em ambos os campos para compatibilidade
    onUpdate({ 
      allowedUsers: newUsers,
      assignedUsers: newUsers 
    });
  };

  const handleFormToggle = (formId: string) => {
    const currentFormIds = stage.formIds || [];
    const newFormIds = currentFormIds.includes(formId)
      ? currentFormIds.filter(id => id !== formId)
      : [...currentFormIds, formId];
    onUpdate({ formIds: newFormIds });
  };

  return (
    <div 
      className={styles.overlay} 
      onClick={(e) => {
        console.log('Overlay clicked');
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex'
      }}
    >
      <div
        className={styles.panel}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          zIndex: 100000,
          background: 'white',
          maxWidth: '680px',
          width: '100%',
          height: '100%'
        }}
      >
        {(() => {
          const currentDef = getStageTypeDefinition(stage.stageType);
          const positionLabel = stagePosition && totalStages
            ? `Etapa ${stagePosition} de ${totalStages}`
            : 'Etapa';
          return (
            <>
              <div className={styles.headerV2}>
                <div className={styles.headerTopRow}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span className={styles.positionBadge}>
                      #{stagePosition ?? '?'} · {positionLabel}
                    </span>
                    {isFirstStage && (
                      <span className={`${styles.positionBadge} ${styles.initial}`}>
                        🏁 INÍCIO DO FLOW
                      </span>
                    )}
                    {isLastStage && !isFirstStage && (
                      <span className={`${styles.positionBadge} ${styles.final}`}>
                        🎯 FIM
                      </span>
                    )}
                  </div>
                  <button onClick={onClose} className={styles.btnClose}>
                    <X size={20} />
                  </button>
                </div>
                <div className={styles.stageTitleRow}>
                  <div
                    className={styles.stageIconBox}
                    style={{ background: `${stage.color}25`, color: stage.color }}
                  >
                    {currentDef.icon}
                  </div>
                  <h3 className={styles.stageNameInline}>
                    {stage.name || 'Etapa sem nome'}
                  </h3>
                </div>
              </div>

              {/* Resumo técnico — o que esta etapa fará em runtime */}
              <div className={styles.techSummary}>
                <div className={styles.techSummaryTitle}>
                  <AlertCircle size={12} />
                  Como esta etapa funciona
                </div>
                <p className={styles.techSummaryBody}>{currentDef.behavior}</p>
                <div className={styles.techSummaryGrid}>
                  <div className={styles.techSummaryItem}>
                    <strong>Avanço:</strong>
                    <span>{getAdvanceLabel(currentDef.whoAdvances)}</span>
                  </div>
                  <div className={styles.techSummaryItem}>
                    <strong>Recebe:</strong>
                    <span>{currentDef.inputs.join(' · ')}</span>
                  </div>
                  <div className={styles.techSummaryItem}>
                    <strong>Produz:</strong>
                    <span>{currentDef.outputs.join(' · ')}</span>
                  </div>
                  {isFirstStage && (
                    <div className={styles.techSummaryItem} style={{ marginTop: 4, color: '#065F46', fontWeight: 600 }}>
                      <strong>⚡ Ponto de entrada:</strong>
                      <span>Toda nova instância deste workflow começa aqui.</span>
                    </div>
                  )}
                </div>
              </div>
            </>
          );
        })()}

        <div className={styles.content}>
          {/* Tipo de Etapa — Cards técnicos em grid */}
          <div className={styles.sectionGroup}>
            <div className={styles.sectionGroupHeader}>
              <Tag size={12} />
              Tipo de Etapa (define o comportamento)
            </div>
            <div className={styles.sectionGroupBody}>
              <div className={styles.typeCardGrid}>
                {STAGE_TYPES.map((type) => {
                  const isActive = stage.stageType === type.type;
                  return (
                    <button
                      key={type.type}
                      type="button"
                      className={`${styles.typeCard} ${isActive ? styles.active : ''}`}
                      onClick={() => onUpdate({
                        stageType: type.type,
                        color: getDefaultColorForType(type.type),
                      })}
                      style={{
                        ['--type-color' as any]: type.color,
                        ['--type-bg' as any]: `${type.color}15`,
                        ['--type-shadow' as any]: `${type.color}30`,
                      }}
                    >
                      <div className={styles.typeCardHeader}>
                        <span className={styles.typeCardIcon}>{type.icon}</span>
                        <span className={styles.typeCardLabel}>{type.label}</span>
                      </div>
                      <div className={styles.typeCardDesc}>{type.description}</div>
                    </button>
                  );
                })}
              </div>
              <div className={styles.techHint}>
                <span>💡</span>
                <span>
                  Exemplos para <strong>{getStageTypeDefinition(stage.stageType).label}</strong>:{' '}
                  <code>{getStageTypeDefinition(stage.stageType).examples}</code>
                </span>
              </div>
            </div>
          </div>

          {/* Nome e Cor lado a lado */}
          <div className={styles.row}>
            <div className={styles.section} style={{ flex: 2 }}>
              <div className={styles.labelWithIcon}>
                <Type size={18} />
                <label>Nome da Etapa</label>
              </div>
              <input
                type="text"
                value={stage.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
                className={styles.input}
                placeholder="Ex: Aprovação Gerencial"
              />
            </div>

            <div className={styles.section} style={{ flex: 1 }}>
              <div className={styles.formGroup}>
                <label>
                  <Palette size={18} />
                  Cor
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="color"
                    value={stage.color}
                    onChange={(e) => onUpdate({ color: e.target.value })}
                  />
                  <span>{stage.color}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Requisitos (condicionais baseados no tipo de etapa) - esconder para etapas com timer e notificação */}
          {!STAGE_TYPES.find(t => t.type === stage.stageType)?.fields.showTimer && 
           !STAGE_TYPES.find(t => t.type === stage.stageType)?.fields.showNotifications && (
            <>
              {/* Separador */}
              <div className={styles.divider}></div>

              <div className={styles.section}>
                <h4 className={styles.sectionTitle}>Requisitos</h4>
                
                {/* Trigger Automático para etapas de execução */}
                {stage.stageType === 'execution' ? (
                  <TriggerConfigPanel
                    trigger={stage.trigger}
                    onUpdate={(trigger) => onUpdate({ trigger })}
                  />
                ) : (
                  <div className={styles.checkboxGroup}>
                    {STAGE_TYPES.find(t => t.type === stage.stageType)?.fields.requireComment !== undefined && (
                      <label className={styles.checkboxCard}>
                        <input
                          type="checkbox"
                          checked={stage.requireComment}
                          onChange={(e) => onUpdate({ requireComment: e.target.checked })}
                        />
                        <div className={styles.checkboxContent}>
                          <MessageSquare size={20} />
                          <div>
                            <strong>Exigir comentário</strong>
                            <p>Obrigatório adicionar comentário ao mover para esta etapa</p>
                          </div>
                        </div>
                      </label>
                    )}

                    {STAGE_TYPES.find(t => t.type === stage.stageType)?.fields.requireAttachments !== undefined && (
                      <label className={styles.checkboxCard}>
                        <input
                          type="checkbox"
                          checked={stage.requireAttachments}
                          onChange={(e) => onUpdate({ requireAttachments: e.target.checked })}
                        />
                        <div className={styles.checkboxContent}>
                          <Paperclip size={20} />
                          <div>
                            <strong>Exigir anexos</strong>
                            <p>Obrigatório anexar arquivos ao mover para esta etapa</p>
                          </div>
                        </div>
                      </label>
                    )}

                    {STAGE_TYPES.find(t => t.type === stage.stageType)?.fields.requireForms !== undefined && (
                      <label className={styles.checkboxCard}>
                        <input
                          type="checkbox"
                          checked={stage.requireForms || false}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            onUpdate({ requireForms: isChecked });
                            if (!isChecked) {
                              onUpdate({ formIds: [] });
                            } else {
                              setIsFormModalOpen(true);
                            }
                          }}
                        />
                        <div 
                          className={styles.checkboxContent}
                          onClick={(e) => {
                            if (stage.requireForms) {
                              e.preventDefault();
                              setIsFormModalOpen(true);
                            }
                          }}
                          style={{ cursor: stage.requireForms ? 'pointer' : 'default' }}
                        >
                          <FileText size={20} />
                          <div>
                            <strong>Exigir formulários</strong>
                            <p>
                              {stage.requireForms && stage.formIds && stage.formIds.length > 0
                                ? `${stage.formIds.length} formulário${stage.formIds.length > 1 ? 's' : ''} selecionado${stage.formIds.length > 1 ? 's' : ''} - Clique para editar`
                                : 'Obrigatório responder formulários nesta etapa'}
                            </p>
                          </div>
                        </div>
                      </label>
                    )}
                  </div>
                )}
              </div>

              {/* Separador */}
              <div className={styles.divider}></div>
            </>
          )}

          {/* Configuração de Validação (apenas para etapas de validação) */}
          {STAGE_TYPES.find(t => t.type === stage.stageType)?.fields.showValidation && (
            <>
              <div className={styles.section}>
                <div className={styles.labelWithIcon}>
                  <CheckCircle size={18} />
                  <h4>Configuração de Validação</h4>
                </div>

                <label className={styles.label} style={{ marginTop: '1rem' }}>
                    <span>Ações Permitidas na Validação:</span>
                  </label>

                  <label className={styles.checkboxCard}>
                      <input
                        type="checkbox"
                        checked={stage.validationConfig?.allowedActions?.includes('approve') || false}
                        onChange={(e) => {
                          const currentActions = stage.validationConfig?.allowedActions || [];
                          const newActions = e.target.checked
                            ? [...currentActions, 'approve']
                            : currentActions.filter(a => a !== 'approve');
                          onUpdate({
                            validationConfig: {
                              ...stage.validationConfig,
                              showPreviousStageData: true,
                              allowedActions: newActions as any,
                              requireCommentOnEdit: stage.validationConfig?.requireCommentOnEdit || true,
                              requireCommentOnReject: stage.validationConfig?.requireCommentOnReject || true,
                              keepEditHistory: true,
                            }
                          });
                        }}
                      />
                      <div className={styles.checkboxContent}>
                        <CheckCircle size={20} color="#10B981" />
                        <div>
                          <strong>✅ Aprovar e Avançar</strong>
                          <p>Validar dados e passar para próxima etapa</p>
                        </div>
                      </div>
                    </label>

                    <label className={styles.checkboxCard}>
                      <input
                        type="checkbox"
                        checked={stage.validationConfig?.allowedActions?.includes('approve_with_edit') || false}
                        onChange={(e) => {
                          const currentActions = stage.validationConfig?.allowedActions || [];
                          const newActions = e.target.checked
                            ? [...currentActions, 'approve_with_edit']
                            : currentActions.filter(a => a !== 'approve_with_edit');
                          onUpdate({
                            validationConfig: {
                              ...stage.validationConfig,
                              showPreviousStageData: true,
                              allowedActions: newActions as any,
                              requireCommentOnEdit: stage.validationConfig?.requireCommentOnEdit || true,
                              requireCommentOnReject: stage.validationConfig?.requireCommentOnReject || true,
                              keepEditHistory: true,
                            }
                          });
                        }}
                      />
                      <div className={styles.checkboxContent}>
                        <FileText size={20} color="#3B82F6" />
                        <div>
                          <strong>✏️ Aprovar com Edição</strong>
                          <p>Editar informações, adicionar comentários e manter histórico</p>
                        </div>
                      </div>
                    </label>

                    <label className={styles.checkboxCard}>
                      <input
                        type="checkbox"
                        checked={stage.validationConfig?.allowedActions?.includes('reject') || false}
                        onChange={(e) => {
                          const currentActions = stage.validationConfig?.allowedActions || [];
                          const newActions = e.target.checked
                            ? [...currentActions, 'reject']
                            : currentActions.filter(a => a !== 'reject');
                          onUpdate({
                            validationConfig: {
                              ...stage.validationConfig,
                              showPreviousStageData: true,
                              allowedActions: newActions as any,
                              requireCommentOnEdit: stage.validationConfig?.requireCommentOnEdit || true,
                              requireCommentOnReject: stage.validationConfig?.requireCommentOnReject || true,
                              keepEditHistory: true,
                            }
                          });
                        }}
                      />
                      <div className={styles.checkboxContent}>
                        <X size={20} color="#F59E0B" />
                        <div>
                          <strong>⬅️ Reprovar e Voltar</strong>
                          <p>Reprovar e retornar para etapa anterior</p>
                        </div>
                      </div>
                    </label>

                    <label className={styles.checkboxCard}>
                      <input
                        type="checkbox"
                        checked={stage.validationConfig?.allowedActions?.includes('destroy') || false}
                        onChange={(e) => {
                          const currentActions = stage.validationConfig?.allowedActions || [];
                          const newActions = e.target.checked
                            ? [...currentActions, 'destroy']
                            : currentActions.filter(a => a !== 'destroy');
                          onUpdate({
                            validationConfig: {
                              ...stage.validationConfig,
                              showPreviousStageData: true,
                              allowedActions: newActions as any,
                              requireCommentOnEdit: stage.validationConfig?.requireCommentOnEdit || true,
                              requireCommentOnReject: stage.validationConfig?.requireCommentOnReject || true,
                              keepEditHistory: true,
                            }
                          });
                        }}
                      />
                      <div className={styles.checkboxContent}>
                        <AlertCircle size={20} color="#EF4444" />
                        <div>
                          <strong>🗑️ Destruir Workflow</strong>
                          <p>Cancelar processo e apagar todos os dados</p>
                        </div>
                      </div>
                    </label>
              </div>

              <div className={styles.divider}></div>
            </>
          )}

          {/* Timer (apenas para etapas de aguardo) */}
          {STAGE_TYPES.find(t => t.type === stage.stageType)?.fields.showTimer && (
            <>
              <div className={styles.section}>
                <div className={styles.labelWithIcon}>
                  <Clock size={18} />
                  <h4>Configuração de Timer</h4>
                </div>
                <p className={styles.hint}>Configure quando esta etapa deve avançar automaticamente</p>

                <div style={{ marginTop: '1rem' }}>
                  <label className={styles.label}>
                    <span>Tipo de Timer:</span>
                  </label>
                  <select
                    value={stage.timer?.type || 'hours'}
                    onChange={(e) => {
                      const newType = e.target.value as 'date' | 'hours' | 'days';
                      onUpdate({
                        timer: {
                          type: newType,
                          value: newType === 'date' ? '' : 1,
                          autoAdvance: true
                        }
                      });
                    }}
                    className={styles.select}
                  >
                    <option value="hours">Aguardar Horas</option>
                    <option value="days">Aguardar Dias</option>
                    <option value="date">Data Específica</option>
                  </select>

                  {(stage.timer?.type || 'hours') === 'date' && (
                    <div style={{ marginTop: '1rem' }}>
                      <label className={styles.label}>
                        <span>Data e Hora:</span>
                      </label>
                      <input
                        type="datetime-local"
                        value={stage.timer?.value || ''}
                        onChange={(e) => onUpdate({
                          timer: {
                            type: 'date',
                            value: e.target.value,
                            autoAdvance: true
                          }
                        })}
                        className={styles.input}
                      />
                    </div>
                  )}

                  {(stage.timer?.type || 'hours') === 'hours' && (
                    <div style={{ marginTop: '1rem' }}>
                      <label className={styles.label}>
                        <span>Quantidade de Horas:</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={stage.timer?.value || 1}
                        onChange={(e) => onUpdate({
                          timer: {
                            type: 'hours',
                            value: parseInt(e.target.value),
                            autoAdvance: true
                          }
                        })}
                        className={styles.input}
                      />
                    </div>
                  )}

                  {(stage.timer?.type || 'hours') === 'days' && (
                    <div style={{ marginTop: '1rem' }}>
                      <label className={styles.label}>
                        <span>Quantidade de Dias:</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={stage.timer?.value || 1}
                        onChange={(e) => onUpdate({
                          timer: {
                            type: 'days',
                            value: parseInt(e.target.value),
                            autoAdvance: true
                          }
                        })}
                        className={styles.input}
                      />
                    </div>
                  )}

                  <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#F0F9FF', borderRadius: '0.5rem', border: '1px solid #BAE6FD' }}>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: '#0369A1', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Clock size={16} />
                      <span>Esta etapa avançará automaticamente quando o timer expirar</span>
                    </p>
                  </div>
                </div>
              </div>

              <div className={styles.divider}></div>
            </>
          )}

          {/* Usuários Permitidos (esconder para etapas de aguardo) */}
          {!STAGE_TYPES.find(t => t.type === stage.stageType)?.fields.hideUserPermissions && (
            <div className={styles.section}>
            <div className={styles.labelWithIcon}>
              <Users size={18} />
              <h4>Usuários Permitidos</h4>
            </div>
            <p className={styles.hint}>Selecione os usuários que podem executar esta etapa</p>
            {loading ? (
              <p>Carregando usuários...</p>
            ) : collaborators.length === 0 ? (
              <p className={styles.emptyText}>Nenhum usuário cadastrado nos departamentos deste workflow</p>
            ) : (
              <div className={styles.checkboxList}>
                {collaborators.map((user) => {
                  // Encontrar nome do departamento
                  // Prioridade 1: Pelo ID
                  let deptName = departments.find(d => d.id === user.departmentId)?.name;
                  
                  // Prioridade 2: Pelo campo department (nome)
                  if (!deptName) {
                    const userDept = (user as any).department;
                    deptName = departments.find(d => d.name === userDept)?.name || userDept;
                  }
                  
                  // Fallback
                  if (!deptName) {
                    deptName = 'Sem departamento';
                  }
                  
                  return (
                    <label key={user.id} className={styles.checkbox}>
                      <input
                        type="checkbox"
                        checked={stage.allowedUsers.includes(user.id)}
                        onChange={() => handleUserToggle(user.id)}
                      />
                      <span>
                        {user.username}
                        <small> ({deptName})</small>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          )}

          {/* Notificações (apenas para etapas específicas) */}
          {STAGE_TYPES.find(t => t.type === stage.stageType)?.fields.showNotifications && (
            <>
              <div className={styles.divider}></div>

              <div className={styles.section}>
                <h4 className={styles.sectionTitle}>Notificações Automáticas</h4>
                <div className={styles.checkboxGroup}>
                  <label className={styles.checkboxCard}>
                    <input
                      type="checkbox"
                      checked={stage.autoNotifications.email}
                      onChange={(e) => onUpdate({
                        autoNotifications: {
                          ...stage.autoNotifications,
                          email: e.target.checked
                        }
                      })}
                    />
                    <div className={styles.checkboxContent}>
                      <Mail size={20} />
                      <div>
                        <strong>Email</strong>
                        <p>Enviar email ao entrar nesta etapa</p>
                      </div>
                    </div>
                  </label>

                  <label className={styles.checkboxCard}>
                    <input
                      type="checkbox"
                      checked={stage.autoNotifications.whatsapp}
                      onChange={(e) => onUpdate({
                        autoNotifications: {
                          ...stage.autoNotifications,
                          whatsapp: e.target.checked
                        }
                      })}
                    />
                    <div className={styles.checkboxContent}>
                      <MessageCircle size={20} />
                      <div>
                        <strong>WhatsApp</strong>
                        <p>Enviar WhatsApp ao entrar nesta etapa</p>
                      </div>
                    </div>
                  </label>
                </div>

                {/* Campo de mensagem de notificação */}
                {(stage.autoNotifications.email || stage.autoNotifications.whatsapp) && (
                  <div className={styles.section} style={{ marginTop: '1rem' }}>
                    <label className={styles.label}>
                      <MessageSquare size={18} />
                      <span>Mensagem de Notificação *</span>
                    </label>
                    <textarea
                      value={stage.autoNotifications?.message ?? ''}
                      onChange={(e) => onUpdate({
                        autoNotifications: {
                          ...stage.autoNotifications,
                          message: e.target.value
                        }
                      })}
                      placeholder="Digite a mensagem que será enviada aos usuários..."
                      className={styles.input}
                      rows={4}
                    />
                    <p className={styles.hint}>
                      Esta mensagem será enviada via {stage.autoNotifications.email && stage.autoNotifications.whatsapp ? 'Email e WhatsApp' : stage.autoNotifications.email ? 'Email' : 'WhatsApp'}
                    </p>

                    {/* Campos de destinatários */}
                    {stage.autoNotifications.email && (
                      <div style={{ marginTop: '1rem' }}>
                        <label className={styles.label}>
                          <Mail size={18} />
                          <span>Emails de Destino *</span>
                        </label>
                        <input
                          type="text"
                          value={(stage.autoNotifications.emailRecipients || []).join(', ')}
                          onChange={(e) => {
                            const emails = e.target.value.split(',').map(email => email.trim()).filter(email => email);
                            onUpdate({
                              autoNotifications: {
                                ...stage.autoNotifications,
                                emailRecipients: emails
                              }
                            });
                          }}
                          onBlur={(e) => {
                            // Validar emails ao sair do campo
                            const emails = e.target.value.split(',').map(email => email.trim()).filter(email => email);
                            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                            const invalidEmails = emails.filter(email => !emailRegex.test(email));
                            
                            if (invalidEmails.length > 0) {
                              alert(`❌ Emails inválidos:\n${invalidEmails.join('\n')}\n\nPor favor, corrija o formato.`);
                            }
                          }}
                          placeholder="exemplo@email.com, outro@email.com"
                          className={styles.input}
                        />
                        <p className={styles.hint}>Separe múltiplos emails por vírgula</p>
                      </div>
                    )}

                    {stage.autoNotifications.whatsapp && (
                      <div style={{ marginTop: '1rem' }}>
                        <label className={styles.label}>
                          <MessageCircle size={18} />
                          <span>Números de WhatsApp *</span>
                        </label>
                        <input
                          type="text"
                          value={(stage.autoNotifications.whatsappNumbers || []).join(', ')}
                          onChange={(e) => {
                            const input = e.target.value;
                            // Apenas armazenar o texto como está, sem processamento
                            const parts = input.split(',').map(p => p.trim());
                            onUpdate({
                              autoNotifications: {
                                ...stage.autoNotifications,
                                whatsappNumbers: parts.filter(p => p.length > 0)
                              }
                            });
                          }}
                          onBlur={(e) => {
                            // Processar e formatar ao sair do campo
                            const input = e.target.value;
                            const parts = input.split(',');
                            const processedNumbers: string[] = [];
                            
                            parts.forEach(part => {
                              const trimmed = part.trim();
                              if (!trimmed) return;
                              
                              // Remover tudo exceto dígitos
                              let digits = trimmed.replace(/\D/g, '');
                              
                              // Adicionar +55 se não tiver
                              if (digits.length > 0 && !digits.startsWith('55')) {
                                digits = '55' + digits;
                              }
                              
                              // Limitar a 13 dígitos
                              if (digits.length > 13) {
                                digits = digits.substring(0, 13);
                              }
                              
                              // Validar e formatar
                              if (digits.length === 13 && digits.startsWith('55')) {
                                const ddd = digits.substring(2, 4);
                                const part1 = digits.substring(4, 9);
                                const part2 = digits.substring(9, 13);
                                processedNumbers.push(`+55 (${ddd}) ${part1}-${part2}`);
                              } else if (digits.length >= 10) {
                                // Número incompleto mas com pelo menos DDD + número
                                processedNumbers.push(trimmed);
                              }
                            });
                            
                            if (processedNumbers.length > 0) {
                              onUpdate({
                                autoNotifications: {
                                  ...stage.autoNotifications,
                                  whatsappNumbers: processedNumbers
                                }
                              });
                            }
                          }}
                          placeholder="+55 (11) 99999-9999, +55 (11) 88888-8888"
                          className={styles.input}
                        />
                        <p className={styles.hint}>
                          Digite: 11999999999 ou +55 11 99999-9999 (separados por vírgula)
                          <br />
                          <small style={{ color: '#6B7280' }}>A formatação será aplicada automaticamente ao sair do campo</small>
                        </p>
                      </div>
                    )}

                    {/* Botão de teste */}
                    <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        onClick={async () => {
                          const hasEmail = stage.autoNotifications.email && stage.autoNotifications.emailRecipients && stage.autoNotifications.emailRecipients.length > 0;
                          const hasWhatsapp = stage.autoNotifications.whatsapp && stage.autoNotifications.whatsappNumbers && stage.autoNotifications.whatsappNumbers.length > 0;
                          const hasMessage = stage.autoNotifications.message && stage.autoNotifications.message.trim();

                          if (!hasMessage) {
                            return;
                          }

                          if (!hasEmail && !hasWhatsapp) {
                            return;
                          }

                          // Mostrar loading
                          const showModal = (title: string, message: string, isError = false) => {
                            if (typeof window !== 'undefined') {
                              const modalWrapper = document.createElement('div');
                              modalWrapper.id = 'test-notification-modal';
                              modalWrapper.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;';
                              
                              modalWrapper.innerHTML = `
                                <div style="background: white; padding: 2rem; border-radius: 1rem; max-width: 500px; width: 90%;">
                                  <h3 style="margin: 0 0 1rem 0; color: ${isError ? '#EF4444' : '#10B981'};">${title}</h3>
                                  <div style="white-space: pre-line; color: #374151; margin-bottom: 1.5rem;">${message}</div>
                                  <div style="display: flex; justify-content: flex-end;">
                                    <button id="close-test-modal" style="padding: 0.5rem 1.5rem; background: #EF4444; color: white; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500;">
                                      OK
                                    </button>
                                  </div>
                                </div>
                              `;
                              
                              document.body.appendChild(modalWrapper);
                              
                              const closeBtn = document.getElementById('close-test-modal');
                              if (closeBtn) {
                                closeBtn.onclick = () => {
                                  const modal = document.getElementById('test-notification-modal');
                                  if (modal) {
                                    modal.remove();
                                  }
                                };
                              }
                              
                              modalWrapper.onclick = (e) => {
                                if (e.target === modalWrapper) {
                                  modalWrapper.remove();
                                }
                              };
                            }
                          };

                          showModal('⏳ Enviando...', 'Aguarde enquanto enviamos as notificações de teste...');

                          const results: string[] = [];
                          let hasError = false;

                          // Enviar Email
                          if (hasEmail) {
                            try {
                              const emailResponse = await fetch('/api/notifications/send-email', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  to: stage.autoNotifications.emailRecipients,
                                  subject: 'Teste de Notificação - BravoForm',
                                  message: stage.autoNotifications.message,
                                }),
                              });

                              const emailData = await emailResponse.json();

                              if (emailResponse.ok) {
                                results.push(`✅ Email enviado para: ${stage.autoNotifications.emailRecipients?.join(', ')}`);
                              } else {
                                results.push(`❌ Erro ao enviar email: ${emailData.error || 'Erro desconhecido'}`);
                                hasError = true;
                              }
                            } catch (error) {
                              results.push(`❌ Erro ao enviar email: ${error}`);
                              hasError = true;
                            }
                          }

                          // Enviar WhatsApp
                          if (hasWhatsapp) {
                            try {
                              const whatsappResponse = await fetch('/api/notifications/send-whatsapp', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  to: stage.autoNotifications.whatsappNumbers,
                                  message: stage.autoNotifications.message,
                                }),
                              });

                              const whatsappData = await whatsappResponse.json();

                              if (whatsappResponse.ok && whatsappData.success) {
                                results.push(`✅ WhatsApp enviado para ${whatsappData.sent} número(s)`);
                                if (whatsappData.failed > 0) {
                                  results.push(`⚠️ ${whatsappData.failed} falhou(aram)`);
                                }
                              } else {
                                results.push(`❌ Erro ao enviar WhatsApp: ${whatsappData.error || 'Erro desconhecido'}`);
                                hasError = true;
                              }
                            } catch (error) {
                              results.push(`❌ Erro ao enviar WhatsApp: ${error}`);
                              hasError = true;
                            }
                          }

                          // Remover modal de loading
                          const loadingModal = document.getElementById('test-notification-modal');
                          if (loadingModal) {
                            loadingModal.remove();
                          }

                          // Mostrar resultado
                          const resultMessage = results.join('\n\n');
                          showModal(
                            hasError ? '⚠️ TESTE CONCLUÍDO COM ERROS' : '✅ TESTE ENVIADO COM SUCESSO!',
                            resultMessage,
                            hasError
                          );
                        }}
                        className={styles.btnIcon}
                        style={{
                          padding: '0.5rem 1rem',
                          background: '#10B981',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.5rem',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          fontWeight: '500',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}
                        type="button"
                        disabled={!stage.autoNotifications.message || (!stage.autoNotifications.email && !stage.autoNotifications.whatsapp)}
                      >
                        <MessageSquare size={16} />
                        Testar Envio
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ─── Execution Form Builder (execution/custom/review) ─── */}
          {(stage.stageType === 'execution' || stage.stageType === 'custom' || stage.stageType === 'review') && (
            <>
              <div className={styles.divider}></div>
              <div className={styles.sectionGroup}>
                <div className={styles.sectionGroupHeader}>
                  📝 Formulário customizado da etapa
                </div>
                <div className={styles.sectionGroupBody}>
                  <p className={styles.hint} style={{ margin: '0 0 var(--space-3)' }}>
                    Construa um formulário rico com cascading lookups (ex: digite código do cliente
                    → mostra o nome; depois selecione a NF → carrega produtos daquela NF), upload
                    de fotos com câmera, dropdowns filtrados, etc.
                  </p>
                  <ExecutionFormBuilder stage={stage} onUpdate={onUpdate} />
                </div>
              </div>
            </>
          )}

          {/* ─── Identity Validation Config ─── */}
          {STAGE_TYPES.find(t => t.type === stage.stageType)?.fields.showIdentityLookup && (
            <>
              <div className={styles.divider}></div>
              <div className={styles.sectionGroup}>
                <div className={styles.sectionGroupHeader}>
                  🪪 Validação de Identidade
                </div>
                <div className={styles.sectionGroupBody}>
                  <p className={styles.hint} style={{ margin: '0 0 var(--space-3)' }}>
                    Nesta etapa, o colaborador digita um identificador (matrícula, CPF, etc.)
                    e o sistema busca os dados em uma tabela do banco para ele confirmar
                    "Sou eu, prosseguir". A identidade fica vinculada à instância do workflow
                    e aparece no histórico.
                  </p>
                  <IdentityLookupConfig stage={stage} onUpdate={onUpdate} />
                </div>
              </div>
            </>
          )}

          {/* ─── Sub-Workflow Config ─── */}
          {STAGE_TYPES.find(t => t.type === stage.stageType)?.fields.showSubWorkflow && (
            <>
              <div className={styles.divider}></div>
              <div className={styles.sectionGroup}>
                <div className={styles.sectionGroupHeader}>
                  🔗 Configuração do Sub-Workflow
                </div>
                <div className={styles.sectionGroupBody}>
                  <p className={styles.hint} style={{ margin: '0 0 var(--space-3)' }}>
                    Quando uma instância chegar nesta etapa, ela invocará outro workflow
                    como sub-rotina. O fluxo só avança quando o sub-workflow concluir
                    (modo "wait") ou imediatamente (modo "fire-and-forget").
                  </p>

                  <SubWorkflowSelector
                    value={stage.subWorkflowId}
                    onChange={(id) => onUpdate({ subWorkflowId: id || undefined })}
                  />

                  <label className={styles.label} style={{ marginTop: 'var(--space-3)' }}>
                    <span>Modo de execução</span>
                  </label>
                  <select
                    value={stage.subWorkflowMode || 'wait'}
                    onChange={(e) => onUpdate({ subWorkflowMode: e.target.value as 'wait' | 'fire-and-forget' })}
                    className={styles.select}
                  >
                    <option value="wait">⏸️ Wait — pausa o pai até o sub completar</option>
                    <option value="fire-and-forget">▶️ Fire-and-forget — dispara e continua</option>
                  </select>

                  <div className={styles.techHint} style={{ marginTop: 'var(--space-3)' }}>
                    <span>💡</span>
                    <span>
                      Modo <code>wait</code>: ideal para validações em série (ex.: chamar
                      "Workflow de Cotação" e esperar o orçamento vir).<br />
                      Modo <code>fire-and-forget</code>: ideal para notificações ou processos
                      assíncronos (ex.: "Workflow de Backup" rodando em background).
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ─── Parallel Config ─── */}
          {STAGE_TYPES.find(t => t.type === stage.stageType)?.fields.showParallelConfig && (
            <>
              <div className={styles.divider}></div>
              <div className={styles.sectionGroup}>
                <div className={styles.sectionGroupHeader}>
                  {stage.stageType === 'parallel-fork' ? '🔀 Bifurcação Paralela' : '🔁 Junção Paralela'}
                </div>
                <div className={styles.sectionGroupBody}>
                  {stage.stageType === 'parallel-fork' ? (
                    <p className={styles.hint} style={{ margin: 0 }}>
                      Cada conexão de saída desta etapa no canvas vira um caminho paralelo.
                      Conecte esta etapa a quantas etapas quiser — todas serão executadas
                      simultaneamente. Use uma "Junção Paralela" mais adiante para
                      reagrupá-las.
                    </p>
                  ) : (
                    <>
                      <p className={styles.hint} style={{ margin: '0 0 var(--space-3)' }}>
                        Esta etapa aguarda múltiplos caminhos paralelos chegarem antes
                        de avançar. Configure quantos paths devem completar.
                      </p>

                      <label className={styles.label}>
                        <span>Mínimo de paths para avançar</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={stage.parallelMinPathsToComplete ?? ''}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          onUpdate({
                            parallelMinPathsToComplete: isFinite(v) && v > 0 ? v : undefined,
                          });
                        }}
                        placeholder="Vazio = exigir TODOS os paths"
                        className={styles.input}
                      />

                      <label className={styles.label} style={{ marginTop: 'var(--space-3)' }}>
                        <span>Timeout (em minutos) — força avanço se exceder</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={stage.parallelTimeoutMinutes ?? ''}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          onUpdate({
                            parallelTimeoutMinutes: isFinite(v) && v > 0 ? v : undefined,
                          });
                        }}
                        placeholder="Vazio = sem timeout"
                        className={styles.input}
                      />

                      <div className={styles.techHint} style={{ marginTop: 'var(--space-3)' }}>
                        <span>💡</span>
                        <span>
                          Exemplo: 3 paths paralelos (Financeiro, Técnico, Jurídico).
                          Mínimo = 2 → avança quando 2 dos 3 aprovarem (consenso parcial).
                          Mínimo vazio + Timeout 1440min → exige todos OU 24h limite.
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ─── SLA Preditivo (diferencial #3) ─── */}
          <div className={styles.divider}></div>
          <div className={styles.sectionGroup}>
            <div className={styles.sectionGroupHeader}>
              ⏱️ SLA Preditivo
            </div>
            <div className={styles.sectionGroupBody}>
              <p className={styles.hint} style={{ margin: '0 0 var(--space-3)' }}>
                Configure o tempo alvo para esta etapa. O sistema vai prever automaticamente
                quando uma instância está prestes a estourar o SLA, baseado no histórico real
                de execução, e sugerir reatribuição quando necessário.
              </p>

              <label className={styles.label}>
                <span>Tempo alvo (em horas)</span>
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={stage.slaTargetMinutes ? (stage.slaTargetMinutes / 60).toString() : ''}
                onChange={(e) => {
                  const hours = parseFloat(e.target.value);
                  onUpdate({
                    slaTargetMinutes: isFinite(hours) && hours > 0 ? Math.round(hours * 60) : undefined,
                  });
                }}
                placeholder="Ex: 2 (= 2h)  · deixe vazio para desativar"
                className={styles.input}
              />

              {stage.slaTargetMinutes && stage.slaTargetMinutes > 0 && (
                <>
                  <div style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 100 }}>
                      <label className={styles.label}>
                        <span>⚠️ Aviso (%)</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="200"
                        value={stage.slaWarnThreshold ?? 80}
                        onChange={(e) => onUpdate({
                          slaWarnThreshold: parseInt(e.target.value, 10) || 80,
                        })}
                        className={styles.input}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 100 }}>
                      <label className={styles.label}>
                        <span>🔥 Crítico (%)</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="200"
                        value={stage.slaCriticalThreshold ?? 100}
                        onChange={(e) => onUpdate({
                          slaCriticalThreshold: parseInt(e.target.value, 10) || 100,
                        })}
                        className={styles.input}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 100 }}>
                      <label className={styles.label}>
                        <span>🚨 Estouro (%)</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="500"
                        value={stage.slaBreachThreshold ?? 150}
                        onChange={(e) => onUpdate({
                          slaBreachThreshold: parseInt(e.target.value, 10) || 150,
                        })}
                        className={styles.input}
                      />
                    </div>
                  </div>

                  <div className={styles.techHint} style={{ marginTop: 'var(--space-3)' }}>
                    <span>💡</span>
                    <span>
                      Com SLA de <code>{stage.slaTargetMinutes}min</code>, alertas serão
                      disparados quando a predição passar de{' '}
                      <code>{Math.round(stage.slaTargetMinutes * (stage.slaWarnThreshold ?? 80) / 100)}min</code> (aviso),{' '}
                      <code>{Math.round(stage.slaTargetMinutes * (stage.slaCriticalThreshold ?? 100) / 100)}min</code> (crítico)
                      e{' '}
                      <code>{Math.round(stage.slaTargetMinutes * (stage.slaBreachThreshold ?? 150) / 100)}min</code> (estouro).
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ─── Discussão colaborativa (diferencial vs Pipefy/Asana) ─── */}
          {workflowId && stage.id && user && (
            <>
              <div className={styles.divider}></div>
              <div className={styles.sectionGroup}>
                <div className={styles.sectionGroupHeader}>
                  💬 Discussão técnica desta etapa
                </div>
                <div className={styles.sectionGroupBody}>
                  <StageCommentsPanel
                    workflowId={workflowId}
                    stageId={stage.id}
                    currentUser={{
                      id: user.uid,
                      username: appUser?.username || user.email?.split('@')[0],
                      name: appUser?.name || user.displayName || user.email || 'Usuário',
                      avatarUrl: user.photoURL || undefined,
                    }}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <FormSelectionModal
        isOpen={isFormModalOpen}
        forms={forms}
        selectedFormIds={stage.formIds || []}
        onToggleForm={handleFormToggle}
        onClose={() => setIsFormModalOpen(false)}
      />
    </div>
  );
}
