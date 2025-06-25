'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2 } from 'lucide-react';
import FormEditor from '@/components/FormEditor';
import styles from '../../styles/Forms.module.css';

// CORREÇÃO: Importa o auth para obter o utilizador atual para a consulta
import { db, auth } from '../../../firebase/config';
import { collection, onSnapshot, query, where, doc, deleteDoc, and } from 'firebase/firestore';

// CORREÇÃO: Importa os tipos do ficheiro central, em vez de os definir localmente
import { type Form, type Company, type Department } from '@/types';
import { useAuth } from '@/hooks/useAuth'; // Assumindo que tem um hook de autenticação

export default function FormsPage() {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<Form | null>(null);
  
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState({ companies: true, departments: false, forms: false });

  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');

  // Utilizador atual do nosso hook de autenticação
  const { user, loading: authLoading } = useAuth();

  // Busca empresas
  useEffect(() => {
    const q = query(collection(db, "companies"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const companiesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Company));
      setCompanies(companiesData);
      if (companiesData.length > 0 && !selectedCompanyId) {
        setSelectedCompanyId(companiesData[0].id);
      }
      setLoading(prev => ({ ...prev, companies: false }));
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
    setLoading(prev => ({ ...prev, departments: true }));
    const q = query(collection(db, `companies/${selectedCompanyId}/departments`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const deptsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department));
      setDepartments(deptsData);
      if (!deptsData.some(d => d.id === selectedDepartmentId)) {
        setSelectedDepartmentId(deptsData[0]?.id || '');
      }
       setLoading(prev => ({ ...prev, departments: false }));
    });
    return () => unsubscribe();
  }, [selectedCompanyId, selectedDepartmentId]);

  // CORREÇÃO: Busca formulários usando a regra de segurança
  useEffect(() => {
    // Não faz nada se não houver departamento ou se o utilizador ainda não estiver carregado
    if (!selectedDepartmentId || !user) {
      setForms([]);
      setLoading(prev => ({ ...prev, forms: false }));
      return;
    }
    setLoading(prev => ({ ...prev, forms: true }));

    // Cria a consulta correta que o Firestore permite
    const q = query(
      collection(db, "forms"),
      and(
        where("departmentId", "==", selectedDepartmentId),
        where("authorizedUsers", "array-contains", user.uid)
      )
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setForms(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Form)));
      setLoading(prev => ({ ...prev, forms: false }));
    }, (error) => {
      console.error("Erro ao buscar formulários: ", error);
      setLoading(prev => ({...prev, forms: false}));
    });

    return () => unsubscribe();
  }, [selectedDepartmentId, user]); // Depende do departamento E do utilizador

  const handleOpenEditor = (form: Form | null = null) => {
    setEditingForm(form);
    setIsEditorOpen(true);
  };
  
  const handleCloseEditor = () => {
    setIsEditorOpen(false);
    setEditingForm(null); 
  }

  const handleDeleteForm = async (formId: string) => {
    // Seria ideal ter uma UI de modal em vez de window.confirm
    if (confirm("Tem certeza que deseja apagar este formulário? Esta ação não pode ser desfeita.")) {
        try {
            await deleteDoc(doc(db, "forms", formId));
        } catch (error) {
            console.error("Erro ao apagar formulário (verifique as permissões): ", error);
            // Adicionar feedback de erro para o utilizador
        }
    }
  };
  
  // Mostra um estado de carregamento enquanto a autenticação está a ser verificada
  if(authLoading) {
      return <div>Carregando autenticação...</div>
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
          {loading.forms ? <p className={styles.emptyState}>Carregando formulários...</p> : forms.length > 0 ? (
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
