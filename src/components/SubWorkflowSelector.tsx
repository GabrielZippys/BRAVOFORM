'use client';

/**
 * SubWorkflowSelector
 *
 * Dropdown que lista workflows ativos disponíveis para serem invocados
 * como sub-workflow. Carrega de /api/dataconnect/workflows e filtra
 * apenas isActive=true.
 */

import React, { useEffect, useState } from 'react';
import { Workflow as WorkflowIcon, Search } from 'lucide-react';
import { logger } from '@/lib/logger';

interface AvailableWorkflow {
  id: string;
  name: string;
  description: string;
  stageCount: number;
}

interface Props {
  value?: string;
  onChange: (workflowId: string | undefined) => void;
  /** ID do workflow corrente — exclui da lista (não pode invocar a si mesmo) */
  excludeWorkflowId?: string;
}

export default function SubWorkflowSelector({ value, onChange, excludeWorkflowId }: Props) {
  const [workflows, setWorkflows] = useState<AvailableWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/dataconnect/workflows?isActive=true');
        const json = await res.json();
        if (!cancelled && json.success) {
          const list = (json.data || [])
            .filter((w: any) => w.id && w.id !== excludeWorkflowId)
            .map((w: any) => ({
              id: w.id,
              name: w.name,
              description: w.description || '',
              stageCount: w.stageCount || 0,
            }));
          setWorkflows(list);
        }
      } catch (e) {
        logger.warn('SubWorkflowSelector: failed to load workflows', { error: (e as Error).message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [excludeWorkflowId]);

  const selected = workflows.find((w) => w.id === value);

  const filtered = search.trim()
    ? workflows.filter((w) =>
        w.name.toLowerCase().includes(search.toLowerCase()) ||
        w.description.toLowerCase().includes(search.toLowerCase())
      )
    : workflows;

  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: 'var(--font-size-sm)',
          fontWeight: 'var(--font-weight-semibold)',
          color: 'var(--color-text-primary)',
          marginBottom: 'var(--space-2)',
        }}
      >
        <WorkflowIcon size={14} style={{ verticalAlign: 'middle' }} /> Workflow alvo
      </label>

      {/* Busca */}
      <div style={{ position: 'relative', marginBottom: 'var(--space-2)' }}>
        <Search
          size={14}
          style={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--color-text-tertiary)',
          }}
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar workflow…"
          style={{
            width: '100%',
            padding: '6px 10px 6px 32px',
            border: '1px solid var(--color-border-default)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-primary)',
            background: 'var(--surface-card)',
            outline: 'none',
          }}
        />
      </div>

      {/* Selected box (se houver) */}
      {selected && (
        <div
          style={{
            padding: 'var(--space-3)',
            background: 'var(--color-brand-50)',
            border: '1px solid var(--color-brand-200)',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--space-2)',
          }}
        >
          <div>
            <strong style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-brand-700)' }}>
              ✓ {selected.name}
            </strong>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-brand-600)' }}>
              {selected.stageCount} etapa{selected.stageCount !== 1 ? 's' : ''}
              {selected.description && ` · ${selected.description.slice(0, 50)}${selected.description.length > 50 ? '…' : ''}`}
            </div>
          </div>
          <button
            onClick={() => onChange(undefined)}
            aria-label="Remover seleção"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-brand-700)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            Remover
          </button>
        </div>
      )}

      {/* Lista de workflows */}
      {loading ? (
        <div
          style={{
            padding: 'var(--space-3)',
            color: 'var(--color-text-tertiary)',
            fontSize: 'var(--font-size-sm)',
          }}
        >
          Carregando workflows…
        </div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            padding: 'var(--space-3)',
            background: 'var(--surface-page)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-text-tertiary)',
            fontSize: 'var(--font-size-sm)',
            textAlign: 'center',
          }}
        >
          {search ? 'Nenhum workflow encontrado' : 'Nenhum workflow ativo disponível'}
        </div>
      ) : (
        <div
          style={{
            maxHeight: 200,
            overflowY: 'auto',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface-card)',
          }}
        >
          {filtered.map((w) => {
            const isSelected = w.id === value;
            return (
              <button
                key={w.id}
                onClick={() => onChange(w.id)}
                style={{
                  display: 'flex',
                  width: '100%',
                  padding: 'var(--space-2) var(--space-3)',
                  background: isSelected ? 'var(--color-brand-50)' : 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--color-border-subtle)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  transition: 'background var(--duration-fast)',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.background = 'var(--surface-hover)';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.background = 'transparent';
                }}
              >
                <WorkflowIcon size={14} color="var(--color-text-tertiary)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: isSelected ? 'var(--font-weight-semibold)' : 'var(--font-weight-normal)',
                    color: 'var(--color-text-primary)',
                  }}>
                    {w.name}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                    {w.stageCount} etapa{w.stageCount !== 1 ? 's' : ''}
                  </div>
                </div>
                {isSelected && (
                  <span style={{ color: 'var(--color-brand-600)', fontSize: 14 }}>✓</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
