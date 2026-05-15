'use client';

/**
 * /w/[token]
 *
 * Página pública (SEM autenticação) que renderiza um workflow para o
 * colaborador executar.
 *
 * Fluxo:
 *   1. Página carrega → GET /api/public/workflow/[token] (retorna stages[])
 *   2. Verifica em localStorage se há instância pendente desse token
 *   3. Se NÃO há → mostra tela inicial com botão "Começar"
 *   4. Clica "Começar" → POST /start → recebe responseId + currentStageId
 *   5. Renderiza a etapa atual com base em currentStageId + stages[]
 *   6. Cada etapa avança chamando /advance-stage ou /identity-validation/confirm
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowRight, Loader2, AlertCircle, RefreshCw,
  Workflow as WorkflowIcon, CheckCircle2, XCircle, FileText, Play,
} from 'lucide-react';
import IdentityValidationStage from '@/components/IdentityValidationStage';
import ExecutionFormStage from '@/components/ExecutionFormStage';
import type { WorkflowStage } from '@/types';
import { logger } from '@/lib/logger';

interface PublicStage extends WorkflowStage {
  stageType: string;
}

interface PublicWorkflowData {
  workflowId: string;
  workflowName: string;
  workflowDescription: string;
  firstStage: PublicStage;
  stages: PublicStage[];
}

type PageState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; workflow: PublicWorkflowData }
  | { kind: 'started'; workflow: PublicWorkflowData; responseId: string; currentStageId: string; identityLabel?: string }
  | { kind: 'completed'; reason?: 'approved' | 'rejected' };

export default function PublicWorkflowPage() {
  const params = useParams();
  const token = String(params?.token || '');

  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const [startingInstance, setStartingInstance] = useState(false);

  const storageKey = `bravoform_workflow_${token}`;

  const loadWorkflow = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const r = await fetch(`/api/public/workflow/${encodeURIComponent(token)}`);
      const j = await r.json();
      if (!j.success) {
        setState({ kind: 'error', message: j.error || 'Erro ao carregar workflow' });
        return;
      }

      const wf = j.data as PublicWorkflowData;

      // Retoma instância anterior se existir
      try {
        const saved = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null;
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.responseId && parsed?.currentStageId) {
            setState({
              kind: 'started',
              workflow: wf,
              responseId: parsed.responseId,
              currentStageId: parsed.currentStageId,
              identityLabel: parsed.identityLabel,
            });
            return;
          }
        }
      } catch (e) { /* ignora */ }

      setState({ kind: 'ready', workflow: wf });
    } catch (e: any) {
      logger.error('Failed to load public workflow', e, { token: token.slice(0, 8) });
      setState({ kind: 'error', message: 'Falha de rede. Verifique sua conexão e tente novamente.' });
    }
  }, [token, storageKey]);

  useEffect(() => {
    if (!token) return;
    loadWorkflow();
  }, [token, loadWorkflow]);

  const handleStart = async () => {
    if (state.kind !== 'ready') return;
    setStartingInstance(true);
    try {
      const r = await fetch(`/api/public/workflow/${encodeURIComponent(token)}/start`, {
        method: 'POST',
      });
      const j = await r.json();
      if (!j.success) {
        setState({ kind: 'error', message: j.error || 'Erro ao iniciar workflow' });
        return;
      }
      const responseId = j.data.responseId;
      const currentStageId = j.data.currentStageId;

      try {
        localStorage.setItem(storageKey, JSON.stringify({ responseId, currentStageId }));
      } catch {}

      setState({
        kind: 'started',
        workflow: state.workflow,
        responseId,
        currentStageId,
      });
    } catch (e: any) {
      logger.error('Failed to start workflow', e);
      setState({ kind: 'error', message: 'Falha de rede. Tente novamente.' });
    } finally {
      setStartingInstance(false);
    }
  };

  const persistStarted = (next: { responseId: string; currentStageId: string; identityLabel?: string }) => {
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
  };

  const clearStored = () => {
    try { localStorage.removeItem(storageKey); } catch {}
  };

  const handleIdentityConfirmed = (data: { nextStageId: string | null; identityLabel: string }) => {
    if (state.kind !== 'started') return;
    if (!data.nextStageId) {
      clearStored();
      setState({ kind: 'completed' });
      return;
    }
    persistStarted({
      responseId: state.responseId,
      currentStageId: data.nextStageId,
      identityLabel: data.identityLabel,
    });
    setState({
      kind: 'started',
      workflow: state.workflow,
      responseId: state.responseId,
      currentStageId: data.nextStageId,
      identityLabel: data.identityLabel,
    });
  };

  const handleStageAdvanced = (result: { nextStageId: string | null; completed: boolean; rejected?: boolean }) => {
    if (state.kind !== 'started') return;
    if (result.completed || !result.nextStageId) {
      clearStored();
      setState({ kind: 'completed', reason: result.rejected ? 'rejected' : 'approved' });
      return;
    }
    persistStarted({
      responseId: state.responseId,
      currentStageId: result.nextStageId,
      identityLabel: state.identityLabel,
    });
    setState({
      kind: 'started',
      workflow: state.workflow,
      responseId: state.responseId,
      currentStageId: result.nextStageId,
      identityLabel: state.identityLabel,
    });
  };

  const currentStage = useMemo(() => {
    if (state.kind !== 'started') return null;
    return state.workflow.stages.find((s) => s.id === state.currentStageId) || null;
  }, [state]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #F0F9FF 0%, #DBEAFE 100%)',
        padding: 'var(--space-6)',
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto', paddingTop: 40 }}>
        <header style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 16px',
              background: '#fff',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              color: '#1E40AF',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            <WorkflowIcon size={16} /> BravoFlow
          </div>
        </header>

        {state.kind === 'loading' && (
          <div style={{
            textAlign: 'center',
            padding: 60,
            background: '#fff',
            borderRadius: 16,
            color: '#6B7280',
          }}>
            <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: '#3B82F6' }} />
            <p style={{ marginTop: 16, fontSize: 14 }}>Carregando workflow…</p>
          </div>
        )}

        {state.kind === 'error' && (
          <ErrorView message={state.message} onRetry={loadWorkflow} />
        )}

        {state.kind === 'ready' && (
          <ReadyView
            workflow={state.workflow}
            onStart={handleStart}
            starting={startingInstance}
          />
        )}

        {state.kind === 'started' && currentStage && (
          <StageRenderer
            token={token}
            stage={currentStage}
            responseId={state.responseId}
            identityLabel={state.identityLabel}
            onIdentityConfirmed={handleIdentityConfirmed}
            onStageAdvanced={handleStageAdvanced}
          />
        )}

        {state.kind === 'started' && !currentStage && (
          <ErrorView
            message="Etapa atual não encontrada. O workflow pode ter sido reconfigurado."
            onRetry={() => {
              clearStored();
              loadWorkflow();
            }}
          />
        )}

        {state.kind === 'completed' && <CompletedView reason={state.reason} />}
      </div>

      <style jsx>{`
        @keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ─── StageRenderer: roteador de tipos ───────────────────────────────────

function StageRenderer({
  token,
  stage,
  responseId,
  identityLabel,
  onIdentityConfirmed,
  onStageAdvanced,
}: {
  token: string;
  stage: PublicStage;
  responseId: string;
  identityLabel?: string;
  onIdentityConfirmed: (data: { nextStageId: string | null; identityLabel: string }) => void;
  onStageAdvanced: (result: { nextStageId: string | null; completed: boolean; rejected?: boolean }) => void;
}) {
  switch (stage.stageType) {
    case 'identity-validation':
      return (
        <IdentityValidationStage
          responseId={responseId}
          stage={stage as WorkflowStage}
          onConfirmed={onIdentityConfirmed}
        />
      );
    case 'documentation':
      return (
        <DocumentationStage
          token={token}
          responseId={responseId}
          stage={stage}
          identityLabel={identityLabel}
          onAdvanced={onStageAdvanced}
        />
      );
    case 'approval':
      return (
        <ApprovalStage
          token={token}
          responseId={responseId}
          stage={stage}
          identityLabel={identityLabel}
          onAdvanced={onStageAdvanced}
        />
      );
    case 'execution':
    case 'custom':
    case 'review': {
      // Se tem formulário customizado configurado, renderiza o builder rico
      const exForm = (stage as any).executionForm;
      if (exForm && exForm.enabled && Array.isArray(exForm.fields) && exForm.fields.length > 0) {
        return (
          <ExecutionFormStage
            token={token}
            responseId={responseId}
            stage={stage}
            onSubmitted={(r) => onStageAdvanced({ ...r })}
          />
        );
      }
      // Senão, fallback pra ExecutionStage simples (textarea + concluir)
      return (
        <ExecutionStage
          token={token}
          responseId={responseId}
          stage={stage}
          identityLabel={identityLabel}
          onAdvanced={onStageAdvanced}
        />
      );
    }
    case 'completion':
      return (
        <CompletionStage
          token={token}
          responseId={responseId}
          stage={stage}
          identityLabel={identityLabel}
          onAdvanced={onStageAdvanced}
        />
      );
    default:
      return <PlaceholderStageView stageType={stage.stageType} stageName={stage.name} />;
  }
}

// ─── Hook genérico de avanço ────────────────────────────────────────────

function useAdvance(token: string, responseId: string, stageId: string, identityLabel?: string) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const advance = useCallback(async (
    payload: { action?: 'approve' | 'reject'; comment?: string },
    onResult: (result: { nextStageId: string | null; completed: boolean; rejected?: boolean }) => void
  ) => {
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`/api/public/workflow/${encodeURIComponent(token)}/advance-stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responseId,
          stageId,
          identityLabel,
          ...payload,
        }),
      });
      const j = await r.json();
      if (!j.success) {
        setError(j.error || 'Erro ao avançar etapa');
        return;
      }
      onResult({
        nextStageId: j.data.nextStageId,
        completed: !!j.data.completed,
        rejected: payload.action === 'reject',
      });
    } catch (e: any) {
      logger.error('advance-stage failed', e);
      setError('Falha de rede. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }, [token, responseId, stageId, identityLabel]);

  return { advance, submitting, error };
}

// ─── DocumentationStage ─────────────────────────────────────────────────

function DocumentationStage({
  token, responseId, stage, identityLabel, onAdvanced,
}: {
  token: string;
  responseId: string;
  stage: PublicStage;
  identityLabel?: string;
  onAdvanced: (r: { nextStageId: string | null; completed: boolean }) => void;
}) {
  const { advance, submitting, error } = useAdvance(token, responseId, stage.id, identityLabel);

  return (
    <div style={cardStyle}>
      <IconBubble bg="#DBEAFE">
        <FileText size={28} color="#1E40AF" />
      </IconBubble>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827' }}>
        {stage.name}
      </h1>
      {stage.description && (
        <p style={{ margin: '12px 0 0', fontSize: 14, color: '#6B7280', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {stage.description}
        </p>
      )}
      {error && <InlineError message={error} />}
      <button
        onClick={() => advance({}, onAdvanced)}
        disabled={submitting}
        style={primaryButton(submitting)}
      >
        {submitting ? (
          <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Enviando…</>
        ) : (
          <>Entendi, prosseguir <ArrowRight size={16} /></>
        )}
      </button>
    </div>
  );
}

// ─── ApprovalStage ──────────────────────────────────────────────────────

function ApprovalStage({
  token, responseId, stage, identityLabel, onAdvanced,
}: {
  token: string;
  responseId: string;
  stage: PublicStage;
  identityLabel?: string;
  onAdvanced: (r: { nextStageId: string | null; completed: boolean; rejected?: boolean }) => void;
}) {
  const [comment, setComment] = useState('');
  const [confirmReject, setConfirmReject] = useState(false);
  const { advance, submitting, error } = useAdvance(token, responseId, stage.id, identityLabel);

  const onApprove = () => advance({ action: 'approve', comment: comment.trim() || undefined }, onAdvanced);
  const onReject = () => {
    if (!confirmReject) { setConfirmReject(true); return; }
    advance({ action: 'reject', comment: comment.trim() || undefined }, onAdvanced);
  };

  return (
    <div style={cardStyle}>
      <IconBubble bg="#FEF3C7">
        <CheckCircle2 size={28} color="#B45309" />
      </IconBubble>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827' }}>
        {stage.name}
      </h1>
      {stage.description && (
        <p style={{ margin: '12px 0 0', fontSize: 14, color: '#6B7280', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {stage.description}
        </p>
      )}

      <label style={labelStyle}>
        Comentário {confirmReject ? '(obrigatório para reprovar)' : '(opcional)'}
      </label>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={confirmReject ? 'Explique o motivo da reprovação' : 'Adicione uma observação…'}
        rows={3}
        style={textareaStyle}
        maxLength={2000}
      />

      {error && <InlineError message={error} />}

      <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
        <button
          onClick={onApprove}
          disabled={submitting}
          style={{ ...primaryButton(submitting), flex: 1, minWidth: 160 }}
        >
          {submitting ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                      : <><CheckCircle2 size={16} /> Aprovar</>}
        </button>
        <button
          onClick={onReject}
          disabled={submitting || (confirmReject && !comment.trim())}
          style={{
            ...secondaryDangerButton,
            flex: 1, minWidth: 160,
            opacity: submitting ? 0.6 : 1,
          }}
        >
          <XCircle size={16} /> {confirmReject ? 'Confirmar reprovação' : 'Reprovar'}
        </button>
      </div>
    </div>
  );
}

// ─── ExecutionStage ─────────────────────────────────────────────────────

function ExecutionStage({
  token, responseId, stage, identityLabel, onAdvanced,
}: {
  token: string;
  responseId: string;
  stage: PublicStage;
  identityLabel?: string;
  onAdvanced: (r: { nextStageId: string | null; completed: boolean }) => void;
}) {
  const [comment, setComment] = useState('');
  const { advance, submitting, error } = useAdvance(token, responseId, stage.id, identityLabel);

  return (
    <div style={cardStyle}>
      <IconBubble bg="#D1FAE5">
        <Play size={28} color="#047857" />
      </IconBubble>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827' }}>
        {stage.name}
      </h1>
      {stage.description && (
        <p style={{ margin: '12px 0 0', fontSize: 14, color: '#6B7280', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {stage.description}
        </p>
      )}

      <label style={labelStyle}>Comentário (opcional)</label>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Detalhes da execução…"
        rows={3}
        style={textareaStyle}
        maxLength={2000}
      />

      {error && <InlineError message={error} />}

      <button
        onClick={() => advance({ comment: comment.trim() || undefined }, onAdvanced)}
        disabled={submitting}
        style={primaryButton(submitting)}
      >
        {submitting ? (
          <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Enviando…</>
        ) : (
          <>Marcar como concluído <ArrowRight size={16} /></>
        )}
      </button>
    </div>
  );
}

// ─── CompletionStage ────────────────────────────────────────────────────

function CompletionStage({
  token, responseId, stage, identityLabel, onAdvanced,
}: {
  token: string;
  responseId: string;
  stage: PublicStage;
  identityLabel?: string;
  onAdvanced: (r: { nextStageId: string | null; completed: boolean }) => void;
}) {
  const { advance, submitting, error } = useAdvance(token, responseId, stage.id, identityLabel);

  return (
    <div style={cardStyle}>
      <IconBubble bg="#D1FAE5">
        <CheckCircle2 size={28} color="#047857" />
      </IconBubble>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827' }}>
        {stage.name}
      </h1>
      {stage.description && (
        <p style={{ margin: '12px 0 0', fontSize: 14, color: '#6B7280', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {stage.description}
        </p>
      )}
      {error && <InlineError message={error} />}
      <button
        onClick={() => advance({}, onAdvanced)}
        disabled={submitting}
        style={primaryButton(submitting)}
      >
        {submitting ? (
          <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Finalizando…</>
        ) : (
          <>Finalizar workflow <CheckCircle2 size={16} /></>
        )}
      </button>
    </div>
  );
}

// ─── Subviews / utilitários ─────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 16,
  padding: 40,
  textAlign: 'center',
  boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  textAlign: 'left',
  marginTop: 24,
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 600,
  color: '#374151',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #D1D5DB',
  borderRadius: 8,
  fontSize: 14,
  fontFamily: 'inherit',
  resize: 'vertical',
  outline: 'none',
  background: '#F9FAFB',
  color: '#111827',
};

const secondaryDangerButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '12px 18px',
  background: '#fff',
  color: '#B91C1C',
  border: '1px solid #FCA5A5',
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

function primaryButton(disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    padding: '12px 24px',
    background: disabled ? '#9CA3AF' : 'linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 700,
    cursor: disabled ? 'wait' : 'pointer',
    boxShadow: disabled ? 'none' : '0 4px 12px rgba(59,130,246,0.4)',
  };
}

function IconBubble({ bg, children }: { bg: string; children: React.ReactNode }) {
  return (
    <div style={{
      width: 56, height: 56,
      borderRadius: '50%',
      background: bg,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    }}>
      {children}
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <div style={{
      marginTop: 16,
      padding: '10px 12px',
      background: '#FEF2F2',
      border: '1px solid #FCA5A5',
      borderRadius: 8,
      fontSize: 13,
      color: '#991B1B',
      textAlign: 'left',
    }}>
      {message}
    </div>
  );
}

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" style={cardStyle}>
      <IconBubble bg="#FEE2E2">
        <AlertCircle size={28} color="#DC2626" />
      </IconBubble>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827' }}>
        Workflow indisponível
      </h1>
      <p style={{ margin: '10px 0 24px', fontSize: 14, color: '#6B7280', lineHeight: 1.5 }}>
        {message}
        <br /><br />
        Se você acredita que isso é um erro, contate o <strong>suporte do sistema</strong>.
      </p>
      <button
        onClick={onRetry}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '10px 20px',
          background: '#3B82F6',
          color: '#fff',
          border: 'none',
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        <RefreshCw size={14} /> Tentar novamente
      </button>
    </div>
  );
}

function ReadyView({
  workflow,
  onStart,
  starting,
}: {
  workflow: PublicWorkflowData;
  onStart: () => void;
  starting: boolean;
}) {
  const firstNeedsIdentity = workflow.firstStage?.stageType === 'identity-validation';
  return (
    <div style={cardStyle}>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: '#111827' }}>
        {workflow.workflowName}
      </h1>
      {workflow.workflowDescription && (
        <p style={{
          margin: '12px 0 0',
          fontSize: 15,
          color: '#6B7280',
          lineHeight: 1.5,
        }}>
          {workflow.workflowDescription}
        </p>
      )}
      <div style={{
        margin: '28px 0',
        padding: 14,
        background: '#F0F9FF',
        border: '1px solid #BAE6FD',
        borderRadius: 10,
        fontSize: 13,
        color: '#0C4A6E',
        lineHeight: 1.5,
      }}>
        Clique em <strong>Começar</strong> abaixo para iniciar.
        {firstNeedsIdentity && ' Você será solicitado a se identificar antes de prosseguir.'}
      </div>
      <button
        onClick={onStart}
        disabled={starting}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '14px 32px',
          background: starting ? '#9CA3AF' : 'linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%)',
          color: '#fff',
          border: 'none',
          borderRadius: 10,
          fontSize: 16,
          fontWeight: 700,
          cursor: starting ? 'wait' : 'pointer',
          boxShadow: starting ? 'none' : '0 4px 12px rgba(59,130,246,0.4)',
        }}
      >
        {starting ? (
          <>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            Preparando…
          </>
        ) : (
          <>Começar <ArrowRight size={16} /></>
        )}
      </button>
    </div>
  );
}

function PlaceholderStageView({ stageType, stageName }: { stageType: string; stageName?: string }) {
  return (
    <div style={cardStyle}>
      <IconBubble bg="#FEF3C7">
        <span style={{ fontSize: 28 }}>⏳</span>
      </IconBubble>
      <h2 style={{ margin: 0, fontSize: 18, color: '#111827' }}>
        {stageName || 'Etapa em processamento interno'}
      </h2>
      <p style={{ margin: '10px 0 0', fontSize: 14, color: '#6B7280', lineHeight: 1.5 }}>
        Esta etapa (tipo <code>{stageType}</code>) é processada pelo sistema.
        Você já pode fechar esta página — não há ação manual necessária.
      </p>
    </div>
  );
}

function CompletedView({ reason }: { reason?: 'approved' | 'rejected' }) {
  const rejected = reason === 'rejected';
  return (
    <div style={cardStyle}>
      <IconBubble bg={rejected ? '#FEE2E2' : '#D1FAE5'}>
        <span style={{ fontSize: 32 }}>{rejected ? '❌' : '✅'}</span>
      </IconBubble>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#111827' }}>
        {rejected ? 'Solicitação reprovada' : 'Workflow concluído!'}
      </h1>
      <p style={{ margin: '12px 0 0', fontSize: 14, color: '#6B7280', lineHeight: 1.5 }}>
        {rejected
          ? 'Sua reprovação foi registrada. Obrigado por participar.'
          : 'Obrigado por participar. Você já pode fechar esta página.'}
      </p>
    </div>
  );
}
