'use client';

import React, { useState, useRef, useEffect } from 'react';
import { db } from '../../firebase/config';
import { doc, addDoc, updateDoc, collection, serverTimestamp } from 'firebase/firestore';
import { type Form, type FormResponse as FormResponseType } from '@/types';
import styles from '../../app/styles/FormResponse.module.css';
import { X, Send, Eraser } from 'lucide-react';

// Novo tipo: genérico para campos criados no builder
type EnhancedFormField = {
  id: string;
  type: string;
  label: string;
  required?: boolean;
  displayAs?: string;
  placeholder?: string;
  description?: string;
  options?: string[];
  allowOther?: boolean;
  columns?: { id: string; label: string; type: string; options?: string[] }[];
  rows?: { id: string; label: string }[];
  [key: string]: any; // permite campos dinâmicos futuros
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

export default function FormResponse({
  form,
  collaborator,
  onClose,
  existingResponse,
  canEdit
}: FormResponseProps) {
  if (!form) return null;

  // Estado das respostas
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [otherInputValues, setOtherInputValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [triedSubmit, setTriedSubmit] = useState(false);
  const signaturePads = useRef<Record<string, HTMLCanvasElement | null>>({});

  // Preenche para edição
  useEffect(() => {
    if (existingResponse) {
      const initial: Record<string, any> = {};
      const initialOthers: Record<string, string> = {};

      Object.entries(existingResponse)
        .filter(([k]) => !['id', 'createdAt', 'updatedAt'].includes(k))
        .forEach(([k, v]) => {
          // Busca por ID ou label (para compatibilidade)
          const field =
            (form.fields as EnhancedFormField[]).find(f => String(f.id) === k || f.label === k);
          if (!field) return;
          const fieldId = String(field.id);

          // Múltipla escolha/checkbox com "outros"
          if (
            (field.type === 'Caixa de Seleção' || field.type === 'Múltipla Escolha') &&
            field.allowOther
          ) {
            if (typeof v === 'string' && v && field.options && !field.options.includes(v)) {
              initial[fieldId] = '___OTHER___';
              initialOthers[fieldId] = v;
            } else if (Array.isArray(v)) {
              const normal = v.filter(opt => field.options?.includes(opt));
              const other = v.find(opt => !(field.options ?? []).includes(opt));
              if (other) initialOthers[fieldId] = other;
              if (normal.length > 0)
                initial[fieldId] = [...normal, ...(other ? ['___OTHER___'] : [])];
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
          return {
            x: e.touches[0].clientX - rect.left,
            y: e.touches[0].clientY - rect.top,
          };
        } else if ('changedTouches' in e && e.changedTouches.length > 0) {
          return {
            x: e.changedTouches[0].clientX - rect.left,
            y: e.changedTouches[0].clientY - rect.top,
          };
        } else if ('clientX' in e) {
          return {
            x: (e as MouseEvent).clientX - rect.left,
            y: (e as MouseEvent).clientY - rect.top,
          };
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
      canvas.addEventListener('touchend', stopDraw, { passive: false });
      canvas.addEventListener('touchcancel', stopDraw, { passive: false });
      return () => {
        canvas.removeEventListener('mousedown', startDraw);
        canvas.removeEventListener('mousemove', draw);
        canvas.removeEventListener('mouseup', stopDraw);
        canvas.removeEventListener('mouseleave', stopDraw);
        canvas.removeEventListener('touchstart', startDraw);
        canvas.removeEventListener('touchmove', draw);
        canvas.removeEventListener('touchend', stopDraw);
        canvas.removeEventListener('touchcancel', stopDraw);
      };
    });
  }, [form.fields]);

  // Restaura imagem da assinatura se tiver
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

  // Manipuladores dinâmicos
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

  // SUBMIT
  const handleSubmit = async () => {
    setTriedSubmit(true);

const missingFields: string[] = [];
(form.fields as EnhancedFormField[]).forEach(field => {
  const fieldIdStr = String(field.id);

  // Só valida campos obrigatórios que não são Cabeçalho, Anexo, Assinatura, ou Tabela
  if (
    field.required &&
    !['Cabeçalho', 'Anexo', 'Assinatura', 'Tabela'].includes(field.type)
  ) {
    const val = responses[fieldIdStr];
    if (
      val === undefined ||
      val === null ||
      (typeof val === 'string' && val.trim() === '') ||
      (Array.isArray(val) && val.length === 0)
    ) {
      missingFields.push(field.label);
    }
  }
});

if (missingFields.length > 0) {
  setError("Preencha todos os campos obrigatórios!");
  setIsSubmitting(false);
  return;
}

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

      // 1. FLATTEN POR LABEL (para BI, facilidade)
      (form.fields as EnhancedFormField[]).forEach(field => {
        const fieldIdStr = String(field.id);
        let answerVal = responses[fieldIdStr];

        if (
          (field.type === 'Caixa de Seleção' || field.type === 'Múltipla Escolha') &&
          field.allowOther
        ) {
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
        flattened[field.label] = answerVal ?? '';
      });

      // 2. SALVAR answers por ID (histórico e compatibilidade)
      const answers: Record<string, any> = {};
      (form.fields as EnhancedFormField[]).forEach(field => {
        const fieldIdStr = String(field.id);
        let answerVal = responses[fieldIdStr];
        if (
          (field.type === 'Caixa de Seleção' || field.type === 'Múltipla Escolha') &&
          field.allowOther
        ) {
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

      // Firestore
      if (existingResponse?.id) {
        await updateDoc(
          doc(db, 'forms', form.id, 'responses', existingResponse.id),
          { ...flattened, updatedAt: serverTimestamp() }
        );
      } else {
        await addDoc(collection(db, 'forms', form.id, 'responses'), flattened);
      }
      onClose();
    } catch (err) {
      setError('Não foi possível enviar a resposta.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --------- Renderização dinâmica dos campos
  const renderTableCell = (
    field: EnhancedFormField,
    row: { id: string; label: string },
    col: { id: string; label: string; type: string; options?: string[] }
  ) => {
    const fieldId = String(field.id);
    const rowId = String(row.id);
    const colId = String(col.id);
    const value =
      responses[fieldId]?.[rowId]?.[colId] !== undefined
        ? responses[fieldId][rowId][colId]
        : '';
    const disabled = !canEdit && !!existingResponse;

    // Mapeamento de tipos para inputs
    switch (col.type) {
      case 'text':
      case 'Texto':
        return (
          <input
            className={styles.tableResponseInput}
            type="text"
            value={value}
            onChange={e =>
              handleTableInputChange(fieldId, rowId, colId, e.target.value)
            }
            disabled={disabled}
          />
        );
      case 'number':
        return (
          <input
            className={styles.tableResponseInput}
            type="number"
            value={value}
            onChange={e =>
              handleTableInputChange(fieldId, rowId, colId, e.target.value)
            }
            disabled={disabled}
          />
        );
      case 'date':
      case 'Data':
        return (
          <input
            className={styles.tableResponseInput}
            type="date"
            value={value}
            onChange={e =>
              handleTableInputChange(fieldId, rowId, colId, e.target.value)
            }
            disabled={disabled}
          />
        );
      case 'select':
      case 'Caixa de Seleção':
      case 'Múltipla Escolha':
        return (
          <select
            className={styles.tableResponseSelect}
            value={value}
            onChange={e =>
              handleTableInputChange(fieldId, rowId, colId, e.target.value)
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
              handleTableInputChange(fieldId, rowId, colId, e.target.value)
            }
            disabled={disabled}
          />
        );
    }
  };

  // Campo dinâmico
  const renderField = (field: EnhancedFormField) => {
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
                  {field.columns?.map((col: any) => (
                    <th key={col.id}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {field.rows?.map((row: any) => (
                  <tr key={row.id}>
                    <td>{row.label}</td>
                    {field.columns?.map((col: any) => (
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
  if (field.displayAs === 'dropdown') {
    return (
      <select
        className={styles.input}
        value={responses[fieldId] || ''}
        onChange={e => handleInputChange(fieldId, e.target.value)}
        disabled={disabled}
      >
        <option value="">Selecione</option>
        {field.options?.map((opt: string) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
        {field.allowOther && <option value="___OTHER___">Outros</option>}
      </select>
    );
  }

  // Versão radio (default)
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
              checked={responses[fieldId] === '___OTHER___'}
              onChange={() => handleInputChange(fieldId, '___OTHER___')}
              disabled={disabled}
            />
            <span>Outros</span>
          </label>
          {responses[fieldId] === '___OTHER___' && (
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
     case 'Cabeçalho':
  return <div className={styles.formSectionHeader}>{field.label}</div>;

      default:
        // Suporte a campos futuros: input genérico texto
        return (
          <input
            className={styles.input}
            value={responses[fieldId] || ''}
            onChange={e => handleInputChange(fieldId, e.target.value)}
            placeholder={field.placeholder || ''}
            disabled={disabled}
          />
        );
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
          {(form.fields as EnhancedFormField[]).map(field => (
            <div key={field.id} className={styles.fieldWrapper}>
              {field.type !== 'Cabeçalho' && (
                <label
  className={
    styles.label +
    (field.required &&
      triedSubmit &&
      (
        responses[String(field.id)] === undefined ||
        responses[String(field.id)] === null ||
        responses[String(field.id)] === '' ||
        (Array.isArray(responses[String(field.id)]) && responses[String(field.id)].length === 0)
      )
      ? ' ' + styles.requiredErrorLabel
      : ''
    )
  }
>
  {field.label}
  {field.required && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
</label>

              )}
              {renderField(field)}
              {field.description && (
                <div className={styles.fieldDescription}>{field.description}</div>
              )}
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
