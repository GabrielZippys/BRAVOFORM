'use client';

import React, { useState, useEffect } from 'react';
import { X, Building2, Users, FileText } from 'lucide-react';
import { db } from '../../firebase/config';
import { collection, getDocs } from 'firebase/firestore';
import styles from '../../app/styles/WorkflowSetupModal.module.css';

interface Company {
  id: string;
  name: string;
}

interface Department {
  id: string;
  name: string;
  companyId?: string;
}

interface WorkflowSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: {
    name: string;
    description?: string;
    companies: string[];
    departments: string[];
  }) => Promise<void>;
  initialData?: {
    name: string;
    description?: string;
    companies: string[];
    departments: string[];
  };
  isEditMode?: boolean;
}

export default function WorkflowSetupModal({ 
  isOpen, 
  onClose, 
  onSave,
  initialData,
  isEditMode = false
}: WorkflowSetupModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [allDepartments, setAllDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadData();
      if (initialData) {
        setName(initialData.name);
        setDescription(initialData.description || '');
        setSelectedCompanies(initialData.companies);
        setSelectedDepartments(initialData.departments);
      }
    }
  }, [isOpen, initialData]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Carregar empresas
      const companiesSnapshot = await getDocs(collection(db, 'companies'));
      const companiesData = companiesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Company[];
      setCompanies(companiesData);

      // Carregar todos os departamentos de todas as empresas
      const allDepts: Department[] = [];
      for (const company of companiesData) {
        const deptsSnapshot = await getDocs(collection(db, `companies/${company.id}/departments`));
        const depts = deptsSnapshot.docs.map(doc => ({
          id: doc.id,
          companyId: company.id,
          ...doc.data()
        })) as Department[];
        allDepts.push(...depts);
      }
      setAllDepartments(allDepts);
      
      setLoading(false);
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
      setError('Erro ao carregar empresas e departamentos');
      setLoading(false);
    }
  };

  const handleCompanyToggle = (companyId: string) => {
    setSelectedCompanies(prev => {
      if (prev.includes(companyId)) {
        // Remover empresa e seus departamentos
        const deptIds = allDepartments
          .filter(d => d.companyId === companyId)
          .map(d => d.id);
        setSelectedDepartments(prevDepts => 
          prevDepts.filter(id => !deptIds.includes(id))
        );
        return prev.filter(id => id !== companyId);
      } else {
        return [...prev, companyId];
      }
    });
  };

  const handleDepartmentToggle = (deptId: string) => {
    setSelectedDepartments(prev => {
      if (prev.includes(deptId)) {
        return prev.filter(id => id !== deptId);
      } else {
        return [...prev, deptId];
      }
    });
  };

  const handleSave = async () => {
    setError('');

    // Validações
    if (!name.trim()) {
      setError('O nome do workflow é obrigatório');
      return;
    }

    if (selectedCompanies.length === 0) {
      setError('Selecione pelo menos uma empresa');
      return;
    }

    if (selectedDepartments.length === 0) {
      setError('Selecione pelo menos um departamento');
      return;
    }

    // Salvar configuração
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        companies: selectedCompanies,
        departments: selectedDepartments
      });

      // Resetar formulário apenas se não for modo de edição
      if (!isEditMode) {
        setName('');
        setDescription('');
        setSelectedCompanies([]);
        setSelectedDepartments([]);
        setError('');
      }
    } catch (err) {
      console.error('Erro ao salvar:', err);
      setError('Erro ao salvar workflow. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setName('');
    setSelectedCompanies([]);
    setSelectedDepartments([]);
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  // Filtrar departamentos das empresas selecionadas
  const availableDepartments = allDepartments.filter(d => 
    selectedCompanies.includes(d.companyId || '')
  );

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>{isEditMode ? 'Editar Workflow' : 'Configuração do Workflow'}</h2>
          <button onClick={handleClose} className={styles.closeButton} disabled={saving}>
            <X size={24} />
          </button>
        </div>

        <div className={styles.content}>
          {loading ? (
            <div className={styles.loading}>Carregando...</div>
          ) : (
            <>
              {/* Nome do Workflow */}
              <div className={styles.section}>
                <label className={styles.label}>
                  <FileText size={18} />
                  <span>Nome do Workflow *</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Processo de Aprovação de Compras"
                  className={styles.input}
                  autoFocus
                />
              </div>

              {/* Descrição do Workflow */}
              <div className={styles.section}>
                <label className={styles.label}>
                  <FileText size={18} />
                  <span>Descrição</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descreva o objetivo deste workflow..."
                  className={styles.input}
                  rows={3}
                />
              </div>

              {/* Empresas */}
              <div className={styles.section}>
                <label className={styles.label}>
                  <Building2 size={18} />
                  <span>Empresas Disponíveis *</span>
                </label>
                <p className={styles.hint}>Selecione as empresas que poderão usar este workflow</p>
                {companies.length === 0 ? (
                  <p className={styles.emptyText}>Nenhuma empresa cadastrada</p>
                ) : (
                  <div className={styles.checkboxList}>
                    {companies.map((company) => (
                      <label key={company.id} className={styles.checkboxCard}>
                        <input
                          type="checkbox"
                          checked={selectedCompanies.includes(company.id)}
                          onChange={() => handleCompanyToggle(company.id)}
                        />
                        <span>{company.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Departamentos */}
              {selectedCompanies.length > 0 && (
                <div className={styles.section}>
                  <label className={styles.label}>
                    <Users size={18} />
                    <span>Departamentos Disponíveis *</span>
                  </label>
                  <p className={styles.hint}>Selecione os departamentos que poderão usar este workflow</p>
                  {availableDepartments.length === 0 ? (
                    <p className={styles.emptyText}>Nenhum departamento nas empresas selecionadas</p>
                  ) : (
                    <div className={styles.checkboxList}>
                      {availableDepartments.map((dept) => {
                        const company = companies.find(c => c.id === dept.companyId);
                        return (
                          <label key={dept.id} className={styles.checkboxCard}>
                            <input
                              type="checkbox"
                              checked={selectedDepartments.includes(dept.id)}
                              onChange={() => handleDepartmentToggle(dept.id)}
                            />
                            <span>
                              {dept.name}
                              {company && <small> ({company.name})</small>}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Mensagem de erro */}
              {error && (
                <div className={styles.error}>
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        <div className={styles.footer}>
          <button onClick={handleClose} className={styles.cancelButton} disabled={saving}>
            Cancelar
          </button>
          <button onClick={handleSave} className={styles.saveButton} disabled={loading || saving}>
            {saving ? 'Salvando...' : (isEditMode ? 'Salvar Alterações' : 'Salvar e Continuar')}
          </button>
        </div>
      </div>
    </div>
  );
}
