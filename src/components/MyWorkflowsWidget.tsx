'use client';

/**
 * MyWorkflowsWidget
 *
 * Aparece no dashboard inicial dos usuários adicionados como "viewers" de
 * um workflow (admin define em BravoFlow → ícone "Quem pode acompanhar").
 *
 * Mostra cards de cada workflow com contagem de instâncias por status e
 * leva direto para a aba Instâncias filtrada por aquele workflow.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, ListChecks, Loader2, ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';

interface MyWorkflow {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  instances: { total: number; byStatus: Record<string, number> };
}

const STATUS_COLORS: Record<string, { color: string; label: string }> = {
  pending:     { color: '#F59E0B', label: 'Aguardando' },
  in_progress: { color: '#3B82F6', label: 'Em andamento' },
  approved:    { color: '#10B981', label: 'Aprovadas' },
  rejected:    { color: '#EF4444', label: 'Reprovadas' },
  completed:   { color: '#059669', label: 'Finalizadas' },
  cancelled:   { color: '#6B7280', label: 'Canceladas' },
  in_routing:  { color: '#3B82F6', label: 'Em roteirização' },
  in_pickup:   { color: '#8B5CF6', label: 'Em retirada' },
};

export default function MyWorkflowsWidget() {
  const router = useRouter();
  const { user } = useAuth();
  const [workflows, setWorkflows] = useState<MyWorkflow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const username = user.email?.split('@')[0] || '';
        const params = new URLSearchParams();
        params.set('userId', user.uid);
        if (username) params.set('username', username);
        const r = await fetch(`/api/dataconnect/my-workflows?${params.toString()}`);
        const j = await r.json();
        if (j.success) setWorkflows(j.data || []);
        else setWorkflows([]);
      } catch (e) {
        logger.error('Failed to load my-workflows', e);
        setWorkflows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  // Não renderiza nada se o user não acompanha nenhum workflow
  // (evita widget vazio poluindo a UI dos admins que criaram tudo)
  if (loading) {
    return (
      <div style={widgetStyle}>
        <Header />
        <div style={{ padding: 30, textAlign: 'center', color: '#9CA3AF' }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
        <style jsx>{`
          @keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (!workflows || workflows.length === 0) {
    return null;
  }

  return (
    <div style={widgetStyle}>
      <Header />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {workflows.map((w) => (
          <button
            key={w.id}
            onClick={() => router.push(`/dashboard/bravoflow?tab=instances&workflow=${encodeURIComponent(w.id)}`)}
            style={{
              textAlign: 'left',
              padding: 14,
              background: '#fff',
              border: '1px solid #E5E7EB',
              borderRadius: 10,
              cursor: 'pointer',
              transition: 'border-color 150ms, box-shadow 150ms',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#BFDBFE';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(59,130,246,0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#E5E7EB';
              e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)';
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111827', lineHeight: 1.3 }}>
                {w.name}
              </h4>
              <ArrowRight size={14} color="#9CA3AF" />
            </div>
            {w.description && (
              <p style={{
                margin: '0 0 10px', fontSize: 11, color: '#6B7280',
                lineHeight: 1.4,
                overflow: 'hidden', textOverflow: 'ellipsis',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}>
                {w.description}
              </p>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: 600, color: '#374151',
              }}>
                <ListChecks size={11} /> {w.instances.total} instância{w.instances.total !== 1 ? 's' : ''}
              </span>
              {Object.entries(w.instances.byStatus).slice(0, 3).map(([status, count]) => {
                const cfg = STATUS_COLORS[status] || { color: '#64748B', label: status };
                return (
                  <span
                    key={status}
                    title={cfg.label}
                    style={{
                      display: 'inline-flex', alignItems: 'center',
                      padding: '1px 6px', borderRadius: 999,
                      fontSize: 10, fontWeight: 600,
                      background: `${cfg.color}20`, color: cfg.color,
                    }}
                  >
                    {count} {cfg.label.toLowerCase()}
                  </span>
                );
              })}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

const widgetStyle: React.CSSProperties = {
  background: '#F9FAFB',
  borderRadius: 12,
  padding: 18,
  marginBottom: 20,
  border: '1px solid #E5E7EB',
};

function Header() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: '#EFF6FF',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Eye size={18} color="#3B82F6" />
      </div>
      <div>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111827' }}>
          Workflows que você acompanha
        </h3>
        <p style={{ margin: 0, fontSize: 11, color: '#6B7280' }}>
          Definidos pelos administradores · clique em um card para ver as instâncias
        </p>
      </div>
    </div>
  );
}
