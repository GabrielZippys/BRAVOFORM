'use client';

/**
 * WorkflowViewersModal
 *
 * Permite ao admin definir quais usuários podem ACOMPANHAR (read-only) o
 * histórico das instâncias de um workflow. Os usuários selecionados aparecem
 * com o widget "Meus workflows acompanhados" no dashboard inicial deles.
 *
 * Persiste como JSONB em dim_workflows.viewers via PATCH /api/dataconnect/workflows.
 */

import { useEffect, useState } from 'react';
import { X, Search, UserPlus, UserMinus, Eye, Loader2, Check } from 'lucide-react';
import { logger } from '@/lib/logger';

interface Viewer {
  id: string;
  username: string;
  name: string;
}

interface Collaborator {
  id: string;
  username: string;
  email: string;
  name: string;
  department: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workflowId: string;
  workflowName: string;
  initialViewers?: Viewer[];
}

export default function WorkflowViewersModal({
  isOpen, onClose, workflowId, workflowName, initialViewers,
}: Props) {
  const [viewers, setViewers] = useState<Viewer[]>(initialViewers || []);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Busca colaboradores (debounce)
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const url = `/api/dataconnect/collaborators?limit=50${query ? `&q=${encodeURIComponent(query)}` : ''}`;
        const r = await fetch(url);
        const j = await r.json();
        if (j.success) setCollaborators(j.data);
      } catch (e) {
        logger.error('Failed to load collaborators', e);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [query, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setViewers(initialViewers || []);
      setSaved(false);
      setError(null);
    }
  }, [isOpen, initialViewers]);

  const isViewer = (id: string) => viewers.some((v) => v.id === id);
  const add = (c: Collaborator) => {
    if (isViewer(c.id)) return;
    setViewers((p) => [...p, { id: c.id, username: c.username, name: c.name }]);
    setSaved(false);
  };
  const remove = (id: string) => {
    setViewers((p) => p.filter((v) => v.id !== id));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch('/api/dataconnect/workflows', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId, viewers }),
      });
      const j = await r.json();
      if (!j.success) {
        setError(j.error || 'Erro ao salvar viewers');
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (e: any) {
      logger.error('Failed to save viewers', e);
      setError('Falha de rede. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15,23,42,0.5)',
        backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '60px 20px',
        zIndex: 100,
        overflowY: 'auto',
      }}
    >
      <div style={{
        background: '#fff',
        width: '100%',
        maxWidth: 640,
        borderRadius: 14,
        boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100vh - 120px)',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 22px',
          borderBottom: '1px solid #E5E7EB',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          background: 'linear-gradient(135deg, #EFF6FF 0%, #FFFFFF 100%)',
        }}>
          <div style={{ flex: 1 }}>
            <h2 style={{
              margin: 0, fontSize: 17, fontWeight: 700, color: '#111827',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Eye size={18} color="#3B82F6" /> Quem pode acompanhar este workflow
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6B7280' }}>
              <strong>{workflowName}</strong> — usuários selecionados verão um widget no
              dashboard com o histórico das instâncias deste workflow.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: 6, borderRadius: 6, color: '#6B7280',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Viewers atuais */}
          <div style={{ padding: '14px 22px', borderBottom: '1px solid #F3F4F6' }}>
            <div style={{
              fontSize: 11, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: 0.6, color: '#374151',
              marginBottom: 8,
            }}>
              Acompanhando ({viewers.length})
            </div>
            {viewers.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>
                Nenhum usuário acompanhando ainda. Adicione abaixo.
              </p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {viewers.map((v) => (
                  <span
                    key={v.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 6px 4px 10px',
                      background: '#EFF6FF',
                      color: '#1E40AF',
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  >
                    {v.name}
                    <button
                      onClick={() => remove(v.id)}
                      aria-label={`Remover ${v.name}`}
                      style={{
                        border: 'none', background: 'transparent', cursor: 'pointer',
                        color: '#1E40AF', padding: 2, display: 'inline-flex',
                      }}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Lista de colaboradores */}
          <div style={{ padding: '14px 22px', flex: 1, overflowY: 'auto' }}>
            <div style={{
              position: 'relative', marginBottom: 10,
            }}>
              <Search
                size={14}
                style={{
                  position: 'absolute', left: 10, top: '50%',
                  transform: 'translateY(-50%)', color: '#9CA3AF',
                }}
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por username, e-mail ou nome..."
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 30px',
                  border: '1px solid #D1D5DB',
                  borderRadius: 8,
                  fontSize: 13,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 20, color: '#9CA3AF' }}>
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            ) : collaborators.length === 0 ? (
              <p style={{ textAlign: 'center', fontSize: 12, color: '#9CA3AF', padding: 20 }}>
                Nenhum colaborador encontrado.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {collaborators.map((c) => {
                  const already = isViewer(c.id);
                  return (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 10px',
                        borderRadius: 6,
                        border: '1px solid #F3F4F6',
                        background: already ? '#F0FDF4' : '#fff',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>
                          {c.name}
                        </div>
                        <div style={{ fontSize: 11, color: '#6B7280' }}>
                          {c.username}
                          {c.email && ` · ${c.email}`}
                          {c.department && ` · ${c.department}`}
                        </div>
                      </div>
                      <button
                        onClick={() => already ? remove(c.id) : add(c)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '6px 10px',
                          background: already ? '#FEE2E2' : '#3B82F6',
                          color: already ? '#991B1B' : '#fff',
                          border: 'none',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {already ? <><UserMinus size={12} /> Remover</> : <><UserPlus size={12} /> Adicionar</>}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 22px',
          borderTop: '1px solid #E5E7EB',
          background: '#F9FAFB',
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}>
          {error && (
            <span style={{ marginRight: 'auto', fontSize: 12, color: '#B91C1C' }}>
              {error}
            </span>
          )}
          {saved && !error && (
            <span style={{
              marginRight: 'auto', fontSize: 12, color: '#059669',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <Check size={14} /> Salvo
            </span>
          )}
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              color: '#6B7280',
              border: '1px solid #D1D5DB',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Fechar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              background: saving ? '#9CA3AF' : '#3B82F6',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: saving ? 'wait' : 'pointer',
            }}
          >
            {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Salvando…</> : 'Salvar'}
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
