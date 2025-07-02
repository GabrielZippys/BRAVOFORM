'use client';

import React, { useState, useRef, useEffect } from 'react';
import { db } from '../../firebase/config';
import { doc, addDoc, updateDoc, collection, serverTimestamp } from 'firebase/firestore';
import { type Form, type Collaborator, type FormResponse as FormResponseType, type FormField } from '@/types';
import styles from '../../app/styles/FormResponse.module.css';
import { X, Send, Eraser, UploadCloud } from 'lucide-react';

interface FormResponseProps {
  form: Form | null;
  collaborator: {
    id: string;
    username: React.ReactNode;
    companyId: string;
    departmentId: string;
    canViewHistory?: boolean;
    canEditHistory?: boolean;
  };
  onClose: () => void;
  existingResponse?: FormResponseType | null;
  canEdit?: boolean;
}

export default function FormResponse({ form, collaborator, onClose, existingResponse, canEdit }: FormResponseProps) {
  if (!form) {
    return null;
  }

  const [responses, setResponses] = useState<Record<string, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const signaturePads = useRef<Record<string, HTMLCanvasElement | null>>({});

  // CORREÇÃO: Usando useEffect para popular o estado inicial de forma mais robusta.
  // Este efeito é executado sempre que um novo 'existingResponse' é passado para o componente.
  useEffect(() => {
    if (existingResponse?.responses && form.fields) {
      const initialState: Record<string, any> = {};
      form.fields.forEach((field: FormField) => {
        if (Object.prototype.hasOwnProperty.call(existingResponse.responses, field.label)) {
          initialState[String(field.id)] = existingResponse.responses[field.label];
        }
      });
      setResponses(initialState);
    } else {
      setResponses({}); // Limpa as respostas se for um formulário novo
    }
  }, [existingResponse, form.fields]);


  // Efeito para desenhar a assinatura existente no canvas
  useEffect(() => {
    Object.entries(signaturePads.current).forEach(([fieldId, canvas]) => {
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Limpa o canvas antes de desenhar
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Se houver uma assinatura no estado, desenha-a
        if (responses[fieldId] && typeof responses[fieldId] === 'string' && responses[fieldId].startsWith('data:image')) {
            const img = new Image();
            img.src = responses[fieldId];
            img.onload = () => {
                ctx.drawImage(img, 0, 0);
            };
        }
        
        // A lógica de desenho manual permanece a mesma...
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        let isDrawing = false;
        let lastX = 0;
        let lastY = 0;

        const getCoords = (e: MouseEvent | TouchEvent) => {
          const rect = canvas.getBoundingClientRect();
          if (e instanceof MouseEvent) {
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
          } else if (e.touches && e.touches.length > 0) {
            return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
          }
          return null;
        };

        const startDrawing = (e: MouseEvent | TouchEvent) => {
          e.preventDefault();
          const coords = getCoords(e);
          if (!coords) return;
          isDrawing = true;
          [lastX, lastY] = [coords.x, coords.y];
        };

        const draw = (e: MouseEvent | TouchEvent) => {
          e.preventDefault();
          if (!isDrawing) return;
          const coords = getCoords(e);
          if (!coords) return;
          ctx.beginPath();
          ctx.moveTo(lastX, lastY);
          ctx.lineTo(coords.x, coords.y);
          ctx.stroke();
          [lastX, lastY] = [coords.x, coords.y];
        };

        const stopDrawing = () => {
          if (!isDrawing) return;
          isDrawing = false;
          if (canvas.dataset.fieldId) {
            handleInputChange(canvas.dataset.fieldId, canvas.toDataURL('image/png'));
          }
        };

        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseout', stopDrawing);
        canvas.addEventListener('touchstart', startDrawing);
        canvas.addEventListener('touchmove', draw);
        canvas.addEventListener('touchend', stopDrawing);
      }
    });
  // A dependência agora inclui 'responses' para garantir que a assinatura seja desenhada quando o estado for atualizado.
  }, [form.fields, responses]);

  const handleInputChange = (fieldId: string, value: any) => {
    setResponses(prev => ({ ...prev, [fieldId]: value }));
  };

  const handleFileChange = (fieldId: string, file: File | null) => {
    if (file) {
      handleInputChange(fieldId, { name: file.name, type: file.type, size: file.size });
    }
  };

  const clearSignature = (fieldId: string) => {
    const canvas = signaturePads.current[String(fieldId)];
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      handleInputChange(String(fieldId), null);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError('');

    if (!form.companyId || !form.departmentId) {
        setError("Dados do formulário incompletos. Contate o administrador.");
        setIsSubmitting(false);
        return;
    }

    const formattedAnswers: Record<string, any> = {};
    form.fields.forEach(field => {
        const fieldIdStr = String(field.id);
        if (Object.prototype.hasOwnProperty.call(responses, fieldIdStr)) {
            formattedAnswers[field.label] = responses[fieldIdStr];
        }
    });

    try {
      if (existingResponse?.id) {
        const responseRef = doc(db, 'forms', form.id, 'responses', existingResponse.id);
        await updateDoc(responseRef, {
            answers: formattedAnswers,
            updatedAt: serverTimestamp(),
        });
      } else {
        const responseCollectionRef = collection(db, 'forms', form.id, 'responses');
        await addDoc(responseCollectionRef, {
          collaboratorId: collaborator.id,
          collaboratorUsername: collaborator.username,
          formId: form.id,
          formTitle: form.title,
          companyId: form.companyId,
          departmentId: form.departmentId,
          answers: formattedAnswers,
          createdAt: serverTimestamp(),
        });
      }

      onClose();
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
                    value={responses[String(field.id)] || ''}
                    onChange={(e) => handleInputChange(String(field.id), e.target.value)} 
                    disabled={!canEdit && !!existingResponse}
                />
              )}

              {field.type === 'Data' && (
                <input 
                    type="date" 
                    className={styles.input} 
                    value={responses[String(field.id)] || ''}
                    onChange={(e) => handleInputChange(String(field.id), e.target.value)} 
                    disabled={!canEdit && !!existingResponse}
                />
              )}

              {field.type === 'Caixa de Seleção' && field.options?.map(option => (
                <label key={option} className={styles.checkboxLabel}>
                  <input 
                    type="checkbox" 
                    checked={(responses[String(field.id)] || []).includes(option)}
                    onChange={(e) => {
                      const current = responses[String(field.id)] || [];
                      const newValue = e.target.checked
                        ? [...current, option]
                        : current.filter((item: string) => item !== option);
                      handleInputChange(String(field.id), newValue);
                    }} 
                    disabled={!canEdit && !!existingResponse}
                  />
                  <span>{option}</span>
                </label>
              ))}

              {field.type === 'Múltipla Escolha' && field.options?.map(option => (
                <label key={option} className={styles.radioLabel}>
                  <input 
                    type="radio" 
                    name={`field_${field.id}`} 
                    checked={responses[String(field.id)] === option}
                    onChange={() => handleInputChange(String(field.id), option)} 
                    disabled={!canEdit && !!existingResponse}
                  />
                  <span>{option}</span>
                </label>
              ))}

               {field.type === 'Anexo' && (
                <div className={styles.fileInputWrapper}>
                  <input
                    type="file"
                    id={`file_${field.id}`}
                    className={styles.fileInput}
                    onChange={(e) => handleFileChange(String(field.id), e.target.files ? e.target.files[0] : null)}
                    disabled={!canEdit && !!existingResponse}
                  />
                  <label htmlFor={`file_${field.id}`} className={`${styles.fileInputButton} ${(!canEdit && !!existingResponse) ? styles.disabledButton : ''}`}>
                    <UploadCloud size={18} /><span>Escolher Ficheiro</span>
                  </label>
                  {responses[String(field.id)] && (
                    <span className={styles.fileName}>{responses[String(field.id)].name}</span>
                  )}
                </div>
              )}

              {field.type === 'Assinatura' && (
                <div className={styles.signatureWrapper}>
                  <canvas
                    ref={(el) => { signaturePads.current[String(field.id)] = el; }}
                    data-field-id={String(field.id)}
                    className={styles.signaturePad}
                    width="600"
                    height="200"
                  ></canvas>
                  <button 
                    onClick={() => clearSignature(String(field.id))} 
                    className={styles.clearButton}
                    disabled={!canEdit && !!existingResponse}
                  >
                    <Eraser size={16} /> Limpar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className={styles.panelFooter}>
          {error && <p className={styles.errorText}>{error}</p>}
          {canEdit || !existingResponse ? (
            <button onClick={handleSubmit} className={styles.submitButton} disabled={isSubmitting}>
                <Send size={18} />
                <span>{isSubmitting ? 'A Enviar...' : (existingResponse ? 'Atualizar Resposta' : 'Submeter Resposta')}</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
