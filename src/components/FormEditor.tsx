'use client';

import React, { useState, useEffect } from 'react';
import { X, Type, Paperclip, PenSquare, Trash2 } from 'lucide-react';
// CORREÇÃO: Importando os tipos do nosso arquivo central
import { type Form, type FormField, type Collaborator } from '@/types';
import styles from '../../app/styles/FormEditor.module.css';
import { db } from '../../firebase/config';
import { collection, addDoc, doc, updateDoc, onSnapshot, query, serverTimestamp } from 'firebase/firestore';

interface FormEditorProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string | null;
  departmentId: string | null;
  existingForm: Form | null;
}

export default function FormEditor({ isOpen, onClose, companyId, departmentId, existingForm }: FormEditorProps) {
  const [formTitle, setFormTitle] = useState("Novo Formulário");
  const [fields, setFields] = useState<FormField[]>([]);
  const [automation, setAutomation] = useState({ type: 'email', target: '' });
  const [error, setError] = useState('');
  
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [assignedCollaborators, setAssignedCollaborators] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      if (existingForm) {
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
    }
  }, [existingForm, isOpen]);

  useEffect(() => {
    if (isOpen && departmentId) {
      const q = query(collection(db, `departments/${departmentId}/collaborators`));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setCollaborators(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Collaborator)));
      });
      return () => unsubscribe();
    }
  }, [departmentId, isOpen]);

  const addField = (type: FormField['type']) => {
    setFields(prev => [...prev, { id: Date.now(), type, label: `Nova Pergunta` }]);
  };
  
  const updateFieldLabel = (id: number, newLabel: string) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, label: newLabel } : f));
  };
  
  const removeField = (id: number) => {
    setFields(prev => prev.filter(f => f.id !== id));
  };
  
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
    
    // Removendo o 'id' do objeto a ser salvo para evitar inconsistências no Firestore
    const formToSave: Omit<Form, 'id'> = { title: formTitle, fields, automation, companyId, departmentId, assignedCollaborators };
    
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
        {/* ... O JSX do editor permanece o mesmo ... */}
        <div className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>{existingForm ? 'Editar Formulário' : 'Novo Formulário'}</h3>
          <button onClick={onClose} className={styles.closeButton}><X /></button>
        </div>
        <div className={styles.editorGrid}>
            {/*... Coluna de controles ... */}
            <div className={styles.previewColumn}>
                {/* ... Pré-visualização ... */}
            </div>
        </div>
        <div className={styles.panelFooter}>
            <button onClick={onClose} className={`${styles.formButton} ${styles.formButtonSecondary}`}>Cancelar</button>
            <button onClick={handleSave} className={`${styles.formButton} ${styles.formButtonPrimary}`}>Salvar</button>
        </div>
      </div>
    </div>
  );
}
