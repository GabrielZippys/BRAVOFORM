'use client';

/**
 * WorkflowPublicLinkModal
 *
 * Modal compartilhado pelo canvas (toolbar) e pela listagem de workflows
 * (botão "Compartilhar" no card).
 *
 * Fluxo:
 *   1. Ao abrir: GET /api/dataconnect/workflows/public-token?workflowId=...
 *   2. Se não existe token: gera automaticamente (POST action=create)
 *   3. Exibe URL completa + botão "Copiar"
 *   4. Permite "Regenerar" (invalida o anterior) e "Revogar" (deleta)
 *   5. Alerta se workflow está inativo (link não funciona)
 */

import React, { useEffect, useState } from 'react';
import {
  X, Link2, Copy, RefreshCw, AlertCircle, CheckCircle2, ShieldAlert, Trash2,
} from 'lucide-react';
import { logger } from '@/lib/logger';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workflowId: string;
  workflowName?: string;
  currentUser: { id: string; name?: string; username?: string };
}

interface TokenInfo {
  publicToken: string | null;
  publicLinkEnabled: boolean;
  publicTokenCreatedAt: string | null;
  workflowIsActive: boolean;
  workflowName: string;
}

function buildPublicUrl(token: string): string {
  if (typeof window === 'undefined') return `/w/${token}`;
  return `${window.location.origin}/w/${token}`;
}

export default function WorkflowPublicLinkModal({
  isOpen, onClose, workflowId, workflowName, currentUser,
}: Props) {
  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'create' | 'regenerate' | 'revoke' | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/dataconnect/workflows/public-token?workflowId=${encodeURIComponent(workflowId)}`);
      const j = await r.json();
      if (!j.success) {
        setError(j.error || 'Erro ao carregar link');
        setLoading(false);
        return;
      }
      const t: TokenInfo = j.data;

      // Auto-cria token se não existir e o workflow está ativo
      if (!t.publicToken && t.workflowIsActive) {
        await handleAction('create', false);
        return; // handleAction recarrega
      }

      setInfo(t);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    load();
  }, [isOpen, workflowId]);

  const handleAction = async (action: 'create' | 'regenerate' | 'revoke', confirmFirst = true) => {
    if (confirmFirst) {
      const msg =
        action === 'regenerate'
          ? '⚠️ Gerar um NOVO link invalida o link anterior. Quem já recebeu o link antigo NÃO conseguirá mais acessar. Continuar?'
          : action === 'revoke'
          ? '⚠️ Revogar desativa permanentemente o link. Quem tiver o link não vai mais conseguir abrir. Continuar?'
          : '';
      if (msg && !confirm(msg)) return;
    }

    setBusy(action);
    setError(null);
    try {
      const init: RequestInit = action === 'revoke'
        ? { method: 'DELETE' }
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workflowId,
              action,
              performedBy: currentUser.id,
              performedByName: currentUser.name || currentUser.username,
            }),
          };
      const url = action === 'revoke'
        ? `/api/dataconnect/workflows/public-token?workflowId=${encodeURIComponent(workflowId)}&performedBy=${encodeURIComponent(currentUser.id)}`
        : `/api/dataconnect/workflows/public-token`;

      const r = await fetch(url, init);
      const j = await r.json();
      if (!j.success) {
        setError(j.error || 'Erro');
        return;
      }
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const handleCopy = async () => {
    if (!info?.publicToken) return;
    try {
      await navigator.clipboard.writeText(buildPublicUrl(info.publicToken));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      logger.warn('Clipboard write failed', { error: (e as Error).message });
    }
  };

  if (!isOpen) return null;

  const publicUrl = info?.publicToken ? buildPublicUrl(info.publicToken) : '';
  const isWorkflowAvailable = info?.workflowIsActive && info?.publicLinkEnabled;

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="public-link-title"
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
          maxWidth: 560,
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
        }}
      >
        {/* Header */}
        <header
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #E5E7EB',
            background: 'linear-gradient(135deg, #EFF6FF 0%, #F0F9FF 100%)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: '#3B82F6',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Link2 size={20} />
            </div>
            <div>
              <h2
                id="public-link-title"
                style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}
              >
                Link Público
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: '#6B7280' }}>
                {workflowName || info?.workflowName || 'Workflow'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#6B7280',
              padding: 6,
            }}
          >
            <X size={20} />
          </button>
        </header>

        {/* Body */}
        <div style={{ padding: 24, flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF' }}>
              <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
              <p style={{ marginTop: 12 }}>Carregando link…</p>
            </div>
          ) : error ? (
            <div
              role="alert"
              style={{
                padding: 14,
                background: '#FEE2E2',
                border: '1px solid #FECACA',
                borderRadius: 8,
                color: '#991B1B',
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                fontSize: 13,
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <strong>Erro ao carregar link</strong>
                <p style={{ margin: '4px 0 0' }}>{error}</p>
              </div>
            </div>
          ) : (
            <>
              {!info?.workflowIsActive && (
                <div
                  style={{
                    padding: 14,
                    background: '#FEF3C7',
                    border: '1px solid #FDE68A',
                    borderRadius: 8,
                    color: '#92400E',
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                    fontSize: 13,
                    marginBottom: 16,
                  }}
                >
                  <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <strong>Workflow desativado</strong>
                    <p style={{ margin: '4px 0 0' }}>
                      O link não vai funcionar até você ativar o workflow no botão "Ativo/Inativo".
                    </p>
                  </div>
                </div>
              )}

              {!info?.publicLinkEnabled && (
                <div
                  style={{
                    padding: 14,
                    background: '#FEE2E2',
                    border: '1px solid #FECACA',
                    borderRadius: 8,
                    color: '#991B1B',
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                    fontSize: 13,
                    marginBottom: 16,
                  }}
                >
                  <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <strong>Link revogado</strong>
                    <p style={{ margin: '4px 0 0' }}>
                      Gere um novo link clicando em "Gerar novo link" abaixo.
                    </p>
                  </div>
                </div>
              )}

              {/* URL Box */}
              {info?.publicToken && (
                <div style={{ marginBottom: 16 }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#374151',
                      marginBottom: 6,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  >
                    URL do link público
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="text"
                      value={publicUrl}
                      readOnly
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        border: '2px solid #D1D5DB',
                        borderRadius: 8,
                        fontSize: 13,
                        fontFamily: 'monospace',
                        color: '#111827',
                        background: '#F9FAFB',
                        outline: 'none',
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleCopy}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '10px 16px',
                        background: copied ? '#10B981' : '#3B82F6',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'background 150ms',
                      }}
                    >
                      {copied ? (
                        <>
                          <CheckCircle2 size={14} /> Copiado!
                        </>
                      ) : (
                        <>
                          <Copy size={14} /> Copiar
                        </>
                      )}
                    </button>
                  </div>
                  {info.publicTokenCreatedAt && (
                    <p style={{ margin: '6px 0 0', fontSize: 11, color: '#9CA3AF' }}>
                      Criado em {new Date(info.publicTokenCreatedAt).toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>
              )}

              {/* Como funciona */}
              <div
                style={{
                  background: '#F9FAFB',
                  border: '1px solid #E5E7EB',
                  borderRadius: 8,
                  padding: 14,
                  fontSize: 13,
                  color: '#4B5563',
                  marginBottom: 16,
                  lineHeight: 1.5,
                }}
              >
                <strong style={{ color: '#111827' }}>Como funciona:</strong>
                <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
                  <li>Compartilhe este link com os colaboradores</li>
                  <li>Eles abrem sem precisar de login</li>
                  <li>A primeira etapa valida a identidade pelo ID</li>
                  <li>Depois disso, executam as etapas restantes</li>
                </ul>
              </div>

              {/* Ações */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {info?.publicToken ? (
                  <>
                    <button
                      onClick={() => handleAction('regenerate')}
                      disabled={busy !== null}
                      style={{
                        flex: 1,
                        minWidth: 180,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        padding: '10px 14px',
                        background: '#fff',
                        color: '#D97706',
                        border: '1px solid #FCD34D',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: busy ? 'wait' : 'pointer',
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      {busy === 'regenerate' ? (
                        <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <RefreshCw size={14} />
                      )}
                      Gerar novo link
                    </button>
                    <button
                      onClick={() => handleAction('revoke')}
                      disabled={busy !== null}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        padding: '10px 14px',
                        background: '#fff',
                        color: '#DC2626',
                        border: '1px solid #FCA5A5',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: busy ? 'wait' : 'pointer',
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      <Trash2 size={14} /> Revogar link
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleAction('create', false)}
                    disabled={busy !== null || !info?.workflowIsActive}
                    style={{
                      flex: 1,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      padding: '12px 16px',
                      background: '#3B82F6',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: busy ? 'wait' : 'pointer',
                      opacity: busy || !info?.workflowIsActive ? 0.6 : 1,
                    }}
                  >
                    {busy === 'create' ? (
                      <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    ) : (
                      <Link2 size={14} />
                    )}
                    Gerar link público
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
