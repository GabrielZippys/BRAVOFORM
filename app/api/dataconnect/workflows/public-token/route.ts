/**
 * /api/dataconnect/workflows/public-token
 *
 * Gera ou regenera o token público de um workflow.
 *
 * GET    ?workflowId=xxx                          → retorna token atual (cria se não existir)
 * POST   { workflowId, action?, performedBy }     → 'create' (default) ou 'regenerate' (invalida o antigo)
 * DELETE ?workflowId=xxx                          → revoga token (desabilita link)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';
import { ensurePublicLinkSchema } from '@/lib/db/publicLinkMigration';
import { auditLog, AuditEventType } from '@/lib/audit';
import { rateLimitMutation, rateLimitRead } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

function generateToken(): string {
  // 32 bytes = 64 chars hex — anti-enumeração + URL-safe
  return crypto.randomBytes(32).toString('hex');
}

// ─── GET: lê token atual (cria se não existir) ────────────────────────
export async function GET(request: NextRequest) {
  const rl = await rateLimitRead(request);
  if (!rl.ok) return rl.response;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensurePublicLinkSchema(client);

    const { searchParams } = new URL(request.url);
    const workflowId = searchParams.get('workflowId');

    if (!workflowId) {
      return NextResponse.json(
        { success: false, error: 'workflowId é obrigatório' },
        { status: 400 }
      );
    }

    const res = await client.query(
      `SELECT public_token, public_link_enabled, public_token_created_at, is_active, name
       FROM dim_workflows
       WHERE firebase_id = $1 AND deleted_at IS NULL`,
      [workflowId]
    );

    if (res.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Workflow não encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        workflowId,
        workflowName: res.rows[0].name,
        publicToken: res.rows[0].public_token || null,
        publicLinkEnabled: res.rows[0].public_link_enabled ?? true,
        publicTokenCreatedAt: res.rows[0].public_token_created_at,
        workflowIsActive: res.rows[0].is_active ?? true,
      },
    });
  } catch (error: any) {
    logger.error('workflows/public-token GET error', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}

// ─── POST: cria ou regenera token ─────────────────────────────────────
export async function POST(request: NextRequest) {
  const rl = await rateLimitMutation(request);
  if (!rl.ok) return rl.response;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensurePublicLinkSchema(client);

    const body = await request.json();
    const { workflowId, action = 'create', performedBy, performedByName } = body;

    if (!workflowId) {
      return NextResponse.json(
        { success: false, error: 'workflowId é obrigatório' },
        { status: 400 }
      );
    }

    if (!['create', 'regenerate'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'action inválida (use "create" ou "regenerate")' },
        { status: 400 }
      );
    }

    // Verifica que workflow existe
    const wfRes = await client.query(
      `SELECT public_token, name FROM dim_workflows
       WHERE firebase_id = $1 AND deleted_at IS NULL`,
      [workflowId]
    );
    if (wfRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Workflow não encontrado' },
        { status: 404 }
      );
    }

    const existing = wfRes.rows[0].public_token;

    // Se já existe e action='create', retorna o atual (idempotente)
    if (existing && action === 'create') {
      return NextResponse.json({
        success: true,
        data: { publicToken: existing, regenerated: false },
      });
    }

    // Gera novo token (com retry caso de colisão raríssima)
    let newToken = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      newToken = generateToken();
      const collisionCheck = await client.query(
        `SELECT 1 FROM dim_workflows WHERE public_token = $1 LIMIT 1`,
        [newToken]
      );
      if (collisionCheck.rowCount === 0) break;
      if (attempt === 2) {
        return NextResponse.json(
          { success: false, error: 'Não foi possível gerar token único' },
          { status: 500 }
        );
      }
    }

    await client.query(
      `UPDATE dim_workflows
       SET public_token = $2,
           public_token_created_at = NOW(),
           public_link_enabled = TRUE,
           updated_at = NOW()
       WHERE firebase_id = $1`,
      [workflowId, newToken]
    );

    await auditLog({
      eventType: AuditEventType.CONFIG_CHANGED,
      severity: action === 'regenerate' ? 'warn' : 'info',
      actor: { id: performedBy || 'unknown', username: performedByName },
      target: { type: 'workflow', id: workflowId, label: wfRes.rows[0].name },
      payload: {
        action: action === 'regenerate' ? 'public_token_regenerated' : 'public_token_created',
        oldTokenHash: existing ? crypto.createHash('sha256').update(existing).digest('hex').slice(0, 12) : null,
      },
      request,
    });

    return NextResponse.json({
      success: true,
      data: {
        publicToken: newToken,
        regenerated: action === 'regenerate',
      },
    });
  } catch (error: any) {
    logger.error('workflows/public-token POST error', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}

// ─── DELETE: revoga link (limpa token + desabilita) ────────────────────
export async function DELETE(request: NextRequest) {
  const rl = await rateLimitMutation(request);
  if (!rl.ok) return rl.response;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensurePublicLinkSchema(client);

    const { searchParams } = new URL(request.url);
    const workflowId = searchParams.get('workflowId');
    const performedBy = searchParams.get('performedBy') || 'unknown';

    if (!workflowId) {
      return NextResponse.json(
        { success: false, error: 'workflowId é obrigatório' },
        { status: 400 }
      );
    }

    await client.query(
      `UPDATE dim_workflows
       SET public_token = NULL,
           public_link_enabled = FALSE,
           updated_at = NOW()
       WHERE firebase_id = $1`,
      [workflowId]
    );

    await auditLog({
      eventType: AuditEventType.CONFIG_CHANGED,
      severity: 'warn',
      actor: { id: performedBy },
      target: { type: 'workflow', id: workflowId },
      payload: { action: 'public_token_revoked' },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    logger.error('workflows/public-token DELETE error', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}
