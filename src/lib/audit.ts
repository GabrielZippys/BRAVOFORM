/**
 * BravoForm — Audit Logger
 *
 * Wrapper sobre fact_audit_events. Garante append-only, fail-soft (nunca
 * quebra a request por erro de audit) e enriquecimento automático com
 * IP/User-Agent quando chamado de uma route handler do Next.js.
 *
 * USO TÍPICO numa API route:
 *
 *   import { auditLog, AuditEventType } from '@/lib/audit';
 *
 *   await auditLog({
 *     eventType: AuditEventType.WORKFLOW_ACTION,
 *     actor: { id: userId, username, role },
 *     target: { type: 'response', id: responseId, label: formTitle },
 *     companyId,
 *     payload: { action, previousStatus: 'pending', newStatus: 'approved' },
 *     request,  // passa NextRequest p/ extrair IP + User-Agent
 *   });
 *
 * NUNCA logue:
 *   - senhas, tokens, secrets
 *   - dados de cartão / CPF / RG nos campos searchable (use payload com mask)
 *
 * Para LGPD: payload é JSONB — fácil de mascarar/anonimizar via UPDATE
 * em uma única coluna se houver DSAR de "right to be forgotten".
 */

import type { NextRequest } from 'next/server';
import { getPool } from '@/lib/db/postgresql';
import { ensureAuditSchema } from '@/lib/db/auditMigration';
import { logger } from '@/lib/logger';

// ─── Catálogo de tipos de evento (use enum para evitar typos) ─────────────
export const AuditEventType = {
  // Auth
  LOGIN:           'auth.login',
  LOGIN_FAILED:    'auth.login.failed',
  LOGOUT:          'auth.logout',
  PASSWORD_CHANGE: 'auth.password.changed',
  MFA_ENABLED:     'auth.mfa.enabled',
  MFA_DISABLED:    'auth.mfa.disabled',

  // RBAC
  RBAC_DENIED:     'rbac.denied',
  PERMISSION_GRANTED: 'rbac.permission.granted',
  PERMISSION_REVOKED: 'rbac.permission.revoked',
  ROLE_CHANGED:    'rbac.role.changed',

  // Workflow
  WORKFLOW_CREATED: 'workflow.created',
  WORKFLOW_UPDATED: 'workflow.updated',
  WORKFLOW_DELETED: 'workflow.deleted',
  WORKFLOW_ACTION:  'workflow.action',          // approve/reject/route/etc.
  WORKFLOW_ACTIVATED:   'workflow.activated',
  WORKFLOW_DEACTIVATED: 'workflow.deactivated',

  // Forms / Responses
  FORM_CREATED:     'form.created',
  FORM_DELETED:     'form.deleted',
  RESPONSE_VIEWED:  'response.viewed',
  RESPONSE_EXPORTED: 'response.exported',
  RESPONSE_DELETED: 'response.deleted',
  RESPONSE_RESTORED: 'response.restored',

  // Compliance / LGPD
  DSAR_EXPORT:      'dsar.export',
  DSAR_FORGET:      'dsar.forget',
  DATA_BREACH_LOGGED: 'compliance.breach.logged',

  // System
  RATE_LIMIT_EXCEEDED: 'rate_limit.exceeded',
  CONFIG_CHANGED:      'system.config.changed',
  CRON_EXECUTED:       'system.cron.executed',
} as const;

export type AuditEventTypeValue = typeof AuditEventType[keyof typeof AuditEventType];

export type AuditSeverity = 'info' | 'warn' | 'critical';

export interface AuditActor {
  id: string;
  username?: string;
  role?: string;
}

export interface AuditTarget {
  type: string;
  id?: string;
  /** Label legível (ex: nome do form/workflow) — facilita leitura no painel */
  label?: string;
}

export interface AuditLogParams {
  eventType: AuditEventTypeValue;
  severity?: AuditSeverity;
  actor?: AuditActor;
  target?: AuditTarget;
  companyId?: string;
  departmentId?: string;
  payload?: Record<string, any>;
  success?: boolean;
  errorMessage?: string;
  /** Passe a NextRequest para extrair IP e User-Agent automaticamente */
  request?: NextRequest;
  /** IP/UA explícitos (override do request) */
  ipAddress?: string;
  userAgent?: string;
}

// ─── Extração segura de IP do header ──────────────────────────────────────
function extractIp(req?: NextRequest): string | undefined {
  if (!req) return undefined;
  // Ordem: x-forwarded-for (chain — pega o primeiro), x-real-ip, fallback
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const xri = req.headers.get('x-real-ip');
  if (xri) return xri.slice(0, 64);
  return undefined;
}

function extractUserAgent(req?: NextRequest): string | undefined {
  if (!req) return undefined;
  const ua = req.headers.get('user-agent');
  return ua ? ua.slice(0, 500) : undefined;
}

/**
 * Registra um evento de audit. Fail-soft: erros são logados mas NUNCA
 * propagados — audit nunca quebra a request principal.
 */
export async function auditLog(params: AuditLogParams): Promise<void> {
  const pool = getPool();
  let client;

  try {
    client = await pool.connect();
    await ensureAuditSchema(client);

    const ip = params.ipAddress || extractIp(params.request);
    const ua = params.userAgent || extractUserAgent(params.request);

    await client.query(
      `INSERT INTO fact_audit_events (
        event_type, severity,
        actor_id, actor_username, actor_role,
        target_type, target_id, target_label,
        company_id, department_id,
        ip_address, user_agent,
        payload, success, error_message
      ) VALUES (
        $1, $2,
        $3, $4, $5,
        $6, $7, $8,
        $9, $10,
        $11, $12,
        $13, $14, $15
      )`,
      [
        params.eventType,
        params.severity || 'info',
        params.actor?.id || null,
        params.actor?.username || null,
        params.actor?.role || null,
        params.target?.type || null,
        params.target?.id || null,
        params.target?.label?.slice(0, 500) || null,
        params.companyId || null,
        params.departmentId || null,
        ip || null,
        ua || null,
        JSON.stringify(params.payload || {}),
        params.success !== false,
        params.errorMessage?.slice(0, 2000) || null,
      ]
    );
  } catch (error) {
    // FAIL-SOFT: nunca propagar erro de audit
    logger.error('auditLog failed (fail-soft, request continues)', error, {
      eventType: params.eventType,
      actorId: params.actor?.id,
    });
  } finally {
    if (client) client.release();
  }
}

// ─── Query helpers para o painel admin ─────────────────────────────────────

export interface AuditQueryFilters {
  eventType?: string;
  actorId?: string;
  targetType?: string;
  targetId?: string;
  companyId?: string;
  severity?: AuditSeverity;
  from?: Date | string;
  to?: Date | string;
  limit?: number;
  offset?: number;
}

export interface AuditEventRow {
  audit_id: number;
  event_type: string;
  severity: AuditSeverity;
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

export async function queryAuditEvents(
  filters: AuditQueryFilters = {}
): Promise<{ rows: AuditEventRow[]; total: number }> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureAuditSchema(client);

    const conds: string[] = [];
    const params: any[] = [];
    let i = 1;

    if (filters.eventType) {
      conds.push(`event_type = $${i++}`);
      params.push(filters.eventType);
    }
    if (filters.actorId) {
      conds.push(`actor_id = $${i++}`);
      params.push(filters.actorId);
    }
    if (filters.targetType) {
      conds.push(`target_type = $${i++}`);
      params.push(filters.targetType);
    }
    if (filters.targetId) {
      conds.push(`target_id = $${i++}`);
      params.push(filters.targetId);
    }
    if (filters.companyId) {
      conds.push(`company_id = $${i++}`);
      params.push(filters.companyId);
    }
    if (filters.severity) {
      conds.push(`severity = $${i++}`);
      params.push(filters.severity);
    }
    if (filters.from) {
      conds.push(`created_at >= $${i++}`);
      params.push(filters.from);
    }
    if (filters.to) {
      conds.push(`created_at <= $${i++}`);
      params.push(filters.to);
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const limit = Math.min(filters.limit ?? 100, 500);
    const offset = filters.offset ?? 0;

    const [rowsResult, countResult] = await Promise.all([
      client.query(
        `SELECT * FROM fact_audit_events ${where}
         ORDER BY created_at DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params
      ),
      client.query(`SELECT COUNT(*)::int AS total FROM fact_audit_events ${where}`, params),
    ]);

    return {
      rows: rowsResult.rows as AuditEventRow[],
      total: countResult.rows[0]?.total || 0,
    };
  } finally {
    client.release();
  }
}
