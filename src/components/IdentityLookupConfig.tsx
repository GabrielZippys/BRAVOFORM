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

      {/* ─── Coluna de busca ──────────────────────────────────── */}
      {stage.lookupTable && (
        <div style={groupStyle}>
          <label style={labelStyle}>Coluna usada para buscar *</label>
          {loadingColumns ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: 6 }}>
              Carregando colunas…
            </div>
          ) : (
            <select
              value={stage.lookupSearchColumn || ''}
              onChange={(e) => onUpdate({ lookupSearchColumn: e.target.value || undefined })}
              style={inputStyle}
            >
              <option value="">— Selecione a coluna onde buscar —</option>
              {columns.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.type})
                </option>
              ))}
            </select>
          )}
          <p style={hintStyle}>
            O colaborador vai digitar um valor que será comparado contra esta coluna.
          </p>
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

      {/* ─── Textos customizáveis ──────────────────────────────── */}
      {stage.lookupTable && (
        <>
          <div style={groupStyle}>
            <label style={labelStyle}>Texto do label (acima do campo)</label>
            <input
              type="text"
              value={stage.lookupInputLabel || ''}
              onChange={(e) => onUpdate({ lookupInputLabel: e.target.value || undefined })}
              placeholder="Ex: Digite sua matrícula"
              style={inputStyle}
            />
          </div>

          <div style={groupStyle}>
            <label style={labelStyle}>Placeholder do campo</label>
            <input
              type="text"
              value={stage.lookupInputPlaceholder || ''}
              onChange={(e) => onUpdate({ lookupInputPlaceholder: e.target.value || undefined })}
              placeholder="Ex: Ex: 12345"
              style={inputStyle}
            />
          </div>

          <div style={groupStyle}>
            <label style={labelStyle}>Texto do botão de confirmação</label>
            <input
              type="text"
              value={stage.lookupConfirmText || ''}
              onChange={(e) => onUpdate({ lookupConfirmText: e.target.value || undefined })}
              placeholder="Ex: Sou eu, prosseguir"
              style={inputStyle}
            />
          </div>

          <div style={groupStyle}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-primary)' }}>
              <input
                type="checkbox"
                checked={stage.lookupRequireMatch ?? true}
                onChange={(e) => onUpdate({ lookupRequireMatch: e.target.checked })}
              />
              Bloquear avanço se o ID não for encontrado
            </label>
          </div>
        </>
      )}
    </div>
  );
}
