'use client';

import React, { useState, useEffect } from 'react';
import { X, CheckCircle, Clock } from 'lucide-react';
import type { WorkflowStage, Collaborator } from '@/types';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import styles from '../../app/styles/WorkflowTestMode.module.css';

interface WorkflowTestModeProps {
  stages: WorkflowStage[];
  workflowName: string;
  workflowDescription: string;
  onClose: () => void;
}

interface StageField {
  id: string;
  type: 'comment' | 'attachment' | 'form';
  label: string;
  required: boolean;
  formId?: string;
}

export default function WorkflowTestMode({ 
  stages, 
  workflowName, 
  workflowDescription,
  onClose 
}: WorkflowTestModeProps) {
  console.log('WorkflowTestMode rendered');
  console.log('stages:', stages);
  console.log('workflowName:', workflowName);
  
  const [selectedUser, setSelectedUser] = useState<Collaborator | null>(null);
  const [showUserSelection, setShowUserSelection] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<Collaborator[]>([]);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [showStageModal, setShowStageModal] = useState(false);
  const [currentFieldIndex, setCurrentFieldIndex] = useState(0);
  const [completedFields, setCompletedFields] = useState<string[]>([]);
  const [openedForms, setOpenedForms] = useState<Set<string>>(new Set());
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationAction, setValidationAction] = useState<string>('');
  const [fieldData, setFieldData] = useState<Record<string, string>>({});

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    // Limpar timer ao desmontar
    return () => {
      if (timerInterval) {
        clearInterval(timerInterval);
      }
    };
  }, [timerInterval]);

  const loadUsers = async () => {
    console.log('loadUsers called');
    try {
      // Coletar todos os usuários únicos das etapas
      const userIds = new Set<string>();
      stages.forEach(stage => {
        if (stage.allowedUsers && stage.allowedUsers.length > 0) {
          stage.allowedUsers.forEach((userId: string) => userIds.add(userId));
        }
      });

      // Carregar dados dos colaboradores
      const collabsSnapshot = await getDocs(collection(db, 'collaborators'));
      const allCollabs = collabsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Collaborator[];

      // Filtrar apenas os usuários que estão nas etapas
      const usersInWorkflow = allCollabs.filter(c => userIds.has(c.id));
      setAvailableUsers(usersInWorkflow);
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
    }
  };

  const handleSelectUser = (user: Collaborator) => {
    console.log('handleSelectUser called with user:', user);
    setSelectedUser(user);
    
    // Encontrar a primeira etapa atribuída a este usuário
    const firstStageIndex = stages.findIndex(stage => 
      stage.allowedUsers?.includes(user.id)
    );
    
    console.log('firstStageIndex:', firstStageIndex);
    
    if (firstStageIndex !== -1) {
      setCurrentStageIndex(firstStageIndex);
    }
    
    setShowUserSelection(false);
  };

  const handleOpenWorkflow = () => {
    console.log('handleOpenWorkflow called');
    console.log('selectedUser:', selectedUser);
    console.log('currentStageIndex:', currentStageIndex);
    
    setCurrentFieldIndex(0);
    setCompletedFields([]);
    setOpenedForms(new Set());
    stopTimer(); // Parar timer anterior
    setShowStageModal(true);
    
    // Iniciar timer se a etapa for do tipo waiting
    const currentStage = getCurrentUserStage();
    console.log('currentStage:', currentStage);
    if (currentStage?.stageType === 'waiting' && currentStage.timer) {
      startTimer(currentStage.timer);
    }
  };

  const startTimer = (timerConfig: any) => {
    const duration = timerConfig.value || 1;
    const unit = timerConfig.type || 'hours';
    
    // Converter para segundos
    let totalSeconds = duration;
    if (unit === 'minutes') totalSeconds *= 60;
    if (unit === 'hours') totalSeconds *= 3600;
    
    setTimerSeconds(totalSeconds);
    setIsTimerActive(true);
    
    // Iniciar contagem regressiva
    const interval = setInterval(() => {
      setTimerSeconds(prev => {
        if (prev <= 1) {
          setIsTimerActive(false);
          clearInterval(interval);
          handleCompleteStage(); // Completar etapa automaticamente
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    setTimerInterval(interval);
  };

  const stopTimer = () => {
    if (timerInterval) {
      clearInterval(timerInterval);
      setTimerInterval(null);
    }
    setIsTimerActive(false);
    setTimerSeconds(0);
  };

  const formatTime = (seconds: number) => {
    if (seconds >= 86400) {
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      return `${days}d ${hours}h`;
    }
    if (seconds >= 3600) {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
    if (seconds >= 60) {
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${minutes}m ${secs}s`;
    }
    return `${seconds}s`;
  };

  const getStageFields = (): StageField[] => {
    const stage = getCurrentUserStage();
    const fields: StageField[] = [];
    
    if (stage.requireComment) {
      fields.push({ id: 'comment', type: 'comment', label: 'Comentário Obrigatório', required: true });
    }
    
    if (stage.requireAttachments) {
      fields.push({ id: 'attachment', type: 'attachment', label: 'Anexo Obrigatório', required: true });
    }
    
    if (stage.formIds && stage.formIds.length > 0) {
      stage.formIds.forEach((formId, index) => {
        // Gerar ID único estável usando crypto.randomUUID
        const uniqueId = `form-${stage.id || 'stage'}-${formId}-${index}`;
        fields.push({ 
          id: uniqueId, 
          type: 'form', 
          label: `Formulário ${index + 1}`, 
          required: true,
          formId 
        });
      });
    }
    
    return fields;
  };

  const getCurrentField = () => {
    const fields = getStageFields();
    return fields[currentFieldIndex] || null;
  };

  const handleCompleteField = () => {
    const currentField = getCurrentField();
    if (!currentField) return; // Verificação de segurança
    
    console.log('Completing field:', currentField.id);
    
    const fields = getStageFields();
    const isLastField = currentFieldIndex === fields.length - 1;
    
    console.log('Current field index:', currentFieldIndex, 'Fields length:', fields.length, 'Is last field:', isLastField);
    
    if (isLastField) {
      console.log('All fields completed, showing validation modal');
      // Todos os campos completos, mostrar modal de validação
      setShowValidationModal(true);
    } else {
      console.log('Moving to next field');
      setCompletedFields([...completedFields, currentField.id]);
      setCurrentFieldIndex(currentFieldIndex + 1);
    }
  };

  const handleBackField = () => {
    if (currentFieldIndex > 0) {
      setCurrentFieldIndex(currentFieldIndex - 1);
    }
  };

  const handleOpenForm = (formId: string) => {
    setOpenedForms(new Set([...openedForms, formId]));
    // Em produção, aqui abriria o formulário real
    console.log('Abrindo formulário:', formId);
  };

  const isFormOpened = (formId: string) => {
    return openedForms.has(formId);
  };

  const handleValidationAction = (action: string) => {
    console.log('Validation action selected:', action);
    setValidationAction(action);
    setShowValidationModal(false);
    
    // Adicionar o campo completado
    const currentField = getCurrentField();
    if (currentField) {
      setCompletedFields([...completedFields, currentField.id]);
    }
    
    // Executar ação baseada na validação
    switch (action) {
      case 'validate':
        console.log('Validando e avançando...');
        handleCompleteStage();
        break;
      case 'reject':
        console.log('Rejeitando - voltando para início da etapa');
        setCurrentFieldIndex(0);
        setCompletedFields([]);
        break;
      case 'destroy':
        console.log('Destruindo workflow');
        setShowStageModal(false);
        break;
      default:
        console.log('Ação padrão - avançando');
        handleCompleteStage();
    }
  };

  const handleCompleteStage = () => {
    console.log('handleCompleteStage called');
    console.log('selectedUser:', selectedUser);
    
    // Fallback: usar primeiro usuário disponível se selectedUser for null
    const currentUser = selectedUser || availableUsers[0];
    console.log('currentUser:', currentUser);
    
    if (!currentUser) {
      console.log('No current user available, returning');
      return; // Verificação de segurança
    }
    
    console.log('Current stage index:', currentStageIndex);
    console.log('Total stages:', stages.length);
    
    // Encontrar próxima etapa do usuário
    const nextStageIndex = stages.findIndex((stage, index) => {
      const isNext = index > currentStageIndex && stage.allowedUsers?.includes(currentUser.id);
      console.log(`Stage ${index}: ${stage.name}, allowedUsers: ${stage.allowedUsers?.join(',')}, isNext: ${isNext}`);
      return isNext;
    });
    
    console.log('Next stage index found:', nextStageIndex);
    
    if (nextStageIndex !== -1) {
      console.log('Advancing to next stage:', stages[nextStageIndex].name);
      // Avançar para próxima etapa
      setCurrentStageIndex(nextStageIndex);
      // Resetar campos para nova etapa
      setCurrentFieldIndex(0);
      setCompletedFields([]);
      setOpenedForms(new Set());
      stopTimer();
      
      // Iniciar timer se a próxima etapa for do tipo waiting
      const nextStage = stages[nextStageIndex];
      if (nextStage?.stageType === 'waiting' && nextStage.timer) {
        console.log('Starting timer for waiting stage');
        startTimer(nextStage.timer);
      }
    } else {
      console.log('No more stages for this user, closing modal');
      // Não há mais etapas para este usuário, fechar modal
      setShowStageModal(false);
    }
  };

  const getUserStages = () => {
    console.log('getUserStages called');
    console.log('selectedUser:', selectedUser);
    console.log('currentStageIndex:', currentStageIndex);
    console.log('stages:', stages);
    
    if (!selectedUser) {
      console.log('No selected user, returning empty array');
      return [];
    }
    
    // Mostrar apenas a etapa atual do usuário
    const currentStage = stages[currentStageIndex];
    console.log('currentStage:', currentStage);
    console.log('currentStage.allowedUsers:', currentStage?.allowedUsers);
    console.log('selectedUser.id:', selectedUser.id);
    
    const hasAccess = currentStage && currentStage.allowedUsers?.includes(selectedUser.id);
    console.log('hasAccess:', hasAccess);
    
    return hasAccess ? [currentStage] : [];
  };

  const getCurrentUserStage = () => {
    const userStages = getUserStages();
    console.log('getCurrentUserStage - userStages:', userStages);
    return userStages[0];
  };

  const isWaitingStage = () => {
    const stage = getCurrentUserStage();
    return stage?.stageType === 'waiting';
  };

  console.log('WorkflowTestMode render - availableUsers:', availableUsers.length);
  
  return (
    <div className={styles.container}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div>
            <h2>Modo de Teste: {workflowName}</h2>
            <p>{workflowDescription}</p>
          </div>
          <button onClick={onClose} className={styles.closeButton}>
            <X size={24} />
          </button>
        </div>

        <div className={styles.content}>
          {!selectedUser ? (
            <div className={styles.userSelection}>
              <h3>Selecione um usuário para testar:</h3>
              <div className={styles.userList}>
                {availableUsers.map(user => (
                  <button
                    key={user.id}
                    onClick={() => handleSelectUser(user)}
                    className={styles.userButton}
                  >
                    <div className={styles.userInfo}>
                      <h4>{user.username}</h4>
                      <p>{user.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
          <div className={styles.workflowTest}>
            <div className={styles.currentUser}>
              <h3>Testando como: {selectedUser.username}</h3>
              <button onClick={() => setShowUserSelection(true)}>
                Trocar usuário
              </button>
            </div>

            <div className={styles.stagesContainer}>
              <h3>Etapas do Workflow:</h3>
              {getUserStages().map(stage => (
                <div key={stage.id} className={styles.stage}>
                  <h4>{stage.name}</h4>
                  <p>Tipo: {stage.stageType}</p>
                  <p>{stage.description || 'Esta etapa não possui descrição.'}</p>
                </div>
              ))}
            </div>

            <button onClick={handleOpenWorkflow} className={styles.startButton}>
              Iniciar Teste
            </button>
          </div>
        )}
      </div>

      {/* Modal de Seleção de Usuário */}
      {showUserSelection && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>Selecionar Usuário</h2>
              <button onClick={() => setShowUserSelection(false)}>
                <X size={24} />
              </button>
            </div>
            <div className={styles.modalContent}>
              {availableUsers.map(user => (
                <button
                  key={user.id}
                  onClick={() => handleSelectUser(user)}
                  className={styles.userOption}
                >
                  {user.username}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal da Etapa */}
      {showStageModal && (
        <div className={styles.stageModalOverlay}>
          <div className={styles.stageModal}>
            <div className={styles.stageHeader}>
              <h2>{getCurrentUserStage().name}</h2>
              <button onClick={() => setShowStageModal(false)} className={styles.closeButton}>
                <X size={24} />
              </button>
            </div>

            <div className={styles.stageContent}>
              {/* Mostrar etapas anteriores como concluídas */}
              {currentStageIndex > 0 && (
                <div className={styles.previousStages}>
                  <h3>Etapas Anteriores (Concluídas)</h3>
                  {stages.slice(0, currentStageIndex).map((stage, index) => (
                    <div key={stage.id} className={styles.completedStage}>
                      <CheckCircle size={18} color="#10B981" />
                      <span>{stage.name}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Timer para etapas waiting */}
              {isWaitingStage() && isTimerActive && (
                <div className={styles.timerContainer}>
                  <div className={styles.timerDisplay}>
                    <Clock size={24} color="#F59E0B" />
                    <div className={styles.timerInfo}>
                      <span className={styles.timerValue}>{formatTime(timerSeconds)}</span>
                      <span className={styles.timerLabel}>tempo restante</span>
                    </div>
                  </div>
                  <div className={styles.timerProgress}>
                    <div 
                      className={styles.timerProgressBar}
                      style={{ width: `${(timerSeconds / Number(getCurrentUserStage().timer?.value || 1)) * 100}%`}}
                    />
                  </div>
                </div>
              )}
              {(() => {
                const fields = getStageFields();
                const currentField = getCurrentField();
                
                // Se não há campos (etapa validation, por exemplo), mostrar apenas botão de concluir
                if (fields.length === 0) {
                  return (
                    <div className={styles.noFieldsMessage}>
                      <p>Esta etapa não requer preenchimento de campos.</p>
                      <button onClick={handleCompleteStage} className={styles.btnNext}>
                        Concluir Etapa
                      </button>
                    </div>
                  );
                }
                
                if (!currentField) return null;
                
                return (
                  <div className={styles.currentField}>
                    <h4>{currentField.label}</h4>
                    <p className={styles.hint}>
                      {currentField.type === 'comment' && 'Digite seu comentário sobre esta etapa.'}
                      {currentField.type === 'attachment' && 'Faça upload dos arquivos necessários.'}
                      {currentField.type === 'form' && 'Preencha o formulário solicitado.'}
                    </p>

                    {currentField.type === 'comment' && (
                      <div className={styles.formField}>
                        <textarea 
                          placeholder="Digite seu comentário..." 
                          rows={4}
                          value={fieldData[currentField.id] || ''}
                          onChange={(e) => setFieldData({...fieldData, [currentField.id]: e.target.value})}
                        />
                      </div>
                    )}

                    {currentField.type === 'attachment' && (
                      <div className={styles.formField}>
                        <input 
                          type="file" 
                          onChange={(e) => {
                            const fileName = e.target.files?.[0]?.name || '';
                            setFieldData({...fieldData, [currentField.id]: fileName});
                          }}
                        />
                      </div>
                    )}

                    {currentField.type === 'form' && (
                      <div className={styles.formField}>
                        <div className={styles.formPlaceholder}>
                          <p>📋 Formulário {currentField.label}</p>
                          <p className={styles.hint}>
                            Em produção, aqui apareceriam os campos do formulário.
                          </p>
                          <button 
                            className={`${styles.btnOpenForm} ${currentField.formId && isFormOpened(currentField.formId) ? styles.btnFormOpened : ''}`}
                            onClick={() => currentField.formId && handleOpenForm(currentField.formId)}
                          >
                            {currentField.formId && isFormOpened(currentField.formId) ? '✅ Formulário Aberto' : 'Abrir Formulário'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {getStageFields().length > 0 && (
                <div className={styles.footerButtons}>
                  {currentFieldIndex > 0 && (
                    <button onClick={handleBackField} className={styles.btnBack}>
                      ← Voltar
                    </button>
                  )}
                  <button onClick={handleCompleteField} className={styles.btnNext}>
                    {currentFieldIndex < getStageFields().length - 1 ? 'Próximo →' : 'Concluir Etapa'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Validação */}
      {showValidationModal && (
        <div className={styles.stageModalOverlay}>
          <div className={styles.stageModal}>
            <div className={styles.stageHeader}>
              <h2>Validação da Etapa</h2>
              <button onClick={() => setShowValidationModal(false)} className={styles.closeButton}>
                <X size={24} />
              </button>
            </div>

            <div className={styles.stageContent}>
              <div className={styles.stageInfo}>
                <h3>Dados da Etapa</h3>
                <div className={styles.validationData}>
                  <p><strong>Etapa:</strong> {getCurrentUserStage()?.name}</p>
                  <p><strong>Campos Completados:</strong> {completedFields.length + 1}/{getStageFields().length}</p>
                  <p><strong>Formulários Abertos:</strong> {openedForms.size}</p>
                </div>
              </div>

              <div className={styles.validationData}>
                <h4>Respostas do Usuário:</h4>
                {getStageFields().map(field => (
                  <div key={field.id} className={styles.fieldResponse}>
                    <div className={styles.fieldHeader}>
                      <strong>{field.label}:</strong>
                      <button 
                        onClick={() => {
                          // Voltar para este campo para editar
                          const fieldIndex = getStageFields().findIndex(f => f.id === field.id);
                          if (fieldIndex !== -1) {
                            setCurrentFieldIndex(fieldIndex);
                            setShowValidationModal(false);
                          }
                        }}
                        className={styles.btnEdit}
                      >
                        ✏️ Editar
                      </button>
                    </div>
                    <div className={styles.fieldValue}>
                      {fieldData[field.id] ? (
                        field.type === 'comment' ? (
                          <p>{fieldData[field.id]}</p>
                        ) : field.type === 'attachment' ? (
                          <p>📎 {fieldData[field.id]}</p>
                        ) : (
                          <p>📋 Formulário preenchido</p>
                        )
                      ) : (
                        <p className={styles.emptyValue}>Não preenchido</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className={styles.validationActions}>
                <h4>Selecione uma ação:</h4>
                <div className={styles.actionButtons}>
                  <button 
                    onClick={() => handleValidationAction('validate')}
                    className={styles.btnValidate}
                  >
                    ✅ Validar e Avançar
                  </button>
                  <button 
                    onClick={() => handleValidationAction('reject')}
                    className={styles.btnReject}
                  >
                    ❌ Rejeitar e Refazer
                  </button>
                  <button 
                    onClick={() => handleValidationAction('destroy')}
                    className={styles.btnDestroy}
                  >
                    🗑️ Destruir Workflow
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
