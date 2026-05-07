/**
 * GET /api/instances/stream
 *
 * Server-Sent Events (SSE) — substitui o polling de 60s do frontend.
 *
 * O servidor mantém a conexão aberta e empurra atualizações ao cliente
 * sempre que detectar mudança no conjunto de instâncias workflow-only.
 *
 * Vantagens vs polling cliente:
 *   • UX em tempo real (sub-segundo) ao invés de até 60s de atraso
 *   • Servidor consulta o banco UMA vez por ciclo e multiplexa para N clientes
 *     futuramente (atualmente 1:1 mas a estrutura permite extensão)
 *   • Cliente reconecta automaticamente em caso de desconexão (browser nativo)
 *   • Headers HTTP/2 são reusados — sem overhead de TCP handshake repetido
 *
 * Estratégia de detecção de mudança:
 *   • Snapshot por ciclo: faz a mesma query do GET /api/dataconnect/responses
 *     com workflowOnly=true e gera um hash determinístico das linhas relevantes
 *     (id + status + currentStageId + motorista + boletim + replicaCount)
 *   • Se o hash mudou desde o último ciclo, envia evento `update` com snapshot
 *     completo. Se não, envia apenas `heartbeat` para manter a conexão viva
 *     (proxies derrubam conexões silenciosas após ~60s)
 *
 * Frequência:
 *   • POLL_INTERVAL_MS = 5000 (5s) — balanço entre responsividade e custo DB
 *   • HEARTBEAT_INTERVAL_MS = 25_000 — força keep-alive no proxy
 *   • MAX_DURATION_MS = 240_000 (4min) — abaixo do limit Vercel; cliente
 *     reconecta após esse tempo automaticamente
 *
 * Formato dos eventos (text/event-stream):
 *
 *   event: connected
 *   data: {"clientId":"abc","intervalMs":5000}
 *
 *   event: update
 *   data: { instances: [...], snapshotAt: "2026-..." }
 *
 *   event: heartbeat
 *   data: {"t":1706...}
 *
 *   event: error
 *   data: {"error":"..."}
 *
 * Cliente consome via EventSource:
 *
 *   const es = new EventSource('/api/instances/stream');
 *   es.addEventListener('update', (e) => { ... });
 */

import type { NextRequest } from 'next/server';
import { getPool } from '@/lib/db/postgresql';
import { ensureWorkflowSchema } from '@/lib/db/workflowMigration';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

// Necessário para streaming (Edge runtime não suporta pg, então usa Node)
export const runtime = 'nodejs';
// Sem cache — cada conexão é única
export const dynamic = 'force-dynamic';

// Em produção, mesmo com pool max=1, múltiplos clientes SSE simultâneos
// pressionam o servidor Postgres (max_connections estourou). 30s é o
// trade-off entre "tempo real" percebido e custo. Se ficar inviável,
// desligar o SSE e cair pra polling client-side puro (já implementado
// no useInstancesStream com forcePolling).
const POLL_INTERVAL_MS      = 30_000;
const HEARTBEAT_INTERVAL_MS = 25_000;
const MAX_DURATION_MS       = 240_000;
// Timeout pra pegar conexão do pool dentro do SSE — falha rápido pra
// não travar o lambda e permitir que outros tentem.
const POOL_ACQUIRE_TIMEOUT_MS = 4_000;
// Circuit breaker bem agressivo: 2 erros consecutivos já fecha a stream
// e o cliente cai automático no fallback de polling (mais resiliente
// que ficar tentando no SSE com pool saturado).
const MAX_CONSECUTIVE_ERRORS = 2;

// Erros do Postgres que indicam saturação total — não adianta retry no
// próximo ciclo, melhor fechar stream e deixar o cliente migrar pra
// polling fallback que naturalmente espalha as requisições no tempo.
function isFatalPoolError(err: any): boolean {
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('remaining connection slots') ||
    msg.includes('too many clients') ||
    msg.includes('max_connections') ||
    msg.includes('pg_use_reserved_connections')
  );
}

interface InstanceRow {
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
  // SLA fields (do recompute periódico)
  slaStatus: string | null;
  slaPredictedMinutes: number | null;
  slaTargetMinutes: number | null;
  slaPercentOfTarget: number | null;
}

/**
 * Pega conexão do pool com timeout próprio.
 *
 * ⚠️ LEAK FIX: Promise.race rejeita o caller mas a pool.connect() ORIGINAL
 * continua pendente. Quando ela resolve depois do timeout, pega um client
 * sem ninguém chamar release() — leak permanente. Para evitar:
 *   • Aguardamos a Promise original sempre
 *   • Se já passou do timeout, RELEASE o client imediatamente em vez
 *     de retorná-lo
 */
async function acquireClientWithTimeout(timeoutMs: number) {
  const pool = getPool();
  let timedOut = false;
  let timeoutHandle: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      reject(new Error('pool acquire timeout'));
    }, timeoutMs);
  });

  const connectPromise = pool.connect().then((client) => {
    if (timedOut) {
      // Race perdeu — solta o client de volta no pool em vez de leak
      try { client.release(); } catch { /* noop */ }
      throw new Error('pool acquire timeout');
    }
    if (timeoutHandle) clearTimeout(timeoutHandle);
    return client;
  });

  return Promise.race([connectPromise, timeoutPromise]);
}

async function fetchSnapshot(): Promise<InstanceRow[]> {
  const client = await acquireClientWithTimeout(POOL_ACQUIRE_TIMEOUT_MS);
  try {
    await ensureWorkflowSchema(client);

    const result = await client.query<InstanceRow>(`
      SELECT
        fr.firebase_id            AS id,
        COALESCE(fr.form_title, df.title, '') AS "formTitle",
        fr.collaborator_username  AS "collaboratorUsername",
        fr.status,
        fr.current_stage_fb_id    AS "currentStageId",
        fr.motorista,
        fr.placa,
        fr.boletim,
        fr.replica_count          AS "replicaCount",
        fr.submitted_at           AS "submittedAt",
        fr.approved_at            AS "approvedAt",
        fr.rejection_reason       AS "rejectionReason",
        fr.setor_entrega          AS "setorEntrega",
        fr.endereco_entrega       AS "enderecoEntrega",
        fr.sla_status             AS "slaStatus",
        fr.sla_predicted_minutes  AS "slaPredictedMinutes",
        fr.sla_target_minutes     AS "slaTargetMinutes",
        CASE
          WHEN fr.sla_target_minutes > 0 AND fr.sla_predicted_minutes IS NOT NULL
          THEN (fr.sla_predicted_minutes / fr.sla_target_minutes * 100)::numeric(10,1)
          ELSE NULL
        END                       AS "slaPercentOfTarget"
      FROM fact_form_response fr
      LEFT JOIN dim_forms df ON df.form_key = fr.form_key
      WHERE fr.deleted_at IS NULL
        AND (
          fr.current_stage_fb_id IS NOT NULL
          OR fr.motorista IS NOT NULL
          OR fr.placa IS NOT NULL
          OR fr.boletim IS NOT NULL
          OR fr.protocolo_cancelamento IS NOT NULL
          OR fr.approved_at IS NOT NULL
          OR fr.rejected_at IS NOT NULL
          OR (df.fields_json IS NOT NULL AND (
                df.fields_json->>'isWorkflowEnabled' = 'true'
                OR (df.fields_json->>'defaultWorkflowId' IS NOT NULL
                    AND df.fields_json->>'defaultWorkflowId' <> '')
              ))
        )
      ORDER BY COALESCE(fr.submitted_at, fr.created_at) DESC
      LIMIT 500
    `);

    return result.rows;
  } finally {
    client.release();
  }
}

function hashSnapshot(rows: InstanceRow[]): string {
  // Hash dos campos que importam — ignora timestamps de leitura
  const sig = rows.map((r) =>
    `${r.id}|${r.status}|${r.currentStageId ?? ''}|${r.motorista ?? ''}|${r.boletim ?? ''}|${r.replicaCount ?? 0}`
  ).join(';');
  return crypto.createHash('sha256').update(sig).digest('hex').slice(0, 16);
}

export async function GET(request: NextRequest) {
  const clientId = crypto.randomBytes(8).toString('hex');
  const startedAt = Date.now();

  // ⚡ KILL SWITCH: se BRAVOFORM_SSE_DISABLED=1, responde imediatamente com
  // evento 'fallback' fazendo o cliente migrar pra polling sem nem tentar
  // abrir conexão com o banco. Útil quando o servidor PG está saturado em
  // produção e queremos aliviar a pressão sem novo deploy.
  if (process.env.BRAVOFORM_SSE_DISABLED === '1') {
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(
          `event: connected\ndata: ${JSON.stringify({ clientId, intervalMs: 0 })}\n\n` +
          `event: fallback\ndata: ${JSON.stringify({ reason: 'sse_disabled' })}\n\n`
        ));
        controller.close();
      },
    });
    logger.info('SSE: kill switch active — instructing client to use polling', { clientId });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  }

  logger.info('SSE: client connected', { clientId });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (event: string, data: any) => {
        try {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch (e) {
          // controller pode estar fechado se o cliente desconectou
          logger.debug('SSE: enqueue failed (client likely disconnected)', { clientId });
        }
      };

      // Evento inicial
      send('connected', { clientId, intervalMs: POLL_INTERVAL_MS });

      let lastHash = '';
      let pollTimer: NodeJS.Timeout | null = null;
      let heartbeatTimer: NodeJS.Timeout | null = null;
      let closed = false;
      let consecutiveErrors = 0;

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (pollTimer) clearInterval(pollTimer);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        try {
          controller.close();
        } catch {
          /* já fechado */
        }
        logger.info('SSE: client disconnected', {
          clientId,
          durationMs: Date.now() - startedAt,
        });
      };

      // Detecta desconexão do cliente (request abort)
      request.signal.addEventListener('abort', cleanup);

      // Snapshot inicial — se falhar, NÃO envia error (cliente vê conexão
      // estabelecida mas sem dados; próximo ciclo tenta de novo).
      try {
        const rows = await fetchSnapshot();
        lastHash = hashSnapshot(rows);
        send('update', {
          instances: rows,
          snapshotAt: new Date().toISOString(),
          count: rows.length,
        });
      } catch (e: any) {
        // Erro fatal de saturação → fecha stream imediatamente.
        // Cliente cai no fallback de polling que natural-spread as requests.
        if (isFatalPoolError(e)) {
          logger.warn('SSE: db saturated on initial snapshot — closing for polling fallback', {
            clientId, error: e.message,
          });
          // Sinaliza ao cliente para usar fallback (status 503 implícito via close)
          send('fallback', { reason: 'db_saturated' });
          cleanup();
          return;
        }
        logger.warn('SSE: initial snapshot failed (will retry)', { clientId, error: e.message });
        consecutiveErrors = 1;
      }

      // Loop de polling com circuit breaker
      pollTimer = setInterval(async () => {
        if (closed) return;
        try {
          const rows = await fetchSnapshot();
          consecutiveErrors = 0;  // reset no sucesso

          const hash = hashSnapshot(rows);
          if (hash !== lastHash) {
            lastHash = hash;
            send('update', {
              instances: rows,
              snapshotAt: new Date().toISOString(),
              count: rows.length,
            });
          }
        } catch (e: any) {
          // Saturação total → fecha imediatamente (não conta no breaker)
          if (isFatalPoolError(e)) {
            logger.warn('SSE: db saturated mid-stream — closing for polling fallback', {
              clientId, error: e.message,
            });
            send('fallback', { reason: 'db_saturated' });
            cleanup();
            return;
          }

          consecutiveErrors++;
          logger.warn('SSE: poll cycle error', {
            clientId,
            error: e.message,
            consecutiveErrors,
          });

          // Circuit breaker mais agressivo: 2 erros já fecha
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            logger.warn('SSE: circuit breaker open — closing stream', {
              clientId,
              consecutiveErrors,
            });
            send('fallback', { reason: 'too_many_errors' });
            cleanup();
            return;
          }
          // NÃO envia error event ao cliente em erros transitórios isolados
        }
      }, POLL_INTERVAL_MS);

      // Heartbeat keep-alive (proxies derrubam conexões silenciosas)
      heartbeatTimer = setInterval(() => {
        if (closed) return;
        send('heartbeat', { t: Date.now() });
      }, HEARTBEAT_INTERVAL_MS);

      // Auto-close depois de MAX_DURATION_MS — cliente reconecta sozinho
      setTimeout(cleanup, MAX_DURATION_MS);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':       'text/event-stream',
      'Cache-Control':      'no-cache, no-transform',
      'Connection':         'keep-alive',
      'X-Accel-Buffering':  'no',         // nginx: desabilita buffer
    },
  });
}
