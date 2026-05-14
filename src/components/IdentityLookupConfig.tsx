'use client';

/**
 * IdentityLookupConfig
 *
 * Subcomponente que renderiza a config de uma etapa de "Identity Validation".
 * Usado dentro do StageConfigPanel quando stage.stageType === 'identity-validation'.
 *
 * Fluxo de configuração para o admin:
 *   1. Escolhe a tabela do banco (alimentada por Pentaho/ETL)
 *   2. Escolhe a coluna onde buscar o ID digitado pelo colaborador
 *   3. Marca quais colunas serão exibidas pro colaborador confirmar
 *   4. Customiza textos (label do input, placeholder, texto do botão de confirmação)
 *   5. Define se exige match (default true)
 */

import React, { useEffect, useState } from 'react';
import type { WorkflowStage } from '@/types';

interface Props {
  stage: WorkflowStage;
  onUpdate: (changes: Partial<WorkflowStage>) => void;
}

interface PgTable {
  name: string;
  schema: string;
  estimatedRows: number;
}

interface PgColumn {
  name: string;
  type: string;
  category: 'text' | 'number' | 'date' | 'boolean' | 'json' | 'other';
  nullable: boolean;
}

export default function IdentityLookupConfig({ stage, onUpdate }: Props) {
  const [tables, setTables] = useState<PgTable[]>([]);
  const [columns, setColumns] = useState<PgColumn[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [tableSearch, setTableSearch] = useState('');

  // Carrega lista de tabelas ao montar
  useEffect(() => {
    setLoadingTables(true);
    fetch('/api/lookup/tables')
      .then((r) => r.json())
      .then((j) => { if (j.success) setTables(j.data); })
      .finally(() => setLoadingTables(false));
  }, []);

  // Carrega colunas quando muda a tabela selecionada
  useEffect(() => {
    if (!stage.lookupTable) {
      setColumns([]);
      return;
    }
    setLoadingColumns(true);
    fetch(`/api/lookup/columns?table=${encodeURIComponent(stage.lookupTable)}`)
      .then((r) => r.json())
      .then((j) => { if (j.success) setColumns(j.data); })
      .finally(() => setLoadingColumns(false));
  }, [stage.lookupTable]);

  const displayColumns = stage.lookupDisplayColumns || [];

  const toggleDisplayColumn = (colName: string) => {
    const idx = displayColumns.findIndex((d) => d.column === colName);
    if (idx >= 0) {
      onUpdate({ lookupDisplayColumns: displayColumns.filter((_, i) => i !== idx) });
    } else {
      onUpdate({ lookupDisplayColumns: [...displayColumns, { column: colName, label: colName }] });
    }
  };

  const updateDisplayLabel = (colName: string, newLabel: string) => {
    onUpdate({
      lookupDisplayColumns: displayColumns.map((d) =>
        d.column === colName ? { ...d, label: newLabel } : d
      ),
    });
  };

  const filteredTables = tableSearch.trim()
    ? tables.filter((t) => t.name.toLowerCase().includes(tableSearch.toLowerCase()))
    : tables;

  // Estilos inline para combinar com o resto do painel
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    background: 'var(--surface-card)',
    border: '1px solid var(--color-border-default)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-text-primary)',
    fontSize: 13,
    outline: 'none',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    marginBottom: 4,
  };
  const hintStyle: React.CSSProperties = {
    margin: '4px 0 0',
    fontSize: 11,
    color: 'var(--color-text-tertiary)',
    lineHeight: 1.4,
  };
  const groupStyle: React.CSSProperties = {
    marginBottom: 14,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* ─── Tabela ─────────────────────────────────────────────── */}
      <div style={groupStyle}>
        <label style={labelStyle}>Tabela do banco *</label>
        {loadingTables ? (
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: 6 }}>
            Carregando tabelas…
          </div>
        ) : (
          <>
            <input
              type="text"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="Buscar tabela..."
              style={{ ...inputStyle, marginBottom: 6 }}
            />
            <select
              value={stage.lookupTable || ''}
              onChange={(e) => onUpdate({
                lookupTable: e.target.value || undefined,
                lookupSearchColumn: undefined,
                lookupDisplayColumns: [],
              })}
              style={{ ...inputStyle, height: 'auto' }}
              size={Math.min(8, Math.max(3, filteredTables.length))}
            >
              <option value="">— Selecione uma tabela —</option>
              {filteredTables.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name} (~{t.estimatedRows.toLocaleString('pt-BR')} reg)
                </option>
              ))}
            </select>
            <p style={hintStyle}>
              Tabelas alimentadas pelo Pentaho/ETL podem ser usadas aqui sem cadastro extra.
            </p>
          </>
        )}
      </div>

      {/* ─── Campos de identificação obrigatórios (N campos) ──────── */}
      {stage.lookupTable && (
        <div style={groupStyle}>
          <label style={labelStyle}>Campos de identificação obrigatórios *</label>
          <p style={hintStyle}>
            Adicione 1 ou mais colunas. O colaborador precisará preencher
            <strong> todas</strong> e cada valor precisa bater com a mesma linha da tabela.
            Quanto mais campos, mais difícil burlar.
          </p>
          {loadingColumns ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: 6 }}>
              Carregando colunas…
            </div>
          ) : (
            <>
              <MatchFieldsEditor
                fields={
                  (stage.lookupMatchFields || []).length > 0
                    ? stage.lookupMatchFields!
                    : (stage.lookupSearchColumn
                        ? [{
                            column: stage.lookupSearchColumn,
                            label: stage.lookupInputLabel || stage.lookupSearchColumn,
                            placeholder: stage.lookupInputPlaceholder || '',
                          }]
                        : [])
                }
                columns={columns}
                onChange={(next) => {
                  onUpdate({
                    lookupMatchFields: next,
                    // sincroniza o legacy para compat com /api/lookup/query
                    lookupSearchColumn: next[0]?.column || undefined,
                    lookupInputLabel: next[0]?.label || undefined,
                    lookupInputPlaceholder: next[0]?.placeholder || undefined,
                  });
                }}
              />
            </>
          )}
        </div>
      )}

      {/* ─── Colunas de exibição ─────────────────────────────── */}
      {stage.lookupTable && columns.length > 0 && (
        <div style={groupStyle}>
          <label style={labelStyle}>Colunas a exibir após o match *</label>
          <p style={hintStyle}>
            Marque as informações que o colaborador verá para confirmar "Sou eu".
          </p>
          <div style={{
            marginTop: 6,
            maxHeight: 220,
            overflowY: 'auto',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: 4,
            background: 'var(--surface-page)',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}>
            {columns.map((c) => {
              const dc = displayColumns.find((d) => d.column === c.name);
              const isSelected = !!dc;
              return (
                <div
                  key={c.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 6px',
                    borderRadius: 4,
                    background: isSelected ? 'var(--color-brand-50)' : 'transparent',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleDisplayColumn(c.name)}
                    style={{ cursor: 'pointer', flexShrink: 0 }}
                  />
                  <span style={{
                    fontSize: 11,
                    color: 'var(--color-text-primary)',
                    minWidth: 110,
                    flexShrink: 0,
                  }}>
                    {c.name}
                  </span>
                  {isSelected && (
                    <input
                      type="text"
                      value={dc!.label}
                      onChange={(e) => updateDisplayLabel(c.name, e.target.value)}
                      placeholder="Rótulo"
                      style={{
                        flex: 1,
                        padding: '2px 6px',
                        background: 'var(--surface-card)',
                        border: '1px solid var(--color-border-default)',
                        borderRadius: 4,
                        color: 'var(--color-text-primary)',
                        fontSize: 11,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Comportamento ──────────────────────────────────────── */}
      {stage.lookupTable && (
        <div style={{
          padding: 10,
          background: 'var(--surface-page)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 11,
          color: 'var(--color-text-tertiary)',
          lineHeight: 1.5,
        }}>
          ℹ️ <strong>Sem botão de confirmação:</strong> quando o colaborador preencher todos
          os campos e clicar em <em>Validar identidade</em>, o sistema verifica e — se tudo
          bater — avança automaticamente para a próxima etapa. Caso contrário, o acesso é
          negado com mensagem clara, sem permitir retry.
        </div>
      )}
    </div>
  );
}

// ─── Editor de N campos de match ─────────────────────────────────────

function MatchFieldsEditor({
  fields,
  columns,
  onChange,
}: {
  fields: Array<{ column: string; label: string; placeholder?: string }>;
  columns: PgColumn[];
  onChange: (next: Array<{ column: string; label: string; placeholder?: string }>) => void;
}) {
  const update = (i: number, patch: Partial<{ column: string; label: string; placeholder?: string }>) => {
    const next = fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f));
    onChange(next);
  };
  const remove = (i: number) => onChange(fields.filter((_, idx) => idx !== i));
  const add = () => {
    const available = columns.filter((c) => !fields.some((f) => f.column === c.name));
    const first = available[0];
    onChange([
      ...fields,
      first ? { column: first.name, label: first.name, placeholder: '' } : { column: '', label: '', placeholder: '' },
    ]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {fields.length === 0 && (
        <div style={{
          padding: 10,
          background: 'var(--surface-page)',
          border: '1px dashed var(--color-border-default)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 12,
          color: 'var(--color-text-tertiary)',
          textAlign: 'center',
        }}>
          Nenhum campo configurado. Clique em "Adicionar campo" abaixo.
        </div>
      )}
      {fields.map((f, i) => (
        <div
          key={i}
          style={{
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: 8,
            background: 'var(--surface-card)',
            display: 'grid',
            gridTemplateColumns: '32px 1fr 1fr 1fr 28px',
            gap: 6,
            alignItems: 'center',
          }}
        >
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--color-text-tertiary)',
            textAlign: 'center',
          }}>
            #{i + 1}
          </span>
          <select
            value={f.column}
            onChange={(e) => update(i, { column: e.target.value, label: f.label || e.target.value })}
            style={{
              padding: '6px 8px',
              background: 'var(--surface-card)',
              border: '1px solid var(--color-border-default)',
              borderRadius: 4,
              fontSize: 11,
              color: 'var(--color-text-primary)',
            }}
          >
            <option value="">— coluna —</option>
            {columns.map((c) => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
          <input
            type="text"
            value={f.label}
            onChange={(e) => update(i, { label: e.target.value })}
            placeholder="Rótulo (ex: E-mail)"
            style={{
              padding: '6px 8px',
              background: 'var(--surface-card)',
              border: '1px solid var(--color-border-default)',
              borderRadius: 4,
              fontSize: 11,
              color: 'var(--color-text-primary)',
            }}
          />
          <input
            type="text"
            value={f.placeholder || ''}
            onChange={(e) => update(i, { placeholder: e.target.value })}
            placeholder="Placeholder (ex: nome@ex.com)"
            style={{
              padding: '6px 8px',
              background: 'var(--surface-card)',
              border: '1px solid var(--color-border-default)',
              borderRadius: 4,
              fontSize: 11,
              color: 'var(--color-text-primary)',
            }}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            title="Remover campo"
            aria-label={`Remover campo ${i + 1}`}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: 'var(--color-text-tertiary)', fontSize: 16, padding: 0,
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        style={{
          padding: '6px 10px',
          background: 'var(--surface-page)',
          border: '1px dashed var(--color-border-default)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--color-text-secondary)',
          cursor: 'pointer',
        }}
      >
        + Adicionar campo de identificação
      </button>
    </div>
  );
}
