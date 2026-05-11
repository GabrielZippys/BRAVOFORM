'use client';

/**
 * LookupField — componente reutilizável de campo de busca.
 *
 * Usado em:
 *   • Preview do formulário (admin testa)
 *   • Renderização para colaborador (workflow execution)
 *
 * Fluxo:
 *   1. Colaborador digita o ID/valor no input
 *   2. Clica em "Buscar" (botão visível)
 *   3. Frontend chama GET /api/lookup/query?sourceId=...&value=...
 *   4. Se match: mostra card abaixo com colunas de exibição
 *   5. Se não-match: abre modal "ID não encontrado — contate o suporte"
 *
 * Estado emitido via onChange:
 *   { inputValue: string, resolved: { col1: { value, label }, ... } | null }
 *
 * Esse formato vai pra answers do form → fica registrado na resposta
 * E aparece no histórico do workflow.
 */

import React, { useState, useCallback } from 'react';
import { Search, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { logger } from '@/lib/logger';

export interface LookupResolved {
  [column: string]: { value: any; label: string };
}

export interface LookupDisplayColumn {
  column: string;
  label: string;
}

export interface LookupValue {
  inputValue: string;
  resolved: LookupResolved | null;
  /** Snapshot da config no momento do match (auditável) */
  table?: string;
  searchColumn?: string;
}

interface Props {
  /** Tabela do PG configurada no campo */
  table: string;
  /** Coluna onde buscar */
  searchColumn: string;
  /** Colunas a exibir após match */
  displayColumns: LookupDisplayColumn[];
  /** Label do campo */
  label?: string;
  /** Placeholder do input */
  placeholder?: string;
  /** Valor atual (controlado) */
  value?: LookupValue;
  /** Callback quando muda valor ou resolve */
  onChange?: (value: LookupValue) => void;
  /** Se true, exige match no banco antes de permitir submit */
  requireMatch?: boolean;
  /** Layout: card abaixo ou inline ao lado */
  displayLayout?: 'card-below' | 'inline-right';
  /** Para modo preview / desabilitado */
  readOnly?: boolean;
}

type Status = 'idle' | 'searching' | 'match' | 'no-match' | 'error';

export default function LookupField({
  table,
  searchColumn,
  displayColumns,
  label = 'Digite seu ID',
  placeholder = 'Ex: matrícula, CPF, código...',
  value,
  onChange,
  requireMatch,
  displayLayout = 'card-below',
  readOnly = false,
}: Props) {
  const [inputValue, setInputValue] = useState(value?.inputValue || '');
  const [resolved, setResolved] = useState<LookupResolved | null>(value?.resolved || null);
  const [status, setStatus] = useState<Status>(value?.resolved ? 'match' : 'idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showNotFoundModal, setShowNotFoundModal] = useState(false);

  const emit = useCallback((nextInput: string, nextResolved: LookupResolved | null) => {
    onChange?.({
      inputValue: nextInput,
      resolved: nextResolved,
      table,
      searchColumn,
    });
  }, [onChange, table, searchColumn]);

  const handleSearch = async () => {
    const v = inputValue.trim();
    if (!v) return;

    if (!table || !searchColumn || !displayColumns || displayColumns.length === 0) {
      setStatus('error');
      setErrorMsg('Campo não configurado corretamente. Contate o administrador.');
      return;
    }

    setStatus('searching');
    setErrorMsg(null);

    try {
      const params = new URLSearchParams({
        table,
        searchColumn,
        value: v,
        displayColumns: displayColumns.map((d) => d.column).join(','),
        displayLabels: displayColumns.map((d) => d.label || d.column).join(','),
      });
      const r = await fetch(`/api/lookup/query?${params.toString()}`);
      const j = await r.json();

      if (!j.success) {
        setStatus('error');
        setErrorMsg(j.error || 'Erro ao buscar');
        return;
      }

      if (!j.match) {
        setStatus('no-match');
        setResolved(null);
        emit(v, null);
        setShowNotFoundModal(true);
        return;
      }

      setResolved(j.data);
      setStatus('match');
      emit(v, j.data);
    } catch (e: any) {
      logger.error('Lookup query failed', e);
      setStatus('error');
      setErrorMsg('Erro de rede. Tente novamente.');
    }
  };

  const handleInputChange = (val: string) => {
    setInputValue(val);
    // Limpa resolução anterior se mudou o input
    if (resolved && val !== value?.inputValue) {
      setResolved(null);
      setStatus('idle');
      emit(val, null);
    }
  };

  const handleClear = () => {
    setInputValue('');
    setResolved(null);
    setStatus('idle');
    setErrorMsg(null);
    emit('', null);
  };

  const StatusIcon =
    status === 'searching' ? Loader2 :
    status === 'match' ? CheckCircle2 :
    status === 'no-match' || status === 'error' ? AlertCircle :
    null;

  const statusColor =
    status === 'match' ? '#10B981' :
    status === 'no-match' || status === 'error' ? '#EF4444' :
    '#6B7280';

  return (
    <>
      <div style={{
        display: 'flex',
        flexDirection: displayLayout === 'inline-right' ? 'row' : 'column',
        gap: 16,
      }}>
        {/* Coluna de input */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {label && (
            <label style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 600,
              color: '#374151',
              marginBottom: 6,
            }}>
              {label}
              {requireMatch && <span style={{ color: '#EF4444', marginLeft: 4 }}>*</span>}
            </label>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(); } }}
                placeholder={placeholder}
                disabled={readOnly || status === 'searching'}
                style={{
                  width: '100%',
                  padding: '10px 36px 10px 12px',
                  border: `2px solid ${
                    status === 'match' ? '#10B981' :
                    status === 'no-match' || status === 'error' ? '#EF4444' :
                    '#D1D5DB'
                  }`,
                  borderRadius: 8,
                  fontSize: 14,
                  color: '#111827',
                  background: readOnly ? '#F9FAFB' : '#fff',
                  outline: 'none',
                  transition: 'border-color 150ms',
                }}
              />
              {StatusIcon && (
                <StatusIcon
                  size={18}
                  color={statusColor}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    animation: status === 'searching' ? 'spin 1s linear infinite' : undefined,
                  }}
                />
              )}
            </div>

            <button
              type="button"
              onClick={handleSearch}
              disabled={readOnly || !inputValue.trim() || status === 'searching'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 18px',
                background: status === 'searching' || !inputValue.trim() ? '#9CA3AF' : '#3B82F6',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: !inputValue.trim() || status === 'searching' ? 'not-allowed' : 'pointer',
                transition: 'background 150ms',
              }}
            >
              <Search size={14} />
              Buscar
            </button>

            {status === 'match' && !readOnly && (
              <button
                type="button"
                onClick={handleClear}
                title="Limpar e buscar outro"
                style={{
                  padding: 10,
                  background: 'transparent',
                  color: '#6B7280',
                  border: '1px solid #D1D5DB',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {errorMsg && status === 'error' && (
            <div style={{
              marginTop: 8,
              padding: 10,
              background: '#FEE2E2',
              border: '1px solid #FECACA',
              borderRadius: 6,
              fontSize: 12,
              color: '#991B1B',
              display: 'flex',
              gap: 6,
              alignItems: 'flex-start',
            }}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              {errorMsg}
            </div>
          )}
        </div>

        {/* Card de resultado */}
        {resolved && status === 'match' && (
          <div
            style={{
              flex: displayLayout === 'inline-right' ? 1 : undefined,
              background: '#ECFDF5',
              border: '1px solid #A7F3D0',
              borderLeft: '4px solid #10B981',
              borderRadius: 8,
              padding: 14,
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              fontWeight: 700,
              color: '#065F46',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 8,
            }}>
              <CheckCircle2 size={14} /> Identificação encontrada
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {Object.entries(resolved).map(([col, info]) => (
                <div key={col} style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                  <span style={{ minWidth: 100, color: '#047857', fontWeight: 500 }}>
                    {info.label}:
                  </span>
                  <strong style={{ color: '#111827' }}>
                    {info.value === null || info.value === undefined ? '—' : String(info.value)}
                  </strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal "ID não encontrado" */}
      {showNotFoundModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setShowNotFoundModal(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 16, maxWidth: 460, width: '100%',
              padding: 28, boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
              textAlign: 'center',
            }}
          >
            <div style={{
              width: 56, height: 56,
              borderRadius: '50%',
              background: '#FEE2E2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <AlertCircle size={28} color="#DC2626" />
            </div>
            <h2 style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
              color: '#111827',
            }}>
              ID não encontrado
            </h2>
            <p style={{
              margin: '8px 0 20px',
              fontSize: 14,
              color: '#6B7280',
              lineHeight: 1.5,
            }}>
              O ID <strong style={{ color: '#111827' }}>"{inputValue}"</strong> não foi encontrado em nossa base.
              <br /><br />
              Por favor, verifique se o ID está correto. Se persistir, entre em contato com o <strong>suporte do sistema</strong>.
            </p>
            <button
              onClick={() => setShowNotFoundModal(false)}
              style={{
                width: '100%',
                padding: '12px 18px',
                background: '#3B82F6',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Entendi
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes spin { from { transform: translateY(-50%) rotate(0deg); } to { transform: translateY(-50%) rotate(360deg); } }
      `}</style>
    </>
  );
}
