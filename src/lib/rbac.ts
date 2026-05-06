/**
 * BravoForm — Sistema RBAC (Role-Based Access Control)
 *
 * Define permissões granulares e mapeia para os papéis BravoFlow.
 *
 * Hierarquia (do mais privilegiado pro menos):
 *   1. SuperAdmin       — controla múltiplas empresas (white-label / SaaS)
 *   2. AdminEmpresa     — admin de UMA empresa (configura tudo da empresa)
 *   3. Supervisor       — gerencia operação, vê tudo, aprova grandes ações
 *   4. AprovadorQualidade — aprova etapas de qualidade
 *   5. Roteirizador     — atribui motorista/rota
 *   6. OperadorRetirada — executa retiradas
 *   7. Solicitante      — abre solicitações
 *   8. Colaborador      — visualiza próprias instâncias
 *
 * Permissões são strings dot-notation (resource.action), facilitando GLOB:
 *   workflow.create   workflow.delete   workflow.*
 *   response.view     response.export   response.*
 *
 * USO em API route:
 *
 *   import { requirePermission } from '@/lib/rbac';
 *
 *   export async function POST(req: NextRequest) {
 *     const auth = await requirePermission(req, 'workflow.create');
 *     if (!auth.ok) return auth.response;  // 401 ou 403 com audit log
 *     const { actor, companyId } = auth;
 *     // ... lógica protegida
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { auditLog, AuditEventType } from '@/lib/audit';
import { logger } from '@/lib/logger';

// ─── Catálogo de permissões ────────────────────────────────────────────────
export const Permission = {
  // Workflow
  WORKFLOW_VIEW:      'workflow.view',
  WORKFLOW_CREATE:    'workflow.create',
  WORKFLOW_UPDATE:    'workflow.update',
  WORKFLOW_DELETE:    'workflow.delete',
  WORKFLOW_ACTIVATE:  'workflow.activate',

  // Workflow actions (executar etapas)
  WORKFLOW_APPROVE:    'workflow.approve',
  WORKFLOW_REJECT:     'workflow.reject',
  WORKFLOW_ROUTE:      'workflow.route',
  WORKFLOW_PICKUP:     'workflow.pickup',
  WORKFLOW_CANCEL:     'workflow.cancel',
  WORKFLOW_REPLICATE:  'workflow.replicate',

  // Forms
  FORM_VIEW:    'form.view',
  FORM_CREATE:  'form.create',
  FORM_UPDATE:  'form.update',
  FORM_DELETE:  'form.delete',

  // Responses
  RESPONSE_VIEW:     'response.view',
  RESPONSE_EXPORT:   'response.export',
  RESPONSE_DELETE:   'response.delete',
  RESPONSE_RESTORE:  'response.restore',

  // Users / Permissions
  USER_VIEW:     'user.view',
  USER_CREATE:   'user.create',
  USER_UPDATE:   'user.update',
  USER_DELETE:   'user.delete',
  ROLE_ASSIGN:   'user.role.assign',

  // Compliance
  AUDIT_VIEW:    'audit.view',
  AUDIT_EXPORT:  'audit.export',
  DSAR_EXECUTE:  'dsar.execute',  // executar export/forget de DSAR

  // System / Multi-tenant
  COMPANY_MANAGE: 'company.manage',
  SYSTEM_CONFIG:  'system.config',
} as const;

export type PermissionValue = typeof Permission[keyof typeof Permission];

// ─── Mapa de papéis → permissões ───────────────────────────────────────────
// `*` significa "todas as permissões". Permissões granulares listadas explicitamente.
const ROLE_PERMISSIONS: Record<string, (PermissionValue | '*')[]> = {
  SuperAdmin: ['*'],

  AdminEmpresa: [
    'workflow.*' as any, 'form.*' as any, 'response.*' as any, 'user.*' as any,
    'audit.view', 'audit.export', 'dsar.execute',
  ],

  Supervisor: [
    Permission.WORKFLOW_VIEW, Permission.WORKFLOW_UPDATE, Permission.WORKFLOW_ACTIVATE,
    Permission.WORKFLOW_APPROVE, Permission.WORKFLOW_REJECT, Permission.WORKFLOW_ROUTE,
    Permission.WORKFLOW_PICKUP, Permission.WORKFLOW_CANCEL,
    Permission.FORM_VIEW, Permission.FORM_UPDATE,
    Permission.RESPONSE_VIEW, Permission.RESPONSE_EXPORT, Permission.RESPONSE_DELETE, Permission.RESPONSE_RESTORE,
    Permission.USER_VIEW,
    Permission.AUDIT_VIEW,
  ],

  AprovadorQualidade: [
    Permission.WORKFLOW_VIEW,
    Permission.WORKFLOW_APPROVE, Permission.WORKFLOW_REJECT, Permission.WORKFLOW_REPLICATE,
    Permission.FORM_VIEW,
    Permission.RESPONSE_VIEW,
  ],

  Roteirizador: [
    Permission.WORKFLOW_VIEW,
    Permission.WORKFLOW_ROUTE,
    Permission.FORM_VIEW,
    Permission.RESPONSE_VIEW,
  ],

  OperadorRetirada: [
    Permission.WORKFLOW_VIEW,
    Permission.WORKFLOW_PICKUP, Permission.WORKFLOW_CANCEL,
    Permission.FORM_VIEW,
    Permission.RESPONSE_VIEW,
  ],

  Solicitante: [
    Permission.WORKFLOW_VIEW,
    Permission.FORM_VIEW, Permission.FORM_CREATE,
    Permission.RESPONSE_VIEW,
  ],

  Colaborador: [
    Permission.FORM_VIEW,
    Permission.RESPONSE_VIEW,
  ],
};

// ─── Verifica se um conjunto de papéis tem uma permissão ──────────────────
export function hasPermission(roles: string[], permission: PermissionValue): boolean {
  if (!roles || roles.length === 0) return false;

  for (const role of roles) {
    const perms = ROLE_PERMISSIONS[role];
    if (!perms) continue;

    // Wildcard total
    if (perms.includes('*')) return true;

    // Match exato
    if (perms.includes(permission)) return true;

    // Wildcard por categoria (workflow.* casa workflow.create)
    const category = permission.split('.')[0] + '.*';
    if (perms.includes(category as any)) return true;
  }

  return false;
}

// ─── Lê o "actor" da request ──────────────────────────────────────────────
// Suporta dois mecanismos:
//   1. Headers customizados (sessão app interna):
//        x-bravo-user-id, x-bravo-username, x-bravo-roles (CSV), x-bravo-company-id
//   2. Cookie de sessão Firebase (futuro: SSO/SAML)
//
// Em produção, recomenda-se mover para JWT signed + verify aqui.

export interface AuthenticatedActor {
  id: string;
  username: string;
  roles: string[];
  companyId?: string;
  departmentId?: string;
}

export function readActorFromRequest(req: NextRequest): AuthenticatedActor | null {
  const id = req.headers.get('x-bravo-user-id');
  if (!id) return null;

  const rolesHeader = req.headers.get('x-bravo-roles') || '';
  const roles = rolesHeader
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

  return {
    id,
    username: req.headers.get('x-bravo-username') || 'unknown',
    roles: roles.length > 0 ? roles : ['Colaborador'],
    companyId: req.headers.get('x-bravo-company-id') || undefined,
    departmentId: req.headers.get('x-bravo-department-id') || undefined,
  };
}

// ─── Resultado de requirePermission ───────────────────────────────────────
export type RbacResult =
  | { ok: true; actor: AuthenticatedActor }
  | { ok: false; response: NextResponse };

/**
 * Verifica se o requester tem a permissão necessária. Caso contrário,
 * retorna um NextResponse 401/403 e registra o evento no audit log.
 *
 * Como usar:
 *   const auth = await requirePermission(req, 'workflow.create');
 *   if (!auth.ok) return auth.response;
 *   const { actor } = auth;
 */
export async function requirePermission(
  req: NextRequest,
  permission: PermissionValue
): Promise<RbacResult> {
  const actor = readActorFromRequest(req);

  // 1) Não autenticado
  if (!actor) {
    await auditLog({
      eventType: AuditEventType.RBAC_DENIED,
      severity: 'warn',
      target: { type: 'permission', id: permission },
      payload: { reason: 'no_actor', path: req.nextUrl.pathname },
      success: false,
      request: req,
    });
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'Autenticação requerida' },
        { status: 401 }
      ),
    };
  }

  // 2) Autenticado mas sem permissão
  if (!hasPermission(actor.roles, permission)) {
    await auditLog({
      eventType: AuditEventType.RBAC_DENIED,
      severity: 'warn',
      actor: { id: actor.id, username: actor.username, role: actor.roles.join(',') },
      target: { type: 'permission', id: permission },
      companyId: actor.companyId,
      payload: { roles: actor.roles, path: req.nextUrl.pathname },
      success: false,
      request: req,
    });
    logger.warn('RBAC denied', {
      userId: actor.id,
      roles: actor.roles,
      permission,
      path: req.nextUrl.pathname,
    });
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: 'Permissão negada',
          required: permission,
        },
        { status: 403 }
      ),
    };
  }

  return { ok: true, actor };
}

/** Versão "soft" que retorna boolean ao invés de Response (útil em GETs) */
export function checkPermission(req: NextRequest, permission: PermissionValue): boolean {
  const actor = readActorFromRequest(req);
  if (!actor) return false;
  return hasPermission(actor.roles, permission);
}
