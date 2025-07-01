'use client';

import React, { useState, useRef, useEffect } from 'react';
import { db } from '../../firebase/config';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { type Form, type FormField, type Collaborator } from '@/types';
import styles from '../../app/styles/FormResponse.module.css';
import { X, Send, Eraser, UploadCloud } from 'lucide-react';

interface FormResponseProps {
  form: Form;
  collaborator: Collaborator;
  onClose: () => void;
}

export default function FormResponse({ form, collaborator, onClose }: FormResponseProps) {
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const signaturePads = useRef<Record<string, HTMLCanvasElement | null>>({});

  // A lógica do canvas de assinatura permanece a mesma
  useEffect(() => {
    Object.values(signaturePads.current).forEach(canvas => {
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

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
          } else if (e.touches.length > 0) {
            return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
          }
          return { x: 0, y: 0 };
        };

        const startDrawing = (e: MouseEvent | TouchEvent) => {
          e.preventDefault();
          isDrawing = true;
          const coords = getCoords(e);
          [lastX, lastY] = [coords.x, coords.y];
        };

        const draw = (e: MouseEvent | TouchEvent) => {
          e.preventDefault();
          if (!isDrawing) return;
          const coords = getCoords(e);
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
  }, [form.fields]);

  // CORREÇÃO: A função de guardar a resposta agora usa o ID do campo como chave, que é mais estável.
  const handleInputChange = (fieldId: string, value: any) => {
    setResponses(prev => ({ ...prev, [fieldId]: value }));
  };

  const handleFileChange = (fieldId: string, file: File | null) => {
    if (file) {
      handleInputChange(fieldId, { name: file.name, type: file.type, size: file.size });
    }
  };

  const clearSignature = (fieldId: string) => {
    const canvas = signaturePads.current[fieldId];
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      handleInputChange(fieldId, null);
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

    // CORREÇÃO: Transforma o objeto de respostas para o formato correto antes de enviar.
    const formattedAnswers: Record<string, any> = {};
    for (const field of form.fields) {
        const fieldIdStr = String(field.id);
        // Verifica se existe uma resposta para este campo
        if (Object.prototype.hasOwnProperty.call(responses, fieldIdStr)) {
            // Cria a nova chave usando o label da pergunta
            formattedAnswers[field.label] = responses[fieldIdStr];
        }
    }

    try {
      const responseCollectionRef = collection(db, 'forms', form.id, 'responses');
      
      await addDoc(responseCollectionRef, {
        collaboratorId: collaborator.id,
        collaboratorUsername: collaborator.username,
        formId: form.id,
        formTitle: form.title,
        companyId: form.companyId,
        departmentId: form.departmentId,
        answers: formattedAnswers, // Envia o objeto de respostas formatado
        createdAt: serverTimestamp(),
      });

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

              {/* CORREÇÃO: Usando o ID do campo (field.id) para guardar o estado internamente */}
              {field.type === 'Texto' && (
                <textarea className={styles.textarea} onChange={(e) => handleInputChange(String(field.id), e.target.value)} />
              )}

              {field.type === 'Data' && (
                <input type="date" className={styles.input} onChange={(e) => handleInputChange(String(field.id), e.target.value)} />
              )}

              {field.type === 'Caixa de Seleção' && field.options?.map(option => (
                <label key={option} className={styles.checkboxLabel}>
                  <input type="checkbox" onChange={(e) => {
                    const current = responses[String(field.id)] || [];
                    const newValue = e.target.checked
                      ? [...current, option]
                      : current.filter((item: string) => item !== option);
                    handleInputChange(String(field.id), newValue);
                  }} />
                  <span>{option}</span>
                </label>
              ))}

              {field.type === 'Múltipla Escolha' && field.options?.map(option => (
                <label key={option} className={styles.radioLabel}>
                  <input type="radio" name={`field_${field.id}`} onChange={() => handleInputChange(String(field.id), option)} />
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
                  />
                  <label htmlFor={`file_${field.id}`} className={styles.fileInputButton}>
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
                    ref={(el) => { signaturePads.current[String(field.id)] = el; }} // Usa o ID como chave
                    data-field-id={String(field.id)} // Usa o ID como data attribute
                    className={styles.signaturePad}
                    width="600"
                    height="200"
                  ></canvas>
                  <button onClick={() => clearSignature(String(field.id))} className={styles.clearButton}>
                    <Eraser size={16} /> Limpar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className={styles.panelFooter}>
          {error && <p className={styles.errorText}>{error}</p>}
          <button onClick={handleSubmit} className={styles.submitButton} disabled={isSubmitting}>
            <Send size={18} />
            <span>{isSubmitting ? 'A Enviar...' : 'Submeter Resposta'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
