'use client';

/**
 * useInstancesStream
 *
 * Hook que consome /api/instances/stream via EventSource (SSE).
 * Reconecta automaticamente em caso de queda. Fallback para polling
 * tradicional se SSE não estiver disponível (improvável em browsers
 * modernos, mas garante robustez em redes corporativas com proxies estranhos).
 *
 * Retorna:
 *   - instances: lista atual de instâncias
 *   - status: 'connecting' | 'connected' | 'disconnected' | 'error' | 'fallback'
 *   - lastUpdate: ISO timestamp da última atualização recebida
 *   - error: mensagem de erro se houver
 *   - reconnect(): força reconexão manual
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { logger } from '@/lib/logger';

export interface StreamInstance {
  id: string;
  formTitle: string | null;
  collaboratorUsername: string | null;
  status: string;
  currentStageId: string | null;
  motorista: string | null;
  placa: string | null;
  boletim: string | null;
  replicaCount: number | null;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  setorEntrega: string | null;
  enderecoEntrega: string | null;
}

export type StreamStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'fallback';

interface UseInstancesStreamOptions {
  /** Se true, usa polling fallback ao invés de SSE (default: false) */
  forcePolling?: boolean;
  /** Intervalo do fallback polling (default: 30s) */
  pollingIntervalMs?: number;
  /** URL do endpoint SSE (default: /api/instances/stream) */
  url?: string;
  /** URL do endpoint REST de fallback (default: /api/dataconnect/responses?workflowOnly=true) */
  fallbackUrl?: string;
}

const DEFAULT_URL = '/api/instances/stream';
const DEFAULT_FALLBACK_URL = '/api/dataconnect/responses?workflowOnly=true&limit=500';

export function useInstancesStream(options: UseInstancesStreamOptions = {}) {
  const {
    forcePolling = false,
    pollingIntervalMs = 30_000,
    url = DEFAULT_URL,
    fallbackUrl = DEFAULT_FALLBACK_URL,
  } = options;

  const [instances, setInstances] = useState<StreamInstance[]>([]);
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  // ─── Polling fallback ──────────────────────────────────────────────────
  const fetchPolling = useCallback(async () => {
    if (!mountedRef.current) return;
    try {
      const res = await fetch(fallbackUrl);
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && mountedRef.current) {
        setInstances(json.data as StreamInstance[]);
        setLastUpdate(new Date().toISOString());
        setStatus('fallback');
        setError(null);
      }
    } catch (e: any) {
      if (mountedRef.current) {
        setError(`Polling falhou: ${e.message}`);
      }
      logger.warn('useInstancesStream: polling failed', { error: e.message });
    }
  }, [fallbackUrl]);

  const startPolling = useCallback(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    setStatus('fallback');
    fetchPolling();
    pollingRef.current = setInterval(fetchPolling, pollingIntervalMs);
  }, [fetchPolling, pollingIntervalMs]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // ─── SSE ───────────────────────────────────────────────────────────────
  const connectSSE = useCallback(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      logger.info('useInstancesStream: EventSource não disponível, usando polling');
      startPolling();
      return;
    }

    setStatus('connecting');
    setError(null);

    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('connected', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        logger.debug('SSE connected', data);
      } catch { /* noop */ }
      if (mountedRef.current) {
        setStatus('connected');
        setError(null);
      }
    });

    es.addEventListener('update', (e) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse((e as MessageEvent).data);
        if (Array.isArray(data.instances)) {
          setInstances(data.instances as StreamInstance[]);
          setLastUpdate(data.snapshotAt || new Date().toISOString());
        }
      } catch (parseErr) {
        logger.warn('SSE: failed to parse update', { error: (parseErr as Error).message });
      }
    });

    es.addEventListener('heartbeat', () => {
      if (mountedRef.current && status !== 'connected') {
        setStatus('connected');
      }
    });

    es.addEventListener('error', (e) => {
      if (!mountedRef.current) return;
      logger.warn('SSE: error event', { readyState: es.readyState });

      // EventSource.CLOSED = 2 — servidor fechou ou erro fatal
      if (es.readyState === EventSource.CLOSED) {
        setStatus('disconnected');
        es.close();
        esRef.current = null;

        // Backoff exponencial: tenta reconectar em 3s, depois 6s, depois 12s
        if (reconnectRef.current) clearTimeout(reconnectRef.current);
        reconnectRef.current = setTimeout(() => {
          if (mountedRef.current && !forcePolling) {
            connectSSE();
          }
        }, 3_000);
      }
    });
  }, [url, forcePolling, startPolling, status]);

  // ─── Public API ────────────────────────────────────────────────────────
  const reconnect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    stopPolling();
    if (forcePolling) {
      startPolling();
    } else {
      connectSSE();
    }
  }, [connectSSE, startPolling, stopPolling, forcePolling]);

  // ─── Lifecycle ─────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    if (forcePolling) {
      startPolling();
    } else {
      connectSSE();
    }

    return () => {
      mountedRef.current = false;
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      stopPolling();
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
    };
  }, [forcePolling, connectSSE, startPolling, stopPolling]);

  return {
    instances,
    status,
    lastUpdate,
    error,
    reconnect,
  };
}
