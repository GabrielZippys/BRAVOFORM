'use client';

/**
 * BulkActionsBar
 *
 * Barra flutuante que aparece quando o usuário seleciona ≥1 instância.
 * Pattern: Gmail/Notion/Linear bulk select.
 *
 * Ações suportadas:
 *   • Cancelar (todas)
 *   • Marcar como retiradas
 *   • Reatribuir motorista (input)
 *   • Soft-delete (lixeira)
 *   • Exportar (CSV / JSON)
 *   • Limpar seleção
 *
 * Cada ação usa /api/dataconnect/bulk-action e mostra resumo de resultado.
 */

import React, { useState } from 'react';
import {
  X, Trash2, Truck, PackageCheck, AlertCircle, Download, Loader2, CheckCircle2,
} from 'lucide-react';
import { logger } from '@/lib/logger';

interface Props {
  selectedIds: string[];
  onClear: () => void;
  /** Callback após bulk action — refresh da lista (SSE refresca sozinho mas força reconexão) */
  onComplete?: () => void;
  currentUser: { id: string; username?: string; name?: string };
}

type BulkAction = 'cancel' | 'mark-picked-up' | 'route' | 'soft-delete' | 'export';

export default function BulkActionsBar({ selectedIds, onClear, onComplete, currentUser }: Props) {
  const [busy, setBusy] = useState<BulkAction | null>(null);
  const [showRouteInput, setShowRouteInput] = useState(false);
  const [routeMotorista, setRouteMotorista] = useState('');
  const [routePlaca, setRoutePlaca] = useState('');
  const [showCancelInput, setShowCancelInput] = useState(false);
  const [cancelMotivo, setCancelMotivo] = useState('');

  if (selectedIds.length === 0) return null;

  const runBulk = async (action: BulkAction, extra: Record<string, any> = {}) => {
    setBusy(action);
    try {
      const res = await fetch('/api/dataconnect/bulk-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          instanceIds: selectedIds,
          performedBy: currentUser.id,
          performedByUsername: currentUser.name || currentUser.username,
          ...extra,
        }),
      });

      const json = await res.json();

      if (action === 'export') {
        // Faz download direto
        if (json.success && Array.isArray(json.data)) {
          downloadJson(json.data, `bravoform-export-${Date.now()}.json`);
          downloadCsv(json.data, `bravoform-export-${Date.now()}.csv`);
        } else {
          alert(`Erro no export: ${json.error || 'desconhecido'}`);
        }
      } else if (json.success) {
        const { succeeded, failed } = json.summary || {};
        if (failed > 0) {
          alert(
            `Bulk concluído com ${failed} falha(s).\n` +
            `✅ ${succeeded} aplicada(s) com sucesso\n` +
            `❌ ${failed} falharam\n\n` +
            `Veja o painel de Audit Log para detalhes.`
          );
        }
        onClear();
        onComplete?.();
      } else {
        alert(`Erro: ${json.error}`);
      }
    } catch (e: any) {
      logger.error('Bulk action falhou', e);
      alert('Erro de rede. Tente novamente.');
    } finally {
      setBusy(null);
      setShowRouteInput(false);
      setShowCancelInput(false);
      setRouteMotorista('');
      setRoutePlaca('');
      setCancelMotivo('');
    }
  };

  const handleCancel = () => {
    if (cancelMotivo.trim().length < 3) {
      alert('Informe um motivo (mínimo 3 caracteres) para o cancelamento em lote.');
      return;
    }
    runBulk('cancel', {
      motivoCancelamento: cancelMotivo.trim(),
      protocoloCancelamento: `BULK-${Date.now()}`,
    });
  };

  const handleRoute = () => {
    if (!routeMotorista.trim()) {
      alert('Informe o motorista para roteirização em lote.');
      return;
    }
    runBulk('route', {
      motorista: routeMotorista.trim(),
      placa: routePlaca.trim() || undefined,
    });
  };

  const handlePickup = () => {
    if (!confirm(`Marcar ${selectedIds.length} retirada(s) como concluídas?`)) return;
    runBulk('mark-picked-up');
  };

  const handleDelete = () => {
    if (!confirm(`Mover ${selectedIds.length} instância(s) para a lixeira?\n\nElas podem ser restauradas em até 30 dias.`)) return;
    runBulk('soft-delete');
  };

  return (
    <div
      role="toolbar"
      aria-label="Ações em lote"
      style={{
        position: 'fixed',
        bottom: 'var(--space-6)',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--color-gray-900)',
        color: '#fff',
        borderRadius: 'var(--radius-xl)',
        padding: 'var(--space-3) var(--space-4)',
        boxShadow: 'var(--shadow-xl)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        zIndex: 9999,
        minWidth: 360,
        maxWidth: 'calc(100vw - 48px)',
      }}
    >
      {/* Top row: count + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            background: 'var(--color-brand-500)',
            padding: '4px 12px',
            borderRadius: 'var(--radius-full)',
            fontSize: 'var(--font-size-sm)',
            fontWeight: 'var(--font-weight-bold)',
          }}
        >
          <CheckCircle2 size={14} />
          {selectedIds.length} selecionada{selectedIds.length !== 1 ? 's' : ''}
        </div>

        <BulkButton
          icon={Truck}
          label="Roteirizar"
          onClick={() => setShowRouteInput((s) => !s)}
          color="#3b82f6"
          loading={busy === 'route'}
        />
        <BulkButton
          icon={PackageCheck}
          label="Marcar retirada"
          onClick={handlePickup}
          color="#059669"
          loading={busy === 'mark-picked-up'}
        />
        <BulkButton
          icon={AlertCircle}
          label="Cancelar"
          onClick={() => setShowCancelInput((s) => !s)}
          color="#6b7280"
          loading={busy === 'cancel'}
        />
        <BulkButton
          icon={Download}
          label="Exportar"
          onClick={() => runBulk('export')}
          color="#8B5CF6"
          loading={busy === 'export'}
        />
        <BulkButton
          icon={Trash2}
          label="Lixeira"
          onClick={handleDelete}
          color="#ef4444"
          loading={busy === 'soft-delete'}
        />
        <button
          onClick={onClear}
          aria-label="Limpar seleção"
          style={{
            marginLeft: 'auto',
            background: 'transparent',
            border: 'none',
            color: 'rgba(255,255,255,0.6)',
            cursor: 'pointer',
            padding: 'var(--space-2)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Inputs contextuais */}
      {showRouteInput && (
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-2)',
            padding: 'var(--space-3)',
            background: 'rgba(255,255,255,0.06)',
            borderRadius: 'var(--radius-md)',
            alignItems: 'center',
          }}
        >
          <input
            value={routeMotorista}
            onChange={(e) => setRouteMotorista(e.target.value)}
            placeholder="Motorista (obrigatório)"
            style={{
              flex: 2,
              padding: '6px 10px',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(255,255,255,0.08)',
              color: '#fff',
              fontSize: 13,
              outline: 'none',
            }}
            autoFocus
          />
          <input
            value={routePlaca}
            onChange={(e) => setRoutePlaca(e.target.value)}
            placeholder="Placa"
            style={{
              flex: 1,
              padding: '6px 10px',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(255,255,255,0.08)',
              color: '#fff',
              fontSize: 13,
              outline: 'none',
            }}
          />
          <button
            onClick={handleRoute}
            disabled={busy !== null}
            style={{
              padding: '6px 14px',
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Aplicar
          </button>
        </div>
      )}

      {showCancelInput && (
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-2)',
            padding: 'var(--space-3)',
            background: 'rgba(255,255,255,0.06)',
            borderRadius: 'var(--radius-md)',
            alignItems: 'center',
          }}
        >
          <input
            value={cancelMotivo}
            onChange={(e) => setCancelMotivo(e.target.value)}
            placeholder="Motivo do cancelamento (obrigatório)"
            style={{
              flex: 1,
              padding: '6px 10px',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(255,255,255,0.08)',
              color: '#fff',
              fontSize: 13,
              outline: 'none',
            }}
            autoFocus
          />
          <button
            onClick={handleCancel}
            disabled={busy !== null}
            style={{
              padding: '6px 14px',
              background: '#ef4444',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancelar todas
          </button>
        </div>
      )}
    </div>
  );
}

function BulkButton({
  icon: Icon, label, onClick, color, loading,
}: {
  icon: any;
  label: string;
  onClick: () => void;
  color: string;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 10px',
        background: 'transparent',
        color: '#fff',
        border: `1px solid ${color}`,
        borderRadius: 'var(--radius-sm)',
        fontSize: 12,
        fontWeight: 500,
        cursor: loading ? 'wait' : 'pointer',
        opacity: loading ? 0.6 : 1,
        transition: 'background var(--duration-fast)',
      }}
      onMouseEnter={(e) => {
        if (!loading) e.currentTarget.style.background = `${color}25`;
      }}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {loading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Icon size={14} />}
      {label}
    </button>
  );
}

// ─── Helpers de download ─────────────────────────────────────────────────
function downloadJson(rows: any[], filename: string) {
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
  triggerDownload(blob, filename);
}

function downloadCsv(rows: any[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    const values = headers.map((h) => {
      const v = row[h];
      if (v == null) return '';
      const s = String(v).replace(/"/g, '""');
      return /[,"\n]/.test(s) ? `"${s}"` : s;
    });
    lines.push(values.join(','));
  }
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
