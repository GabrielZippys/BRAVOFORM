/**********************************************************************************
 * FORMEDITOR COMPLETO - VERSÃO COM LAYOUT DEFINITIVO
 *
 * Inclui o JSX corrigido para o novo layout de scroll.
 **********************************************************************************/

'use client';

import React, { useState, useEffect } from 'react';
import { X, Type, Paperclip, PenSquare, Trash2, CheckSquare, CircleDot, Calendar, Heading2, PlusCircle } from 'lucide-react';
import { type Form, type FormField, type Collaborator } from '@/types';
import styles from '../../app/styles/FormEditor.module.css';
import { db, auth } from '../../firebase/config';
import { collection, addDoc, doc, updateDoc, onSnapshot, query, serverTimestamp, arrayUnion, where } from 'firebase/firestore';


interface FormEditorProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string | null;
  departmentId: string | null;
  existingForm: Form | null;
}

export default function FormEditor({ isOpen, onClose, companyId, departmentId, existingForm }: FormEditorProps) {
  const [formTitle, setFormTitle] = useState("");
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
        setAssignedCollaborators(existingForm.collaborators || []); 
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
      const collaboratorsPath = `departments/${departmentId}/collaborators`;
      const q = query(collection(db, collaboratorsPath));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const collaboratorsData = snapshot.docs.map(doc => ({ 
            id: doc.id,
            username: doc.data().username 
        } as Collaborator));
        setCollaborators(collaboratorsData);
      }, (err) => {
        console.error("Erro ao buscar colaboradores:", err);
        setError("Não foi possível carregar a lista de colaboradores.");
      });

      return () => unsubscribe();
    }
  }, [departmentId, isOpen]);
  
  const addField = (type: FormField['type']) => {
    const newField: FormField = { id: Date.now(), type, label: 'Nova Pergunta' };
    if (type === 'Assinatura') newField.label = 'Assinatura';
    else if (type === 'Caixa de Seleção' || type === 'Múltipla Escolha') newField.options = ['Opção 1'];
    setFields(prev => [...prev, newField]);
  };
  
  const updateFieldLabel = (id: number, newLabel: string) => { setFields(prev => prev.map(f => f.id === id ? { ...f, label: newLabel } : f)); };
  const removeField = (id: number) => { setFields(prev => prev.filter(f => f.id !== id)); };

  const addOption = (fieldId: number) => { setFields(prev => prev.map(f => (f.id === fieldId && (f.type === 'Caixa de Seleção' || f.type === 'Múltipla Escolha')) ? { ...f, options: [...(f.options || []), `Nova Opção`] } : f)); };
  const updateOption = (fieldId: number, optionIndex: number, newText: string) => { setFields(prev => prev.map(f => { if (f.id === fieldId && f.options) { const newOptions = [...f.options]; newOptions[optionIndex] = newText; return { ...f, options: newOptions }; } return f; })); };
  const removeOption = (fieldId: number, optionIndex: number) => { setFields(prev => prev.map(f => { if (f.id === fieldId && f.options) { const newOptions = [...f.options]; newOptions.splice(optionIndex, 1); return { ...f, options: newOptions }; } return f; })); };

  const handleCollaboratorToggle = (collaboratorId: string) => { setAssignedCollaborators(prev => prev.includes(collaboratorId) ? prev.filter(id => id !== collaboratorId) : [...prev, collaboratorId]); };

  const handleSave = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return setError("Utilizador não autenticado.");
    if (!formTitle.trim() || !companyId || !departmentId) return setError("Título, empresa e departamento são obrigatórios.");
    setError('');

    try {
        const uniqueCollaborators = [...new Set(assignedCollaborators)];
        if (existingForm?.id) {
            const formRef = doc(db, "forms", existingForm.id);
            const newAuthorizedUsers = [...new Set([existingForm.ownerId, ...uniqueCollaborators])];
            await updateDoc(formRef, { title: formTitle, fields, automation, collaborators: uniqueCollaborators, authorizedUsers: newAuthorizedUsers });
        } else {
            const uniqueAuthorized = [...new Set([currentUser.uid, ...uniqueCollaborators])];
            await addDoc(collection(db, "forms"), { title: formTitle, fields, automation, companyId, departmentId, ownerId: currentUser.uid, collaborators: uniqueCollaborators, authorizedUsers: uniqueAuthorized, createdAt: serverTimestamp() });
        }
        onClose();
    } catch (e) { console.error("Erro ao salvar formulário: ", e); setError("Não foi possível salvar o formulário."); }
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
          {/* Coluna da Esquerda (Controlos) */}
          <div className={styles.controlsColumn}>
            {/* Secção de Título e Adicionar Campos (não rolam) */}
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
                <button onClick={() => addField('Caixa de Seleção')} className={styles.button}><CheckSquare size={16} /><span>Seleção</span></button>
                <button onClick={() => addField('Múltipla Escolha')} className={styles.button}><CircleDot size={16} /><span>Escolha</span></button>
                <button onClick={() => addField('Data')} className={styles.button}><Calendar size={16} /><span>Data</span></button>
                <button onClick={() => addField('Cabeçalho')} className={styles.button}><Heading2 size={16} /><span>Cabeçalho</span></button>
              </div>
            </div>

            {/* CORREÇÃO: Container que cresce e rola, envolvendo os campos e os colaboradores */}
            <div className={styles.scrollableContent}>
                <div className={styles.fieldsList}>
                  {fields.map(field => (
                      <div key={field.id} className={styles.fieldEditor}>
                        <div className={styles.fieldHeader}>
                          <span className={styles.fieldTypeLabel}>{field.type}</span>
                          <button onClick={() => removeField(field.id)} className={styles.deleteFieldButton}><Trash2 size={16}/></button>
                        </div>
                        {field.type !== 'Assinatura' && (<input type="text" value={field.label} placeholder={field.type === 'Cabeçalho' ? 'Texto do Cabeçalho' : 'Digite a sua pergunta'} onChange={(e) => updateFieldLabel(field.id, e.target.value)} className={styles.input}/>)}
                        {(field.type === 'Caixa de Seleção' || field.type === 'Múltipla Escolha') && (
                          <div className={styles.optionsEditor}>
                            {field.options?.map((option, index) => (<div key={index} className={styles.optionInputGroup}><input type="text" value={option} onChange={(e) => updateOption(field.id, index, e.target.value)} className={styles.optionInput}/><button onClick={() => removeOption(field.id, index)} className={styles.removeOptionButton}><X size={14} /></button></div>))}
                            <button onClick={() => addOption(field.id)} className={styles.addOptionButton}><PlusCircle size={16} /> Adicionar Opção</button>
                          </div>
                        )}
                      </div>
                  ))}
                </div>
    
                <div className={styles.collaboratorSection}>
                  <h4 className={styles.subTitle}>Atribuir a Colaboradores</h4>
                  <div className={styles.collaboratorList}>
                    {collaborators.length > 0 ? collaborators.map(collab => (
                      <label key={collab.id} className={styles.collaboratorItem}>
                        <input type="checkbox" checked={assignedCollaborators.includes(collab.id)} onChange={() => handleCollaboratorToggle(collab.id)}/>
                        <span>{collab.username}</span>
                      </label>
                    )) : <p className={styles.emptyListText}>Nenhum colaborador encontrado.</p>}
                  </div>
                </div>
            </div>
            
            {error && <p className={styles.errorMessage}>{error}</p>}
          </div>

          {/* Coluna da Direita (Preview) */}
          <div className={styles.previewColumn}>
            <div className={styles.previewFrame}>
              <h2 className={styles.previewTitle}>{formTitle}</h2>
              <div className={styles.previewFieldsContainer}>
                {fields.map((field) => (
                  <div key={field.id} className={styles.previewFieldWrapper}>
                    {field.type === 'Cabeçalho' ? <h3 className={styles.previewSectionHeader}>{field.label}</h3> :
                     field.type !== 'Assinatura' ? <label className={styles.previewLabel}>{field.label}</label> : null}
                    {field.type === 'Texto' && <div className={styles.previewInput}></div>}
                    {field.type === 'Anexo' && <div className={styles.previewAttachment}><Paperclip size={24}/></div>}
                    {field.type === 'Assinatura' && <div className={styles.previewSignature}><span>Assine Aqui</span></div>}
                    {field.type === 'Data' && <input type="date" className={styles.previewDateInput} />}
                    {field.type === 'Caixa de Seleção' && field.options?.map((opt, i) => (<div key={i} className={styles.previewOptionItem}><div className={styles.previewCheckbox}></div><span>{opt}</span></div>))}
                    {field.type === 'Múltipla Escolha' && field.options?.map((opt, i) => (<div key={i} className={styles.previewOptionItem}><div className={styles.previewRadio}></div><span>{opt}</span></div>))}
                  </div>
                ))}
              </div>
              <button className={styles.previewButton} type="button">Submeter</button>
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
