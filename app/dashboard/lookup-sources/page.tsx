'use client';

/**
 * /dashboard/lookup-sources
 *
 * Tela de gerenciamento das Fontes de Lookup (admin).
 * Admin cadastra fontes que serão usadas em campos "lookup" de formulários.
 *
 * Fluxo: 1) escolhe tabela do PG → 2) escolhe coluna de busca →
 *        3) seleciona colunas a exibir → 4) salva.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  Database, Plus, Edit, Trash2, RefreshCw, Search,
  ChevronRight, AlertCircle, Check, X,
} from 'lucide-react';
import ErrorBoundary from '@/components/ErrorBoundary';
import { SkeletonList } from '@/components/Skeleton';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';

interface LookupSource {
  source_id: number;
  firebase_id: string;
  name: string;
  description: string | null;
  table_name: string;
  search_column: string;
  search_column_type: string;
  display_columns: Array<{ column: string; label?: string }>;
  is_active: boolean;
  created_at: string;
  created_by_name: string | null;
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

export default function LookupSourcesPage() {
  const { user } = useAuth();
  const [sources, setSources] = useState<LookupSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/lookup/sources');
      const j = await r.json();
      if (j.success) setSources(j.data || []);
    } catch (e) {
      logger.error('Failed to load lookup sources', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Excluir a fonte "${name}"?\n\nFormulários que usam essa fonte ficarão sem o campo lookup funcional.`)) return;
    try {
      await fetch(`/api/lookup/sources?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      load();
    } catch (e) {
      logger.error('Delete source failed', e);
    }
  };

  return (
    <ErrorBoundary>
      <div style={{ padding: 'var(--space-8)', maxWidth: 1200, margin: '0 auto' }}>
        <header style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-6)',
          paddingBottom: 'var(--space-5)',
          borderBottom: '2px solid #E5E7EB',
        }}>
          <div>
            <h1 style={{
              margin: 0,
              fontSize: 'var(--font-size-3xl)',
              fontWeight: 700,
              color: '#111827',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
            }}>
              <Database size={28} color="#3B82F6" /> Fontes de Lookup
            </h1>
            <p style={{ margin: 'var(--space-2) 0 0', fontSize: 14, color: '#6B7280' }}>
              Cadastre fontes de dados que poderão ser usadas em campos de busca
              nos formulários. Exemplo: cadastro de funcionários, base de clientes,
              tabela importada do RH/ERP.
            </p>
          </div>
          <button
            onClick={() => { setShowCreate(true); setEditingId(null); }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              background: '#3B82F6',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Plus size={18} /> Nova Fonte
          </button>
        </header>

        {loading ? (
          <SkeletonList count={3} variant="card" />
        ) : sources.length === 0 ? (
          <div style={{
            background: '#fff',
            border: '1px dashed #D1D5DB',
            borderRadius: 12,
            padding: 60,
            textAlign: 'center',
            color: '#6B7280',
          }}>
            <Database size={48} style={{ opacity: 0.5, marginBottom: 12 }} />
            <h3 style={{ margin: '0 0 8px', color: '#374151' }}>Nenhuma fonte cadastrada</h3>
            <p style={{ margin: '0 0 16px', fontSize: 14 }}>
              Crie sua primeira Fonte de Lookup para usar em campos de busca dos formulários.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                background: '#3B82F6',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Plus size={14} /> Criar primeira fonte
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sources.map((src) => (
              <SourceCard
                key={src.firebase_id}
                source={src}
                onEdit={() => { setEditingId(src.firebase_id); setShowCreate(false); }}
                onDelete={() => handleDelete(src.firebase_id, src.name)}
              />
            ))}
          </div>
        )}

        {/* Modal de criação/edição */}
        {(showCreate || editingId) && (
          <SourceEditor
            sourceId={editingId}
            onClose={() => { setShowCreate(false); setEditingId(null); }}
            onSaved={() => { setShowCreate(false); setEditingId(null); load(); }}
            currentUser={{
              id: user?.uid || '',
              name: user?.displayName || user?.email || 'Admin',
            }}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}

// ─── Card de Source ────────────────────────────────────────────────
function SourceCard({
  source, onEdit, onDelete,
}: { source: LookupSource; onEdit: () => void; onDelete: () => void }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #E5E7EB',
      borderLeft: `4px solid ${source.is_active ? '#10B981' : '#9CA3AF'}`,
      borderRadius: 8,
      padding: 16,
      display: 'flex',
      gap: 16,
      alignItems: 'flex-start',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 15, color: '#111827' }}>{source.name}</strong>
          <span style={{
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 999,
            background: source.is_active ? '#D1FAE5' : '#F3F4F6',
            color: source.is_active ? '#065F46' : '#6B7280',
            fontWeight: 600,
          }}>
            {source.is_active ? 'Ativa' : 'Inativa'}
          </span>
        </div>
        {source.description && (
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6B7280', lineHeight: 1.4 }}>
            {source.description}
          </p>
        )}
        <div style={{
          marginTop: 10,
          fontSize: 12,
          color: '#4B5563',
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
        }}>
          <span>
            <Database size={11} style={{ verticalAlign: 'middle' }} />{' '}
            <code style={{ background: '#F3F4F6', padding: '1px 6px', borderRadius: 4 }}>
              {source.table_name}
            </code>
          </span>
          <span>
            <Search size={11} style={{ verticalAlign: 'middle' }} />{' '}
            Busca por: <strong>{source.search_column}</strong>
          </span>
          <span>
            Exibe: <strong>{source.display_columns?.length || 0}</strong> coluna(s)
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={onEdit}
          aria-label="Editar"
          style={{
            padding: 8, background: 'transparent', border: '1px solid #D1D5DB',
            borderRadius: 6, cursor: 'pointer', color: '#4B5563',
          }}
        >
          <Edit size={14} />
        </button>
        <button
          onClick={onDelete}
          aria-label="Excluir"
          style={{
            padding: 8, background: 'transparent', border: '1px solid #FECACA',
            borderRadius: 6, cursor: 'pointer', color: '#DC2626',
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Editor (modal) ────────────────────────────────────────────────
function SourceEditor({
  sourceId, onClose, onSaved, currentUser,
}: {
  sourceId: string | null;
  onClose: () => void;
  onSaved: () => void;
  currentUser: { id: string; name: string };
}) {
  const isEdit = !!sourceId;
  const [step, setStep] = useState<'meta' | 'table' | 'columns' | 'review'>('meta');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tableName, setTableName] = useState('');
  const [searchColumn, setSearchColumn] = useState('');
  const [displayColumns, setDisplayColumns] = useState<Array<{ column: string; label: string }>>([]);
  const [tables, setTables] = useState<PgTable[]>([]);
  const [columns, setColumns] = useState<PgColumn[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Carrega dados se for edição
  useEffect(() => {
    if (!sourceId) return;
    (async () => {
      try {
        const r = await fetch(`/api/lookup/sources?id=${encodeURIComponent(sourceId)}`);
        const j = await r.json();
        if (j.success) {
          const s = j.data;
          setName(s.name);
          setDescription(s.description || '');
          setTableName(s.table_name);
          setSearchColumn(s.search_column);
          setDisplayColumns(s.display_columns.map((c: any) => ({
            column: c.column,
            label: c.label || c.column,
          })));
        }
      } catch (e) {
        logger.error('Failed to load source for edit', e);
      }
    })();
  }, [sourceId]);

  // Carrega tabelas quando entra no step
  useEffect(() => {
    if (step !== 'table' || tables.length > 0) return;
    setLoadingTables(true);
    fetch('/api/lookup/tables')
      .then((r) => r.json())
      .then((j) => { if (j.success) setTables(j.data); })
      .finally(() => setLoadingTables(false));
  }, [step, tables.length]);

  // Carrega colunas quando muda tableName
  useEffect(() => {
    if (!tableName) return;
    setLoadingColumns(true);
    fetch(`/api/lookup/columns?table=${encodeURIComponent(tableName)}`)
      .then((r) => r.json())
      .then((j) => { if (j.success) setColumns(j.data); })
      .finally(() => setLoadingColumns(false));
  }, [tableName]);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const payload = {
        name, description, tableName, searchColumn,
        displayColumns: displayColumns.map((c) => ({ column: c.column, label: c.label || c.column })),
        ...(isEdit
          ? { id: sourceId, performedBy: currentUser.id, performedByName: currentUser.name }
          : { createdBy: currentUser.id, createdByName: currentUser.name }),
      };
      const r = await fetch('/api/lookup/sources', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (j.success) onSaved();
      else setError(j.error || 'Erro ao salvar');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const canAdvance: Record<string, boolean> = {
    meta: !!name.trim(),
    table: !!tableName,
    columns: !!searchColumn && displayColumns.length > 0,
    review: true,
  };

  const filteredTables = tables.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 16, maxWidth: 760, width: '100%',
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
        }}
      >
        {/* Header */}
        <header style={{
          padding: '20px 24px', borderBottom: '1px solid #E5E7EB',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}>
            {isEdit ? 'Editar Fonte de Lookup' : 'Nova Fonte de Lookup'}
          </h2>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: '#6B7280', padding: 6,
          }}>
            <X size={20} />
          </button>
        </header>

        {/* Stepper */}
        <div style={{ padding: '12px 24px', borderBottom: '1px solid #F3F4F6', display: 'flex', gap: 8 }}>
          {(['meta', 'table', 'columns', 'review'] as const).map((s, idx) => {
            const labels = { meta: 'Identificação', table: 'Tabela', columns: 'Colunas', review: 'Revisar' };
            const isActive = step === s;
            const isDone = ['meta', 'table', 'columns', 'review'].indexOf(step) > idx;
            return (
              <div key={s} style={{
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
                color: isActive ? '#2563EB' : isDone ? '#10B981' : '#9CA3AF',
                fontWeight: isActive ? 600 : 500,
              }}>
                <span style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: isActive ? '#3B82F6' : isDone ? '#10B981' : '#E5E7EB',
                  color: isActive || isDone ? '#fff' : '#6B7280',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700,
                }}>
                  {isDone ? <Check size={12} /> : idx + 1}
                </span>
                {labels[s]}
                {idx < 3 && <ChevronRight size={14} color="#D1D5DB" style={{ marginLeft: 4 }} />}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {step === 'meta' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Nome da fonte *
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Cadastro de Funcionários"
                  style={{
                    width: '100%', padding: '10px 12px', border: '1px solid #D1D5DB',
                    borderRadius: 8, fontSize: 14, color: '#111827',
                  }}
                  autoFocus
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Descrição (opcional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Base do RH sincronizada diariamente com a folha de pagamento"
                  rows={3}
                  style={{
                    width: '100%', padding: '10px 12px', border: '1px solid #D1D5DB',
                    borderRadius: 8, fontSize: 14, color: '#111827', resize: 'vertical',
                  }}
                />
              </div>
            </div>
          )}

          {step === 'table' && (
            <div>
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar tabela..."
                  style={{
                    width: '100%', padding: '10px 12px 10px 36px',
                    border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 14, color: '#111827',
                  }}
                />
              </div>
              {loadingTables ? (
                <div style={{ textAlign: 'center', padding: 20, color: '#9CA3AF' }}>
                  Carregando tabelas…
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 400, overflowY: 'auto' }}>
                  {filteredTables.map((t) => (
                    <button
                      key={t.name}
                      onClick={() => { setTableName(t.name); setSearchColumn(''); setDisplayColumns([]); }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 14px', background: tableName === t.name ? '#EFF6FF' : '#fff',
                        border: `1px solid ${tableName === t.name ? '#3B82F6' : '#E5E7EB'}`,
                        borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>{t.name}</span>
                      <span style={{ fontSize: 11, color: '#9CA3AF' }}>~{t.estimatedRows.toLocaleString('pt-BR')} reg</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 'columns' && (
            <div>
              {loadingColumns ? (
                <div style={{ textAlign: 'center', padding: 20, color: '#9CA3AF' }}>
                  Carregando colunas…
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                      Coluna de busca * <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(onde o colaborador vai buscar o ID)</span>
                    </label>
                    <select
                      value={searchColumn}
                      onChange={(e) => setSearchColumn(e.target.value)}
                      style={{
                        width: '100%', padding: '10px 12px', border: '1px solid #D1D5DB',
                        borderRadius: 8, fontSize: 14, color: '#111827', background: '#fff',
                      }}
                    >
                      <option value="">— Selecione —</option>
                      {columns.map((c) => (
                        <option key={c.name} value={c.name}>{c.name} ({c.type})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                      Colunas a exibir após match * <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(marcar pelo menos 1)</span>
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto', border: '1px solid #E5E7EB', borderRadius: 8, padding: 8 }}>
                      {columns.map((c) => {
                        const idx = displayColumns.findIndex((d) => d.column === c.name);
                        const isSelected = idx >= 0;
                        return (
                          <div key={c.name} style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '6px 8px', borderRadius: 6,
                            background: isSelected ? '#EFF6FF' : 'transparent',
                          }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setDisplayColumns([...displayColumns, { column: c.name, label: c.name }]);
                                } else {
                                  setDisplayColumns(displayColumns.filter((d) => d.column !== c.name));
                                }
                              }}
                              style={{ cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: 13, color: '#111827', minWidth: 140 }}>
                              {c.name} <small style={{ color: '#9CA3AF' }}>({c.type})</small>
                            </span>
                            {isSelected && (
                              <input
                                value={displayColumns[idx].label}
                                onChange={(e) => {
                                  const next = [...displayColumns];
                                  next[idx] = { ...next[idx], label: e.target.value };
                                  setDisplayColumns(next);
                                }}
                                placeholder="Rótulo exibido"
                                style={{
                                  flex: 1, padding: '4px 8px', border: '1px solid #D1D5DB',
                                  borderRadius: 4, fontSize: 12, color: '#111827',
                                }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 'review' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <ReviewRow label="Nome" value={name} />
              {description && <ReviewRow label="Descrição" value={description} />}
              <ReviewRow label="Tabela" value={<code style={{ background: '#F3F4F6', padding: '2px 8px', borderRadius: 4 }}>{tableName}</code>} />
              <ReviewRow label="Coluna de busca" value={<code style={{ background: '#F3F4F6', padding: '2px 8px', borderRadius: 4 }}>{searchColumn}</code>} />
              <ReviewRow label="Colunas exibidas" value={
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {displayColumns.map((c) => (
                    <li key={c.column} style={{ fontSize: 13 }}>
                      <code style={{ background: '#F3F4F6', padding: '1px 6px', borderRadius: 4 }}>{c.column}</code>
                      {' '} → <strong>{c.label}</strong>
                    </li>
                  ))}
                </ul>
              } />
              {error && (
                <div style={{
                  padding: 12, background: '#FEE2E2', color: '#991B1B',
                  borderRadius: 8, fontSize: 13,
                  display: 'flex', gap: 8, alignItems: 'flex-start',
                }}>
                  <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer style={{
          padding: 16, borderTop: '1px solid #E5E7EB',
          display: 'flex', justifyContent: 'space-between', gap: 8,
        }}>
          <button
            onClick={() => {
              if (step === 'meta') onClose();
              else setStep(step === 'review' ? 'columns' : step === 'columns' ? 'table' : 'meta');
            }}
            style={{
              padding: '10px 18px', background: 'transparent',
              color: '#6B7280', border: '1px solid #D1D5DB', borderRadius: 8,
              fontSize: 14, fontWeight: 500, cursor: 'pointer',
            }}
          >
            {step === 'meta' ? 'Cancelar' : 'Voltar'}
          </button>
          {step !== 'review' ? (
            <button
              onClick={() => setStep(step === 'meta' ? 'table' : step === 'table' ? 'columns' : 'review')}
              disabled={!canAdvance[step]}
              style={{
                padding: '10px 18px', background: canAdvance[step] ? '#3B82F6' : '#E5E7EB',
                color: '#fff', border: 'none', borderRadius: 8,
                fontSize: 14, fontWeight: 600, cursor: canAdvance[step] ? 'pointer' : 'not-allowed',
              }}
            >
              Próximo
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '10px 18px', background: '#10B981',
                color: '#fff', border: 'none', borderRadius: 8,
                fontSize: 14, fontWeight: 600, cursor: saving ? 'wait' : 'pointer',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Criar fonte'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, fontSize: 13 }}>
      <span style={{ flex: '0 0 140px', color: '#6B7280', fontWeight: 500 }}>{label}:</span>
      <span style={{ flex: 1, color: '#111827' }}>{value}</span>
    </div>
  );
}
