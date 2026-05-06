/**
 * /api/dataconnect/workflow-versions
 *
 * Gerencia versões de workflows (drafts, publicações, arquivamento).
 *
 * GET    ?workflowId=xxx                 → lista todas as versões do workflow
 * GET    ?workflowId=xxx&status=active   → busca a versão active
 * POST   { workflowId, stages, ... }     → cria draft (incrementa version_number)
 * PATCH  { versionId, action: 'publish' | 'archive' | 'restore', ... }
 *
 * Quando publica:
 *   1) Versão atual `active` (se houver) vira `archived`
 *   2) O draft especificado vira `active`
 *   3) Histórico em fact_audit_events (severity=info)
 *
 * Compatibilidade: workflows existentes sem versão registrada são tratados
 * como "v0 implícita" — primeira chamada cria v1 automática a partir do
 * estado atual em dim_workflow_stages.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';
import { ensureVersioningSchema } from '@/lib/db/versioningMigration';
import { auditLog, AuditEventType } from '@/lib/audit';
import { rateLimitMutation, rateLimitRead } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

// ─── GET ─────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const rl = await rateLimitRead(request);
  if (!rl.ok) return rl.response;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureVersioningSchema(client);

    const { searchParams } = new URL(request.url);
    const workflowId = searchParams.get('workflowId');
    const status     = searchParams.get('status');

    if (!workflowId) {
      return NextResponse.json(
        { success: false, error: 'workflowId é obrigatório' },
        { status: 400 }
      );
    }

    let query = `
      SELECT
        version_id, workflow_fb_id, version_number, status,
        stages_json, activation_json, metadata_json,
        created_at, created_by, created_by_name,
        published_at, published_by, published_by_name,
        archived_at, archived_by,
        change_notes
      FROM dim_workflow_versions
      WHERE workflow_fb_id = $1
    `;
    const params: any[] = [workflowId];

    if (status) {
      query += ' AND status = $2';
      params.push(status);
    }

    query += ' ORDER BY version_number DESC';

    const result = await client.query(query, params);

    return NextResponse.json({
      success: true,
      data: result.rows,
      count: result.rowCount,
    });
  } catch (error: any) {
    logger.error('workflow-versions GET error', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}

// ─── POST: criar nova draft ──────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const rl = await rateLimitMutation(request);
  if (!rl.ok) return rl.response;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureVersioningSchema(client);

    const body = await request.json();
    const {
      workflowId,
      stages,
      activationSettings,
      metadata,
      changeNotes,
      createdBy,
      createdByName,
    } = body;

    if (!workflowId || !Array.isArray(stages)) {
      return NextResponse.json(
        { success: false, error: 'workflowId e stages (array) são obrigatórios' },
        { status: 400 }
      );
    }

    // Próximo version_number = MAX + 1 (transação para evitar race)
    await client.query('BEGIN');

    const maxRes = await client.query(
      `SELECT COALESCE(MAX(version_number), 0) AS max_v
       FROM dim_workflow_versions
       WHERE workflow_fb_id = $1`,
      [workflowId]
    );
    const nextVersion = (maxRes.rows[0]?.max_v || 0) + 1;

    const inserted = await client.query(
      `INSERT INTO dim_workflow_versions (
        workflow_fb_id, version_number, status,
        stages_json, activation_json, metadata_json,
        created_by, created_by_name, change_notes
      ) VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7, $8)
      RETURNING version_id, version_number, created_at`,
      [
        workflowId,
        nextVersion,
        JSON.stringify(stages),
        JSON.stringify(activationSettings || {}),
        JSON.stringify(metadata || {}),
        createdBy || null,
        createdByName || null,
        changeNotes || null,
      ]
    );

    await client.query('COMMIT');

    const newVersion = inserted.rows[0];

    await auditLog({
      eventType: AuditEventType.WORKFLOW_UPDATED,
      severity: 'info',
      actor: { id: createdBy || 'unknown', username: createdByName },
      target: { type: 'workflow', id: workflowId, label: `v${nextVersion} draft` },
      payload: {
        action: 'version_created',
        versionId: newVersion.version_id,
        versionNumber: nextVersion,
        stageCount: stages.length,
      },
      request,
    });

    return NextResponse.json({
      success: true,
      data: {
        versionId: newVersion.version_id,
        versionNumber: newVersion.version_number,
        status: 'draft',
        createdAt: newVersion.created_at,
      },
    });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('workflow-versions POST error', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}

// ─── PATCH: publish | archive | restore ──────────────────────────────────
export async function PATCH(request: NextRequest) {
  const rl = await rateLimitMutation(request);
  if (!rl.ok) return rl.response;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureVersioningSchema(client);

    const body = await request.json();
    const { versionId, action, performedBy, performedByName } = body;

    if (!versionId || !action) {
      return NextResponse.json(
        { success: false, error: 'versionId e action são obrigatórios' },
        { status: 400 }
      );
    }

    if (!['publish', 'archive', 'restore'].includes(action)) {
      return NextResponse.json(
        { success: false, error: `action inválida: ${action}` },
        { status: 400 }
      );
    }

    await client.query('BEGIN');

    // Busca a versão alvo
    const targetRes = await client.query(
      `SELECT version_id, workflow_fb_id, version_number, status
       FROM dim_workflow_versions
       WHERE version_id = $1`,
      [versionId]
    );

    if (targetRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: 'Versão não encontrada' },
        { status: 404 }
      );
    }

    const target = targetRes.rows[0];
    const workflowId = target.workflow_fb_id;

    if (action === 'publish') {
      // 1) Arquiva a active corrente (se houver)
      await client.query(
        `UPDATE dim_workflow_versions
         SET status = 'archived',
             archived_at = NOW(),
             archived_by = $2
         WHERE workflow_fb_id = $1
           AND status = 'active'`,
        [workflowId, performedBy || null]
      );

      // 2) Publica a target
      await client.query(
        `UPDATE dim_workflow_versions
         SET status = 'active',
             published_at = NOW(),
             published_by = $2,
             published_by_name = $3
         WHERE version_id = $1`,
        [versionId, performedBy || null, performedByName || null]
      );

      await auditLog({
        eventType: AuditEventType.WORKFLOW_ACTIVATED,
        severity: 'info',
        actor: { id: performedBy || 'unknown', username: performedByName },
        target: { type: 'workflow', id: workflowId, label: `v${target.version_number}` },
        payload: { action: 'version_published', versionId, versionNumber: target.version_number },
        request,
      });
    } else if (action === 'archive') {
      await client.query(
        `UPDATE dim_workflow_versions
         SET status = 'archived',
             archived_at = NOW(),
             archived_by = $2
         WHERE version_id = $1`,
        [versionId, performedBy || null]
      );

      await auditLog({
        eventType: AuditEventType.WORKFLOW_DEACTIVATED,
        actor: { id: performedBy || 'unknown', username: performedByName },
        target: { type: 'workflow', id: workflowId, label: `v${target.version_number}` },
        payload: { action: 'version_archived', versionId, versionNumber: target.version_number },
        request,
      });
    } else if (action === 'restore') {
      // Volta para draft (admin pode publicar de novo se quiser)
      await client.query(
        `UPDATE dim_workflow_versions
         SET status = 'draft',
             archived_at = NULL,
             archived_by = NULL
         WHERE version_id = $1`,
        [versionId]
      );

      await auditLog({
        eventType: AuditEventType.WORKFLOW_UPDATED,
        actor: { id: performedBy || 'unknown', username: performedByName },
        target: { type: 'workflow', id: workflowId, label: `v${target.version_number}` },
        payload: { action: 'version_restored', versionId, versionNumber: target.version_number },
        request,
      });
    }

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      data: { versionId, action },
    });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('workflow-versions PATCH error', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}
