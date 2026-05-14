'use client';

/**
 * IdentityValidationStage
 *
 * Renderiza uma etapa "identity-validation" do workflow público.
 *
 * Fluxo:
 *   1. Se a etapa tem `lookupPreSelect.enabled = true`, o colaborador vê
 *      PRIMEIRO um dropdown manual (ex: "Selecione sua unidade") e clica
 *      "Continuar" para passar à etapa de campos.
 *   2. Renderiza os N campos de identidade. Os campos podem ser sobrescritos
 *      pela opção da pré-seleção escolhida.
 *   3. Bate todos → workflow avança automaticamente.
 *   4. Erra qualquer → tela "Acesso negado" definitiva.
 */

import React, { useMemo, useState } from 'react';
import { Loader2, AlertCircle, ShieldCheck, User, Lock, ArrowRight } from 'lucide-react';
import { logger } from '@/lib/logger';
import type { WorkflowStage } from '@/types';

interface Props {
  responseId: string;
  stage: WorkflowStage;
  onConfirmed?: (data: { nextStageId: string | null; identityLabel: string }) => void;
}

type Status = 'idle' | 'validating' | 'blocked' | 'error';
type Step = 'pre-select' | 'fields';

interface MatchField {
  column: string;
  label: string;
  placeholder?: string;
}

export default function IdentityValidationStage({ responseId, stage, onConfirmed }: Props) {
  const preSelect = stage.lookupPreSelect;
  const preSelectEnabled = !!preSelect?.enabled;
  const preSelectOptions = preSelect?.options || [];

  const [step, setStep] = useState<Step>(preSelectEnabled && preSelectOptions.length > 0 ? 'pre-select' : 'fields');
  const [preSelectValue, setPreSelectValue] = useState<string>('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Resolve a config efetiva: se há pré-seleção e o user escolheu uma option
  // que sobrescreve, usa o override; senão, usa o default da etapa.
  const resolvedFields: MatchField[] = useMemo(() => {
    let baseFields = stage.lookupMatchFields || [];
    if (preSelectEnabled && preSelectValue) {
      const opt = preSelectOptions.find((o) => o.value === preSelectValue);
      if (opt?.matchFields && opt.matchFields.length > 0) {
        baseFields = opt.matchFields as any;
      }
    }
    if (baseFields.length > 0) {
      return baseFields.map((f) => ({
        column: f.column,
        label: f.label || f.column,
        placeholder: f.placeholder,
      }));
    }
    if (stage.lookupSearchColumn) {
      return [{
        column: stage.lookupSearchColumn,
        label: stage.lookupInputLabel || stage.lookupSearchColumn,
        placeholder: stage.lookupInputPlaceholder,
      }];
    }
    return [];
  }, [stage, preSelectEnabled, preSelectValue, preSelectOptions]);

  const resolvedTable = useMemo(() => {
    if (preSelectEnabled && preSelectValue) {
      const opt = preSelectOptions.find((o) => o.value === preSelectValue);
      if (opt?.lookupTable) return opt.lookupTable;
    }
    return stage.lookupTable || '';
  }, [stage, preSelectEnabled, preSelectValue, preSelectOptions]);

  const isConfigured = !!resolvedTable && resolvedFields.length > 0;
  const allFilled = resolvedFields.every((f) => (values[f.column] || '').trim().length > 0);

  const setField = (col: string, v: string) => {
    setValues((p) => ({ ...p, [col]: v }));
    if (status === 'error') {
      setStatus('idle');
      setErrorMsg(null);
    }
  };

  const handleContinueFromPreSelect = () => {
    const required = preSelect?.required !== false;
    if (required && !preSelectValue) return;
    setValues({}); // limpa valores pra evitar resíduo entre opções
    setStep('fields');
  };

  const handleValidate = async () => {
    if (!isConfigured) {
      setStatus('error');
      setErrorMsg('Etapa não configurada. Contate o administrador.');
      return;
    }
    if (!allFilled) return;

    setStatus('validating');
    setErrorMsg(null);

    try {
      const inputs: Record<string, string> = {};
      for (const f of resolvedFields) inputs[f.column] = (values[f.column] || '').trim();

      const r = await fetch('/api/identity-validation/multi-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responseId,
          stageId: stage.id,
          inputs,
          preSelectValue: preSelectEnabled ? preSelectValue : undefined,
        }),
      });
      const j = await r.json();

      if (!j.success) {
        if (r.status === 404) {
          setStatus('blocked');
          setErrorMsg(j.error || 'Identidade não localizada — acesso negado.');
        } else {
          setStatus('error');
          setErrorMsg(j.error || 'Erro ao validar identidade.');
        }
        return;
      }

      onConfirmed?.({
        nextStageId: j.data?.nextStageId || null,
        identityLabel: j.data?.identityLabel || '',
      });
    } catch (e: any) {
      logger.error('Identity multi-check failed', e);
      setStatus('error');
      setErrorMsg('Erro de rede. Tente novamente.');
    }
  };

  const blocked = status === 'blocked';

  // ─── UI de barragem ──────────────────────────────────────────────────
  if (blocked) {
    return (
      <div
        role="alert"
        style={{
          maxWidth: 560,
          margin: '0 auto',
          padding: 36,
          background: '#fff',
          borderRadius: 16,
          border: '1px solid #FCA5A5',
          boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
          textAlign: 'center',
        }}
      >
        <div style={{
          width: 64, height: 64,
          borderRadius: '50%',
          background: '#FEE2E2',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 14,
        }}>
          <Lock size={32} color="#B91C1C" />
        </div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827' }}>
          Acesso negado
        </h1>
        <p style={{ margin: '10px 0 0', fontSize: 14, color: '#6B7280', lineHeight: 1.6 }}>
          {errorMsg}
          <br /><br />
          Verifique se preencheu os dados exatamente como cadastrados no sistema.
          Se persistir, entre em contato com o <strong>suporte</strong>.
        </p>
      </div>
    );
  }

  // ─── Tela 1: Pré-seleção ─────────────────────────────────────────────
  if (step === 'pre-select' && preSelectEnabled && preSelectOptions.length > 0) {
    const required = preSelect?.required !== false;
    const canContinue = !required || !!preSelectValue;
    return (
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
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 64, height: 64,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 12,
          }}>
            <User size={32} color="#1E40AF" />
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827' }}>
            {stage.name || 'Identifique-se'}
          </h1>
          {stage.description && (
            <p style={{ margin: '6px 0 0', fontSize: 14, color: '#6B7280', whiteSpace: 'pre-wrap' }}>
              {stage.description}
            </p>
          )}
        </div>

        <label
          htmlFor="pre-select-input"
          style={{
            display: 'block',
            fontSize: 13,
            fontWeight: 600,
            color: '#374151',
            marginBottom: 8,
          }}
        >
          {preSelect?.label || 'Selecione uma opção'}
          {required && <span style={{ color: '#EF4444', marginLeft: 4 }}>*</span>}
        </label>

        <select
          id="pre-select-input"
          value={preSelectValue}
          onChange={(e) => setPreSelectValue(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 14px',
            border: '2px solid #D1D5DB',
            borderRadius: 10,
            fontSize: 15,
            color: '#111827',
            background: '#fff',
            outline: 'none',
            boxSizing: 'border-box',
            cursor: 'pointer',
          }}
        >
          <option value="">{preSelect?.placeholder || 'Escolha uma opção...'}</option>
          {preSelectOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label || o.value}</option>
          ))}
        </select>

        <button
          type="button"
          onClick={handleContinueFromPreSelect}
          disabled={!canContinue}
          style={{
            marginTop: 20,
            width: '100%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '14px 20px',
            background: !canContinue
              ? '#9CA3AF'
              : 'linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%)',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 700,
            cursor: !canContinue ? 'not-allowed' : 'pointer',
            boxShadow: !canContinue ? 'none' : '0 4px 12px rgba(59,130,246,0.4)',
          }}
        >
          Continuar <ArrowRight size={16} />
        </button>
      </div>
    );
  }

  // ─── Tela 2: Campos de identidade ────────────────────────────────────
  return (
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
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{
          width: 64, height: 64,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 12,
        }}>
          <User size={32} color="#1E40AF" />
        </div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827' }}>
          {stage.name || 'Identifique-se'}
        </h1>
        {stage.description && (
          <p style={{ margin: '6px 0 0', fontSize: 14, color: '#6B7280', whiteSpace: 'pre-wrap' }}>
            {stage.description}
          </p>
        )}
        {preSelectEnabled && preSelectValue && (
          <p style={{
            margin: '10px auto 0',
            display: 'inline-block',
            padding: '4px 10px',
            background: '#EFF6FF',
            color: '#1E40AF',
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 999,
          }}>
            {preSelect?.label}: <strong>{preSelectOptions.find((o) => o.value === preSelectValue)?.label || preSelectValue}</strong>
            <button
              type="button"
              onClick={() => setStep('pre-select')}
              style={{
                marginLeft: 8,
                background: 'transparent', border: 'none',
                color: '#1E40AF',
                fontSize: 11, fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              alterar
            </button>
          </p>
        )}
        {resolvedFields.length > 1 && (
          <p style={{
            margin: '14px auto 0',
            display: 'inline-block',
            padding: '4px 10px',
            background: '#FEF3C7',
            color: '#92400E',
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 999,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}>
            Identificação reforçada — {resolvedFields.length} campos obrigatórios
          </p>
        )}
      </div>

      {!isConfigured ? (
        <div style={{
          padding: 14,
          background: '#FEE2E2',
          border: '1px solid #FCA5A5',
          borderRadius: 8,
          fontSize: 13,
          color: '#991B1B',
        }}>
          <AlertCircle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
          Etapa não configurada pelo administrador.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16 }}>
            {resolvedFields.map((f, i) => (
              <div key={f.column}>
                <label
                  htmlFor={`id-field-${f.column}`}
                  style={{
                    display: 'block',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#374151',
                    marginBottom: 6,
                  }}
                >
                  {f.label}
                  <span style={{ color: '#EF4444', marginLeft: 4 }}>*</span>
                </label>
                <input
                  id={`id-field-${f.column}`}
                  type="text"
                  value={values[f.column] || ''}
                  onChange={(e) => setField(f.column, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && allFilled && status !== 'validating') {
                      e.preventDefault();
                      handleValidate();
                    }
                  }}
                  placeholder={f.placeholder || ''}
                  disabled={status === 'validating'}
                  autoFocus={i === 0}
                  autoComplete="off"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    border: `2px solid ${status === 'error' ? '#FCA5A5' : '#D1D5DB'}`,
                    borderRadius: 10,
                    fontSize: 15,
                    color: '#111827',
                    background: '#fff',
                    outline: 'none',
                    transition: 'border-color 150ms',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            ))}
          </div>

          {errorMsg && status === 'error' && (
            <div
              role="alert"
              style={{
                marginBottom: 14,
                padding: 10,
                background: '#FEE2E2',
                border: '1px solid #FECACA',
                borderRadius: 8,
                fontSize: 13,
                color: '#991B1B',
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
              }}
            >
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              {errorMsg}
            </div>
          )}

          <button
            type="button"
            onClick={handleValidate}
            disabled={!allFilled || status === 'validating'}
            style={{
              width: '100%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '14px 20px',
              background: (!allFilled || status === 'validating')
                ? '#9CA3AF'
                : 'linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%)',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 700,
              cursor: (!allFilled || status === 'validating') ? 'not-allowed' : 'pointer',
              boxShadow: (!allFilled || status === 'validating') ? 'none' : '0 4px 12px rgba(59,130,246,0.4)',
            }}
          >
            {status === 'validating' ? (
              <>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                Validando…
              </>
            ) : (
              <>
                <ShieldCheck size={16} />
                Validar identidade
              </>
            )}
          </button>

          <p style={{
            margin: '12px 0 0',
            fontSize: 11,
            color: '#9CA3AF',
            textAlign: 'center',
            lineHeight: 1.5,
          }}>
            {resolvedFields.length === 1
              ? 'Preencha o campo acima para continuar.'
              : `Todos os ${resolvedFields.length} campos precisam estar corretos para prosseguir.`}
          </p>
        </>
      )}

      <style jsx>{`
        @keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
