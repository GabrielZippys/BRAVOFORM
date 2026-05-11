'use client';

/**
 * IdentityValidationStage
 *
 * Renderiza uma etapa do tipo "identity-validation" para o colaborador
 * em workflow sem login.
 *
 * Fluxo:
 *   1. Colaborador vê título da etapa + label customizado
 *   2. Digita seu ID/matrícula no input
 *   3. Clica em "Buscar"
 *   4. Se encontrar → mostra card com dados + 2 botões:
 *        ✓ "Sou eu, prosseguir"  → confirma e avança workflow
 *        ✗ "Não sou eu"          → limpa e permite buscar de novo
 *   5. Se não encontrar → modal "ID não encontrado, contate o suporte"
 *
 * Quando o usuário confirma, chama POST /api/identity-validation/confirm
 * que persiste a identidade e avança a etapa do workflow.
 */

import React, { useState } from 'react';
import { Search, Loader2, CheckCircle2, AlertCircle, ArrowRight, X, User } from 'lucide-react';
import { logger } from '@/lib/logger';
import type { WorkflowStage } from '@/types';

interface Props {
  /** Instância do workflow (firebase_id) — para registro */
  responseId: string;
  /** Stage atual com as configs de lookup */
  stage: WorkflowStage;
  /** Callback após confirmação (workflow avançou) */
  onConfirmed?: (data: { nextStageId: string | null; identityLabel: string }) => void;
}

type Status = 'idle' | 'searching' | 'match' | 'no-match' | 'error' | 'confirming';

export default function IdentityValidationStage({ responseId, stage, onConfirmed }: Props) {
  const [inputValue, setInputValue] = useState('');
  const [resolved, setResolved] = useState<Record<string, { value: any; label: string }> | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showNotFoundModal, setShowNotFoundModal] = useState(false);

  const cfg = {
    table: stage.lookupTable || '',
    searchColumn: stage.lookupSearchColumn || '',
    displayColumns: stage.lookupDisplayColumns || [],
    inputLabel: stage.lookupInputLabel || 'Digite seu identificador',
    inputPlaceholder: stage.lookupInputPlaceholder || 'Ex: matrícula, CPF, código...',
    confirmText: stage.lookupConfirmText || 'Sou eu, prosseguir',
    requireMatch: stage.lookupRequireMatch ?? true,
  };

  const isConfigured = !!(cfg.table && cfg.searchColumn && cfg.displayColumns.length > 0);

  // Label amigável: junta os 2 primeiros valores resolvidos com hífen
  const computeLabel = (data: Record<string, { value: any; label: string }>) => {
    const vals = Object.values(data).slice(0, 2).map((d) => d.value).filter(Boolean);
    return vals.join(' — ') || inputValue.trim();
  };

  const handleSearch = async () => {
    const v = inputValue.trim();
    if (!v) return;
    if (!isConfigured) {
      setStatus('error');
      setErrorMsg('Etapa não configurada. Contate o administrador.');
      return;
    }

    setStatus('searching');
    setErrorMsg(null);

    try {
      const params = new URLSearchParams({
        table: cfg.table,
        searchColumn: cfg.searchColumn,
        value: v,
        displayColumns: cfg.displayColumns.map((d) => d.column).join(','),
        displayLabels: cfg.displayColumns.map((d) => d.label || d.column).join(','),
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
        setShowNotFoundModal(true);
        return;
      }

      setResolved(j.data);
      setStatus('match');
    } catch (e: any) {
      logger.error('Identity lookup failed', e);
      setStatus('error');
      setErrorMsg('Erro de rede. Tente novamente.');
    }
  };

  const handleConfirm = async () => {
    if (!resolved) return;
    setStatus('confirming');
    setErrorMsg(null);
    try {
      const r = await fetch('/api/identity-validation/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responseId,
          stageId: stage.id,
          inputValue: inputValue.trim(),
          resolved,
          label: computeLabel(resolved),
        }),
      });
      const j = await r.json();
      if (!j.success) {
        setStatus('error');
        setErrorMsg(j.error || 'Erro ao confirmar identidade');
        return;
      }
      onConfirmed?.({
        nextStageId: j.data?.nextStageId || null,
        identityLabel: computeLabel(resolved),
      });
    } catch (e: any) {
      logger.error('Identity confirm failed', e);
      setStatus('error');
      setErrorMsg('Erro de rede. Tente novamente.');
    }
  };

  const handleRetry = () => {
    setInputValue('');
    setResolved(null);
    setStatus('idle');
    setErrorMsg(null);
  };

  return (
    <>
      <div
        style={{
          maxWidth: 560,
          margin: '0 auto',
          padding: 28,
          background: '#fff',
          borderRadius: 16,
          border: '1px solid #E5E7EB',
          boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
        }}
      >
        {/* Cabeçalho */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
            }}
          >
            <User size={32} color="#1E40AF" />
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              color: '#111827',
            }}
          >
            {stage.name || 'Identifique-se'}
          </h1>
          {stage.description && (
            <p style={{ margin: '6px 0 0', fontSize: 14, color: '#6B7280' }}>
              {stage.description}
            </p>
          )}
        </div>

        {/* Input + botão buscar */}
        <div style={{ marginBottom: 14 }}>
          <label
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 600,
              color: '#374151',
              marginBottom: 6,
            }}
          >
            {cfg.inputLabel}
            {cfg.requireMatch && <span style={{ color: '#EF4444', marginLeft: 4 }}>*</span>}
          </label>

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                if (resolved) {
                  setResolved(null);
                  setStatus('idle');
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && status === 'idle') {
                  e.preventDefault();
                  handleSearch();
                }
              }}
              placeholder={cfg.inputPlaceholder}
              disabled={status === 'searching' || status === 'confirming' || status === 'match'}
              autoFocus
              style={{
                flex: 1,
                padding: '12px 14px',
                border: `2px solid ${
                  status === 'match' ? '#10B981' :
                  status === 'error' || status === 'no-match' ? '#EF4444' :
                  '#D1D5DB'
                }`,
                borderRadius: 10,
                fontSize: 16,
                color: '#111827',
                background: status === 'match' ? '#F0FDF4' : '#fff',
                outline: 'none',
                transition: 'border-color 150ms',
              }}
            />
            {status !== 'match' && (
              <button
                type="button"
                onClick={handleSearch}
                disabled={!inputValue.trim() || status === 'searching'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '12px 20px',
                  background: !inputValue.trim() || status === 'searching' ? '#9CA3AF' : '#3B82F6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: !inputValue.trim() || status === 'searching' ? 'not-allowed' : 'pointer',
                }}
              >
                {status === 'searching' ? (
                  <>
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    Buscando…
                  </>
                ) : (
                  <>
                    <Search size={16} />
                    Buscar
                  </>
                )}
              </button>
            )}
          </div>

          {errorMsg && (status === 'error') && (
            <div
              role="alert"
              style={{
                marginTop: 10,
                padding: 10,
                background: '#FEE2E2',
                border: '1px solid #FECACA',
                borderRadius: 6,
                fontSize: 13,
                color: '#991B1B',
                display: 'flex',
                gap: 6,
                alignItems: 'flex-start',
              }}
            >
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              {errorMsg}
            </div>
          )}
        </div>

        {/* Card de dados encontrados */}
        {resolved && (
          <div
            style={{
              background: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderLeft: '4px solid #10B981',
              borderRadius: 10,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 700,
                color: '#047857',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 10,
              }}
            >
              <CheckCircle2 size={14} /> Identificação encontrada
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {Object.entries(resolved).map(([col, info]) => (
                <div key={col} style={{ display: 'flex', gap: 10, fontSize: 14 }}>
                  <span style={{ minWidth: 120, color: '#047857', fontWeight: 500 }}>
                    {info.label}:
                  </span>
                  <strong style={{ color: '#111827' }}>
                    {info.value === null || info.value === undefined ? '—' : String(info.value)}
                  </strong>
                </div>
              ))}
            </div>

            <p
              style={{
                margin: '14px 0 0',
                fontSize: 13,
                color: '#065F46',
                fontStyle: 'italic',
                textAlign: 'center',
              }}
            >
              Confirme se essas são as suas informações
            </p>
          </div>
        )}

        {/* Botões de confirmação */}
        {resolved && status === 'match' && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={handleRetry}
              style={{
                flex: 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '12px 18px',
                background: 'transparent',
                color: '#6B7280',
                border: '1px solid #D1D5DB',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <X size={14} /> Não sou eu
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={status === 'confirming'}
              style={{
                flex: 2,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '12px 18px',
                background: status === 'confirming'
                  ? '#9CA3AF'
                  : 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 700,
                cursor: status === 'confirming' ? 'wait' : 'pointer',
                boxShadow: status === 'confirming' ? 'none' : '0 4px 12px rgba(16,185,129,0.3)',
              }}
            >
              {status === 'confirming' ? (
                <>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  Confirmando…
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  {cfg.confirmText}
                  <ArrowRight size={16} />
                </>
              )}
            </button>
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
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 16,
              maxWidth: 460,
              width: '100%',
              padding: 28,
              boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: '#FEE2E2',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <AlertCircle size={28} color="#DC2626" />
            </div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}>
              ID não encontrado
            </h2>
            <p style={{ margin: '8px 0 20px', fontSize: 14, color: '#6B7280', lineHeight: 1.5 }}>
              O ID <strong style={{ color: '#111827' }}>"{inputValue}"</strong> não foi encontrado em nossa base.
              <br /><br />
              Verifique se digitou corretamente. Se persistir, entre em contato com o{' '}
              <strong>suporte do sistema</strong>.
            </p>
            <button
              onClick={() => setShowNotFoundModal(false)}
              style={{
                width: '100%',
                padding: '12px 18px',
                background: '#3B82F6',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
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

      <style jsx>{`@keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
