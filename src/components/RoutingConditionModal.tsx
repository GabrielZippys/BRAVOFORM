'use client';

import React, { useState, useEffect } from 'react';
import { X, GitBranch, Users, Building2, Briefcase, Code, AlertCircle } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import type { RoutingCondition, RoutingConditionType } from '@/types';
import styles from '../../app/styles/RoutingConditionModal.module.css';

interface Company {
  id: string;
  name: string;
}

interface Department {
  id: string;
  name: string;
}

interface User {
  id: string;
  username: string;
  department?: string;
}

interface RoutingConditionModalProps {
  isOpen: boolean;
  sourceStageId: string;
  targetStages: { id: string; name: string }[];
  existingConditions: RoutingCondition[];
  onSave: (conditions: RoutingCondition[]) => void;
  onClose: () => void;
}

export default function RoutingConditionModal({
  isOpen,
  sourceStageId,
  targetStages,
  existingConditions,
  onSave,
  onClose
}: RoutingConditionModalProps) {
  const [conditions, setConditions] = useState<RoutingCondition[]>(existingConditions);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Carregar empresas
      const companiesSnapshot = await getDocs(collection(db, 'companies'));
      const companiesData = companiesSnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name
      }));
      setCompanies(companiesData);

      // Carregar departamentos
      const departmentsSnapshot = await getDocs(collection(db, 'departments'));
      const departmentsData = departmentsSnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name
      }));
      setDepartments(departmentsData);

      // Carregar usuários
      const usersSnapshot = await getDocs(collection(db, 'collaborators'));
      const usersData = usersSnapshot.docs.map(doc => ({
        id: doc.id,
        username: doc.data().username,
        department: doc.data().department
      }));
      setUsers(usersData);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleAddCondition = (targetStageId: string) => {
    const newCondition: RoutingCondition = {
      id: crypto.randomUUID(),
      targetStageId,
      type: 'user',
      label: 'Nova Condição',
      criteria: {}
    };
    setConditions([...conditions, newCondition]);
  };

  const handleUpdateCondition = (id: string, updates: Partial<RoutingCondition>) => {
    const updatedConditions = conditions.map(c => c.id === id ? { ...c, ...updates } : c);
    setConditions(updatedConditions);
    
    // Validar em tempo real
    setTimeout(() => {
      validateConditionsRealtime(updatedConditions);
    }, 100);
  };

  // Verificar se adicionar um ID causaria duplicação
  const wouldCauseDuplication = (
    conditionId: string,
    type: RoutingConditionType,
    idToAdd: string
  ): { isDuplicate: boolean; itemName: string } => {
    let isDuplicate = false;
    let itemName = '';

    conditions.forEach(condition => {
      if (condition.id === conditionId) return; // Pular a própria condição
      
      if (type === 'company' && condition.type === 'company' && condition.criteria.companyIds?.includes(idToAdd)) {
        isDuplicate = true;
        const company = companies.find(c => c.id === idToAdd);
        itemName = company?.name || '';
      }
      
      if (type === 'department' && condition.type === 'department' && condition.criteria.departmentIds?.includes(idToAdd)) {
        isDuplicate = true;
        const dept = departments.find(d => d.id === idToAdd);
        itemName = dept?.name || '';
      }
      
      if (type === 'user' && condition.type === 'user' && condition.criteria.userIds?.includes(idToAdd)) {
        isDuplicate = true;
        const user = users.find(u => u.id === idToAdd);
        itemName = user?.username || '';
      }
    });

    return { isDuplicate, itemName };
  };

  const validateConditionsRealtime = (conditionsToValidate: RoutingCondition[]) => {
    const errors: string[] = [];
    const allSelectedCompanies: string[] = [];
    const allSelectedDepartments: string[] = [];
    const allSelectedUsers: string[] = [];

    conditionsToValidate.forEach(condition => {
      if (condition.type === 'company' && condition.criteria.companyIds) {
        condition.criteria.companyIds.forEach(id => {
          if (allSelectedCompanies.includes(id)) {
            const company = companies.find(c => c.id === id);
            errors.push(`Empresa "${company?.name}" selecionada em múltiplos caminhos`);
          } else {
            allSelectedCompanies.push(id);
          }
        });
      }
      
      if (condition.type === 'department' && condition.criteria.departmentIds) {
        condition.criteria.departmentIds.forEach(id => {
          if (allSelectedDepartments.includes(id)) {
            const dept = departments.find(d => d.id === id);
            errors.push(`Departamento "${dept?.name}" selecionado em múltiplos caminhos`);
          } else {
            allSelectedDepartments.push(id);
          }
        });
      }
      
      if (condition.type === 'user' && condition.criteria.userIds) {
        condition.criteria.userIds.forEach(id => {
          if (allSelectedUsers.includes(id)) {
            const user = users.find(u => u.id === id);
            errors.push(`Usuário "${user?.username}" selecionado em múltiplos caminhos`);
          } else {
            allSelectedUsers.push(id);
          }
        });
      }
    });

    setValidationErrors(errors);
  };

  const handleRemoveCondition = (id: string) => {
    setConditions(conditions.filter(c => c.id !== id));
  };

  // Validar se há duplicação de seleções entre caminhos
  const validateConditions = (): boolean => {
    const errors: string[] = [];
    const allSelectedCompanies: string[] = [];
    const allSelectedDepartments: string[] = [];
    const allSelectedUsers: string[] = [];

    conditions.forEach(condition => {
      if (condition.type === 'company' && condition.criteria.companyIds) {
        condition.criteria.companyIds.forEach(id => {
          if (allSelectedCompanies.includes(id)) {
            const company = companies.find(c => c.id === id);
            errors.push(`Empresa "${company?.name}" selecionada em múltiplos caminhos`);
          } else {
            allSelectedCompanies.push(id);
          }
        });
      }
      
      if (condition.type === 'department' && condition.criteria.departmentIds) {
        condition.criteria.departmentIds.forEach(id => {
          if (allSelectedDepartments.includes(id)) {
            const dept = departments.find(d => d.id === id);
            errors.push(`Departamento "${dept?.name}" selecionado em múltiplos caminhos`);
          } else {
            allSelectedDepartments.push(id);
          }
        });
      }
      
      if (condition.type === 'user' && condition.criteria.userIds) {
        condition.criteria.userIds.forEach(id => {
          if (allSelectedUsers.includes(id)) {
            const user = users.find(u => u.id === id);
            errors.push(`Usuário "${user?.username}" selecionado em múltiplos caminhos`);
          } else {
            allSelectedUsers.push(id);
          }
        });
      }
    });

    setValidationErrors(errors);
    return errors.length === 0;
  };

  const handleSave = () => {
    if (validateConditions()) {
      onSave(conditions);
      onClose();
    }
  };

  const getConditionIcon = (type: RoutingConditionType) => {
    switch (type) {
      case 'user': return <Users size={18} />;
      case 'company': return <Building2 size={18} />;
      case 'department': return <Briefcase size={18} />;
      case 'custom': return <Code size={18} />;
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <GitBranch size={24} />
            <h2>Configurar Caminhos Condicionais</h2>
          </div>
          <button onClick={onClose} className={styles.closeButton}>
            <X size={24} />
          </button>
        </div>

        <div className={styles.content}>
          <p className={styles.hint}>
            Configure as condições para determinar qual caminho seguir quando houver múltiplas opções
          </p>

          {validationErrors.length > 0 && (
            <div className={styles.errorBox} id="validation-errors">
              <AlertCircle size={20} style={{ flexShrink: 0 }} />
              <div>
                <strong>⚠️ Conflitos detectados:</strong>
                <ul>
                  {validationErrors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
                <p><strong>Atenção:</strong> Cada empresa/departamento/usuário deve estar em apenas um caminho. Remova as duplicações para continuar.</p>
              </div>
            </div>
          )}

          {targetStages.map((target) => {
            const targetConditions = conditions.filter(c => c.targetStageId === target.id);
            
            return (
              <div key={target.id} className={styles.targetSection}>
                <div className={styles.targetHeader}>
                  <h3>→ {target.name}</h3>
                  <button
                    onClick={() => handleAddCondition(target.id)}
                    className={styles.addButton}
                  >
                    + Adicionar Condição
                  </button>
                </div>

                {targetConditions.length === 0 ? (
                  <p className={styles.emptyText}>
                    Nenhuma condição configurada. Este caminho será sempre disponível.
                  </p>
                ) : (
                  <div className={styles.conditionsList}>
                    {targetConditions.map((condition) => (
                      <div key={condition.id} className={styles.conditionCard}>
                        <div className={styles.conditionHeader}>
                          <input
                            type="text"
                            value={condition.label}
                            onChange={(e) => handleUpdateCondition(condition.id, { label: e.target.value })}
                            placeholder="Nome da condição"
                            className={styles.conditionLabel}
                          />
                          <button
                            onClick={() => handleRemoveCondition(condition.id)}
                            className={styles.removeButton}
                          >
                            <X size={16} />
                          </button>
                        </div>

                        <div className={styles.conditionType}>
                          <label>Tipo de Validação:</label>
                          <select
                            value={condition.type}
                            onChange={(e) => handleUpdateCondition(condition.id, { type: e.target.value as RoutingConditionType })}
                            className={styles.select}
                          >
                            <option value="user">Por Usuário</option>
                            <option value="company">Por Empresa</option>
                            <option value="department">Por Departamento</option>
                            <option value="custom">Regra Customizada</option>
                          </select>
                        </div>

                        <div className={styles.conditionCriteria}>
                          {condition.type === 'company' && (
                            <div>
                              <label>Empresas permitidas neste caminho:</label>
                              {loading ? (
                                <p>Carregando empresas...</p>
                              ) : (
                                <div className={styles.checkboxList}>
                                  {companies.map(company => (
                                    <label key={company.id} className={styles.checkboxItem}>
                                      <input
                                        type="checkbox"
                                        checked={condition.criteria.companyIds?.includes(company.id) || false}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            const { isDuplicate, itemName } = wouldCauseDuplication(condition.id, 'company', company.id);
                                            if (isDuplicate) {
                                              e.preventDefault();
                                              setErrorModalMessage(`A empresa "${itemName}" já está selecionada em outro caminho. Cada empresa deve estar em apenas um caminho.`);
                                              setShowErrorModal(true);
                                              return;
                                            }
                                          }
                                          
                                          const currentIds = condition.criteria.companyIds || [];
                                          const newIds = e.target.checked
                                            ? [...currentIds, company.id]
                                            : currentIds.filter(id => id !== company.id);
                                          handleUpdateCondition(condition.id, {
                                            criteria: { ...condition.criteria, companyIds: newIds }
                                          });
                                        }}
                                      />
                                      <span>{company.name}</span>
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          {condition.type === 'department' && (
                            <div>
                              <label>Departamentos permitidos neste caminho:</label>
                              {loading ? (
                                <p>Carregando departamentos...</p>
                              ) : (
                                <div className={styles.checkboxList}>
                                  {departments.map(dept => (
                                    <label key={dept.id} className={styles.checkboxItem}>
                                      <input
                                        type="checkbox"
                                        checked={condition.criteria.departmentIds?.includes(dept.id) || false}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            const { isDuplicate, itemName } = wouldCauseDuplication(condition.id, 'department', dept.id);
                                            if (isDuplicate) {
                                              e.preventDefault();
                                              setErrorModalMessage(`O departamento "${itemName}" já está selecionado em outro caminho. Cada departamento deve estar em apenas um caminho.`);
                                              setShowErrorModal(true);
                                              return;
                                            }
                                          }
                                          
                                          const currentIds = condition.criteria.departmentIds || [];
                                          const newIds = e.target.checked
                                            ? [...currentIds, dept.id]
                                            : currentIds.filter(id => id !== dept.id);
                                          handleUpdateCondition(condition.id, {
                                            criteria: { ...condition.criteria, departmentIds: newIds }
                                          });
                                        }}
                                      />
                                      <span>{dept.name}</span>
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          {condition.type === 'user' && (
                            <div>
                              <label>Usuários permitidos neste caminho:</label>
                              {loading ? (
                                <p>Carregando usuários...</p>
                              ) : (
                                <div className={styles.checkboxList}>
                                  {users.map(user => (
                                    <label key={user.id} className={styles.checkboxItem}>
                                      <input
                                        type="checkbox"
                                        checked={condition.criteria.userIds?.includes(user.id) || false}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            const { isDuplicate, itemName } = wouldCauseDuplication(condition.id, 'user', user.id);
                                            if (isDuplicate) {
                                              e.preventDefault();
                                              setErrorModalMessage(`O usuário "${itemName}" já está selecionado em outro caminho. Cada usuário deve estar em apenas um caminho.`);
                                              setShowErrorModal(true);
                                              return;
                                            }
                                          }
                                          
                                          const currentIds = condition.criteria.userIds || [];
                                          const newIds = e.target.checked
                                            ? [...currentIds, user.id]
                                            : currentIds.filter(id => id !== user.id);
                                          handleUpdateCondition(condition.id, {
                                            criteria: { ...condition.criteria, userIds: newIds }
                                          });
                                        }}
                                      />
                                      <span>{user.username} {user.department && `(${user.department})`}</span>
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          {condition.type === 'custom' && (
                            <div>
                              <label>Regra customizada:</label>
                              <textarea
                                value={condition.criteria.customRule || ''}
                                onChange={(e) => handleUpdateCondition(condition.id, {
                                  criteria: { ...condition.criteria, customRule: e.target.value }
                                })}
                                placeholder="Descreva a regra de validação..."
                                className={styles.textarea}
                                rows={3}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className={styles.footer}>
          <button onClick={onClose} className={styles.cancelButton}>
            Cancelar
          </button>
          <button onClick={handleSave} className={styles.saveButton}>
            Salvar Condições
          </button>
        </div>
      </div>

      {/* Modal de erro sobre o modal principal */}
      {showErrorModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={() => setShowErrorModal(false)}
        >
          <div 
            style={{
              background: 'white',
              padding: '2rem',
              borderRadius: '1rem',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.5rem' }}>
              <AlertCircle size={32} color="#EF4444" style={{ flexShrink: 0 }} />
              <div>
                <h3 style={{ margin: '0 0 0.5rem 0', color: '#991B1B', fontSize: '1.25rem' }}>
                  ⚠️ Conflito Detectado
                </h3>
                <p style={{ margin: 0, color: '#374151', lineHeight: '1.5' }}>
                  {errorModalMessage}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowErrorModal(false)}
                style={{
                  padding: '0.625rem 1.5rem',
                  background: '#EF4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
