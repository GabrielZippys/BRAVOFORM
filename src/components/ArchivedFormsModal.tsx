'use client';

import React, { useState, useEffect } from 'react';
import { db } from '../../firebase/config';
import { collection, onSnapshot, query, where, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Archive, RotateCcw, Trash2, X, FileText } from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import styles from './ArchivedFormsModal.module.css';
import { type Form } from '@/types';

interface ArchivedFormsModalProps {
  isOpen: boolean;
  onClose: () => void;
  departmentId: string;
  currentUserEmail?: string;
  currentUserId?: string;
}

export default function ArchivedFormsModal({
  isOpen,
  onClose,
  departmentId,
  currentUserEmail,
  currentUserId,
}: ArchivedFormsModalProps) {
  const [archivedForms, setArchivedForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(false);

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

  // Carregar formulários arquivados
  useEffect(() => {
    if (!isOpen || !departmentId) {
      setArchivedForms([]);
      return;
    }

    setLoading(true);

    const qForms = query(collection(db, 'forms'), where('departmentId', '==', departmentId));
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
            return hasValidId && isArchived;
          });

        const dedup = Array.from(new Map(list.map((f) => [f.id, f])).values());
        setArchivedForms(dedup);
        setLoading(false);
      },
      (error) => {
        console.error('Erro ao buscar formulários arquivados: ', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isOpen, departmentId]);

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
            restoredBy: currentUserEmail || currentUserId || 'unknown'
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

  if (!isOpen) return null;

  return (
    <>
      <div className={styles.overlay}>
        <div className={styles.modal}>
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerTitle}>
              <Archive size={24} />
              <h2>Formulários Arquivados</h2>
            </div>
            <button onClick={onClose} className={styles.closeButton}>
              <X size={24} />
            </button>
          </div>

          {/* Content */}
          <div className={styles.content}>
            {loading ? (
              <div className={styles.emptyState}>
                <p>Carregando formulários arquivados...</p>
              </div>
            ) : archivedForms.length > 0 ? (
              <div className={styles.formsList}>
                {archivedForms.map((form) => {
                  const archivedData = form as any;
                  const archivedAt = archivedData.archivedAt?.toDate?.();
                  const archivedBy = archivedData.archivedBy || 'Desconhecido';

                  return (
                    <div key={form.id} className={styles.formCard}>
                      <div className={styles.formIcon}>
                        <Archive size={20} />
                      </div>

                      <div className={styles.formInfo}>
                        <h3 className={styles.formTitle}>
                          {form.title}
                          <span className={styles.archivedBadge}>ARQUIVADO</span>
                        </h3>
                        {archivedAt && (
                          <p className={styles.formMeta}>
                            Arquivado em {archivedAt.toLocaleDateString()} às{' '}
                            {archivedAt.toLocaleTimeString()} por {archivedBy}
                          </p>
                        )}
                      </div>

                      <div className={styles.formActions}>
                        <button
                          onClick={() => handleRestoreForm(form.id, form.title)}
                          className={styles.restoreButton}
                          title="Restaurar formulário"
                        >
                          <RotateCcw size={16} />
                          Restaurar
                        </button>

                        <button
                          onClick={() => handleDeletePermanently(form.id, form.title)}
                          className={styles.deleteButton}
                          title="Excluir permanentemente"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <FileText size={48} />
                <p>Nenhum formulário arquivado neste departamento.</p>
              </div>
            )}
          </div>
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
    </>
  );
}
