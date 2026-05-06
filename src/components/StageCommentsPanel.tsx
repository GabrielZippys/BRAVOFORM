'use client';

/**
 * StageCommentsPanel
 *
 * Painel de threads de comentários numa etapa de workflow.
 * Diferencial vs Pipefy/Asana: aqui comentamos na DEFINIÇÃO da etapa
 * (template), não em instância — útil para discussões de design.
 *
 * Features:
 *   - Lista threads (comentário raiz + replies aninhados)
 *   - Botão "Resolver" marca thread como resolvida
 *   - Edição inline pelo autor
 *   - Soft delete pelo autor
 *   - Empty state com CTA
 *   - Tempo relativo ("há 5 min")
 *
 * Uso:
 *   <StageCommentsPanel
 *     workflowId={workflowId}
 *     stageId={stage.id}
 *     currentUser={{ id, username, name, avatarUrl }}
 *   />
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  MessageCircle, Send, Check, X, Edit3, Trash2, CornerDownRight, RefreshCw,
} from 'lucide-react';
import { logger } from '@/lib/logger';

interface Comment {
  comment_id: number;
  parent_id: number | null;
  author_id: string;
  author_username: string | null;
  author_name: string | null;
  author_avatar_url: string | null;
  body: string;
  mentions: string[];
  resolved_at: string | null;
  resolved_by: string | null;
  resolved_by_name: string | null;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
}

interface CurrentUser {
  id: string;
  username?: string;
  name?: string;
  avatarUrl?: string;
}

interface Props {
  workflowId: string;
  stageId: string;
  currentUser: CurrentUser;
  /** Callback opcional quando muda o número de comentários (para badge) */
  onCountChange?: (count: number) => void;
}

const STORAGE_HEIGHT_KEY = 'bravoform-comments-height';

// ─── Tempo relativo em pt-BR ─────────────────────────────────────────────
function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  if (diff < 2_592_000) return `há ${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

export default function StageCommentsPanel({
  workflowId,
  stageId,
  currentUser,
  onCountChange,
}: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ workflowId, stageId });
      const res = await fetch(`/api/stage-comments?${params}`);
      const json = await res.json();
      if (json.success) {
        setComments(json.data || []);
        onCountChange?.((json.data || []).length);
      } else {
        logger.warn('Failed to load comments', { error: json.error });
      }
    } catch (e) {
      logger.error('Erro ao carregar comments', e);
    } finally {
      setLoading(false);
    }
  }, [workflowId, stageId, onCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async () => {
    const text = newCommentText.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/stage-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId,
          stageId,
          parentId: replyTo,
          body: text,
          authorId: currentUser.id,
          authorUsername: currentUser.username,
          authorName: currentUser.name || currentUser.username,
          authorAvatarUrl: currentUser.avatarUrl,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setNewCommentText('');
        setReplyTo(null);
        load();
      } else {
        logger.warn('Failed to post comment', { error: json.error });
      }
    } catch (e) {
      logger.error('Erro ao enviar comment', e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async (commentId: number, resolved: boolean) => {
    try {
      await fetch('/api/stage-comments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commentId,
          resolved,
          resolvedBy: currentUser.id,
          resolvedByName: currentUser.name || currentUser.username,
        }),
      });
      load();
    } catch (e) {
      logger.error('Erro ao resolver comment', e);
    }
  };

  const handleEdit = async (commentId: number) => {
    if (!editingText.trim()) return;
    try {
      await fetch('/api/stage-comments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commentId,
          body: editingText.trim(),
          authorId: currentUser.id,
        }),
      });
      setEditingId(null);
      setEditingText('');
      load();
    } catch (e) {
      logger.error('Erro ao editar comment', e);
    }
  };

  const handleDelete = async (commentId: number) => {
    if (!confirm('Excluir este comentário?')) return;
    try {
      await fetch(
        `/api/stage-comments?commentId=${commentId}&deletedBy=${currentUser.id}`,
        { method: 'DELETE' }
      );
      load();
    } catch (e) {
      logger.error('Erro ao deletar comment', e);
    }
  };

  // Agrupa por thread (parent_id null = raiz, depois replies)
  const roots = comments.filter((c) => !c.parent_id);
  const repliesByParent: Record<number, Comment[]> = {};
  for (const c of comments) {
    if (c.parent_id) {
      (repliesByParent[c.parent_id] = repliesByParent[c.parent_id] || []).push(c);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          fontSize: 'var(--font-size-sm)',
          fontWeight: 'var(--font-weight-semibold)',
          color: 'var(--color-text-primary)',
        }}>
          <MessageCircle size={16} />
          Discussão {comments.length > 0 && (
            <span style={{
              background: 'var(--color-brand-100)',
              color: 'var(--color-brand-700)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 'var(--font-weight-bold)',
            }}>
              {comments.length}
            </span>
          )}
        </div>
        <button
          onClick={load}
          aria-label="Recarregar comentários"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-text-tertiary)',
            padding: 'var(--space-1)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Lista de threads */}
      {loading ? (
        <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-xs)', padding: 'var(--space-3)' }}>
          Carregando comentários…
        </div>
      ) : roots.length === 0 ? (
        <div style={{
          background: 'var(--surface-page)',
          border: '1px dashed var(--color-border-default)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-4)',
          textAlign: 'center',
          color: 'var(--color-text-tertiary)',
          fontSize: 'var(--font-size-sm)',
        }}>
          💬 Nenhuma discussão sobre esta etapa.
          <br />
          <small>Use comentários para documentar decisões de design ou pedir feedback de outros admins.</small>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {roots.map((root) => (
            <Thread
              key={root.comment_id}
              root={root}
              replies={repliesByParent[root.comment_id] || []}
              currentUser={currentUser}
              editingId={editingId}
              editingText={editingText}
              setEditingId={setEditingId}
              setEditingText={setEditingText}
              onReply={() => setReplyTo(root.comment_id)}
              onResolve={handleResolve}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isReplyTarget={replyTo === root.comment_id}
            />
          ))}
        </div>
      )}

      {/* Input de novo comentário / reply */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          padding: 'var(--space-3)',
          background: 'var(--surface-page)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        {replyTo !== null && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-1)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-tertiary)',
          }}>
            <CornerDownRight size={12} />
            Respondendo
            <button
              onClick={() => setReplyTo(null)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-secondary)',
                padding: 0,
                marginLeft: 'auto',
              }}
            >
              <X size={12} />
            </button>
          </div>
        )}
        <textarea
          value={newCommentText}
          onChange={(e) => setNewCommentText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={replyTo ? 'Sua resposta…' : 'Escreva um comentário sobre esta etapa…'}
          rows={2}
          maxLength={4000}
          style={{
            width: '100%',
            padding: 'var(--space-2)',
            border: '1px solid var(--color-border-default)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--font-size-sm)',
            fontFamily: 'inherit',
            color: 'var(--color-text-primary)',
            background: 'var(--surface-card)',
            resize: 'vertical',
            outline: 'none',
            transition: 'border-color var(--duration-fast)',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-border-focus)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border-default)')}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
            <kbd style={{ fontFamily: 'monospace', fontSize: 10 }}>Ctrl</kbd> +{' '}
            <kbd style={{ fontFamily: 'monospace', fontSize: 10 }}>Enter</kbd> para enviar
          </span>
          <button
            onClick={handleSubmit}
            disabled={submitting || !newCommentText.trim()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
              padding: '6px 12px',
              background: 'var(--color-brand-500)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 'var(--font-weight-semibold)',
              cursor: submitting || !newCommentText.trim() ? 'not-allowed' : 'pointer',
              opacity: submitting || !newCommentText.trim() ? 0.5 : 1,
            }}
          >
            <Send size={12} /> Enviar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Thread (raiz + replies) ─────────────────────────────────────────────
function Thread({
  root, replies, currentUser, editingId, editingText, setEditingId, setEditingText,
  onReply, onResolve, onEdit, onDelete, isReplyTarget,
}: {
  root: Comment;
  replies: Comment[];
  currentUser: CurrentUser;
  editingId: number | null;
  editingText: string;
  setEditingId: (id: number | null) => void;
  setEditingText: (text: string) => void;
  onReply: () => void;
  onResolve: (id: number, r: boolean) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  isReplyTarget: boolean;
}) {
  const isResolved = !!root.resolved_at;

  return (
    <div
      style={{
        background: 'var(--surface-card)',
        border: `1px solid ${isReplyTarget ? 'var(--color-brand-500)' : 'var(--color-border-subtle)'}`,
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-3)',
        opacity: isResolved ? 0.6 : 1,
      }}
    >
      <CommentItem
        comment={root}
        currentUser={currentUser}
        isResolved={isResolved}
        editingId={editingId}
        editingText={editingText}
        setEditingId={setEditingId}
        setEditingText={setEditingText}
        onReply={onReply}
        onResolve={onResolve}
        onEdit={onEdit}
        onDelete={onDelete}
      />

      {replies.length > 0 && (
        <div style={{
          marginTop: 'var(--space-3)',
          paddingLeft: 'var(--space-4)',
          borderLeft: '2px solid var(--color-border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        }}>
          {replies.map((reply) => (
            <CommentItem
              key={reply.comment_id}
              comment={reply}
              currentUser={currentUser}
              isResolved={false}
              editingId={editingId}
              editingText={editingText}
              setEditingId={setEditingId}
              setEditingText={setEditingText}
              onReply={onReply}
              onResolve={onResolve}
              onEdit={onEdit}
              onDelete={onDelete}
              isReply
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Item de comentário (raiz ou reply) ──────────────────────────────────
function CommentItem({
  comment, currentUser, isResolved, editingId, editingText,
  setEditingId, setEditingText, onReply, onResolve, onEdit, onDelete, isReply,
}: {
  comment: Comment;
  currentUser: CurrentUser;
  isResolved: boolean;
  editingId: number | null;
  editingText: string;
  setEditingId: (id: number | null) => void;
  setEditingText: (text: string) => void;
  onReply: () => void;
  onResolve: (id: number, r: boolean) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  isReply?: boolean;
}) {
  const isOwn = comment.author_id === currentUser.id;
  const isEditing = editingId === comment.comment_id;
  const displayName = comment.author_name || comment.author_username || 'Usuário';
  const initial = displayName[0]?.toUpperCase() || '?';

  return (
    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
      {/* Avatar */}
      {comment.author_avatar_url ? (
        <img
          src={comment.author_avatar_url}
          alt={displayName}
          style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0 }}
        />
      ) : (
        <div
          aria-hidden
          style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'var(--color-brand-500)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 600, flexShrink: 0,
          }}
        >
          {initial}
        </div>
      )}

      {/* Conteúdo */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 'var(--space-2)',
          flexWrap: 'wrap',
        }}>
          <strong style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
            {displayName}
          </strong>
          <small style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>
            {timeAgo(comment.created_at)}
            {comment.edited_at && ' (editado)'}
          </small>
          {comment.resolved_at && (
            <span style={{
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--color-success-100)',
              color: 'var(--color-success-700)',
              fontWeight: 600,
            }}>
              ✓ Resolvido
            </span>
          )}
        </div>

        {isEditing ? (
          <div style={{ marginTop: 'var(--space-1)' }}>
            <textarea
              value={editingText}
              onChange={(e) => setEditingText(e.target.value)}
              rows={2}
              style={{
                width: '100%',
                padding: 'var(--space-2)',
                border: '1px solid var(--color-border-focus)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--font-size-sm)',
                fontFamily: 'inherit',
                color: 'var(--color-text-primary)',
                background: 'var(--surface-card)',
                resize: 'vertical',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
              <button
                onClick={() => onEdit(comment.comment_id)}
                style={{
                  padding: '4px 8px',
                  background: 'var(--color-brand-500)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                Salvar
              </button>
              <button
                onClick={() => { setEditingId(null); setEditingText(''); }}
                style={{
                  padding: '4px 8px',
                  background: 'transparent',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border-default)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <p style={{
            margin: 'var(--space-1) 0 0',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-primary)',
            lineHeight: 'var(--line-height-relaxed)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {comment.body}
          </p>
        )}

        {/* Ações */}
        {!isEditing && (
          <div style={{
            display: 'flex',
            gap: 'var(--space-3)',
            marginTop: 'var(--space-1)',
            fontSize: 11,
          }}>
            {!isReply && (
              <button
                onClick={onReply}
                style={{
                  background: 'transparent', border: 'none', padding: 0,
                  color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11,
                }}
              >
                Responder
              </button>
            )}
            {!isReply && !isResolved && (
              <button
                onClick={() => onResolve(comment.comment_id, true)}
                style={{
                  background: 'transparent', border: 'none', padding: 0,
                  color: 'var(--color-success-600)', cursor: 'pointer', fontSize: 11,
                  display: 'inline-flex', alignItems: 'center', gap: 2,
                }}
              >
                <Check size={11} /> Resolver
              </button>
            )}
            {!isReply && isResolved && (
              <button
                onClick={() => onResolve(comment.comment_id, false)}
                style={{
                  background: 'transparent', border: 'none', padding: 0,
                  color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11,
                }}
              >
                Reabrir
              </button>
            )}
            {isOwn && (
              <>
                <button
                  onClick={() => {
                    setEditingId(comment.comment_id);
                    setEditingText(comment.body);
                  }}
                  style={{
                    background: 'transparent', border: 'none', padding: 0,
                    color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11,
                    display: 'inline-flex', alignItems: 'center', gap: 2,
                  }}
                >
                  <Edit3 size={11} /> Editar
                </button>
                <button
                  onClick={() => onDelete(comment.comment_id)}
                  style={{
                    background: 'transparent', border: 'none', padding: 0,
                    color: 'var(--color-danger-600)', cursor: 'pointer', fontSize: 11,
                    display: 'inline-flex', alignItems: 'center', gap: 2,
                  }}
                >
                  <Trash2 size={11} /> Excluir
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
