'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, AlertTriangle } from 'lucide-react'; 
import FormEditor from '@/components/FormEditor'; // Ajuste o caminho se necessário
import styles from '../../styles/Forms.module.css';
import { db, auth } from '../../../firebase/config';
import { onAuthStateChanged, type User } from "firebase/auth";
import { collection, onSnapshot, query, where, doc, deleteDoc } from 'firebase/firestore';

import { type Form, type Company, type Department } from '@/types';

export default function FormsPage() {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<Form | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState({ companies: true, departments: false, forms: false, auth: true });
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(prev => ({ ...prev, auth: false }));
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "companies"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const companiesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Company));
      setCompanies(companiesData);
      if(companiesData.length > 0 && !selectedCompanyId) {
        setSelectedCompanyId(companiesData[0].id);
      }
      setLoading(prev => ({...prev, companies: false}));
    });
    return () => unsubscribe();
  }, [selectedCompanyId]);

  useEffect(() => {
    if (!selectedCompanyId) {
      setDepartments([]);
      setSelectedDepartmentId('');
      return;
    }
    setLoading(prev => ({...prev, departments: true}));
    const q = query(collection(db, `companies/${selectedCompanyId}/departments`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const deptsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department));
      setDepartments(deptsData);
      const currentDeptExists = deptsData.some(d => d.id === selectedDepartmentId);
      if (!currentDeptExists) {
        setSelectedDepartmentId(deptsData[0]?.id || '');
      }
       setLoading(prev => ({...prev, departments: false}));
    });
    return () => unsubscribe();
  }, [selectedCompanyId, selectedDepartmentId]);

  useEffect(() => {
    if (!selectedDepartmentId) {
      setForms([]);
      setFirestoreError(null);
      setLoading(prev => ({ ...prev, forms: false }));
      return;
    }
    setLoading(prev => ({ ...prev, forms: true }));
    setFirestoreError(null);

    const q = query(
      collection(db, "forms"),
      where("departmentId", "==", selectedDepartmentId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setForms(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Form)));
      setLoading(prev => ({ ...prev, forms: false }));
    }, (error) => {
      console.error("Erro ao buscar formulários: ", error);
      setFirestoreError("Não foi possível carregar os formulários. Verifique se o índice do Firestore foi criado.");
      setLoading(prev => ({...prev, forms: false}));
    });

    return () => unsubscribe();
  }, [selectedDepartmentId]);

  const handleOpenEditor = (form: Form | null = null) => {
    setEditingForm(form); 
    setIsEditorOpen(true);
  };
  
  const handleCloseEditor = () => {
    setIsEditorOpen(false);
    setEditingForm(null); 
  }

  const handleDeleteForm = async (formId: string) => {
    if (window.confirm("Tem certeza que deseja apagar este formulário? Esta ação não pode ser desfeita.")) {
        await deleteDoc(doc(db, "forms", formId));
    }
  };

  if (loading.auth) {
      return <p className={styles.emptyState}>A verificar autenticação...</p>
  }

  if (isEditorOpen) {
    return (
      <FormEditor 
        companyId={selectedCompanyId}
        departmentId={selectedDepartmentId}
        existingForm={editingForm}
        onSaveSuccess={handleCloseEditor}
        onCancel={handleCloseEditor}
      />
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h2 className={styles.title}>Gerenciar Formulários</h2>
        <button 
          onClick={() => handleOpenEditor()} 
          className={styles.button}
          disabled={!selectedCompanyId || !selectedDepartmentId}
        >
          <Plus size={16} />
          <span>Novo Formulário</span>
        </button>
      </header>

      {/* Wrapper para os filtros, usando a classe .frame original */}
      <div className={styles.frame}>
        <div className={styles.filters}>
          <div className={styles.filterGroup}>
            <label htmlFor="empresa">Empresa</label>
            <select id="empresa" value={selectedCompanyId} onChange={e => setSelectedCompanyId(e.target.value)} className={styles.filterInput}>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label htmlFor="depto">Departamento</label>
            <select id="depto" value={selectedDepartmentId} onChange={e => setSelectedDepartmentId(e.target.value)} className={styles.filterInput} disabled={!selectedCompanyId}>
               {loading.departments ? <option>Carregando...</option> : departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* NOVO Wrapper para a lista de formulários */}
      <div className={styles.listWrapper}>
        <div className={styles.cardGrid}>
          {loading.forms ? (
            <p className={styles.emptyState}>Carregando formulários...</p>
          ) : firestoreError ? (
            <div className={styles.errorState}>
              <AlertTriangle size={24} />
              <p><strong>{firestoreError}</strong></p>
            </div>
          ) : forms.length > 0 ? (
            forms.map((form) => (
              <div key={form.id} className={styles.formCard}>
                <h3 className={styles.cardTitle}>{form.title}</h3>
                <div className={styles.cardActions}>
                  <button onClick={() => handleOpenEditor(form)} className={styles.actionButton} title="Editar"><Edit size={16}/></button>
                  <button onClick={() => handleDeleteForm(form.id)} className={`${styles.actionButton} ${styles.deleteButton}`} title="Apagar"><Trash2 size={16}/></button>
                </div>
              </div>
            ))
          ) : (
            <p className={styles.emptyState}>Nenhum formulário encontrado para este setor.</p>
          )}
        </div>
      </div>
    </div>
  );
}
