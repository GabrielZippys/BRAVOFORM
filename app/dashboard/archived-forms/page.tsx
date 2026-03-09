'use client';

import React, { useState, useEffect } from 'react';
import { db, auth } from '../../../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, onSnapshot, query, where, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Archive, RotateCcw, Trash2, AlertTriangle, FileText } from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';
import styles from '../../styles/Forms.module.css';
import { type Form, type Company, type Department } from '@/types';

export default function ArchivedFormsPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [archivedForms, setArchivedForms] = useState<Form[]>([]);

  const [loading, setLoading] = useState({
    companies: true,
    departments: false,
    forms: false,
    auth: true,
  });
  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Estados do modal de confirmação
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDanger?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    isDanger: false,
  });

  // Auth
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading((prev) => ({ ...prev, auth: false }));
    });
    return () => unsubscribeAuth();
  }, []);

  // Empresas
  useEffect(() => {
    const qCompanies = query(collection(db, 'companies'));
    const unsubscribe = onSnapshot(qCompanies, (snapshot) => {
      const companiesData = snapshot.docs.map((d) => ({ ...(d.data() as any), id: d.id } as Company));
      setCompanies(companiesData);
      if (companiesData.length > 0 && !selectedCompanyId) {
        setSelectedCompanyId(companiesData[0].id);
      }
      setLoading((prev) => ({ ...prev, companies: false }));
    });
    return () => unsubscribe();
  }, [selectedCompanyId]);

  // Departamentos
  useEffect(() => {
    if (!selectedCompanyId) {
      setDepartments([]);
      setSelectedDepartmentId('');
      return;
    }
    setLoading((prev) => ({ ...prev, departments: true }));

    const qDepts = query(collection(db, `companies/${selectedCompanyId}/departments`));
    const unsubscribe = onSnapshot(qDepts, (snapshot) => {
      const deptsData = snapshot.docs.map((d) => ({ ...(d.data() as any), id: d.id } as Department));
      setDepartments(deptsData);

      const currentDeptExists = deptsData.some((d) => d.id === selectedDepartmentId);
      if (!currentDeptExists) {
        setSelectedDepartmentId(deptsData[0]?.id || '');
      }
      setLoading((prev) => ({ ...prev, departments: false }));
    });

    return () => unsubscribe();
  }, [selectedCompanyId, selectedDepartmentId]);

  // Formulários Arquivados
  useEffect(() => {
    if (!selectedDepartmentId) {
      setArchivedForms([]);
      setFirestoreError(null);
      setLoading((prev) => ({ ...prev, forms: false }));
      return;
    }

    setLoading((prev) => ({ ...prev, forms: true }));
    setFirestoreError(null);

    const qForms = query(collection(db, 'forms'), where('departmentId', '==', selectedDepartmentId));
    const unsubscribe = onSnapshot(
      qForms,
      (snapshot) => {
        const list = snapshot.docs
          .map((d) => {
            const data = d.data() as any;
            return { ...data, id: d.id } as Form;
          })
          .filter((f) => {
            const hasValidId = typeof f.id === 'string' && f.id.trim() !== '';
            const isArchived = (f as any).archived || false;
            return hasValidId && isArchived; // Mostra APENAS formulários arquivados
          });

        const dedup = Array.from(new Map(list.map((f) => [f.id, f])).values());
        setArchivedForms(dedup);
        setLoading((prev) => ({ ...prev, forms: false }));
      },
      (error) => {
        console.error('Erro ao buscar formulários arquivados: ', error);
        setFirestoreError('Não foi possível carregar os formulários arquivados.');
        setLoading((prev) => ({ ...prev, forms: false }));
      }
    );

    return () => unsubscribe();
  }, [selectedDepartmentId]);

  // Restaurar formulário
  const handleRestoreForm = (formId: string, formTitle: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Restaurar formulário?',
      message: `"${formTitle}"\n\nEle voltará para a lista de formulários ativos e poderá receber novos envios.`,
      isDanger: false,
      onConfirm: async () => {
        try {
          const formRef = doc(db, 'forms', formId);
          await updateDoc(formRef, {
            archived: false,
            restoredAt: new Date(),
            restoredBy: currentUser?.email || currentUser?.uid || 'unknown'
          });
          setConfirmModal({ ...confirmModal, isOpen: false });
        } catch (error) {
          console.error('Erro ao restaurar formulário:', error);
          alert('Erro ao restaurar o formulário. Tente novamente.');
        }
      },
    });
  };

  // Excluir permanentemente
  const handleDeletePermanently = (formId: string, formTitle: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'ATENÇÃO: Exclusão Permanente',
      message: `Excluir permanentemente o formulário "${formTitle}"?\n\nEsta ação NÃO PODE ser desfeita!\nTodos os dados e histórico serão perdidos.`,
      isDanger: true,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'forms', formId));
          setConfirmModal({ ...confirmModal, isOpen: false });
        } catch (error) {
          console.error('Erro ao excluir formulário:', error);
          alert('Erro ao excluir o formulário. Tente novamente.');
        }
      },
    });
  };

  if (loading.auth) {
    return <p className={styles.emptyState}>A verificar autenticação...</p>;
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Archive size={28} color="#64748b" />
          <h2 className={styles.title}>Formulários Arquivados</h2>
        </div>
      </header>

      <div className={styles.frame}>
        <div className={styles.filters}>
          <div className={styles.filterGroup}>
            <label htmlFor="empresa">Empresa</label>
            <select
              id="empresa"
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className={styles.filterInput}
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label htmlFor="depto">Departamento</label>
            <select
              id="depto"
              value={selectedDepartmentId}
              onChange={(e) => setSelectedDepartmentId(e.target.value)}
              className={styles.filterInput}
              disabled={!selectedCompanyId}
            >
              {loading.departments ? (
                <option>Carregando...</option>
              ) : (
                departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      </div>

      <div className={styles.listWrapper}>
        <div className={styles.cardGrid}>
          {loading.forms ? (
            <p className={styles.emptyState}>Carregando formulários arquivados...</p>
          ) : firestoreError ? (
            <div className={styles.errorState}>
              <AlertTriangle size={24} />
              <p>
                <strong>{firestoreError}</strong>
              </p>
            </div>
          ) : archivedForms.length > 0 ? (
            archivedForms.map((form) => {
              const archivedData = form as any;
              const archivedAt = archivedData.archivedAt?.toDate?.();
              const archivedBy = archivedData.archivedBy || 'Desconhecido';

              return (
                <div key={form.id} className={styles.formCard} style={{ 
                  opacity: 0.85,
                  background: 'rgba(148, 163, 184, 0.05)',
                  borderColor: 'rgba(148, 163, 184, 0.3)'
                }}>
                  <div className={styles.dragHandle} style={{ cursor: 'default', color: '#94a3b8' }}>
                    <Archive size={20} />
                  </div>

                  <div style={{ flex: 1 }}>
                    <h3 className={styles.cardTitle}>
                      {form.title}
                      <span style={{
                        marginLeft: '0.5rem',
                        padding: '0.2rem 0.5rem',
                        background: 'rgba(148, 163, 184, 0.15)',
                        color: '#64748b',
                        borderRadius: '6px',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        border: '1px solid rgba(148, 163, 184, 0.3)'
                      }}>
                        ARQUIVADO
                      </span>
                    </h3>
                    {archivedAt && (
                      <p style={{ 
                        fontSize: '0.75rem', 
                        color: '#94a3b8', 
                        margin: '0.25rem 0 0 0' 
                      }}>
                        Arquivado em {archivedAt.toLocaleDateString()} às {archivedAt.toLocaleTimeString()} por {archivedBy}
                      </p>
                    )}
                  </div>

                  <div className={styles.cardActions}>
                    <button 
                      onClick={() => handleRestoreForm(form.id, form.title)} 
                      className={styles.actionButton}
                      title="Restaurar formulário"
                      style={{
                        background: 'rgba(34, 197, 94, 0.1)',
                        color: '#22c55e'
                      }}
                    >
                      <RotateCcw size={16} />
                    </button>

                    <button
                      onClick={() => handleDeletePermanently(form.id, form.title)}
                      className={`${styles.actionButton} ${styles.deleteButton}`}
                      title="Excluir permanentemente"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className={styles.emptyState}>
              <FileText size={48} style={{ opacity: 0.5 }} />
              <p>Nenhum formulário arquivado neste departamento.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Confirmação */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        isDanger={confirmModal.isDanger}
      />
    </div>
  );
}
