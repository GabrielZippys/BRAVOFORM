'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, AlertTriangle } from 'lucide-react'; 
import FormEditor from '@/components/FormEditor';
import styles from '../../styles/Forms.module.css';

// CORREÇÃO: Importa as funções e instâncias necessárias do Firebase
import { db, auth } from '../../../firebase/config';
import { onAuthStateChanged, type User } from "firebase/auth";
import { collection, onSnapshot, query, where, doc, deleteDoc, and } from 'firebase/firestore';

// CORREÇÃO: Importa os tipos do ficheiro central, em vez de os definir localmente
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
  
  // Estado para guardar o utilizador autenticado
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Efeito para ouvir o estado da autenticação
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(prev => ({ ...prev, auth: false }));
    });
    return () => unsubscribeAuth();
  }, []);

  // Busca empresas
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

  // Busca departamentos da empresa selecionada
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

  // CORREÇÃO: Busca formulários usando a regra de segurança
  useEffect(() => {
    // Não faz nada se não houver departamento ou se o utilizador ainda não estiver carregado
    if (!selectedDepartmentId || !currentUser) {
      setForms([]);
      setFirestoreError(null);
      setLoading(prev => ({ ...prev, forms: false }));
      return;
    }
    setLoading(prev => ({ ...prev, forms: true }));
    setFirestoreError(null);

    // Cria a consulta correta que o Firestore permite
    const q = query(
      collection(db, "forms"),
      and(
        where("departmentId", "==", selectedDepartmentId),
        where("authorizedUsers", "array-contains", currentUser.uid)
      )
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setForms(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Form)));
      setLoading(prev => ({ ...prev, forms: false }));
    }, (error) => {
      console.error("Erro ao buscar formulários: ", error);
      setFirestoreError("Não foi possível carregar os formulários. Verifique se o índice do Firestore foi criado (ver consola do browser para um link).");
      setLoading(prev => ({...prev, forms: false}));
    });

    return () => unsubscribe();
  }, [selectedDepartmentId, currentUser]); // Depende do departamento E do utilizador

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

  return (
    <>
      <div>
        <div className={styles.header}>
          <h2 className={styles.title}>Gerenciar Formulários</h2>
          <button 
            onClick={() => handleOpenEditor()} 
            className={styles.button}
            disabled={!selectedCompanyId || !selectedDepartmentId}
          >
            <Plus size={16} />
            <span>Novo Formulário</span>
          </button>
        </div>

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

        <div className={styles.cardGrid}>
          {loading.forms ? (
            <p className={styles.emptyState}>Carregando formulários...</p>
          ) : firestoreError ? (
            <div className={styles.errorState}> {/* Crie esta classe no seu CSS */}
              <AlertTriangle size={24} />
              <p><strong>{firestoreError}</strong></p>
            </div>
          ) : forms.length > 0 ? (
            forms.map(form => (
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

      <FormEditor 
        isOpen={isEditorOpen} 
        onClose={handleCloseEditor} 
        companyId={selectedCompanyId}
        departmentId={selectedDepartmentId}
        existingForm={editingForm}
      />
    </>
  );
}
