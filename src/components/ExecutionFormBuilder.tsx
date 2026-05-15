'use client';

/**
 * ExecutionFormBuilder
 *
 * Editor visual de formulários customizados para etapas de execution.
 * Permite ao admin:
 *   - Habilitar/desabilitar o formulário
 *   - Adicionar campos (text, number, textarea, lookup-input, display,
 *     lookup-dropdown, file)
 *   - Configurar lookups com cascading (where: fromField)
 *   - Reordenar campos
 *
 * Persiste em stage.executionForm.
 */

import React, { useEffect, useState } from 'react';
import { ArrowUp, ArrowDown, Trash2, Plus, FileText, Eye } from 'lucide-react';
import type { WorkflowStage, ExecutionFormField, ExecutionFormFieldType, LookupConfig } from '@/types';

interface Props {
  stage: WorkflowStage;
  onUpdate: (changes: Partial<WorkflowStage>) => void;
}

interface PgTable { name: string; schema: string; estimatedRows: number; }
interface PgColumn { name: string; type: string; }

const FIELD_TYPES: Array<{ value: ExecutionFormFieldType; label: string; hint: string }> = [
  { value: 'text',            label: 'Texto curto',         hint: 'Input simples de uma linha' },
  { value: 'number',          label: 'Número',              hint: 'Input numérico' },
  { value: 'textarea',        label: 'Texto longo',         hint: 'Área de texto multilinha' },
  { value: 'lookup-input',    label: 'Lookup (digitar ID)', hint: 'Digita um valor → busca uma linha na tabela' },
  { value: 'display',         label: 'Mostrar dado',        hint: 'Read-only auto-preenchido por outro campo' },
  { value: 'lookup-dropdown', label: 'Dropdown filtrado',   hint: 'Lista vem de query SQL (pode filtrar por outros campos)' },
  { value: 'file',            label: 'Arquivo / Foto',      hint: 'Upload com suporte a câmera no celular' },
];

export default function ExecutionFormBuilder({ stage, onUpdate }: Props) {
  const form = stage.executionForm || { enabled: false, fields: [] };
  const fields = form.fields || [];
  const [tables, setTables] = useState<PgTable[]>([]);
  const [columnsCache, setColumnsCache] = useState<Record<string, PgColumn[]>>({});

  useEffect(() => {
    fetch('/api/lookup/tables')
      .then((r) => r.json())
      .then((j) => { if (j.success) setTables(j.data); });
  }, []);

  const loadColumns = async (table: string) => {
    if (!table || columnsCache[table]) return;
    const r = await fetch(`/api/lookup/columns?table=${encodeURIComponent(table)}`);
    const j = await r.json();
    if (j.success) setColumnsCache((p) => ({ ...p, [table]: j.data }));
  };

  const updateForm = (changes: Partial<NonNullable<WorkflowStage['executionForm']>>) => {
    onUpdate({ executionForm: { ...form, ...changes } as any });
  };
  const updateFields = (next: ExecutionFormField[]) => updateForm({ fields: next });

  const addField = (type: ExecutionFormFieldType) => {
    const id = `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const newField: ExecutionFormField = {
      id,
      type,
      label: FIELD_TYPES.find((t) => t.value === type)?.label || 'Campo',
      required: false,
    };
    if (type === 'lookup-input' || type === 'lookup-dropdown') {
      newField.lookup = { table: stage.lookupTable || '', where: [] };
    }
    if (type === 'file') {
      newField.accept = 'image/*';
      newField.capture = 'camera';
      newField.multiple = true;
    }
    updateFields([...fields, newField]);
  };

  const updateField = (idx: number, patch: Partial<ExecutionFormField>) => {
    const next = fields.map((f, i) => i === idx ? { ...f, ...patch } : f);
    updateFields(next);
  };
  const removeField = (idx: number) => updateFields(fields.filter((_, i) => i !== idx));
  const moveField = (idx: number, dir: -1 | 1) => {
    const ni = idx + dir;
    if (ni < 0 || ni >= fields.length) return;
    const next = [...fields];
    [next[idx], next[ni]] = [next[ni], next[idx]];
    updateFields(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Switch principal */}
      <label style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 12, fontWeight: 600,
        color: 'var(--color-text-primary)',
        padding: 10,
        background: form.enabled ? '#EFF6FF' : 'var(--surface-page)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
      }}>
        <input
          type="checkbox"
          checked={!!form.enabled}
          onChange={(e) => updateForm({ enabled: e.target.checked })}
        />
        Habilitar formulário customizado nesta etapa
        <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)', fontSize: 11 }}>
          (cascading lookups, dropdowns filtrados, upload de fotos)
        </span>
      </label>

      {!form.enabled && (
        <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
          Sem isto, a etapa de execution mostra apenas um textarea + botão "Marcar como concluído".
        </p>
      )}

      {form.enabled && (
        <>
          {/* Título e descrição */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={smallLabel}>Título do formulário</label>
              <input
                type="text"
                value={form.title || ''}
                onChange={(e) => updateForm({ title: e.target.value })}
                placeholder={stage.name || 'Ex: Solicitação de Devolução'}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={smallLabel}>Descrição (opcional)</label>
              <input
                type="text"
                value={form.description || ''}
                onChange={(e) => updateForm({ description: e.target.value })}
                placeholder="Ex: Preencha os dados do produto que será retirado"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Bloco explicativo */}
          <div style={{
            padding: 10,
            background: 'var(--surface-card)',
            border: '1px solid var(--color-brand-200, #BFDBFE)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 11,
            color: 'var(--color-text-secondary)',
            lineHeight: 1.6,
          }}>
            <strong style={{ color: 'var(--color-text-primary)' }}>
              Como funciona o cruzamento de informações?
            </strong>
            <br />
            Use o tipo <strong>Lookup</strong> pra um campo que digita um ID e busca a linha
            no banco (ex: código do cliente → nome do cliente).
            <br />
            Use <strong>Mostrar dado</strong> pra um read-only que pega valor de outro campo
            (ex: "Nome do cliente" lendo da linha encontrada).
            <br />
            Use <strong>Dropdown filtrado</strong> pra listas dinâmicas (ex: NFs do cliente
            escolhido). No bloco "Onde buscar", referencie o ID do campo anterior em
            <em> "Onde campo de outro field = "</em>.
          </div>

          {/* Lista de campos */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {fields.length === 0 && (
              <div style={{
                padding: 14,
                background: 'var(--surface-page)',
                border: '1px dashed var(--color-border-default)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 12, color: 'var(--color-text-tertiary)',
                textAlign: 'center',
              }}>
                Nenhum campo ainda. Adicione abaixo.
              </div>
            )}
            {fields.map((f, i) => (
              <FieldEditor
                key={f.id}
                index={i}
                total={fields.length}
                field={f}
                allFields={fields}
                tables={tables}
                columnsCache={columnsCache}
                loadColumns={loadColumns}
                onUpdate={(patch) => updateField(i, patch)}
                onRemove={() => removeField(i)}
                onMove={(dir) => moveField(i, dir)}
              />
            ))}
          </div>

          {/* Adicionar campo */}
          <div>
            <div style={{ ...smallLabel, marginTop: 4 }}>+ Adicionar campo</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {FIELD_TYPES.map((ft) => (
                <button
                  key={ft.value}
                  type="button"
                  onClick={() => addField(ft.value)}
                  title={ft.hint}
                  style={{
                    padding: '6px 10px',
                    background: 'var(--surface-card)',
                    border: '1px solid var(--color-border-default)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 11, fontWeight: 500,
                    color: 'var(--color-text-primary)',
                    cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <Plus size={11} /> {ft.label}
                </button>
              ))}
            </div>
          </div>

          {/* Preview ao vivo */}
          {fields.length > 0 && (
            <div style={{
              marginTop: 4, padding: 10,
              background: 'var(--surface-card)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-sm)',
            }}>
              <div style={{ ...smallLabel, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Eye size={11} /> Prévia · o colaborador verá
              </div>
              <div style={{ paddingLeft: 8, borderLeft: '2px solid var(--color-brand-200, #BFDBFE)' }}>
                {fields.map((f, i) => (
                  <div key={f.id} style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: i > 0 ? 4 : 0 }}>
                    {f.required && f.type !== 'display' && (
                      <span style={{ color: '#EF4444', marginRight: 4 }}>*</span>
                    )}
                    <strong>{f.label || '(sem label)'}</strong>{' '}
                    <span style={{ color: 'var(--color-text-tertiary)' }}>
                      [{FIELD_TYPES.find((t) => t.value === f.type)?.label}]
                    </span>
                    {f.type === 'lookup-dropdown' && f.lookup?.where && f.lookup.where.length > 0 && (
                      <span style={{ color: 'var(--color-text-tertiary)' }}>
                        {' '}— filtrado por: {f.lookup.where.map((w) => w.fromField || w.value).join(', ')}
                      </span>
                    )}
                    {f.type === 'display' && f.from && (
                      <span style={{ color: 'var(--color-text-tertiary)' }}>
                        {' '}— de <code>{f.from}</code>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── FieldEditor ──────────────────────────────────────────────────────

function FieldEditor({
  index, total, field, allFields, tables, columnsCache, loadColumns,
  onUpdate, onRemove, onMove,
}: {
  index: number;
  total: number;
  field: ExecutionFormField;
  allFields: ExecutionFormField[];
  tables: PgTable[];
  columnsCache: Record<string, PgColumn[]>;
  loadColumns: (t: string) => void;
  onUpdate: (patch: Partial<ExecutionFormField>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  useEffect(() => {
    if ((field.type === 'lookup-input' || field.type === 'lookup-dropdown') && field.lookup?.table) {
      loadColumns(field.lookup.table);
    }
  }, [field.lookup?.table, field.type, loadColumns]);

  const cols = field.lookup?.table ? (columnsCache[field.lookup.table] || []) : [];

  const updateLookup = (patch: Partial<LookupConfig>) => {
    onUpdate({ lookup: { ...(field.lookup || { table: '', where: [] }), ...patch } });
  };

  return (
    <div style={{
      padding: 10,
      background: 'var(--surface-card)',
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 'var(--radius-sm)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{
          fontSize: 10, fontWeight: 700,
          color: 'var(--color-text-tertiary)',
          background: 'var(--surface-page)',
          padding: '2px 6px', borderRadius: 4,
        }}>
          #{index + 1}
        </span>
        <select
          value={field.type}
          onChange={(e) => onUpdate({ type: e.target.value as ExecutionFormFieldType })}
          style={{ ...inputStyle, width: 'auto', padding: '4px 6px' }}
        >
          {FIELD_TYPES.map((ft) => (
            <option key={ft.value} value={ft.value}>{ft.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          aria-label="Mover pra cima"
          style={iconBtnStyle}
        >
          <ArrowUp size={12} />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          aria-label="Mover pra baixo"
          style={iconBtnStyle}
        >
          <ArrowDown size={12} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remover"
          style={{ ...iconBtnStyle, color: '#B91C1C' }}
        >
          <Trash2 size={12} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <input
          type="text"
          value={field.id}
          onChange={(e) => onUpdate({ id: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') })}
          placeholder="ID (ex: cliente_codigo)"
          style={{ ...inputStyle, fontFamily: 'monospace' }}
          title="ID interno do campo (sem espaços, sem acentos)"
        />
        <input
          type="text"
          value={field.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="Label (ex: Código do cliente)"
          style={inputStyle}
        />
      </div>

      {(field.type === 'text' || field.type === 'number' || field.type === 'textarea' || field.type === 'lookup-input') && (
        <div style={{ marginTop: 6 }}>
          <input
            type="text"
            value={field.placeholder || ''}
            onChange={(e) => onUpdate({ placeholder: e.target.value })}
            placeholder="Placeholder (ex: Ex: 12345)"
            style={inputStyle}
          />
        </div>
      )}

      {/* Lookup config */}
      {(field.type === 'lookup-input' || field.type === 'lookup-dropdown') && (
        <div style={{ marginTop: 8, padding: 8, background: 'var(--surface-page)', borderRadius: 4 }}>
          <div style={smallLabel}>Onde buscar</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 4 }}>
            <select
              value={field.lookup?.table || ''}
              onChange={(e) => updateLookup({ table: e.target.value })}
              style={inputStyle}
            >
              <option value="">— tabela —</option>
              {tables.map((t) => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
            {field.type === 'lookup-input' && (
              <select
                value={field.lookup?.searchColumn || ''}
                onChange={(e) => updateLookup({ searchColumn: e.target.value })}
                style={inputStyle}
                title="Coluna que recebe o que o usuário digita"
              >
                <option value="">— coluna de busca —</option>
                {cols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            )}
            {field.type === 'lookup-dropdown' && (
              <>
                <select
                  value={field.lookup?.selectColumn || ''}
                  onChange={(e) => updateLookup({ selectColumn: e.target.value })}
                  style={inputStyle}
                  title="Coluna do VALOR retornado (ex: numero_nf)"
                >
                  <option value="">— coluna do valor —</option>
                  {cols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </>
            )}
          </div>
          {field.type === 'lookup-dropdown' && (
            <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <select
                value={field.lookup?.labelColumn || ''}
                onChange={(e) => updateLookup({ labelColumn: e.target.value })}
                style={inputStyle}
                title="Coluna do rótulo exibido no dropdown (opcional)"
              >
                <option value="">— coluna do rótulo (opc.) —</option>
                {cols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-text-primary)' }}>
                <input
                  type="checkbox"
                  checked={!!field.lookup?.distinct}
                  onChange={(e) => updateLookup({ distinct: e.target.checked })}
                />
                SELECT DISTINCT
              </label>
            </div>
          )}

          {/* Colunas extras pra display refs */}
          {(field.type === 'lookup-input' || field.type === 'lookup-dropdown') && (
            <div style={{ marginTop: 6 }}>
              <div style={smallLabel}>Colunas extras a retornar (separadas por vírgula — pra serem usadas por "Mostrar dado")</div>
              <input
                type="text"
                value={(field.lookup?.resolveColumns || []).join(', ')}
                onChange={(e) => updateLookup({
                  resolveColumns: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                })}
                placeholder="Ex: cliente, produto"
                style={inputStyle}
              />
            </div>
          )}

          {/* WHERE conditions */}
          <WhereEditor
            where={field.lookup?.where || []}
            allFields={allFields.filter((f) => f.id !== field.id)}
            cols={cols}
            onChange={(next) => updateLookup({ where: next })}
          />
        </div>
      )}

      {/* Display: from */}
      {field.type === 'display' && (
        <div style={{ marginTop: 8 }}>
          <div style={smallLabel}>Pegar valor de outro campo</div>
          <input
            type="text"
            value={field.from || ''}
            onChange={(e) => onUpdate({ from: e.target.value })}
            placeholder="Ex: cliente_codigo.cliente"
            style={{ ...inputStyle, fontFamily: 'monospace' }}
          />
          <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--color-text-tertiary)' }}>
            Formato: <code>id_do_campo.nome_da_coluna</code> (o campo precisa ser lookup-input ou
            lookup-dropdown, e a coluna precisa estar em "resolveColumns" ou ser a label/value)
          </p>
        </div>
      )}

      {/* File config */}
      {field.type === 'file' && (
        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          <input
            type="text"
            value={field.accept || ''}
            onChange={(e) => onUpdate({ accept: e.target.value })}
            placeholder="accept (ex: image/*)"
            style={inputStyle}
          />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
            <input
              type="checkbox"
              checked={field.multiple !== false}
              onChange={(e) => onUpdate({ multiple: e.target.checked })}
            />
            Múltiplos
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
            <input
              type="checkbox"
              checked={field.capture !== 'none'}
              onChange={(e) => onUpdate({ capture: e.target.checked ? 'camera' : 'none' })}
            />
            Câmera no mobile
          </label>
        </div>
      )}

      {/* Required */}
      <label style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-text-primary)' }}>
        <input
          type="checkbox"
          checked={!!field.required}
          onChange={(e) => onUpdate({ required: e.target.checked })}
          disabled={field.type === 'display'}
        />
        Campo obrigatório
        {field.type === 'display' && <span style={{ color: 'var(--color-text-tertiary)' }}>(display nunca é obrigatório)</span>}
      </label>
    </div>
  );
}

function WhereEditor({
  where, allFields, cols, onChange,
}: {
  where: NonNullable<LookupConfig['where']>;
  allFields: ExecutionFormField[];
  cols: PgColumn[];
  onChange: (next: NonNullable<LookupConfig['where']>) => void;
}) {
  return (
    <div style={{ marginTop: 6 }}>
      <div style={smallLabel}>Filtros (WHERE) — para cascading lookups</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
        {where.map((w, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 24px', gap: 4 }}>
            <select
              value={w.column}
              onChange={(e) => {
                const next = [...where];
                next[i] = { ...next[i], column: e.target.value };
                onChange(next);
              }}
              style={{ ...inputStyle, fontSize: 10 }}
              title="Coluna a filtrar no banco"
            >
              <option value="">— coluna —</option>
              {cols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            <select
              value={w.fromField || ''}
              onChange={(e) => {
                const next = [...where];
                next[i] = { ...next[i], fromField: e.target.value || undefined };
                onChange(next);
              }}
              style={{ ...inputStyle, fontSize: 10 }}
              title="Valor vem de qual campo do formulário"
            >
              <option value="">— igual ao valor de... —</option>
              {allFields.map((f) => <option key={f.id} value={f.id}>{f.label || f.id}</option>)}
            </select>
            <input
              type="text"
              value={w.value !== undefined ? String(w.value) : ''}
              onChange={(e) => {
                const next = [...where];
                next[i] = { ...next[i], value: e.target.value, fromField: undefined };
                onChange(next);
              }}
              placeholder="OU valor fixo"
              style={{ ...inputStyle, fontSize: 10 }}
            />
            <button
              type="button"
              onClick={() => onChange(where.filter((_, idx) => idx !== i))}
              aria-label="Remover"
              style={{ ...iconBtnStyle, color: '#B91C1C', justifySelf: 'center' }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...where, { column: '', fromField: undefined }])}
        style={{
          marginTop: 4, padding: '4px 8px',
          background: 'transparent',
          border: '1px dashed var(--color-border-default)',
          borderRadius: 4, fontSize: 10, fontWeight: 500,
          color: 'var(--color-text-secondary)',
          cursor: 'pointer',
        }}
      >
        + Filtro
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '5px 8px',
  background: 'var(--surface-card)',
  border: '1px solid var(--color-border-default)',
  borderRadius: 4,
  fontSize: 11,
  color: 'var(--color-text-primary)',
  outline: 'none',
  boxSizing: 'border-box',
};

const smallLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 10, fontWeight: 600,
  color: 'var(--color-text-tertiary)',
  textTransform: 'uppercase', letterSpacing: 0.4,
  marginBottom: 2,
};

const iconBtnStyle: React.CSSProperties = {
  border: 'none', background: 'transparent', cursor: 'pointer',
  color: 'var(--color-text-tertiary)', padding: 2,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};
