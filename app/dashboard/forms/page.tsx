'use client';

import React, { useState, useEffect } from 'react';

// Drag and Drop
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { Plus, Edit, Trash2, AlertTriangle, GripVertical, Pause, Play, Archive, Copy } from 'lucide-react';
import EnhancedFormBuilderPage from '@/components/EnhancedFormBuilder';
import ConfirmModal from '@/components/ConfirmModal';
import ArchivedFormsModal from '@/components/ArchivedFormsModal';
import styles from '../../styles/Forms.module.css';

import { db, auth } from '../../../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, onSnapshot, query, where, doc, deleteDoc, updateDoc, Timestamp, addDoc } from 'firebase/firestore';
import { type Form, type Company, type Department } from '@/types';

// --- Card arrastável ---
const SortableFormCard = ({
  form,
  onEdit,
  onDelete,
  onTogglePause,
  onArchive,
  onDuplicate,
}: {
  form: Form;
  onEdit: (form: Form) => void;
  onDelete: (id: string) => void;
  onTogglePause: (id: string, currentPausedState: boolean) => void;
  onArchive: (id: string, title: string) => void;
  onDuplicate: (form: Form) => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: form.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isPaused = (form as any).paused || false;

  return (
    <div ref={setNodeRef} style={style} className={`${styles.formCard} ${isPaused ? styles.pausedCard : ''}`}>
      <div {...attributes} {...listeners} className={styles.dragHandle} title="Arrastar para reordenar">
        <GripVertical size={20} />
      </div>

      <div style={{ flex: 1 }}>
        <h3 className={styles.cardTitle}>
          {form.title}
          {isPaused && (
            <span style={{
              marginLeft: '0.5rem',
              padding: '0.2rem 0.5rem',
              background: 'rgba(251, 146, 60, 0.15)',
              color: '#f97316',
              borderRadius: '6px',
              fontSize: '0.7rem',
              fontWeight: 600,
              border: '1px solid rgba(251, 146, 60, 0.3)'
            }}>
              PAUSADO
            </span>
          )}
        </h3>
      </div>

      <div className={styles.cardActions}>
        <button 
          onClick={() => onTogglePause(form.id, isPaused)} 
          className={styles.actionButton}
          title={isPaused ? "Reativar formulário" : "Pausar formulário"}
          style={{
            background: isPaused ? 'rgba(34, 197, 94, 0.1)' : 'rgba(251, 146, 60, 0.1)',
            color: isPaused ? '#22c55e' : '#f97316'
          }}
        >
          {isPaused ? <Play size={16} /> : <Pause size={16} />}
        </button>

        <button onClick={() => onEdit(form)} className={styles.actionButton} title="Editar">
          <Edit size={16} />
        </button>

        <button
          onClick={() => onDuplicate(form)}
          className={styles.actionButton}
          title="Duplicar formulário"
          style={{
            background: 'rgba(59, 130, 246, 0.1)',
            color: '#3b82f6'
          }}
        >
          <Copy size={16} />
        </button>

        <button
          onClick={() => onArchive(form.id, form.title)}
          className={styles.actionButton}
          title="Arquivar formulário"
          style={{
            background: 'rgba(148, 163, 184, 0.1)',
            color: '#64748b'
          }}
        >
          <Archive size={16} />
        </button>

        <button
          onClick={() => onDelete(form.id)}
          className={`${styles.actionButton} ${styles.deleteButton}`}
          title="Apagar"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
};

// --- Página principal ---
export default function FormsPage() {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<Form | null>(null);
  const [isArchivedModalOpen, setIsArchivedModalOpen] = useState(false);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [forms, setForms] = useState<Form[]>([]);

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

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setForms((items) => {
        const oldIndex = items.findIndex((it) => it.id === active.id);
        const newIndex = items.findIndex((it) => it.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }

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

  // Formulários
  useEffect(() => {
    if (!selectedDepartmentId) {
      setForms([]);
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
        // Garante que o id seja SEMPRE o doc.id (nunca um id salvo dentro do documento)
        const list = snapshot.docs
          .map((d) => {
            const data = d.data() as any;
            return { ...data, id: d.id } as Form;
          })
          .filter((f) => {
            const hasValidId = typeof f.id === 'string' && f.id.trim() !== '';
            const isArchived = (f as any).archived || false;
            return hasValidId && !isArchived; // Não mostra formulários arquivados
          });

        // Remove duplicatas por segurança
        const dedup = Array.from(new Map(list.map((f) => [f.id, f])).values());
        setForms(dedup);
        setLoading((prev) => ({ ...prev, forms: false }));
      },
      (error) => {
        console.error('Erro ao buscar formulários: ', error);
        setFirestoreError('Não foi possível carregar os formulários. Verifique se o índice do Firestore foi criado.');
        setLoading((prev) => ({ ...prev, forms: false }));
      }
    );

    return () => unsubscribe();
  }, [selectedDepartmentId]);

  // Ações
  const handleOpenEditor = (form: Form | null = null) => {
    setEditingForm(form);
    setIsEditorOpen(true);
  };
  const handleCloseEditor = () => {
    setIsEditorOpen(false);
    setEditingForm(null);
  };
  const handleDeleteForm = (formId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Apagar Formulário',
      message: 'Tem certeza que deseja apagar este formulário?\n\nEsta ação não pode ser desfeita.',
      isDanger: true,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'forms', formId));
          setConfirmModal({ ...confirmModal, isOpen: false });
        } catch (error) {
          console.error('Erro ao apagar formulário:', error);
          alert('Erro ao apagar o formulário. Tente novamente.');
        }
      },
    });
  };

  const handleTogglePause = async (formId: string, currentPausedState: boolean) => {
    try {
      const formRef = doc(db, 'forms', formId);
      await updateDoc(formRef, {
        paused: !currentPausedState
      });
    } catch (error) {
      console.error('Erro ao pausar/reativar formulário:', error);
      alert('Erro ao atualizar o formulário. Tente novamente.');
    }
  };

  const handleArchiveForm = (formId: string, formTitle: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Arquivar este formulário?',
      message: `"${formTitle}"\n\nEle deixará de receber envios e será movido para a área de Arquivo.`,
      isDanger: false,
      onConfirm: async () => {
        try {
          const formRef = doc(db, 'forms', formId);
          await updateDoc(formRef, {
            archived: true,
            archivedAt: Timestamp.now(),
            archivedBy: currentUser?.email || currentUser?.uid || 'unknown'
          });
          setConfirmModal({ ...confirmModal, isOpen: false });
        } catch (error) {
          console.error('Erro ao arquivar formulário:', error);
          alert('Erro ao arquivar o formulário. Tente novamente.');
        }
      },
    });
  };

  const handleDuplicateForm = (form: Form) => {
    setConfirmModal({
      isOpen: true,
      title: 'Duplicar formulário?',
      message: `"${form.title}"\n\nSerá criada uma cópia exata da estrutura deste formulário.\nOs envios já realizados NÃO serão copiados.`,
      isDanger: false,
      onConfirm: async () => {
        try {
          // Cria cópia do formulário sem o ID e sem dados de arquivamento/pausa
          const formCopy: any = {
            ...form,
            title: `${form.title} (Cópia)`,
            createdAt: Timestamp.now(),
            createdBy: currentUser?.email || currentUser?.uid || 'unknown',
            archived: false,
            paused: false,
          };

          // Remove campos que não devem existir no formulário duplicado
          delete formCopy.id;
          delete formCopy.archivedAt;
          delete formCopy.archivedBy;
          delete formCopy.restoredAt;
          delete formCopy.restoredBy;

          // Adiciona o novo formulário ao Firestore
          await addDoc(collection(db, 'forms'), formCopy);
          
          setConfirmModal({ ...confirmModal, isOpen: false });
        } catch (error) {
          console.error('Erro ao duplicar formulário:', error);
          alert('Erro ao duplicar o formulário. Tente novamente.');
        }
      },
    });
  };

  if (loading.auth) {
    return <p className={styles.emptyState}>A verificar autenticação...</p>;
  }

  return (
    <div className={`${styles.container} ${isEditorOpen ? styles.editorActive : ''}`}>
      <header className={styles.header}>
        <h2 className={styles.title}>Gerenciar Formulários</h2>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => setIsArchivedModalOpen(true)}
            className={styles.button}
            style={{
              background: 'rgba(148, 163, 184, 0.1)',
              color: '#64748b',
              border: '1px solid rgba(148, 163, 184, 0.3)'
            }}
            title="Ver formulários arquivados"
          >
            <Archive size={16} />
            <span>Arquivo</span>
          </button>

          <button
            onClick={() => {
              const url = `/forms/builder/novo?companyId=${selectedCompanyId}&departmentId=${selectedDepartmentId}`;
              window.open(url, '_blank');
            }}
            className={styles.button}
            disabled={!selectedCompanyId || !selectedDepartmentId}
          >
            <Plus size={16} />
            <span>Novo Formulário</span>
          </button>
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          {/* <- IMPORTANTÍSSIMO: Somente IDs no items */}
          <SortableContext items={forms.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            <div className={styles.cardGrid}>
              {loading.forms ? (
                <p className={styles.emptyState}>Carregando formulários...</p>
              ) : firestoreError ? (
                <div className={styles.errorState}>
                  <AlertTriangle size={24} />
                  <p>
                    <strong>{firestoreError}</strong>
                  </p>
                </div>
              ) : forms.length > 0 ? (
                forms.map((form, idx) => (
                  <SortableFormCard
                    key={form.id || `fallback-${idx}`}
                    form={form}
                    onEdit={(formToEdit) => {
                      const url = `/forms/builder/${formToEdit.id}?companyId=${formToEdit.companyId}&departmentId=${formToEdit.departmentId}`;
                      window.open(url, '_blank');
                    }}
                    onDelete={handleDeleteForm}
                    onTogglePause={handleTogglePause}
                    onArchive={handleArchiveForm}
                    onDuplicate={handleDuplicateForm}
                  />
                ))
              ) : (
                <p className={styles.emptyState}>Nenhum formulário encontrado para este setor.</p>
              )}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {/* Painel deslizante do editor (se precisar usar embutido) */}
      <div className={`${styles.editorPanel} ${isEditorOpen ? styles.isOpen : ''}`}>
        <div className={styles.editorPanelOverlay}></div>
        <div className={styles.editorPanelContent}>
          {isEditorOpen && (
            <EnhancedFormBuilderPage
              companyId={selectedCompanyId}
              departmentId={selectedDepartmentId}
              existingForm={editingForm}
              onSaveSuccess={handleCloseEditor}
              onCancel={handleCloseEditor}
            />
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

      {/* Modal de Formulários Arquivados */}
      <ArchivedFormsModal
        isOpen={isArchivedModalOpen}
        onClose={() => setIsArchivedModalOpen(false)}
        departmentId={selectedDepartmentId}
        currentUserEmail={currentUser?.email || undefined}
        currentUserId={currentUser?.uid || undefined}
      />
    </div>
  );
}
