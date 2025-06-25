'use client';
import { useState, useEffect } from 'react';
// CORREÇÃO: Removidos os ícones não utilizados.
import { Plus, Edit, Trash2 } from 'lucide-react'; 
import FormEditor from '@/components/FormEditor';
import styles from '../../styles/Forms.module.css';
import { db } from '../../../firebase/config';
import { collection, onSnapshot, query, where, doc, deleteDoc } from 'firebase/firestore';

// Tipos de dados
interface Company { id: string; name: string; }
interface Department { id: string; name: string; }
// CORREÇÃO: Definindo um tipo específico para os campos para resolver o erro 'any'
interface FormField { id: number; type: 'Texto' | 'Anexo' | 'Assinatura'; label: string; }
interface Form {
  id: string;
  title: string;
  fields: FormField[];
  automation: { type: string; target: string };
  assignedCollaborators?: string[];
  companyId: string;
  departmentId: string;
  ownerId: string;
  collaborators: string[];
  authorizedUsers: string[];
}


export default function FormsPage() {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<Form | null>(null);
  
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState({ companies: true, departments: false, forms: false });

  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');

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
  // CORREÇÃO: Adicionada a dependência que faltava
  }, [selectedCompanyId, selectedDepartmentId]);

  // Busca formulários do departamento selecionado
  useEffect(() => {
    if (!selectedDepartmentId) {
      setForms([]);
      setLoading(prev => ({...prev, forms: false}));
      return;
    }
    setLoading(prev => ({...prev, forms: true}));
    const q = query(collection(db, "forms"), where("departmentId", "==", selectedDepartmentId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setForms(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Form)));
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
