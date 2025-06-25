
'use client';
import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2 } from 'lucide-react';
import FormEditor from '@/components/FormEditor';
import { type Company, type Department, type Form } from '@/types'; // Importando do arquivo central de tipos
import styles from '../../styles/Forms.module.css';
import { db } from '../../../firebase/config';
import { collection, onSnapshot, query, where, doc, deleteDoc } from 'firebase/firestore';

export default function FormsPage() {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<Form | null>(null);
  
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState({ companies: true, departments: false, forms: false });

  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');

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
  }, [selectedCompanyId, selectedDepartmentId]); // CORREÇÃO: Adicionada a dependência

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
    if (window.confirm("Tem certeza que deseja apagar este formulário?")) {
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
