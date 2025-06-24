
'use client';

import React, { useState, useEffect } from 'react';
import { X, Type, Paperclip, PenSquare, Trash2 } from 'lucide-react';
import styles from '../../app/styles/FormEditor.module.css';
import { db } from '../../firebase/config';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';

interface FormField {
  id: number;
  type: 'Texto' | 'Anexo' | 'Assinatura';
  label: string;
}

interface Form {
    id?: string;
    title: string;
    fields: FormField[];
    automation: { type: string; target: string; };
    assignedCollaborators?: string[];
}

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

  useEffect(() => {
    if (isOpen && existingForm) {
        setFormTitle(existingForm.title);
        setFields(existingForm.fields || []);
        setAutomation(existingForm.automation || { type: 'email', target: '' });
    } else {
        setFormTitle("Novo Formulário");
        setFields([]);
        setAutomation({ type: 'email', target: '' });
    }
  }, [existingForm, isOpen]);


  const addField = (type: FormField['type']) => {
    const newField: FormField = { id: Date.now(), type, label: `Nova Pergunta` };
    setFields(prevFields => [...prevFields, newField]);
  };
  
  const updateFieldLabel = (id: number, newLabel: string) => {
    setFields(prevFields => prevFields.map(field => field.id === id ? { ...field, label: newLabel } : field));
  };
  
  const removeField = (id: number) => {
    setFields(prevFields => prevFields.filter(field => field.id !== id));
  };

  const handleSave = async () => {
    if (!formTitle.trim() || !companyId || !departmentId) {
        return setError("Título, empresa e departamento são obrigatórios.");
    }
    setError('');
    
    const formToSave = { title: formTitle, fields, automation, companyId, departmentId };
    
    try {
        if (existingForm?.id) {
            const formRef = doc(db, "forms", existingForm.id);
            await updateDoc(formRef, formToSave);
        } else {
            await addDoc(collection(db, "forms"), { ...formToSave, createdAt: new Date() });
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
            <div>
              <label htmlFor="form-title" className={styles.label}>Título do Formulário</label>
              <input type="text" id="form-title" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} className={styles.input}/>
            </div>
            <div>
              <h4 className={styles.subTitle}>Adicionar Campos</h4>
              <div className={styles.fieldButtons}>
                <button onClick={() => addField('Texto')} className={styles.button}><Type size={16} /><span>Texto</span></button>
                <button onClick={() => addField('Anexo')} className={styles.button}><Paperclip size={16} /><span>Anexo</span></button>
                <button onClick={() => addField('Assinatura')} className={styles.button}><PenSquare size={16} /><span>Assinatura</span></button>
              </div>
            </div>
            <div className={styles.fieldsList}>
                {fields.map(field => (
                    <div key={field.id} className={styles.fieldEditor}>
                        <div className={styles.fieldHeader}><span className={styles.fieldTypeLabel}>{field.type}</span><button onClick={() => removeField(field.id)} className={styles.deleteFieldButton}><Trash2 size={16}/></button></div>
                        <input type="text" value={field.label} onChange={(e) => updateFieldLabel(field.id, e.target.value)} className={styles.input}/>
                    </div>
                ))}
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
