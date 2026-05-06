'use client';

/**
 * WorkflowVersionPanel
 *
 * Modal que mostra todas as versões do workflow e permite:
 *   - Visualizar versão active corrente
 *   - Publicar uma draft (arquiva a active anterior automaticamente)
 *   - Arquivar manualmente
 *   - Restaurar uma archived → vira draft de novo
 *   - Ver change_notes de cada versão (changelog)
 *
 * Pattern: padrão dos enterprise BPM tools (Camunda, Mendix, Flowable).
 *
 * Diferencial vendável: instâncias em produção ficam pinned na versão
 * em que foram criadas (workflow_version_id) — mudanças no template
 * NÃO afetam fluxos em andamento. Crítico para SLA contratuais.
 */

import React, { useEffect, useState } from 'react';
import {
  X, GitBranch, CheckCircle2, Archive, RefreshCw, Rocket, History, AlertCircle,
} from 'lucide-react';
import { logger } from '@/lib/logger';

interface WorkflowVersion {
  version_id: number;
  workflow_fb_id: string;
  version_number: number;
  status: 'draft' | 'active' | 'archived';
  created_at: string;
  created_by_name: string | null;
  published_at: string | null;
  published_by_name: string | null;
  archived_at: string | null;
  change_notes: string | null;
  stages_json: any[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workflowId: string;
  workflowName?: string;
  /** Callback após publicar/arquivar — força reload do canvas pai */
  onChange?: () => void;
  currentUser: { id: string; name?: string; username?: string };
}

const STATUS_CONFIG = {
  draft: {
    label: 'Rascunho',
    color: 'var(--color-warning-700)',
    bg: 'var(--color-warning-100)',
    icon: History,
  },
  active: {
    label: 'Em produção',
    color: 'var(--color-success-700)',
    bg: 'var(--color-success-100)',
    icon: CheckCircle2,
  },
  archived: {
    label: 'Arquivada',
    color: 'var(--color-text-tertiary)',
    bg: 'var(--color-gray-100)',
    icon: Archive,
  },
} as const;

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function WorkflowVersionPanel({
  isOpen,
  onClose,
  workflowId,
  workflowName,
  onChange,
  currentUser,
}: Props) {
  const [versions, setVersions] = useState<WorkflowVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    load();
  }, [isOpen, workflowId]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dataconnect/workflow-versions?workflowId=${encodeURIComponent(workflowId)}`);
      const json = await res.json();
      if (json.success) {
        setVersions(json.data || []);
      }
    } catch (e) {
      logger.error('Failed to load versions', e);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (versionId: number, action: 'publish' | 'archive' | 'restore') => {
    if (action === 'publish') {
      const ok = confirm(
        '⚠️ Publicar esta versão?\n\n' +
        '• A versão atual em produção será arquivada\n' +
        '• Novas instâncias usarão esta versão\n' +
        '• Instâncias em andamento NÃO são afetadas (ficam na versão original)\n\n' +
        'Continuar?'
      );
      if (!ok) return;
    }
    if (action === 'archive') {
      const ok = confirm('Arquivar esta versão? Ela ficará oculta mas pode ser restaurada depois.');
      if (!ok) return;
    }

    setActingId(versionId);
    try {
      const res = await fetch('/api/dataconnect/workflow-versions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionId,
          action,
          performedBy: currentUser.id,
          performedByName: currentUser.name || currentUser.username,
        }),
      });
      const json = await res.json();
      if (json.success) {
        await load();
        onChange?.();
      } else {
        alert(`Erro: ${json.error}`);
      }
    } catch (e) {
      logger.error('Version action failed', e);
      alert('Erro ao executar ação. Veja o console.');
    } finally {
      setActingId(null);
    }
  };

  if (!isOpen) return null;

  const active = versions.find((v) => v.status === 'active');
  const drafts = versions.filter((v) => v.status === 'draft');
  const archived = versions.filter((v) => v.status === 'archived');

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="versions-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--surface-overlay)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-4)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface-card)',
          borderRadius: 'var(--radius-2xl)',
          maxWidth: 720,
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden',
          border: '1px solid var(--color-border-subtle)',
        }}
      >
        {/* Header */}
        <header
          style={{
            padding: 'var(--space-5) var(--space-6)',
            borderBottom: '1px solid var(--color-border-subtle)',
            background: 'linear-gradient(135deg, var(--color-brand-50) 0%, var(--color-info-50) 100%)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-brand-500)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <GitBranch size={20} />
            </div>
            <div>
              <h2
                id="versions-title"
                style={{
                  margin: 0,
                  fontSize: 'var(--font-size-xl)',
                  fontWeight: 'var(--font-weight-bold)',
                  color: 'var(--color-text-primary)',
                }}
              >
                Histórico de Versões
              </h2>
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                {workflowName || 'Workflow'} · {versions.length} versão{versions.length !== 1 ? 'ões' : ''}
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
              color: 'var(--color-text-secondary)',
              padding: 'var(--space-2)',
            }}
          >
            <X size={22} />
          </button>
        </header>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-6)' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--color-text-tertiary)' }}>
              <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
              <p style={{ marginTop: 'var(--space-3)' }}>Carregando versões…</p>
            </div>
          ) : versions.length === 0 ? (
            <div
              style={{
                background: 'var(--surface-page)',
                border: '1px dashed var(--color-border-default)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-8)',
                textAlign: 'center',
              }}
            >
              <GitBranch size={40} style={{ color: 'var(--color-text-tertiary)' }} />
              <h3 style={{ margin: 'var(--space-3) 0 var(--space-1)', color: 'var(--color-text-primary)' }}>
                Sem versões ainda
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-text-secondary)',
                  maxWidth: 440,
                  marginInline: 'auto',
                }}
              >
                Salve o workflow no canvas para criar a primeira versão. Versões te
                permitem publicar mudanças sem afetar instâncias em andamento.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {/* Active */}
              {active && (
                <Section title="🚀 Em produção" count={1}>
                  <VersionCard version={active} onAction={handleAction} actingId={actingId} />
                </Section>
              )}
              {/* Drafts */}
              {drafts.length > 0 && (
                <Section title="📝 Rascunhos" count={drafts.length}>
                  {drafts.map((v) => (
                    <VersionCard key={v.version_id} version={v} onAction={handleAction} actingId={actingId} />
                  ))}
                </Section>
              )}
              {/* Archived */}
              {archived.length > 0 && (
                <Section title="🗄️ Arquivadas" count={archived.length} dim>
                  {archived.map((v) => (
                    <VersionCard key={v.version_id} version={v} onAction={handleAction} actingId={actingId} />
                  ))}
                </Section>
              )}
            </div>
          )}
        </div>

        {/* Footer informativo */}
        <footer
          style={{
            padding: 'var(--space-4) var(--space-6)',
            borderTop: '1px solid var(--color-border-subtle)',
            background: 'var(--surface-page)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-tertiary)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
        >
          <AlertCircle size={14} />
          Instâncias em andamento permanecem na versão em que foram criadas (pinned).
        </footer>
      </div>

      <style jsx>{`
        @keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ─── Section ─────────────────────────────────────────────────────────────
function Section({
  title, count, dim, children,
}: {
  title: string;
  count: number;
  dim?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section style={{ opacity: dim ? 0.7 : 1 }}>
      <header
        style={{
          fontSize: 'var(--font-size-xs)',
          fontWeight: 'var(--font-weight-bold)',
          color: 'var(--color-text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 'var(--space-2)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
        }}
      >
        {title}
        <span
          style={{
            background: 'var(--color-gray-200)',
            color: 'var(--color-gray-700)',
            padding: '0 6px',
            borderRadius: 'var(--radius-full)',
            fontSize: 10,
          }}
        >
          {count}
        </span>
      </header>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {children}
      </div>
    </section>
  );
}

// ─── VersionCard ─────────────────────────────────────────────────────────
function VersionCard({
  version,
  onAction,
  actingId,
}: {
  version: WorkflowVersion;
  onAction: (id: number, action: 'publish' | 'archive' | 'restore') => void;
  actingId: number | null;
}) {
  const cfg = STATUS_CONFIG[version.status];
  const Icon = cfg.icon;
  const stageCount = Array.isArray(version.stages_json) ? version.stages_json.length : 0;
  const isActing = actingId === version.version_id;

  return (
    <div
      style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--color-border-subtle)',
        borderLeft: `4px solid ${cfg.color}`,
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-3)',
        display: 'flex',
        gap: 'var(--space-3)',
        alignItems: 'flex-start',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 'var(--radius-md)',
          background: cfg.bg,
          color: cfg.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={16} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
            v{version.version_number}
          </strong>
          <span
            style={{
              fontSize: 10,
              padding: '1px 8px',
              borderRadius: 'var(--radius-full)',
              background: cfg.bg,
              color: cfg.color,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {cfg.label}
          </span>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
            · {stageCount} etapa{stageCount !== 1 ? 's' : ''}
          </span>
        </div>

        <div
          style={{
            marginTop: 'var(--space-1)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-secondary)',
          }}
        >
          Criada em <strong>{formatDate(version.created_at)}</strong>
          {version.created_by_name && <> por {version.created_by_name}</>}
          {version.published_at && (
            <>
              {' '} · Publicada em <strong>{formatDate(version.published_at)}</strong>
              {version.published_by_name && <> por {version.published_by_name}</>}
            </>
          )}
        </div>

        {version.change_notes && (
          <p
            style={{
              margin: 'var(--space-2) 0 0',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-secondary)',
              fontStyle: 'italic',
              lineHeight: 'var(--line-height-relaxed)',
              padding: 'var(--space-2)',
              background: 'var(--surface-page)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            “{version.change_notes}”
          </p>
        )}

        {/* Ações */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
          {version.status === 'draft' && (
            <button
              onClick={() => onAction(version.version_id, 'publish')}
              disabled={isActing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                background: 'var(--color-success-500)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontSize: 11,
                fontWeight: 600,
                cursor: isActing ? 'wait' : 'pointer',
                opacity: isActing ? 0.5 : 1,
              }}
            >
              <Rocket size={11} />
              {isActing ? 'Publicando…' : 'Publicar'}
            </button>
          )}
          {version.status === 'active' && (
            <span
              style={{
                fontSize: 11,
                color: 'var(--color-text-tertiary)',
                fontStyle: 'italic',
              }}
            >
              Versão em produção — não pode ser arquivada (publique outra antes)
            </span>
          )}
          {version.status === 'archived' && (
            <button
              onClick={() => onAction(version.version_id, 'restore')}
              disabled={isActing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                background: 'transparent',
                color: 'var(--color-brand-600)',
                border: '1px solid var(--color-brand-300)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 11,
                fontWeight: 500,
                cursor: isActing ? 'wait' : 'pointer',
              }}
            >
              <RefreshCw size={11} />
              Restaurar como rascunho
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
