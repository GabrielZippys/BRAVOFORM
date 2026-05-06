'use client';

/**
 * /dashboard/audit — Painel de auditoria (compliance SOC 2 / LGPD).
 *
 * Lista todos os eventos sensíveis registrados em fact_audit_events com
 * filtros por tipo, severidade, actor, alvo e período. Permite exportar
 * o log para CSV/JSON conforme exigência ANPD.
 *
 * Permissão necessária: audit.view (admin/supervisor).
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  Shield, Search, Filter, Download, AlertTriangle, AlertCircle, Info,
  RefreshCw, User, Target, Clock, ChevronLeft, ChevronRight,
} from 'lucide-react';
import ErrorBoundary from '@/components/ErrorBoundary';
import { SkeletonTable } from '@/components/Skeleton';
import { logger } from '@/lib/logger';
import styles from '../../styles/Audit.module.css';

interface AuditEvent {
  audit_id: number;
  event_type: string;
  severity: 'info' | 'warn' | 'critical';
  actor_id: string | null;
  actor_username: string | null;
  actor_role: string | null;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  company_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  payload: Record<string, any>;
  success: boolean;
  error_message: string | null;
  created_at: string;
}

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; icon: any; label: string }> = {
  info: {
    color: 'var(--color-info-700)',
    bg: 'var(--color-info-50)',
    icon: Info,
    label: 'Info',
  },
  warn: {
    color: 'var(--color-warning-700)',
    bg: 'var(--color-warning-50)',
    icon: AlertTriangle,
    label: 'Aviso',
  },
  critical: {
    color: 'var(--color-danger-700)',
    bg: 'var(--color-danger-50)',
    icon: AlertCircle,
    label: 'Crítico',
  },
};

// Categorias para o filtro (mais legível que livre)
const EVENT_CATEGORIES = [
  { value: '', label: 'Todos os eventos' },
  { value: 'auth.login', label: '🔐 Login' },
  { value: 'auth.login.failed', label: '🚫 Login falhou' },
  { value: 'rbac.denied', label: '⛔ Permissão negada' },
  { value: 'workflow.action', label: '▶️ Ação de workflow' },
  { value: 'workflow.created', label: '➕ Workflow criado' },
  { value: 'workflow.deleted', label: '🗑️ Workflow excluído' },
  { value: 'response.deleted', label: '🗑️ Resposta excluída' },
  { value: 'response.exported', label: '📤 Resposta exportada' },
  { value: 'dsar.export', label: '📋 LGPD: Export DSAR' },
  { value: 'dsar.forget', label: '🔒 LGPD: Direito ao esquecimento' },
  { value: 'rate_limit.exceeded', label: '⚡ Rate limit excedido' },
];

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [filterType, setFilterType] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [searchActor, setSearchActor] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Paginação
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  // Modal de detalhes
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (filterType) params.set('eventType', filterType);
      if (filterSeverity) params.set('severity', filterSeverity);
      if (searchActor) params.set('actorId', searchActor);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);

      const res = await fetch(`/api/audit/events?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setEvents(json.data.rows);
        setTotal(json.data.total);
      } else {
        logger.warn('Audit events query failed', { error: json.error });
      }
    } catch (e) {
      logger.error('Falha ao carregar audit events', e);
    } finally {
      setLoading(false);
    }
  }, [filterType, filterSeverity, searchActor, fromDate, toDate, limit, offset]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleExport = (format: 'json' | 'csv') => {
    if (events.length === 0) return;
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      // CSV
      const headers = ['audit_id', 'event_type', 'severity', 'actor_username', 'target_type', 'target_id', 'ip_address', 'success', 'created_at'];
      const lines = [headers.join(',')];
      for (const e of events) {
        const row = [
          e.audit_id,
          e.event_type,
          e.severity,
          `"${(e.actor_username || '').replace(/"/g, '""')}"`,
          e.target_type || '',
          e.target_id || '',
          e.ip_address || '',
          e.success,
          e.created_at,
        ];
        lines.push(row.join(','));
      }
      const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-export-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <ErrorBoundary>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>
              <Shield size={28} /> Audit Log
            </h1>
            <p className={styles.subtitle}>
              Trilha de auditoria compliance-ready · SOC 2 · LGPD · ISO 27001
            </p>
          </div>
          <div className={styles.headerActions}>
            <button onClick={loadEvents} className={styles.btnSecondary} aria-label="Atualizar">
              <RefreshCw size={16} /> Atualizar
            </button>
            <button onClick={() => handleExport('csv')} className={styles.btnSecondary} disabled={events.length === 0}>
              <Download size={16} /> CSV
            </button>
            <button onClick={() => handleExport('json')} className={styles.btnPrimary} disabled={events.length === 0}>
              <Download size={16} /> JSON
            </button>
          </div>
        </header>

        {/* Filtros */}
        <div className={styles.filtersBar}>
          <div className={styles.filterGroup}>
            <Filter size={16} aria-hidden />
            <select
              value={filterType}
              onChange={(e) => { setFilterType(e.target.value); setOffset(0); }}
              className={styles.select}
              aria-label="Tipo de evento"
            >
              {EVENT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <select
              value={filterSeverity}
              onChange={(e) => { setFilterSeverity(e.target.value); setOffset(0); }}
              className={styles.select}
              aria-label="Severidade"
            >
              <option value="">Toda severidade</option>
              <option value="info">Info</option>
              <option value="warn">Aviso</option>
              <option value="critical">Crítico</option>
            </select>
          </div>
          <div className={styles.filterGroup}>
            <Search size={16} aria-hidden />
            <input
              type="text"
              value={searchActor}
              onChange={(e) => { setSearchActor(e.target.value); setOffset(0); }}
              placeholder="ID do usuário..."
              className={styles.input}
              aria-label="Buscar por ID de usuário"
            />
          </div>
          <div className={styles.filterGroup}>
            <Clock size={16} aria-hidden />
            <input
              type="date"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setOffset(0); }}
              className={styles.input}
              aria-label="Data inicial"
            />
            <span className={styles.dateSep}>→</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setOffset(0); }}
              className={styles.input}
              aria-label="Data final"
            />
          </div>
        </div>

        {/* Resumo */}
        <div className={styles.summary}>
          <strong>{total.toLocaleString('pt-BR')}</strong> evento{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}
          {totalPages > 1 && (
            <span className={styles.summaryPagination}>
              · Página {currentPage} de {totalPages}
            </span>
          )}
        </div>

        {/* Tabela */}
        {loading ? (
          <SkeletonTable rows={10} columns={5} />
        ) : events.length === 0 ? (
          <div className={styles.emptyState}>
            <Shield size={48} aria-hidden />
            <p>Nenhum evento encontrado com os filtros atuais.</p>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Severidade</th>
                  <th>Evento</th>
                  <th>Actor</th>
                  <th>Alvo</th>
                  <th>IP</th>
                  <th aria-label="Detalhes" />
                </tr>
              </thead>
              <tbody>
                {events.map((event) => {
                  const sev = SEVERITY_CONFIG[event.severity] || SEVERITY_CONFIG.info;
                  const SevIcon = sev.icon;
                  return (
                    <tr
                      key={event.audit_id}
                      onClick={() => setSelectedEvent(event)}
                      className={`${styles.row} ${!event.success ? styles.rowFailed : ''}`}
                    >
                      <td className={styles.cellMonospace}>{formatDate(event.created_at)}</td>
                      <td>
                        <span
                          className={styles.severityBadge}
                          style={{ background: sev.bg, color: sev.color }}
                        >
                          <SevIcon size={12} />
                          {sev.label}
                        </span>
                      </td>
                      <td>
                        <code className={styles.eventType}>{event.event_type}</code>
                        {!event.success && <span className={styles.failedBadge}>FALHA</span>}
                      </td>
                      <td>
                        {event.actor_username ? (
                          <span className={styles.actorCell}>
                            <User size={12} aria-hidden />
                            {event.actor_username}
                            {event.actor_role && <small> ({event.actor_role})</small>}
                          </span>
                        ) : (
                          <span className={styles.muted}>—</span>
                        )}
                      </td>
                      <td>
                        {event.target_type ? (
                          <span className={styles.targetCell}>
                            <Target size={12} aria-hidden />
                            {event.target_label || event.target_id?.slice(0, 12) || event.target_type}
                          </span>
                        ) : (
                          <span className={styles.muted}>—</span>
                        )}
                      </td>
                      <td className={styles.cellMonospace}>
                        {event.ip_address ? (
                          <span className={styles.ipCell}>{event.ip_address}</span>
                        ) : (
                          <span className={styles.muted}>—</span>
                        )}
                      </td>
                      <td>
                        <button className={styles.detailsBtn} aria-label="Ver detalhes">→</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginação */}
        {totalPages > 1 && !loading && (
          <div className={styles.pagination}>
            <button
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={offset === 0}
              className={styles.btnSecondary}
            >
              <ChevronLeft size={16} /> Anterior
            </button>
            <span className={styles.paginationInfo}>
              {offset + 1}–{Math.min(offset + limit, total)} de {total.toLocaleString('pt-BR')}
            </span>
            <button
              onClick={() => setOffset(offset + limit)}
              disabled={offset + limit >= total}
              className={styles.btnSecondary}
            >
              Próximo <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Modal de detalhes */}
        {selectedEvent && (
          <div
            className={styles.modalOverlay}
            onClick={() => setSelectedEvent(null)}
            role="dialog"
            aria-modal="true"
          >
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <header className={styles.modalHeader}>
                <h3>Detalhes do evento #{selectedEvent.audit_id}</h3>
                <button onClick={() => setSelectedEvent(null)} className={styles.btnClose} aria-label="Fechar">
                  ✕
                </button>
              </header>
              <div className={styles.modalBody}>
                <DetailRow label="Tipo" value={<code>{selectedEvent.event_type}</code>} />
                <DetailRow label="Severidade" value={selectedEvent.severity} />
                <DetailRow label="Quando" value={formatDate(selectedEvent.created_at)} />
                <DetailRow label="Sucesso" value={selectedEvent.success ? '✅ Sim' : '❌ Não'} />
                {selectedEvent.error_message && (
                  <DetailRow
                    label="Erro"
                    value={<span style={{ color: 'var(--color-danger-600)' }}>{selectedEvent.error_message}</span>}
                  />
                )}
                <hr className={styles.modalSep} />
                <DetailRow label="Actor ID" value={selectedEvent.actor_id || '—'} />
                <DetailRow label="Actor username" value={selectedEvent.actor_username || '—'} />
                <DetailRow label="Actor role" value={selectedEvent.actor_role || '—'} />
                <hr className={styles.modalSep} />
                <DetailRow label="Target type" value={selectedEvent.target_type || '—'} />
                <DetailRow label="Target ID" value={selectedEvent.target_id || '—'} />
                <DetailRow label="Target label" value={selectedEvent.target_label || '—'} />
                <hr className={styles.modalSep} />
                <DetailRow label="IP" value={selectedEvent.ip_address || '—'} />
                <DetailRow label="User-Agent" value={<small>{selectedEvent.user_agent || '—'}</small>} />
                <DetailRow label="Company" value={selectedEvent.company_id || '—'} />
                <hr className={styles.modalSep} />
                <div className={styles.payloadLabel}>Payload (JSON):</div>
                <pre className={styles.payloadJson}>
                  {JSON.stringify(selectedEvent.payload, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={styles.detailRow}>
      <span className={styles.detailLabel}>{label}</span>
      <span className={styles.detailValue}>{value}</span>
    </div>
  );
}
