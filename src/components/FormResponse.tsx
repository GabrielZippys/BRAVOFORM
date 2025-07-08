'use client';

import React, { useState, useRef, useEffect } from 'react';
import { db } from '../../firebase/config';
import { doc, addDoc, updateDoc, collection, serverTimestamp } from 'firebase/firestore';
import { type Form, type Collaborator, type FormResponse as FormResponseType, type FormField } from '@/types';
import styles from '../../app/styles/FormResponse.module.css';
import { X, Send, Eraser, UploadCloud, FileText } from 'lucide-react';

// Estendemos o tipo FormField para incluir as propriedades da tabela
type EditorFormField = FormField & {
  columns?: { id: number; label: string; type: string; options?: string[] }[];
  rows?: { id: number; label: string }[];
  options?: string[];
};

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

  useEffect(() => {
    if (existingResponse?.answers && form.fields) {
      const initialState: Record<string, any> = {};
      form.fields.forEach((field: EditorFormField) => {
        if (
          typeof existingResponse.answers === 'object' &&
          existingResponse.answers !== null &&
          Object.prototype.hasOwnProperty.call(existingResponse.answers, field.label)
        ) {
          initialState[String(field.id)] = (existingResponse.answers as Record<string, any>)[field.label];
        }
      });
      setResponses(initialState);
    } else {
      setResponses({});
    }
  }, [existingResponse, form.fields]);


  useEffect(() => {
    const allPads = Object.entries(signaturePads.current);

    allPads.forEach(([fieldId, canvas]) => {
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
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
          if (coords) {
            isDrawing = true;
            [lastX, lastY] = [coords.x, coords.y];
          }
        };

        const draw = (e: MouseEvent | TouchEvent) => {
          e.preventDefault();
          if (!isDrawing) return;
          const coords = getCoords(e);
          if (coords) {
            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(coords.x, coords.y);
            ctx.stroke();
            [lastX, lastY] = [coords.x, coords.y];
          }
        };

        const stopDrawing = () => {
          if (isDrawing) {
            isDrawing = false;
            if (canvas.dataset.fieldId) {
              handleInputChange(canvas.dataset.fieldId, canvas.toDataURL('image/png'));
            }
          }
        };

        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';

        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseout', stopDrawing);
        canvas.addEventListener('touchstart', startDrawing, { passive: false });
        canvas.addEventListener('touchmove', draw, { passive: false });
        canvas.addEventListener('touchend', stopDrawing);

        // Função de limpeza
        return () => {
          canvas.removeEventListener('mousedown', startDrawing);
          canvas.removeEventListener('mousemove', draw);
          canvas.removeEventListener('mouseup', stopDrawing);
          canvas.removeEventListener('mouseout', stopDrawing);
          canvas.removeEventListener('touchstart', startDrawing);
          canvas.removeEventListener('touchmove', draw);
          canvas.removeEventListener('touchend', stopDrawing);
        };
      }
    });
  }, [form.fields]);

  useEffect(() => {
    Object.entries(signaturePads.current).forEach(([fieldId, canvas]) => {
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (responses[fieldId] && typeof responses[fieldId] === 'string' && responses[fieldId].startsWith('data:image')) {
                const img = new Image();
                img.src = responses[fieldId];
                img.onload = () => ctx.drawImage(img, 0, 0);
            }
        }
    });
  }, [responses]);

  const handleInputChange = (fieldId: string, value: any) => {
    setResponses(prev => ({ ...prev, [fieldId]: value }));
  };
  
  const handleTableInputChange = (fieldId: string, rowId: string, columnId: string, value: any) => {
    setResponses(prev => ({
        ...prev,
        [fieldId]: { ...prev[fieldId], [rowId]: { ...prev[fieldId]?.[rowId], [columnId]: value } }
    }));
  };

  const handleFileChange = (fieldId: string, files: FileList | null) => {
    if (files && files.length > 0) {
      const newFiles = Array.from(files).map(file => ({
        name: file.name, type: file.type, size: file.size,
      }));
      const existingFiles = responses[fieldId] || [];
      handleInputChange(fieldId, [...existingFiles, ...newFiles]);
    }
  };

  const removeFile = (fieldId: string, fileIndex: number) => {
    const currentFiles = responses[fieldId] || [];
    const updatedFiles = currentFiles.filter((_: any, index: number) => index !== fileIndex);
    handleInputChange(fieldId, updatedFiles);
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
        await updateDoc(responseRef, { answers: formattedAnswers, updatedAt: serverTimestamp() });
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

  const renderTableCell = (field: EditorFormField, row: { id: number; label: string }, col: { id: number; label: string; type: string; options?: string[] }) => {
    const value = responses[String(field.id)]?.[String(row.id)]?.[String(col.id)] || '';
    const isDisabled = !canEdit && !!existingResponse;

    switch (col.type) {
      case 'Data':
        return <input type="date" className={styles.tableResponseInput} value={value} onChange={(e) => handleTableInputChange(String(field.id), String(row.id), String(col.id), e.target.value)} disabled={isDisabled} />;
      
      case 'Caixa de Seleção':
        return <input type="checkbox" className={styles.tableResponseCheckbox} checked={!!value} onChange={(e) => handleTableInputChange(String(field.id), String(row.id), String(col.id), e.target.checked)} disabled={isDisabled} />;

      case 'Múltipla Escolha':
        return (
          <select className={styles.tableResponseSelect} value={value} onChange={(e) => handleTableInputChange(String(field.id), String(row.id), String(col.id), e.target.value)} disabled={isDisabled}>
            <option value="">Selecione</option>
            {col.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        );

      case 'Texto':
      default:
        return <input type="text" className={styles.tableResponseInput} value={value} onChange={(e) => handleTableInputChange(String(field.id), String(row.id), String(col.id), e.target.value)} disabled={isDisabled} />;
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
          {(form.fields as EditorFormField[]).map(field => (
            <div key={field.id} className={styles.fieldWrapper}>
              <label className={styles.label}>{field.label}</label>

              {field.type === 'Texto' && ( <textarea className={styles.textarea} value={responses[String(field.id)] || ''} onChange={(e) => handleInputChange(String(field.id), e.target.value)} disabled={!canEdit && !!existingResponse} /> )}
              {field.type === 'Data' && ( <input type="datetime-local" className={styles.input} value={responses[String(field.id)] || ''} onChange={(e) => handleInputChange(String(field.id), e.target.value)} disabled={!canEdit && !!existingResponse} /> )}
              
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
                <div>
                  <div className={styles.fileInputWrapper}>
                    <input
                      type="file"
                      id={`file_${field.id}`}
                      className={styles.fileInput}
                      onChange={(e) => handleFileChange(String(field.id), e.target.files)}
                      disabled={!canEdit && !!existingResponse}
                      multiple 
                    />
                    <label htmlFor={`file_${field.id}`} className={`${styles.fileInputButton} ${(!canEdit && !!existingResponse) ? styles.disabledButton : ''}`}>
                      <UploadCloud size={18} /><span>Escolher Ficheiros</span>
                    </label>
                  </div>
                  {Array.isArray(responses[String(field.id)]) && (
                    <div className={styles.fileList}>
                      {responses[String(field.id)].map((file: any, index: number) => (
                        <div key={index} className={styles.fileListItem}>
                          <FileText size={16} />
                          <span className={styles.fileName}>{file.name}</span>
                          <button onClick={() => removeFile(String(field.id), index)} className={styles.removeFileButton} title="Remover ficheiro">
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
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

              {field.type === 'Tabela' && (
                <div className={styles.tableResponseWrapper}>
                    <table className={styles.tableResponse}>
                        <thead>
                            <tr>
                                <th className={styles.tableResponseTh}></th>
                                {field.columns?.map(col => <th key={col.id} className={styles.tableResponseTh}>{col.label}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {field.rows?.map(row => (
                                <tr key={row.id}>
                                    <td className={styles.tableResponseFirstCol}>{row.label}</td>
                                    {field.columns?.map(col => (
                                        <td key={col.id} className={styles.tableResponseTd}>
                                            {renderTableCell(field, row, col)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
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
