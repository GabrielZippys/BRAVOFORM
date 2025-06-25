'use client';

import React, { useState, useEffect } from 'react';
import { X, Type, Paperclip, PenSquare, Trash2 } from 'lucide-react';
import styles from '../../app/styles/FormEditor.module.css';
import { db } from '../../firebase/config';
import { collection, addDoc, doc, updateDoc, onSnapshot, query, serverTimestamp } from 'firebase/firestore';

// --- Tipos de Dados ---
interface FormField { id: number; type: 'Texto' | 'Anexo' | 'Assinatura'; label: string; }
interface Form { id?: string; title: string; fields: FormField[]; automation: { type: string; target: string; }; assignedCollaborators?: string[]; }
interface Collaborator { id: string; username: string; }
interface FormEditorProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string | null;
  departmentId: string | null;
  existingForm: Form | null;
}

export default function FormEditor({ isOpen, onClose, companyId, departmentId, existingForm }: FormEditorProps) {
  // --- Estados do Formulário ---
  const [formTitle, setFormTitle] = useState("Novo Formulário");
  const [fields, setFields] = useState<FormField[]>([]);
  const [automation, setAutomation] = useState({ type: 'email', target: '' });
  const [error, setError] = useState('');
  
  // --- Novos Estados para Atribuição ---
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [assignedCollaborators, setAssignedCollaborators] = useState<string[]>([]);

  // Efeito para preencher o editor quando um formulário existente é passado
  useEffect(() => {
    if (isOpen && existingForm) {
        setFormTitle(existingForm.title);
        setFields(existingForm.fields || []);
        setAutomation(existingForm.automation || { type: 'email', target: '' });
        setAssignedCollaborators(existingForm.assignedCollaborators || []);
    } else {
        setFormTitle("Novo Formulário");
        setFields([]);
        setAutomation({ type: 'email', target: '' });
        setAssignedCollaborators([]);
    }
  }, [existingForm, isOpen]);
  
  // Efeito para buscar colaboradores do departamento selecionado
  useEffect(() => {
    if (isOpen && departmentId) {
      const q = query(collection(db, `departments/${departmentId}/collaborators`));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setCollaborators(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Collaborator)));
      });
      return () => unsubscribe();
    }
  }, [departmentId, isOpen]);

  // --- Funções do Editor ---
  const addField = (type: FormField['type']) => setFields([...fields, { id: Date.now(), type, label: `Nova Pergunta` }]);
  const updateFieldLabel = (id: number, newLabel: string) => setFields(fields.map(f => f.id === id ? { ...f, label: newLabel } : f));
  const removeField = (id: number) => setFields(fields.filter(f => f.id !== id));
  
  const handleCollaboratorToggle = (collaboratorId: string) => {
    setAssignedCollaborators(prev => 
      prev.includes(collaboratorId) 
        ? prev.filter(id => id !== collaboratorId) 
        : [...prev, collaboratorId]
    );
  };

  const handleSave = async () => {
    if (!formTitle.trim() || !companyId || !departmentId) {
        return setError("Título, empresa e departamento são obrigatórios.");
    }
    setError('');
    
    const formToSave = { title: formTitle, fields, automation, companyId, departmentId, assignedCollaborators };
    
    try {
        if (existingForm?.id) {
            await updateDoc(doc(db, "forms", existingForm.id), formToSave);
        } else {
            await addDoc(collection(db, "forms"), { ...formToSave, createdAt: serverTimestamp() });
        }
        onClose();
    } catch (e) {
        console.error("Erro ao salvar formulário: ", e);
        setError("Não foi possível salvar o formulário.");
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>{existingForm ? 'Editar Formulário' : 'Novo Formulário'}</h3>
          <button onClick={onClose} className={styles.closeButton}><X /></button>
        </div>
        
        <div className={styles.editorGrid}>
          <div className={styles.controlsColumn}>
            <div><label className={styles.label}>Título do Formulário</label><input type="text" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} className={styles.input}/></div>
            <div><h4 className={styles.subTitle}>Adicionar Campos</h4><div className={styles.fieldButtons}><button onClick={() => addField('Texto')} className={styles.button}><Type size={16} /><span>Texto</span></button><button onClick={() => addField('Anexo')} className={styles.button}><Paperclip size={16} /><span>Anexo</span></button><button onClick={() => addField('Assinatura')} className={styles.button}><PenSquare size={16} /><span>Assinatura</span></button></div></div>
            <div className={styles.fieldsList}>
                {fields.map(field => (
                    <div key={field.id} className={styles.fieldEditor}>
                        <div className={styles.fieldHeader}><span className={styles.fieldTypeLabel}>{field.type}</span><button onClick={() => removeField(field.id)} className={styles.deleteFieldButton}><Trash2 size={16}/></button></div>
                        <input type="text" value={field.label} onChange={(e) => updateFieldLabel(field.id, e.target.value)} className={styles.input}/>
                    </div>
                ))}
            </div>
            <div>
              <h4 className={styles.subTitle}>Atribuir a Colaboradores</h4>
              <div className={styles.collaboratorList}>
                {collaborators.length > 0 ? collaborators.map(collab => (
                    <label key={collab.id} className={styles.collaboratorItem}>
                        <input type="checkbox" checked={assignedCollaborators.includes(collab.id)} onChange={() => handleCollaboratorToggle(collab.id)}/>
                        {collab.username}
                    </label>
                )) : <p style={{padding: '0.5rem', opacity: 0.7}}>Nenhum colaborador encontrado neste setor.</p>}
              </div>
            </div>
             {error && <p style={{color: 'red', marginTop: '1rem'}}>{error}</p>}
          </div>
          <div className={styles.previewColumn}>
            <div className={styles.previewFrame}>
              <h2 className={styles.previewTitle}>{formTitle}</h2>
              <div className={styles.previewFieldsContainer}>
                {fields.map((field) => (
                  <div key={field.id} >
                    <label className={styles.previewLabel}>{field.label}</label>
                    {field.type === 'Texto' && <div className={styles.previewInput}></div>}
                    {field.type === 'Anexo' && <div className={styles.previewAttachment}><Paperclip size={24}/></div>}
                    {field.type === 'Assinatura' && <div className={styles.previewSignature}></div>}
                  </div>
                ))}
              </div>
              <button className={styles.previewButton}>Submeter</button>
            </div>
          </div>
        </div>
        <div className={styles.panelFooter}>
            <button onClick={onClose} className={`${styles.formButton} ${styles.formButtonSecondary}`}>Cancelar</button>
            <button onClick={handleSave} className={`${styles.formButton} ${styles.formButtonPrimary}`}>Salvar Formulário</button>
        </div>
      </div>
    </div>
  );
}

