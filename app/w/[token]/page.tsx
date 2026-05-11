'use client';

/**
 * /w/[token]
 *
 * Página pública (SEM autenticação) que renderiza um workflow para o
 * colaborador executar.
 *
 * Fluxo:
 *   1. Página carrega → GET /api/public/workflow/[token]
 *   2. Verifica em localStorage se há instância pendente desse token
 *   3. Se NÃO há → mostra tela inicial com botão "Começar"
 *   4. Clica "Começar" → POST /start → recebe responseId → salva em localStorage
 *   5. Renderiza a etapa atual (atualmente: identity-validation)
 *   6. Após confirmar identidade → workflow avança (próximas etapas: roadmap)
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { ArrowRight, Loader2, AlertCircle, RefreshCw, Workflow as WorkflowIcon } from 'lucide-react';
import IdentityValidationStage from '@/components/IdentityValidationStage';
import type { WorkflowStage } from '@/types';
import { logger } from '@/lib/logger';

interface PublicWorkflowData {
  workflowId: string;
  workflowName: string;
  workflowDescription: string;
  firstStage: WorkflowStage & { stageType: string };
}

type PageState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; workflow: PublicWorkflowData }
  | { kind: 'started'; workflow: PublicWorkflowData; responseId: string; currentStageId: string }
  | { kind: 'completed' };

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

      // Retoma instância anterior se existir (mesmo token, mesma session)
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
            });
            return;
          }
        }
      } catch (e) { /* ignora — começa do zero */ }

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

      // Salva em localStorage para resumir caso recarregue
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

  const handleIdentityConfirmed = (data: { nextStageId: string | null; identityLabel: string }) => {
    if (state.kind !== 'started') return;
    if (!data.nextStageId) {
      // Workflow completo
      try { localStorage.removeItem(storageKey); } catch {}
      setState({ kind: 'completed' });
      return;
    }
    // Avança para próxima etapa
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        responseId: state.responseId,
        currentStageId: data.nextStageId,
      }));
    } catch {}
    setState({
      kind: 'started',
      workflow: state.workflow,
      responseId: state.responseId,
      currentStageId: data.nextStageId,
    });
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #F0F9FF 0%, #DBEAFE 100%)',
        padding: 'var(--space-6)',
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto', paddingTop: 40 }}>
        {/* Cabeçalho */}
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

        {/* Conteúdo por estado */}
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

        {state.kind === 'started' && state.workflow.firstStage.stageType === 'identity-validation' && (
          <IdentityValidationStage
            responseId={state.responseId}
            stage={state.workflow.firstStage as WorkflowStage}
            onConfirmed={handleIdentityConfirmed}
          />
        )}

        {state.kind === 'started' && state.workflow.firstStage.stageType !== 'identity-validation' && (
          <PlaceholderStageView stageType={state.workflow.firstStage.stageType} />
        )}

        {state.kind === 'completed' && <CompletedView />}
      </div>

      <style jsx>{`
        @keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ─── Subviews ──────────────────────────────────────────────────────────

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      style={{
        background: '#fff',
        borderRadius: 16,
        padding: 40,
        textAlign: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
      }}
    >
      <div style={{
        width: 56, height: 56,
        borderRadius: '50%',
        background: '#FEE2E2',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
      }}>
        <AlertCircle size={28} color="#DC2626" />
      </div>
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
  return (
    <div style={{
      background: '#fff',
      borderRadius: 16,
      padding: 40,
      textAlign: 'center',
      boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
    }}>
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
        Você será solicitado a se identificar antes de prosseguir.
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

function PlaceholderStageView({ stageType }: { stageType: string }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 16,
      padding: 40,
      textAlign: 'center',
      boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
    }}>
      <h2 style={{ margin: 0, fontSize: 18, color: '#111827' }}>
        Etapa em desenvolvimento
      </h2>
      <p style={{ margin: '10px 0 0', fontSize: 14, color: '#6B7280' }}>
        Esta etapa (tipo <code>{stageType}</code>) ainda não está disponível no
        link público. Contate o administrador.
      </p>
    </div>
  );
}

function CompletedView() {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 16,
      padding: 40,
      textAlign: 'center',
      boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
    }}>
      <div style={{
        width: 64, height: 64,
        borderRadius: '50%',
        background: '#D1FAE5',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
      }}>
        <span style={{ fontSize: 32 }}>✅</span>
      </div>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#111827' }}>
        Workflow concluído!
      </h1>
      <p style={{ margin: '12px 0 0', fontSize: 14, color: '#6B7280', lineHeight: 1.5 }}>
        Obrigado por participar. Você já pode fechar esta página.
      </p>
    </div>
  );
}
