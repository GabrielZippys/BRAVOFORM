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
      {/* ─── Pré-seleção contextual (opcional) ────────────────────── */}
      <PreSelectEditor
        value={stage.lookupPreSelect}
        defaultColumns={columns}
        onChange={(next) => onUpdate({ lookupPreSelect: next })}
      />

      {/* ─── Tabela (default da etapa) ────────────────────────────── */}
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
          <label style={labelStyle}>
            {stage.lookupPreSelect?.enabled
              ? 'Campos default (fallback) *'
              : 'Campos de identificação obrigatórios *'}
          </label>
          <p style={hintStyle}>
            {stage.lookupPreSelect?.enabled ? (
              <>
                Usados apenas <strong>quando uma opção da pré-seleção não define seus
                próprios campos</strong>. Se todas as opções acima estão configuradas,
                estes campos não serão usados.
              </>
            ) : (
              <>
                Adicione 1 ou mais colunas. O colaborador precisará preencher
                <strong> todas</strong> e cada valor precisa bater com a mesma linha da tabela.
                Quanto mais campos, mais difícil burlar.
              </>
            )}
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

// ─── Pré-seleção: dropdown manual antes dos match_fields ─────────────────

type PreSelect = NonNullable<WorkflowStage['lookupPreSelect']>;

function PreSelectEditor({
  value,
  defaultColumns,
  onChange,
}: {
  value: WorkflowStage['lookupPreSelect'];
  defaultColumns: PgColumn[];
  onChange: (next: WorkflowStage['lookupPreSelect']) => void;
}) {
  const enabled = !!value?.enabled;
  const current: PreSelect = value || { enabled: false, label: '', options: [] };

  const patch = (changes: Partial<PreSelect>) => {
    onChange({ ...current, ...changes });
  };

  const addOption = () => {
    patch({
      options: [
        ...(current.options || []),
        { value: '', label: '', lookupTable: '', matchFields: [] },
      ],
    });
  };
  const updateOption = (i: number, changes: Partial<PreSelect['options'][number]>) => {
    patch({
      options: (current.options || []).map((o, idx) => idx === i ? { ...o, ...changes } : o),
    });
  };
  const removeOption = (i: number) => {
    patch({ options: (current.options || []).filter((_, idx) => idx !== i) });
  };

  return (
    <div style={{
      marginBottom: 14,
      padding: 10,
      background: enabled ? 'var(--color-brand-50, #EFF6FF)' : 'var(--surface-page)',
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 'var(--radius-sm)',
    }}>
      <label style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 12, fontWeight: 600,
        color: 'var(--color-text-primary)',
        cursor: 'pointer',
      }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => patch({ enabled: e.target.checked })}
        />
        Pré-seleção contextual antes da identidade
        <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)', fontSize: 11 }}>
          (ex: escolher unidade)
        </span>
      </label>

      {!enabled && (
        <p style={{
          margin: '6px 0 0 24px',
          fontSize: 11,
          color: 'var(--color-text-tertiary)',
          lineHeight: 1.5,
        }}>
          Habilite para exibir um dropdown manual antes dos campos de identificação.
          Cada opção pode usar tabela e campos diferentes.
        </p>
      )}

      {enabled && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Bloco explicativo "Como funciona?" — com exemplo concreto */}
          <div style={{
            padding: 10,
            background: 'var(--surface-card)',
            border: '1px solid var(--color-brand-200, #BFDBFE)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 11,
            color: 'var(--color-text-secondary)',
            lineHeight: 1.6,
          }}>
            <strong style={{ color: 'var(--color-text-primary)' }}>Como funciona?</strong>
            <br />
            O colaborador verá um <strong>dropdown</strong> antes dos campos de identidade.
            A escolha do dropdown decide <strong>quais campos pedir</strong> e
            <strong> qual coluna usar para validar</strong> cada um.
            <br /><br />
            <strong>Exemplo prático:</strong> seu time tem 2 equipes — Apetite e MPA. Você
            cria 2 opções abaixo:
            <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
              <li>Opção <code>Apetite</code> → pede "ID do vendedor", busca na coluna <code>codigo_vendedor</code></li>
              <li>Opção <code>MPA</code> → pede "ID do vendedor", busca na coluna <code>codigo_mpa</code></li>
            </ul>
            Mesmo input visual, mas a coluna varia. Você configura isso dentro de cada opção.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={{
                display: 'block', fontSize: 11, fontWeight: 600,
                color: 'var(--color-text-primary)', marginBottom: 2,
              }}>
                Rótulo do dropdown *
              </label>
              <input
                type="text"
                value={current.label || ''}
                onChange={(e) => patch({ label: e.target.value })}
                placeholder="Ex: Selecione sua unidade"
                style={{
                  width: '100%', padding: '6px 8px',
                  background: 'var(--surface-card)',
                  border: '1px solid var(--color-border-default)',
                  borderRadius: 4, fontSize: 11,
                  color: 'var(--color-text-primary)',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{
                display: 'block', fontSize: 11, fontWeight: 600,
                color: 'var(--color-text-primary)', marginBottom: 2,
              }}>
                Placeholder
              </label>
              <input
                type="text"
                value={current.placeholder || ''}
                onChange={(e) => patch({ placeholder: e.target.value })}
                placeholder="Ex: Escolha uma unidade..."
                style={{
                  width: '100%', padding: '6px 8px',
                  background: 'var(--surface-card)',
                  border: '1px solid var(--color-border-default)',
                  borderRadius: 4, fontSize: 11,
                  color: 'var(--color-text-primary)',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <label style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 11, color: 'var(--color-text-primary)',
          }}>
            <input
              type="checkbox"
              checked={current.required !== false}
              onChange={(e) => patch({ required: e.target.checked })}
            />
            Obrigatório (sem escolher, o colaborador não avança)
          </label>

          <div>
            <div style={{
              fontSize: 11, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: 0.5,
              color: 'var(--color-text-secondary)',
              marginBottom: 6,
            }}>
              Opções do dropdown
            </div>
            <p style={{
              margin: '0 0 8px', fontSize: 11,
              color: 'var(--color-text-tertiary)', lineHeight: 1.5,
            }}>
              Para cada opção, você pode deixar em branco para usar a tabela/campos default
              da etapa, OU sobrescrever com uma tabela e campos específicos.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(current.options || []).length === 0 && (
                <div style={{
                  padding: 10,
                  background: 'var(--surface-card)',
                  border: '1px dashed var(--color-border-default)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 11, color: 'var(--color-text-tertiary)',
                  textAlign: 'center',
                }}>
                  Nenhuma opção. Clique em "+ Adicionar opção" abaixo.
                </div>
              )}
              {(current.options || []).map((opt, i) => (
                <PreSelectOptionEditor
                  key={i}
                  index={i}
                  option={opt}
                  defaultColumns={defaultColumns}
                  onChange={(changes) => updateOption(i, changes)}
                  onRemove={() => removeOption(i)}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={addOption}
              style={{
                marginTop: 8,
                padding: '6px 10px',
                background: 'var(--surface-page)',
                border: '1px dashed var(--color-border-default)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 11, fontWeight: 500,
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
              }}
            >
              + Adicionar opção
            </button>
          </div>

          {/* Preview ao vivo do que o colaborador vai ver */}
          {(current.options || []).length > 0 && (
            <PreSelectPreview preSelect={current} />
          )}
        </div>
      )}
    </div>
  );
}

function PreSelectPreview({ preSelect }: { preSelect: PreSelect }) {
  return (
    <div style={{
      marginTop: 4,
      padding: 10,
      background: 'var(--surface-card)',
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 'var(--radius-sm)',
      fontSize: 11,
      color: 'var(--color-text-secondary)',
    }}>
      <div style={{
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        fontSize: 10,
        color: 'var(--color-text-tertiary)',
        marginBottom: 6,
      }}>
        Prévia · o que o colaborador verá
      </div>
      <div style={{ paddingLeft: 8, borderLeft: '2px solid var(--color-brand-200, #BFDBFE)' }}>
        <div>
          <strong>Tela 1:</strong> dropdown{' '}
          <em>"{preSelect.label || '(sem rótulo)'}"</em> com{' '}
          {(preSelect.options || []).length} opção{(preSelect.options || []).length !== 1 ? 'ões' : ''}
        </div>
        {(preSelect.options || []).map((opt, i) => {
          const hasFields = (opt.matchFields || []).length > 0;
          const fields = hasFields
            ? (opt.matchFields || []).map((f) => `${f.label || f.column || '?'} (coluna: ${f.column || '?'})`).join(' + ')
            : '(usa campos default da etapa)';
          return (
            <div key={i} style={{ marginTop: 4, paddingTop: 4, borderTop: i > 0 ? '1px dashed var(--color-border-subtle)' : 'none' }}>
              <strong>Tela 2</strong> se escolher <em>"{opt.label || opt.value || `Opção ${i + 1}`}"</em>:
              <br />
              <span style={{ marginLeft: 12 }}>Pedir: {fields}</span>
              {opt.lookupTable && (
                <><br /><span style={{ marginLeft: 12 }}>Buscar em: <code>{opt.lookupTable}</code></span></>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PreSelectOptionEditor({
  index, option, defaultColumns, onChange, onRemove,
}: {
  index: number;
  option: PreSelect['options'][number];
  defaultColumns: PgColumn[];
  onChange: (changes: Partial<PreSelect['options'][number]>) => void;
  onRemove: () => void;
}) {
  const [optColumns, setOptColumns] = React.useState<PgColumn[]>([]);
  const [loadingOptCols, setLoadingOptCols] = React.useState(false);

  // Quando a opção tem tabela override, carrega as colunas dela
  React.useEffect(() => {
    if (!option.lookupTable) {
      setOptColumns([]);
      return;
    }
    setLoadingOptCols(true);
    fetch(`/api/lookup/columns?table=${encodeURIComponent(option.lookupTable)}`)
      .then((r) => r.json())
      .then((j) => { if (j.success) setOptColumns(j.data); })
      .finally(() => setLoadingOptCols(false));
  }, [option.lookupTable]);

  const columnsForFields = optColumns.length > 0 ? optColumns : defaultColumns;
  const fieldCount = (option.matchFields || []).length;
  const usesDefault = !option.lookupTable && fieldCount === 0;

  const updateMatchField = (i: number, patch: Partial<{ column: string; label: string; placeholder?: string }>) => {
    const next = (option.matchFields || []).map((f, idx) => idx === i ? { ...f, ...patch } : f);
    onChange({ matchFields: next });
  };
  const addMatchField = () => {
    onChange({
      matchFields: [...(option.matchFields || []), { column: '', label: '', placeholder: '' }],
    });
  };
  const removeMatchField = (i: number) => {
    onChange({ matchFields: (option.matchFields || []).filter((_, idx) => idx !== i) });
  };

  return (
    <div style={{
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--surface-card)',
      padding: 10,
    }}>
      {/* Cabeçalho da opção: valor + rótulo + status badge + remover */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '32px 1fr 1fr 28px',
        gap: 6,
        alignItems: 'center',
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700,
          color: 'var(--color-text-tertiary)', textAlign: 'center',
        }}>
          #{index + 1}
        </span>
        <input
          type="text"
          value={option.value || ''}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder="Valor (ex: apetite)"
          style={{
            padding: '6px 8px',
            background: 'var(--surface-page)',
            border: '1px solid var(--color-border-default)',
            borderRadius: 4, fontSize: 11,
            color: 'var(--color-text-primary)',
          }}
        />
        <input
          type="text"
          value={option.label || ''}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="O que o colaborador vê (ex: Apetite)"
          style={{
            padding: '6px 8px',
            background: 'var(--surface-page)',
            border: '1px solid var(--color-border-default)',
            borderRadius: 4, fontSize: 11,
            color: 'var(--color-text-primary)',
          }}
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remover opção"
          title="Remover opção"
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: 'var(--color-text-tertiary)', fontSize: 16, padding: 0,
          }}
        >
          ×
        </button>
      </div>

      {/* Status badge */}
      <div style={{
        marginTop: 8, marginBottom: 6,
        padding: '6px 8px',
        background: usesDefault ? '#FEF3C7' : '#D1FAE5',
        color: usesDefault ? '#92400E' : '#065F46',
        borderRadius: 4,
        fontSize: 10, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: 0.4,
      }}>
        {usesDefault
          ? '⚠ Usando configuração default da etapa (ainda sem coluna específica)'
          : `✓ Coluna(s) específica(s) para esta opção (${fieldCount || 1} campo${fieldCount > 1 ? 's' : ''})`}
      </div>

      {/* Configuração da opção (sempre aberta) */}
      <div style={{
        paddingTop: 6,
        borderTop: '1px dashed var(--color-border-subtle)',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 600,
          color: 'var(--color-text-primary)',
          marginBottom: -2,
        }}>
          Quando escolherem <strong>"{option.label || option.value || `Opção ${index + 1}`}"</strong>, pedir e validar:
        </div>

        {loadingOptCols && (
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', padding: 4 }}>
            Carregando colunas…
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(option.matchFields || []).map((mf, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr 24px',
                gap: 4,
              }}
            >
              <select
                value={mf.column}
                onChange={(e) => updateMatchField(i, { column: e.target.value, label: mf.label || e.target.value })}
                style={{
                  padding: '4px 6px',
                  background: 'var(--surface-page)',
                  border: '1px solid var(--color-border-default)',
                  borderRadius: 4, fontSize: 10,
                  color: 'var(--color-text-primary)',
                }}
                title="Coluna no banco onde buscar"
              >
                <option value="">— coluna do banco —</option>
                {columnsForFields.map((c) => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
              <input
                type="text"
                value={mf.label}
                onChange={(e) => updateMatchField(i, { label: e.target.value })}
                placeholder="Rótulo (ex: ID do vendedor)"
                style={{
                  padding: '4px 6px',
                  background: 'var(--surface-page)',
                  border: '1px solid var(--color-border-default)',
                  borderRadius: 4, fontSize: 10,
                  color: 'var(--color-text-primary)',
                }}
              />
              <input
                type="text"
                value={mf.placeholder || ''}
                onChange={(e) => updateMatchField(i, { placeholder: e.target.value })}
                placeholder="Placeholder (ex: 12345)"
                style={{
                  padding: '4px 6px',
                  background: 'var(--surface-page)',
                  border: '1px solid var(--color-border-default)',
                  borderRadius: 4, fontSize: 10,
                  color: 'var(--color-text-primary)',
                }}
              />
              <button
                type="button"
                onClick={() => removeMatchField(i)}
                aria-label="Remover campo"
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  color: 'var(--color-text-tertiary)', fontSize: 14,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addMatchField}
          style={{
            padding: '5px 10px',
            background: 'var(--surface-page)',
            border: '1px dashed var(--color-border-default)',
            borderRadius: 4,
            fontSize: 11, fontWeight: 500,
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            alignSelf: 'flex-start',
          }}
        >
          + Adicionar campo (ex: ID do vendedor → coluna codigo_vendedor)
        </button>

        {/* Tabela override (raro, escondido em detalhe colapsável) */}
        <details style={{ marginTop: 4 }}>
          <summary style={{
            cursor: 'pointer',
            fontSize: 10, fontWeight: 500,
            color: 'var(--color-text-tertiary)',
            userSelect: 'none',
          }}>
            Avançado: usar uma <strong>tabela diferente</strong> para esta opção
          </summary>
          <div style={{ marginTop: 4 }}>
            <input
              type="text"
              value={option.lookupTable || ''}
              onChange={(e) => onChange({ lookupTable: e.target.value })}
              placeholder="Em branco = usa a tabela default da etapa"
              style={{
                width: '100%', padding: '6px 8px',
                background: 'var(--surface-page)',
                border: '1px solid var(--color-border-default)',
                borderRadius: 4, fontSize: 11,
                color: 'var(--color-text-primary)',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </details>
      </div>
    </div>
  );
}
