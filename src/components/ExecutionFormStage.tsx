'use client';

/**
 * ExecutionFormStage
 *
 * Renderiza uma etapa execution/custom/review que tem um `executionForm`
 * configurado. Suporta:
 *   - text / number / textarea (básicos)
 *   - lookup-input  : digita ID, sistema resolve nome ao sair do campo (onBlur)
 *   - display       : read-only, valor vem de outro field via "fromFieldId.col"
 *   - lookup-dropdown: dropdown filtrado por outros fields (cascading)
 *   - file          : upload com câmera (capture="environment") direto pro Storage
 *
 * Ao submeter, chama POST /api/public/workflow/[token]/form-submit que
 * persiste valores em fact_form_response.execution_form_values e avança
 * a etapa.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2, AlertCircle, ArrowRight, Camera, Upload, X,
  CheckCircle2, ChevronDown, FileText,
} from 'lucide-react';
import { logger } from '@/lib/logger';
import { uploadPublicFile, type UploadedFile } from '@/lib/uploadFile';
import type { ExecutionFormField } from '@/types';

interface Props {
  token: string;
  responseId: string;
  stage: any; // PublicStage do /w/[token]/page.tsx
  onSubmitted: (result: { nextStageId: string | null; completed: boolean }) => void;
}

// Estado de um lookup-input após resolução
interface LookupInputState {
  status: 'idle' | 'loading' | 'match' | 'no-match' | 'error';
  rowData?: Record<string, any>;  // a linha encontrada (pra display fields)
  error?: string;
}

export default function ExecutionFormStage({ token, responseId, stage, onSubmitted }: Props) {
  const form = stage.executionForm || stage.execution_form;
  const fields: ExecutionFormField[] = useMemo(() => form?.fields || [], [form]);

  const [values, setValues] = useState<Record<string, any>>({});
  const [lookupStates, setLookupStates] = useState<Record<string, LookupInputState>>({});
  const [dropdownOptions, setDropdownOptions] = useState<Record<string, Array<{ value: any; label: string; [k: string]: any }>>>({});
  const [dropdownLoading, setDropdownLoading] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Cache do último fetch por field, pra evitar refetch redundante
  const lastFetchKey = useRef<Record<string, string>>({});

  // Helper: monta contextValues atual pra usar em where:[{fromField}]
  const contextValuesFor = useCallback((excludeId?: string): Record<string, any> => {
    const ctx: Record<string, any> = {};
    for (const k of Object.keys(values)) {
      if (k === excludeId) continue;
      ctx[k] = values[k];
    }
    return ctx;
  }, [values]);

  // Resolve lookup-input via API
  const resolveLookupInput = useCallback(async (field: ExecutionFormField, searchValue: string) => {
    setLookupStates((p) => ({ ...p, [field.id]: { status: 'loading' } }));
    try {
      const r = await fetch(`/api/public/workflow/${encodeURIComponent(token)}/form-lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responseId,
          stageId: stage.id,
          fieldId: field.id,
          contextValues: contextValuesFor(field.id),
          searchValue,
        }),
      });
      const j = await r.json();
      if (!j.success) {
        setLookupStates((p) => ({ ...p, [field.id]: { status: 'error', error: j.error || 'Erro ao consultar' } }));
        return;
      }
      if (!j.match) {
        setLookupStates((p) => ({ ...p, [field.id]: { status: 'no-match' } }));
        return;
      }
      setLookupStates((p) => ({ ...p, [field.id]: { status: 'match', rowData: j.match } }));
      // Substitui o valor digitado pelo valor canônico da linha encontrada.
      // Isso garante que dropdowns filtrados (cascading) batam por igualdade.
      if (field.lookup?.searchColumn) {
        const canonical = j.match[field.lookup.searchColumn];
        if (canonical !== undefined && canonical !== null && String(canonical) !== searchValue) {
          setValues((p) => ({ ...p, [field.id]: String(canonical) }));
        }
      }
    } catch (e: any) {
      logger.error('lookup-input resolve failed', e);
      setLookupStates((p) => ({ ...p, [field.id]: { status: 'error', error: 'Falha de rede' } }));
    }
  }, [token, responseId, stage.id, contextValuesFor]);

  // Resolve dropdown via API
  const loadDropdown = useCallback(async (field: ExecutionFormField, ctxKey: string) => {
    if (lastFetchKey.current[field.id] === ctxKey) return;
    lastFetchKey.current[field.id] = ctxKey;

    setDropdownLoading((p) => ({ ...p, [field.id]: true }));
    try {
      const r = await fetch(`/api/public/workflow/${encodeURIComponent(token)}/form-lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responseId,
          stageId: stage.id,
          fieldId: field.id,
          contextValues: contextValuesFor(field.id),
        }),
      });
      const j = await r.json();
      if (j.success && Array.isArray(j.rows)) {
        setDropdownOptions((p) => ({ ...p, [field.id]: j.rows }));
      } else {
        setDropdownOptions((p) => ({ ...p, [field.id]: [] }));
      }
    } catch (e) {
      logger.error('lookup-dropdown load failed', e);
      setDropdownOptions((p) => ({ ...p, [field.id]: [] }));
    } finally {
      setDropdownLoading((p) => ({ ...p, [field.id]: false }));
    }
  }, [token, responseId, stage.id, contextValuesFor]);

  // Recarrega cada dropdown sempre que suas dependências mudam
  useEffect(() => {
    for (const f of fields) {
      if (f.type !== 'lookup-dropdown' || !f.lookup) continue;
      const deps = (f.lookup.where || []).filter((w) => w.fromField).map((w) => w.fromField!);
      const ctxKey = deps.map((d) => `${d}=${values[d] ?? ''}`).join('|') || '(no-deps)';
      const allDepsFilled = deps.every((d) => values[d] !== undefined && values[d] !== '' && values[d] !== null);
      if (deps.length === 0 || allDepsFilled) {
        loadDropdown(f, ctxKey);
      } else {
        // Limpa opções se dependência ainda não foi preenchida
        if (lastFetchKey.current[f.id] !== '(empty-deps)') {
          lastFetchKey.current[f.id] = '(empty-deps)';
          setDropdownOptions((p) => ({ ...p, [f.id]: [] }));
        }
      }
    }
  }, [fields, values, loadDropdown]);

  // Resolve um display field: lê do field referenciado em "from"
  const resolveDisplayValue = (field: ExecutionFormField): string => {
    if (!field.from) return '';
    const [refId, col] = field.from.split('.');
    if (!refId) return '';
    // Se o field referenciado é lookup-input, lê do rowData
    const lookupState = lookupStates[refId];
    if (lookupState?.status === 'match' && lookupState.rowData && col) {
      return String(lookupState.rowData[col] ?? '');
    }
    // Se o field referenciado é lookup-dropdown, lê do option escolhido
    const selectedValue = values[refId];
    const opts = dropdownOptions[refId] || [];
    const opt = opts.find((o) => o.value === selectedValue);
    if (opt && col) {
      return String(opt[col] ?? opt.label ?? '');
    }
    // Fallback: valor cru
    return selectedValue !== undefined ? String(selectedValue) : '';
  };

  const setValue = (id: string, v: any) => {
    setValues((p) => ({ ...p, [id]: v }));
    // Limpa lookup state se mudou um input
    if (lookupStates[id]) {
      setLookupStates((p) => ({ ...p, [id]: { status: 'idle' } }));
    }
  };

  // Quando lookup-input muda, limpa fields que dependem dele
  const onChangeWithCascade = (id: string, v: any) => {
    setValues((p) => {
      const next: Record<string, any> = { ...p, [id]: v };
      for (const f of fields) {
        if (f.type !== 'lookup-dropdown') continue;
        const deps = (f.lookup?.where || []).filter((w) => w.fromField).map((w) => w.fromField);
        if (deps.includes(id)) {
          next[f.id] = '';
        }
      }
      return next;
    });
    if (lookupStates[id]) {
      setLookupStates((p) => ({ ...p, [id]: { status: 'idle' } }));
    }
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    // Valida obrigatórios visíveis
    for (const f of fields) {
      if (f.type === 'display') continue;
      if (!f.required) continue;
      const v = values[f.id];
      const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
      if (empty) {
        setSubmitError(`Preencha o campo: ${f.label}`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const r = await fetch(`/api/public/workflow/${encodeURIComponent(token)}/form-submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responseId, stageId: stage.id, values }),
      });
      const j = await r.json();
      if (!j.success) {
        setSubmitError(j.error || 'Erro ao enviar formulário');
        return;
      }
      onSubmitted({
        nextStageId: j.data?.nextStageId || null,
        completed: !!j.data?.completed,
      });
    } catch (e: any) {
      logger.error('form-submit failed', e);
      setSubmitError('Falha de rede. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!form?.enabled || fields.length === 0) {
    return (
      <div style={cardStyle}>
        <p style={{ color: '#6B7280' }}>Formulário não configurado.</p>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827' }}>
          {form.title || stage.name}
        </h1>
        {(form.description || stage.description) && (
          <p style={{ margin: '6px 0 0', fontSize: 14, color: '#6B7280', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {form.description || stage.description}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {fields.map((f) => (
          <FieldRenderer
            key={f.id}
            field={f}
            value={values[f.id] ?? ''}
            onChange={(v) => setValue(f.id, v)}
            onChangeWithCascade={(v) => onChangeWithCascade(f.id, v)}
            lookupState={lookupStates[f.id]}
            onResolveLookup={(sv) => resolveLookupInput(f, sv)}
            dropdownOptions={dropdownOptions[f.id] || []}
            dropdownLoading={!!dropdownLoading[f.id]}
            resolveDisplay={() => resolveDisplayValue(f)}
            token={token}
            responseId={responseId}
            stageId={stage.id}
          />
        ))}
      </div>

      {submitError && (
        <div role="alert" style={{
          marginTop: 16, padding: 10,
          background: '#FEE2E2', border: '1px solid #FECACA',
          borderRadius: 8, fontSize: 13, color: '#991B1B',
          display: 'flex', gap: 8, alignItems: 'flex-start',
        }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          {submitError}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        style={{
          marginTop: 18,
          width: '100%',
          padding: '14px 20px',
          background: submitting
            ? '#9CA3AF'
            : 'linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%)',
          color: '#fff',
          border: 'none',
          borderRadius: 10,
          fontSize: 15,
          fontWeight: 700,
          cursor: submitting ? 'wait' : 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        {submitting ? (
          <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Enviando…</>
        ) : (
          <>Enviar solicitação <ArrowRight size={16} /></>
        )}
      </button>

      <style jsx>{`
        @keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ─── FieldRenderer ────────────────────────────────────────────────────

function FieldRenderer({
  field, value, onChange, onChangeWithCascade,
  lookupState, onResolveLookup,
  dropdownOptions, dropdownLoading,
  resolveDisplay,
  token, responseId, stageId,
}: {
  field: ExecutionFormField;
  value: any;
  onChange: (v: any) => void;
  onChangeWithCascade: (v: any) => void;
  lookupState?: LookupInputState;
  onResolveLookup: (sv: string) => void;
  dropdownOptions: Array<{ value: any; label: string; [k: string]: any }>;
  dropdownLoading: boolean;
  resolveDisplay: () => string;
  token: string;
  responseId: string;
  stageId: string;
}) {
  switch (field.type) {
    case 'text':
    case 'number': {
      return (
        <FieldShell field={field}>
          <input
            type={field.type === 'number' ? 'number' : 'text'}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            min={field.min}
            max={field.max}
            style={inputStyle}
          />
        </FieldShell>
      );
    }
    case 'textarea': {
      return (
        <FieldShell field={field}>
          <textarea
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            rows={4}
            style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
          />
        </FieldShell>
      );
    }
    case 'lookup-input': {
      return (
        <FieldShell field={field}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={value || ''}
              onChange={(e) => onChangeWithCascade(e.target.value)}
              onBlur={() => {
                const v = String(value || '').trim();
                if (v) onResolveLookup(v);
              }}
              placeholder={field.placeholder}
              style={{
                ...inputStyle,
                borderColor:
                  lookupState?.status === 'match' ? '#10B981' :
                  lookupState?.status === 'no-match' ? '#EF4444' :
                  '#D1D5DB',
                background: lookupState?.status === 'match' ? '#F0FDF4' : '#fff',
              }}
            />
            <button
              type="button"
              onClick={() => {
                const v = String(value || '').trim();
                if (v) onResolveLookup(v);
              }}
              disabled={!value || lookupState?.status === 'loading'}
              style={{
                padding: '0 14px',
                background: '#3B82F6', color: '#fff',
                border: 'none', borderRadius: 10, cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
              }}
            >
              {lookupState?.status === 'loading'
                ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                : 'Buscar'}
            </button>
          </div>
          {lookupState?.status === 'no-match' && (
            <p style={{ marginTop: 4, fontSize: 12, color: '#B91C1C' }}>
              Nenhum registro encontrado para "{value}"
            </p>
          )}
          {lookupState?.status === 'error' && (
            <p style={{ marginTop: 4, fontSize: 12, color: '#B91C1C' }}>
              {lookupState.error}
            </p>
          )}
          {lookupState?.status === 'match' && (
            <p style={{ marginTop: 4, fontSize: 12, color: '#047857', display: 'flex', alignItems: 'center', gap: 4 }}>
              <CheckCircle2 size={12} /> Encontrado
            </p>
          )}
        </FieldShell>
      );
    }
    case 'display': {
      const v = resolveDisplay();
      return (
        <FieldShell field={field}>
          <div style={{
            ...inputStyle,
            background: '#F9FAFB',
            color: v ? '#111827' : '#9CA3AF',
            fontWeight: v ? 500 : 400,
            cursor: 'default',
            userSelect: 'none',
          }}>
            {v || <em style={{ fontStyle: 'italic', fontSize: 13 }}>aguardando…</em>}
          </div>
        </FieldShell>
      );
    }
    case 'lookup-dropdown': {
      return (
        <FieldShell field={field}>
          <div style={{ position: 'relative' }}>
            <select
              value={value || ''}
              onChange={(e) => onChangeWithCascade(e.target.value)}
              disabled={dropdownLoading || dropdownOptions.length === 0}
              style={{ ...inputStyle, appearance: 'none', paddingRight: 36, cursor: dropdownOptions.length > 0 ? 'pointer' : 'not-allowed' }}
            >
              <option value="">
                {dropdownLoading
                  ? 'Carregando…'
                  : dropdownOptions.length === 0
                    ? '(preencha os campos anteriores)'
                    : (field.placeholder || 'Selecione…')}
              </option>
              {dropdownOptions.map((o, i) => (
                <option key={`${o.value}-${i}`} value={o.value}>{o.label}</option>
              ))}
            </select>
            <ChevronDown size={14} style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              pointerEvents: 'none', color: '#9CA3AF',
            }} />
          </div>
          {dropdownOptions.length > 0 && (
            <p style={{ marginTop: 4, fontSize: 11, color: '#6B7280' }}>
              {dropdownOptions.length} {dropdownOptions.length === 1 ? 'opção' : 'opções'}
            </p>
          )}
        </FieldShell>
      );
    }
    case 'file': {
      return (
        <FieldShell field={field}>
          <FileUploader
            field={field}
            value={Array.isArray(value) ? value : []}
            onChange={onChange}
            token={token}
            responseId={responseId}
            stageId={stageId}
          />
        </FieldShell>
      );
    }
    default:
      return null;
  }
}

// ─── FileUploader (com câmera) ─────────────────────────────────────────

function FileUploader({
  field, value, onChange, token, responseId,
}: {
  field: ExecutionFormField;
  value: UploadedFile[];
  onChange: (next: UploadedFile[]) => void;
  token: string;
  responseId: string;
  stageId: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const galleryInput = useRef<HTMLInputElement | null>(null);
  const cameraInput = useRef<HTMLInputElement | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setErr(null);
    try {
      const uploaded: UploadedFile[] = [];
      for (const f of Array.from(files)) {
        const r = await uploadPublicFile(f, {
          token,
          responseId,
          fieldId: field.id,
          onlyImages: (field.accept || '').includes('image'),
        });
        uploaded.push(r);
      }
      onChange([...value, ...uploaded]);
    } catch (e: any) {
      setErr(e?.message || 'Falha ao enviar');
    } finally {
      setUploading(false);
    }
  };

  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  return (
    <div>
      <input
        ref={galleryInput}
        type="file"
        accept={field.accept || '*'}
        multiple={field.multiple !== false}
        onChange={(e) => handleFiles(e.target.files)}
        style={{ display: 'none' }}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => handleFiles(e.target.files)}
        style={{ display: 'none' }}
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {field.capture !== 'none' && (
          <button
            type="button"
            onClick={() => cameraInput.current?.click()}
            disabled={uploading}
            style={uploadBtnStyle('#3B82F6')}
          >
            <Camera size={14} /> Tirar foto
          </button>
        )}
        <button
          type="button"
          onClick={() => galleryInput.current?.click()}
          disabled={uploading}
          style={uploadBtnStyle('#6B7280')}
        >
          <Upload size={14} /> {uploading ? 'Enviando…' : 'Anexar arquivo'}
        </button>
      </div>

      {err && (
        <p style={{ marginTop: 6, fontSize: 12, color: '#B91C1C' }}>{err}</p>
      )}

      {value.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {value.map((f, i) => (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px',
                background: '#F9FAFB', border: '1px solid #E5E7EB',
                borderRadius: 6, fontSize: 12,
              }}
            >
              {f.type?.startsWith('image/') ? (
                <img src={f.url} alt={f.name} style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }} />
              ) : (
                <FileText size={20} color="#6B7280" />
              )}
              <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, color: '#1E40AF', textDecoration: 'none' }}>
                {f.name}
              </a>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="Remover"
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#9CA3AF' }}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 16,
  padding: 28,
  boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 13px',
  border: '1px solid #D1D5DB',
  borderRadius: 10,
  fontSize: 14,
  color: '#111827',
  background: '#fff',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

function uploadBtnStyle(color: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '9px 14px',
    background: color, color: '#fff',
    border: 'none', borderRadius: 8,
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
  };
}

function FieldShell({ field, children }: { field: ExecutionFormField; children: React.ReactNode }) {
  return (
    <div>
      <label
        htmlFor={`xf-${field.id}`}
        style={{
          display: 'block',
          fontSize: 13, fontWeight: 600, color: '#374151',
          marginBottom: 6,
        }}
      >
        {field.label}
        {field.required && field.type !== 'display' && (
          <span style={{ color: '#EF4444', marginLeft: 4 }}>*</span>
        )}
      </label>
      {children}
      {field.helpText && (
        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9CA3AF', lineHeight: 1.4 }}>
          {field.helpText}
        </p>
      )}
    </div>
  );
}
