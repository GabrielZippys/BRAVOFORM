'use client';

import React, { useState, useRef, useEffect } from 'react';
import { db } from '../../firebase/config';
import { doc, addDoc, updateDoc, collection, serverTimestamp } from 'firebase/firestore';
import { type Form, type FormField, type FormResponse as FormResponseType } from '@/types';
import styles from '../../app/styles/FormResponse.module.css';
import { X, Send, Eraser } from 'lucide-react';

type ResponseFormField = FormField & {
  allowOther?: boolean;
  columns?: { id: number; label: string; type: string; options?: string[] }[];
  rows?: { id: number; label: string }[];
  options?: string[];
};

interface FormResponseProps {
  form: Form | null;
  collaborator: {
    id: string;
    username: string;
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
  if (!form) return null;

  const [responses, setResponses] = useState<Record<string, any>>({});
  const [otherInputValues, setOtherInputValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const signaturePads = useRef<Record<string, HTMLCanvasElement | null>>({});

  // Restaura valores de edição
  useEffect(() => {
    if (existingResponse && typeof existingResponse === 'object') {
      const initial: Record<string, any> = {};
      const initialOthers: Record<string, string> = {};
      Object.entries(existingResponse)
        .filter(([k]) => k !== 'id')
        .forEach(([k, v]) => {
          // Se veio de flattened (BI), preenche por label
          const field = (form.fields as ResponseFormField[]).find(f => f.label === k || String(f.id) === k);
          if (!field) return;
          const fieldId = String(field.id);
          if ((field.type === 'Caixa de Seleção' || field.type === 'Múltipla Escolha') && field.allowOther) {
            // Outros para checkbox/radio
            if (typeof v === 'string' && v && field.options && !field.options.includes(v)) {
              initial[fieldId] = '___OTHER___';
              initialOthers[fieldId] = v;
            } else if (Array.isArray(v)) {
              const normal = v.filter(opt => field.options?.includes(opt));
              const other = v.find(opt => field.options?.indexOf(opt) === -1);
              if (other) initialOthers[fieldId] = other;
              if (normal.length > 0) initial[fieldId] = [...normal, ...(other ? ['___OTHER___'] : [])];
            } else {
              initial[fieldId] = v;
            }
          } else {
            initial[fieldId] = v;
          }
        });
      setResponses(initial);
      setOtherInputValues(initialOthers);
    }
  }, [existingResponse, form.fields]);

  // --- CANVAS DE ASSINATURA ---
  useEffect(() => {
    Object.entries(signaturePads.current).forEach(([fieldId, canvas]) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      let drawing = false;
      let lastX = 0, lastY = 0;

      const getPos = (e: MouseEvent | TouchEvent) => {
        const rect = canvas.getBoundingClientRect();
        if ('touches' in e && e.touches.length > 0) {
          return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
        } else if ('clientX' in e) {
          return { x: (e as MouseEvent).clientX - rect.left, y: (e as MouseEvent).clientY - rect.top };
        }
        return null;
      };

      const startDraw = (e: MouseEvent | TouchEvent) => {
        e.preventDefault();
        const pos = getPos(e);
        if (!pos) return;
        drawing = true;
        lastX = pos.x;
        lastY = pos.y;
      };
      const draw = (e: MouseEvent | TouchEvent) => {
        if (!drawing) return;
        e.preventDefault();
        const pos = getPos(e);
        if (!pos) return;
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(pos.x, pos.y);
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.stroke();
        lastX = pos.x;
        lastY = pos.y;
      };
      const stopDraw = () => {
        drawing = false;
        if (canvas.dataset.fieldId) {
          handleInputChange(canvas.dataset.fieldId, canvas.toDataURL('image/png'));
        }
      };

      canvas.addEventListener('mousedown', startDraw);
      canvas.addEventListener('mousemove', draw);
      canvas.addEventListener('mouseup', stopDraw);
      canvas.addEventListener('mouseleave', stopDraw);
      canvas.addEventListener('touchstart', startDraw, { passive: false });
      canvas.addEventListener('touchmove', draw, { passive: false });
      canvas.addEventListener('touchend', stopDraw);

      // Limpar eventos ao desmontar
      return () => {
        canvas.removeEventListener('mousedown', startDraw);
        canvas.removeEventListener('mousemove', draw);
        canvas.removeEventListener('mouseup', stopDraw);
        canvas.removeEventListener('mouseleave', stopDraw);
        canvas.removeEventListener('touchstart', startDraw);
        canvas.removeEventListener('touchmove', draw);
        canvas.removeEventListener('touchend', stopDraw);
      };
    });
  }, [responses, form.fields]); // Reage ao mount

  // Restaura imagem de assinatura caso exista
  useEffect(() => {
    Object.entries(signaturePads.current).forEach(([fieldId, canvas]) => {
      if (canvas && responses[fieldId]?.startsWith?.('data:image')) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const img = new window.Image();
        img.src = responses[fieldId];
        img.onload = () => ctx.drawImage(img, 0, 0);
      }
    });
  }, [responses]);

  const handleInputChange = (fieldId: string, value: any) =>
    setResponses(prev => ({ ...prev, [fieldId]: value }));

  const handleOtherInputChange = (fieldId: string, text: string) =>
    setOtherInputValues(prev => ({ ...prev, [fieldId]: text }));

  const handleTableInputChange = (
    fieldId: string,
    rowId: string,
    colId: string,
    value: any
  ) => {
    setResponses(prev => ({
      ...prev,
      [fieldId]: {
        ...(prev[fieldId] || {}),
        [rowId]: {
          ...(prev[fieldId]?.[rowId] || {}),
          [colId]: value,
        },
      },
    }));
  };

  const handleFileChange = (fieldId: string, files: FileList | null) => {
    if (files && files.length > 0) {
      const newFiles = Array.from(files).map(f => ({
        name: f.name,
        size: f.size,
        type: f.type,
      }));
      handleInputChange(fieldId, [...(responses[fieldId] || []), ...newFiles]);
    }
  };

  const removeFile = (fieldId: string, index: number) => {
    const files = responses[fieldId] || [];
    handleInputChange(fieldId, files.filter((_: any, idx: number) => idx !== index));
  };

  const clearSignature = (fieldId: string) => {
    const canvas = signaturePads.current[fieldId];
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      handleInputChange(fieldId, '');
    }
  };

 const handleSubmit = async () => {
  setIsSubmitting(true);
  setError('');
  try {
    const flattened: Record<string, any> = {
      collaboratorId: collaborator.id,
      collaboratorUsername: collaborator.username,
      formId: form.id,
      formTitle: form.title,
      companyId: form.companyId,
      departmentId: form.departmentId,
      status: 'pending',
      submittedAt: serverTimestamp()
    };

    // Salva SEM ___OTHER___ (substitui sempre pelo texto real!)
    (form.fields as ResponseFormField[]).forEach(field => {
      const fieldIdStr = String(field.id);
      let answerVal = responses[fieldIdStr];

      if ((field.type === 'Caixa de Seleção' || field.type === 'Múltipla Escolha') && field.allowOther) {
        const otherVal = otherInputValues[fieldIdStr] || '';
        if (Array.isArray(answerVal)) {
          answerVal = answerVal
            .map((v: string) => (v === '___OTHER___' ? (otherVal || '') : v))
            .filter(v => v !== '');
          // Se só tinha outro e estava vazio, salva como string vazia
          if (answerVal.length === 1 && answerVal[0] === '') answerVal = '';
        } else if (answerVal === '___OTHER___') {
          answerVal = otherVal;
        }
      }
      flattened[field.label] = answerVal ?? '';
    });

    // Também deixa o campo answers pronto para histórico
    const answers: Record<string, any> = {};
    (form.fields as ResponseFormField[]).forEach(field => {
      const fieldIdStr = String(field.id);
      let answerVal = responses[fieldIdStr];
      if ((field.type === 'Caixa de Seleção' || field.type === 'Múltipla Escolha') && field.allowOther) {
        const otherVal = otherInputValues[fieldIdStr] || '';
        if (Array.isArray(answerVal)) {
          answerVal = answerVal
            .map((v: string) => (v === '___OTHER___' ? (otherVal || '') : v))
            .filter(v => v !== '');
          if (answerVal.length === 1 && answerVal[0] === '') answerVal = '';
        } else if (answerVal === '___OTHER___') {
          answerVal = otherVal;
        }
      }
      answers[fieldIdStr] = answerVal ?? '';
    });

    flattened.answers = answers;

    if (existingResponse?.id) {
      await updateDoc(doc(db, 'forms', form.id, 'responses', existingResponse.id), { ...flattened, updatedAt: serverTimestamp() });
    } else {
      await addDoc(collection(db, 'forms', form.id, 'responses'), flattened, );
        submittedAt: serverTimestamp() // CORRETO!

    }
    onClose();
  } catch (err) {
    setError('Não foi possível enviar a resposta.');
  } finally {
    setIsSubmitting(false);
  }
};



  const renderTableCell = (
  field: ResponseFormField,
  row: { id: number; label: string },
  col: { id: number; label: string; type: string; options?: string[] }
) => {
  // Sempre acessa com segurança!
  const fieldId = String(field.id);
  const rowId = String(row.id);
  const colId = String(col.id);

  // Garante caminhos intermediários como objeto
  const value =
    responses[fieldId]?.[rowId]?.[colId] !== undefined
      ? responses[fieldId][rowId][colId]
      : '';

  const disabled = !canEdit && !!existingResponse;

  switch (col.type) {
    case 'Texto':
      return (
        <input
          className={styles.tableResponseInput}
          type="text"
          value={value}
          onChange={e =>
            handleTableInputChange(
              fieldId,
              rowId,
              colId,
              e.target.value
            )
          }
          disabled={disabled}
        />
      );
    case 'Data':
      return (
        <input
          className={styles.tableResponseInput}
          type="date"
          value={value}
          onChange={e =>
            handleTableInputChange(
              fieldId,
              rowId,
              colId,
              e.target.value
            )
          }
          disabled={disabled}
        />
      );
    case 'Caixa de Seleção':
    case 'Múltipla Escolha':
      return (
        <select
          className={styles.tableResponseSelect}
          value={value}
          onChange={e =>
            handleTableInputChange(
              fieldId,
              rowId,
              colId,
              e.target.value
            )
          }
          disabled={disabled}
        >
          <option value="">Selecione</option>
          {col.options?.map((opt: string) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    default:
      return (
        <input
          className={styles.tableResponseInput}
          type="text"
          value={value}
          onChange={e =>
            handleTableInputChange(
              fieldId,
              rowId,
              colId,
              e.target.value
            )
          }
          disabled={disabled}
        />
      );
  }
};


  const renderField = (field: ResponseFormField) => {
    const fieldId = String(field.id);
    const disabled = !canEdit && !!existingResponse;
    const otherVal = '___OTHER___';
    switch (field.type) {
      case 'Tabela':
        return (
          <div className={styles.tableResponseWrapper}>
            <table className={styles.tableResponse}>
              <thead>
                <tr>
                  <th></th>
                  {field.columns?.map(col => (
                    <th key={col.id}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {field.rows?.map(row => (
                  <tr key={row.id}>
                    <td>{row.label}</td>
                    {field.columns?.map(col => (
                      <td key={col.id}>{renderTableCell(field, row, col)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case 'Anexo':
        return (
          <div>
            <input
              type="file"
              onChange={e => handleFileChange(fieldId, e.target.files)}
              disabled={disabled}
              multiple
            />
            {Array.isArray(responses[fieldId]) &&
              responses[fieldId].map((file: any, i: number) => (
                <div key={i}>
                  <span>{file.name}</span>{' '}
                  <button onClick={() => removeFile(fieldId, i)} type="button">
                    Remover
                  </button>
                </div>
              ))}
          </div>
        );
      case 'Assinatura':
        return (
          <div className={styles.signatureWrapper}>
            <canvas
              ref={el => {
                signaturePads.current[fieldId] = el;
              }}
              data-field-id={fieldId}
              className={styles.signaturePad}
              width={600}
              height={200}
            ></canvas>
            <button
              onClick={() => clearSignature(fieldId)}
              type="button"
              className={styles.clearButton}
            >
              <Eraser size={16} /> Limpar
            </button>
          </div>
        );
      case 'Caixa de Seleção':
        return (
          <div>
            {field.options?.map((opt: string) => (
              <label key={opt} className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={(responses[fieldId] || []).includes(opt)}
                  onChange={e => {
                    const current = responses[fieldId] || [];
                    handleInputChange(
                      fieldId,
                      e.target.checked
                        ? [...current, opt]
                        : current.filter((v: string) => v !== opt)
                    );
                  }}
                  disabled={disabled}
                />
                <span>{opt}</span>
              </label>
            ))}
            {field.allowOther && (
              <>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={(responses[fieldId] || []).includes(otherVal)}
                    onChange={e => {
                      const current = responses[fieldId] || [];
                      handleInputChange(
                        fieldId,
                        e.target.checked
                          ? [...current, otherVal]
                          : current.filter((v: string) => v !== otherVal)
                      );
                    }}
                    disabled={disabled}
                  />
                  <span>Outros</span>
                </label>
                {(responses[fieldId] || []).includes(otherVal) && (
                  <input
                    className={styles.otherInput}
                    value={otherInputValues[fieldId] || ''}
                    onChange={e => handleOtherInputChange(fieldId, e.target.value)}
                    placeholder="Por favor, especifique"
                    disabled={disabled}
                  />
                )}
              </>
            )}
          </div>
        );
      case 'Múltipla Escolha':
        return (
          <div>
            {field.options?.map((opt: string) => (
              <label key={opt} className={styles.radioLabel}>
                <input
                  type="radio"
                  name={`field_${field.id}`}
                  checked={responses[fieldId] === opt}
                  onChange={() => handleInputChange(fieldId, opt)}
                  disabled={disabled}
                />
                <span>{opt}</span>
              </label>
            ))}
            {field.allowOther && (
              <>
                <label className={styles.radioLabel}>
                  <input
                    type="radio"
                    name={`field_${field.id}`}
                    checked={responses[fieldId] === otherVal}
                    onChange={() => handleInputChange(fieldId, otherVal)}
                    disabled={disabled}
                  />
                  <span>Outros</span>
                </label>
                {responses[fieldId] === otherVal && (
                  <input
                    className={styles.otherInput}
                    value={otherInputValues[fieldId] || ''}
                    onChange={e => handleOtherInputChange(fieldId, e.target.value)}
                    placeholder="Por favor, especifique"
                    disabled={disabled}
                  />
                )}
              </>
            )}
          </div>
        );
      case 'Texto':
        return (
          <textarea
            className={styles.textarea}
            value={responses[fieldId] || ''}
            onChange={e => handleInputChange(fieldId, e.target.value)}
            disabled={disabled}
          />
        );
      case 'Data':
        return (
          <input
            type="datetime-local"
            className={styles.input}
            value={responses[fieldId] || ''}
            onChange={e => handleInputChange(fieldId, e.target.value)}
            disabled={disabled}
          />
        );
      default:
        return <p>Tipo {field.type} não implementado</p>;
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>{form.title}</h3>
          <button onClick={onClose} className={styles.closeButton}>
            <X />
          </button>
        </div>
        <div className={styles.panelBody}>
          {(form.fields as ResponseFormField[]).map(field => (
            <div key={field.id} className={styles.fieldWrapper}>
              <label className={styles.label}>{field.label}</label>
              {renderField(field)}
            </div>
          ))}
        </div>
        <div className={styles.panelFooter}>
          {error && <p className={styles.errorText}>{error}</p>}
          {canEdit || !existingResponse ? (
            <button
              onClick={handleSubmit}
              className={styles.submitButton}
              disabled={isSubmitting}
            >
              <Send size={18} />
              <span>
                {isSubmitting
                  ? 'A Enviar...'
                  : existingResponse
                  ? 'Atualizar Resposta'
                  : 'Submeter Resposta'}
              </span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
