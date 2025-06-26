import React, { useState } from 'react';
import { db } from '../../firebase/config';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { type Form, type Collaborator } from '@/types';
import styles from '../../app/styles/FormResponse.module.css';
import { X, Send } from 'lucide-react';

interface FormResponseProps {
  form: Form;
  collaborator: Collaborator;
  onClose: () => void;
}

export default function FormResponse({ form, collaborator, onClose }: FormResponseProps) {
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleInputChange = (fieldId: number, value: any) => {
    setResponses(prev => ({
      ...prev,
      [fieldId]: value
    }));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError('');

    try {
      await addDoc(collection(db, 'form_responses'), {
        formId: form.id,
        formTitle: form.title,
        collaboratorId: collaborator.id,
        collaboratorUsername: collaborator.username,
        departmentId: collaborator.departmentId,
        responses: responses,
        submittedAt: serverTimestamp()
      });
      onClose(); // Fecha o modal após o sucesso
    } catch (err) {
      console.error("Erro ao submeter resposta: ", err);
      setError("Não foi possível enviar a sua resposta. Tente novamente.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>{form.title}</h3>
          <button onClick={onClose} className={styles.closeButton}><X /></button>
        </div>

        <div className={styles.panelBody}>
          {form.fields.map(field => (
            <div key={field.id} className={styles.fieldWrapper}>
              <label className={styles.label}>{field.label}</label>
              {field.type === 'Texto' && (
                <textarea
                  className={styles.textarea}
                  onChange={(e) => handleInputChange(field.id, e.target.value)}
                />
              )}
              {field.type === 'Data' && (
                <input
                  type="date"
                  className={styles.input}
                  onChange={(e) => handleInputChange(field.id, e.target.value)}
                />
              )}
              {field.type === 'Caixa de Seleção' && field.options?.map(option => (
                <label key={option} className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    onChange={(e) => {
                      const current = responses[field.id] || [];
                      const newValue = e.target.checked
                        ? [...current, option]
                        : current.filter((item: string) => item !== option);
                      handleInputChange(field.id, newValue);
                    }}
                  />
                  <span>{option}</span>
                </label>
              ))}
              {field.type === 'Múltipla Escolha' && field.options?.map(option => (
                <label key={option} className={styles.radioLabel}>
                  <input
                    type="radio"
                    name={`field_${field.id}`}
                    onChange={() => handleInputChange(field.id, option)}
                  />
                  <span>{option}</span>
                </label>
              ))}
              {/* Tipos Anexo e Assinatura podem ser implementados posteriormente */}
            </div>
          ))}
        </div>

        <div className={styles.panelFooter}>
          {error && <p className={styles.errorText}>{error}</p>}
          <button 
            onClick={handleSubmit} 
            className={styles.submitButton}
            disabled={isSubmitting}
          >
            <Send size={18} />
            <span>{isSubmitting ? 'A Enviar...' : 'Submeter Resposta'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
