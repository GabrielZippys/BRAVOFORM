'use client';

/**
 * WorkflowAIGenerator
 *
 * Modal que recebe uma descrição em português brasileiro do processo
 * e usa a IA (GPT-4o-mini via /api/ai/generate-workflow) para gerar
 * etapas BravoFlow estruturadas.
 *
 * Fluxo:
 *   1. Admin descreve em pt-BR ("fluxo de retirada de qualidade com aprovação...")
 *   2. Click em "Gerar com IA" → POST para /api/ai/generate-workflow
 *   3. Mostra preview lateral com stages numeradas + reasoning
 *   4. Admin pode "Aplicar" (substitui canvas) ou "Refinar" (edita descrição e regenera)
 *
 * Diferencial vs concorrentes globais:
 *   - System prompt calibrado em vocabulário operacional brasileiro
 *   - Sugere papéis BravoFlow (AprovadorQualidade, Roteirizador, etc.)
 *   - Detecta termos como "retirada", "boletim", "NF" e aplica tipos corretos
 */

import React, { useState } from 'react';
import { X, Sparkles, ArrowRight, RefreshCw, AlertCircle, Lightbulb } from 'lucide-react';
import { getStageTypeDefinition } from '@/utils/stageTypes';
import { logger } from '@/lib/logger';
import type { WorkflowStage } from '@/types';

interface AIResult {
  suggestedName: string;
  suggestedDescription: string;
  reasoning: string;
  stages: WorkflowStage[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Aplica as etapas geradas no canvas */
  onApply: (stages: WorkflowStage[], suggestedName?: string) => void;
  /** Avisa que vai sobrescrever etapas existentes */
  willOverwrite?: boolean;
  /** Contexto opcional: nome da empresa, departamentos */
  context?: {
    companyName?: string;
    companyDepartments?: string[];
  };
}

const EXAMPLES = [
  'Fluxo de retirada de qualidade com aprovação do supervisor, roteirização e marcação de retirada — escalar para gerente se demorar mais de 2h.',
  'Pedido de compra: solicitante abre, comprador cota com 3 fornecedores, financeiro aprova acima de R$ 5.000, recebimento confere e registra NF.',
  'Aprovação de férias: colaborador solicita, líder aprova, RH valida saldo e formaliza no sistema.',
  'Reclamação de cliente: registro com anexo, triagem do supervisor, ação corretiva, retorno ao cliente em até 48h.',
];

export default function WorkflowAIGenerator({
  isOpen,
  onClose,
  onApply,
  willOverwrite,
  context,
}: Props) {
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AIResult | null>(null);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (description.trim().length < 10) {
      setError('Descreva o processo com pelo menos 10 caracteres.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/ai/generate-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim(), context }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'Falha ao gerar workflow.');
        logger.warn('AI Generator falhou', { error: json.error });
      } else {
        setResult(json.data);
        logger.info('AI Generator gerou workflow', { stages: json.data.stages.length });
      }
    } catch (e: any) {
      setError(`Erro de rede: ${e?.message || 'desconhecido'}`);
      logger.error('AI Generator network error', e);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!result) return;
    onApply(result.stages, result.suggestedName);
    onClose();
    setResult(null);
    setDescription('');
  };

  const handleClose = () => {
    setResult(null);
    setError(null);
    setDescription('');
    onClose();
  };

  return (
    <div
      onClick={handleClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--surface-overlay)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-6)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface-card)',
          borderRadius: 'var(--radius-2xl)',
          maxWidth: 980,
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: 'var(--space-5) var(--space-6)',
            background:
              'linear-gradient(135deg, var(--color-brand-50) 0%, var(--color-info-50) 100%)',
            borderBottom: '1px solid var(--color-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 'var(--radius-lg)',
                background:
                  'linear-gradient(135deg, var(--color-brand-500) 0%, #8B5CF6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={22} color="#fff" />
            </div>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 'var(--font-size-xl)',
                  fontWeight: 'var(--font-weight-bold)',
                  color: 'var(--color-text-primary)',
                }}
              >
                Gerar workflow com IA
              </h2>
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                Descreva seu processo em português — nós montamos as etapas pra você
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            aria-label="Fechar"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 'var(--space-2)',
              color: 'var(--color-text-secondary)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <X size={22} />
          </button>
        </div>

        {/* Aviso sobrescrita */}
        {willOverwrite && (
          <div
            style={{
              padding: 'var(--space-3) var(--space-6)',
              background: 'var(--color-warning-50)',
              borderBottom: '1px solid var(--color-warning-100)',
              color: 'var(--color-warning-700)',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 'var(--font-weight-medium)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
            }}
          >
            <AlertCircle size={16} />
            Aplicar substituirá todas as etapas atuais do canvas.
          </div>
        )}

        {/* Body — split: input à esquerda, preview à direita */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Coluna esquerda: Input */}
          <div
            style={{
              flex: result ? 1 : 1.2,
              padding: 'var(--space-6)',
              overflowY: 'auto',
              borderRight: result ? '1px solid var(--color-border-subtle)' : 'none',
            }}
          >
            <label
              style={{
                display: 'block',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 'var(--font-weight-semibold)',
                color: 'var(--color-text-primary)',
                marginBottom: 'var(--space-2)',
              }}
            >
              Descreva seu processo
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Fluxo de retirada de qualidade com aprovação do supervisor, roteirização e marcação de retirada. Se demorar mais de 2 horas, escalar para o gerente."
              rows={8}
              style={{
                width: '100%',
                padding: 'var(--space-3)',
                border: '2px solid var(--color-border-default)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--font-size-sm)',
                fontFamily: 'inherit',
                color: 'var(--color-text-primary)',
                background: 'var(--surface-card)',
                resize: 'vertical',
                lineHeight: 'var(--line-height-relaxed)',
                outline: 'none',
                transition: 'border-color var(--duration-fast) var(--ease-in-out)',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-brand-500)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border-default)')}
              maxLength={2000}
              disabled={loading}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-tertiary)',
                marginTop: 'var(--space-1)',
              }}
            >
              <span>{description.length} / 2000 caracteres</span>
              <span>Mínimo: 10 caracteres</span>
            </div>

            {/* Erro */}
            {error && (
              <div
                role="alert"
                style={{
                  marginTop: 'var(--space-3)',
                  padding: 'var(--space-3)',
                  background: 'var(--color-danger-50)',
                  border: '1px solid var(--color-danger-100)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-danger-700)',
                  fontSize: 'var(--font-size-sm)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 'var(--space-2)',
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{error}</span>
              </div>
            )}

            {/* Botão gerar */}
            <button
              onClick={handleGenerate}
              disabled={loading || description.trim().length < 10}
              style={{
                marginTop: 'var(--space-4)',
                width: '100%',
                padding: 'var(--space-3)',
                background: loading
                  ? 'var(--color-gray-400)'
                  : 'linear-gradient(135deg, var(--color-brand-500) 0%, #8B5CF6 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 'var(--font-weight-semibold)',
                cursor: loading ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--space-2)',
                boxShadow: 'var(--shadow-md)',
                transition: 'transform var(--duration-fast) var(--ease-out)',
              }}
              onMouseEnter={(e) =>
                !loading && (e.currentTarget.style.transform = 'translateY(-1px)')
              }
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
            >
              {loading ? (
                <>
                  <RefreshCw size={18} className="spin" />
                  Gerando…
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  {result ? 'Refazer com IA' : 'Gerar com IA'}
                </>
              )}
            </button>

            {/* Exemplos */}
            {!result && (
              <div style={{ marginTop: 'var(--space-6)' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    marginBottom: 'var(--space-3)',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 'var(--font-weight-semibold)',
                    color: 'var(--color-text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  <Lightbulb size={14} />
                  Inspire-se nestes exemplos
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {EXAMPLES.map((ex, i) => (
                    <button
                      key={i}
                      onClick={() => setDescription(ex)}
                      style={{
                        textAlign: 'left',
                        padding: 'var(--space-3)',
                        background: 'var(--surface-page)',
                        border: '1px solid var(--color-border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--color-text-secondary)',
                        lineHeight: 'var(--line-height-relaxed)',
                        transition: 'all var(--duration-fast) var(--ease-in-out)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-brand-300)';
                        e.currentTarget.style.background = 'var(--color-brand-50)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-border-subtle)';
                        e.currentTarget.style.background = 'var(--surface-page)';
                      }}
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Coluna direita: Preview do resultado */}
          {result && (
            <div
              style={{
                flex: 1.2,
                padding: 'var(--space-6)',
                overflowY: 'auto',
                background: 'var(--surface-page)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-4)',
              }}
            >
              {/* Nome sugerido */}
              <div
                style={{
                  background: 'var(--surface-card)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-4)',
                }}
              >
                <div
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 'var(--font-weight-semibold)',
                    color: 'var(--color-text-tertiary)',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    marginBottom: 'var(--space-1)',
                  }}
                >
                  Nome sugerido
                </div>
                <div
                  style={{
                    fontSize: 'var(--font-size-base)',
                    fontWeight: 'var(--font-weight-bold)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {result.suggestedName}
                </div>
                {result.suggestedDescription && (
                  <div
                    style={{
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--color-text-secondary)',
                      marginTop: 'var(--space-2)',
                      lineHeight: 'var(--line-height-relaxed)',
                    }}
                  >
                    {result.suggestedDescription}
                  </div>
                )}
              </div>

              {/* Reasoning da IA */}
              {result.reasoning && (
                <div
                  style={{
                    background: 'var(--color-info-50)',
                    border: '1px solid var(--color-info-100)',
                    borderLeft: '4px solid var(--color-info-500)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-3)',
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-info-700)',
                    lineHeight: 'var(--line-height-relaxed)',
                  }}
                >
                  <strong>💡 Lógica da IA:</strong> {result.reasoning}
                </div>
              )}

              {/* Etapas geradas */}
              <div>
                <div
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 'var(--font-weight-semibold)',
                    color: 'var(--color-text-tertiary)',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    marginBottom: 'var(--space-2)',
                  }}
                >
                  Etapas geradas ({result.stages.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {result.stages.map((stage, idx) => {
                    const def = getStageTypeDefinition(stage.stageType);
                    const isFirst = idx === 0;
                    const isLast = idx === result.stages.length - 1;
                    return (
                      <div
                        key={stage.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--space-3)',
                          padding: 'var(--space-3)',
                          background: 'var(--surface-card)',
                          border: '1px solid var(--color-border-subtle)',
                          borderLeft: `4px solid ${stage.color}`,
                          borderRadius: 'var(--radius-md)',
                        }}
                      >
                        <span
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 'var(--radius-full)',
                            background: isFirst
                              ? 'var(--color-success-500)'
                              : isLast
                              ? 'var(--color-brand-500)'
                              : 'var(--color-gray-500)',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 'var(--font-size-xs)',
                            fontWeight: 'var(--font-weight-bold)',
                            flexShrink: 0,
                          }}
                        >
                          {idx + 1}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 'var(--space-1)',
                              flexWrap: 'wrap',
                            }}
                          >
                            <span style={{ fontSize: 16 }}>{def.icon}</span>
                            <strong
                              style={{
                                fontSize: 'var(--font-size-sm)',
                                color: 'var(--color-text-primary)',
                              }}
                            >
                              {stage.name}
                            </strong>
                            {isFirst && (
                              <span
                                style={{
                                  background: 'var(--color-success-100)',
                                  color: 'var(--color-success-700)',
                                  fontSize: 9,
                                  padding: '1px 6px',
                                  borderRadius: 'var(--radius-full)',
                                  fontWeight: 'var(--font-weight-bold)',
                                }}
                              >
                                INÍCIO
                              </span>
                            )}
                            {isLast && (
                              <span
                                style={{
                                  background: 'var(--color-brand-100)',
                                  color: 'var(--color-brand-700)',
                                  fontSize: 9,
                                  padding: '1px 6px',
                                  borderRadius: 'var(--radius-full)',
                                  fontWeight: 'var(--font-weight-bold)',
                                }}
                              >
                                FIM
                              </span>
                            )}
                            {(stage as any).suggestedRole && (
                              <span
                                style={{
                                  background: 'var(--color-gray-100)',
                                  color: 'var(--color-gray-700)',
                                  fontSize: 10,
                                  padding: '1px 6px',
                                  borderRadius: 'var(--radius-full)',
                                  fontWeight: 'var(--font-weight-medium)',
                                }}
                              >
                                {(stage as any).suggestedRole}
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: 'var(--font-size-xs)',
                              color: 'var(--color-text-secondary)',
                            }}
                          >
                            {def.label}
                            {stage.description ? ` · ${stage.description}` : ''}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Aplicar */}
              <button
                onClick={handleApply}
                style={{
                  marginTop: 'auto',
                  padding: 'var(--space-3) var(--space-4)',
                  background: 'var(--color-success-500)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: 'var(--font-weight-semibold)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 'var(--space-2)',
                  boxShadow: 'var(--shadow-sm)',
                  transition: 'background var(--duration-fast) var(--ease-in-out)',
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = 'var(--color-success-600)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = 'var(--color-success-500)')
                }
              >
                Aplicar este workflow no canvas <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>

        <style jsx>{`
          .spin {
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}
