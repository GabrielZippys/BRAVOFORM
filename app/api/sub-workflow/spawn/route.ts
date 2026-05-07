/**
 * POST /api/sub-workflow/spawn
 *
 * Invoca um workflow como sub-rotina de outra instância (parent).
 *
 * Body:
 *   {
 *     parentResponseId: string,    // firebase_id da response que está chamando
 *     parentStageId: string,       // stage_fb_id da etapa "sub-workflow" no parent
 *     subWorkflowId: string,       // firebase_id do workflow alvo
 *     mode?: 'wait' | 'fire-and-forget',
 *     inputData?: Record<string, any>,  // dados a injetar na sub-instância
 *     spawnedBy: string,
 *     spawnedByName: string,
 *   }
 *
 * Comportamento:
 *   1. Valida parent existe e tem subWorkflowId configurado na stage atual
 *   2. Valida sub-workflow existe e está ativo
 *   3. Cria nova fact_form_response vinculada via parent_response_fb_id
 *      com is_sub_workflow_instance=TRUE
 *   4. Se mode='wait', marca parent com sub_workflow_paused_at + sub_workflow_spawned_id
 *   5. Audit log + workflow history
 *
 * Quando o sub completa (status=completed):
 *   - Cron ou trigger detecta sub_workflow_paused_at + sub_workflow_spawned_id no pai
 *   - Encerra a pausa do pai (sub_workflow_resumed_at = NOW())
 *   - Avança o pai para próxima etapa
 *
 * Esse endpoint só faz o SPAWN. A retomada do pai é feita via cron ou
 * trigger separado (não bloqueia esta request).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';
import { ensureWorkflowSchema } from '@/lib/db/workflowMigration';
import { ensureAdvancedFlowSchema } from '@/lib/db/advancedFlowMigration';
import { auditLog, AuditEventType } from '@/lib/audit';
import { rateLimitMutation } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  const rl = await rateLimitMutation(request);
  if (!rl.ok) return rl.response;

  const pool = getPool();
  const client = await pool.connect();

  try {
    await ensureWorkflowSchema(client);
    await ensureAdvancedFlowSchema(client);

    const body = await request.json();
    const {
      parentResponseId,
      parentStageId,
      subWorkflowId,
      mode = 'wait',
      inputData = {},
      spawnedBy,
      spawnedByName,
    } = body;

    if (!parentResponseId || !subWorkflowId) {
      return NextResponse.json(
        { success: false, error: 'parentResponseId e subWorkflowId são obrigatórios' },
        { status: 400 }
      );
    }

    if (!['wait', 'fire-and-forget'].includes(mode)) {
      return NextResponse.json(
        { success: false, error: `mode inválido: ${mode}` },
        { status: 400 }
      );
    }

    await client.query('BEGIN');

    // 1) Valida parent
    const parentRes = await client.query(
      `SELECT response_key, form_key, status, current_stage_fb_id, company_key, department_key, collaborator_key
       FROM fact_form_response
       WHERE firebase_id = $1
         AND deleted_at IS NULL`,
      [parentResponseId]
    );
    if (parentRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: 'Response pai não encontrada' },
        { status: 404 }
      );
    }
    const parent = parentRes.rows[0];

    // 2) Valida sub-workflow existe (procura primeiro stage do workflow para usá-lo como entry point)
    const subWorkflowRes = await client.query(
      `SELECT firebase_id AS stage_id, workflow_name, stage_name, stage_order
       FROM dim_workflow_stages
       WHERE workflow_fb_id = $1
       ORDER BY stage_order ASC
       LIMIT 1`,
      [subWorkflowId]
    );
    if (subWorkflowRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: 'Sub-workflow não encontrado ou sem etapas' },
        { status: 404 }
      );
    }
    const firstStage = subWorkflowRes.rows[0];

    // 3) Cria a sub-instance
    const subFirebaseId = `sub_${crypto.randomBytes(8).toString('hex')}`;
    const subTitle = `[SUB] ${firstStage.workflow_name || 'Sub-workflow'}`;

    const insertRes = await client.query(
      `INSERT INTO fact_form_response (
         firebase_id, form_key, form_title, status, current_stage_fb_id,
         submitted_at, created_at,
         company_key, department_key, collaborator_key,
         is_sub_workflow_instance, parent_response_fb_id, sub_parent_stage_id
       ) VALUES (
         $1, $2, $3, 'pending', $4,
         NOW(), NOW(),
         $5, $6, $7,
         TRUE, $8, $9
       )
       RETURNING response_key`,
      [
        subFirebaseId,
        parent.form_key,           // herda form_key (sub é estritamente uma instância de workflow)
        subTitle,
        firstStage.stage_id,
        parent.company_key,
        parent.department_key,
        parent.collaborator_key,
        parentResponseId,
        parentStageId || null,
      ]
    );

    // 4) Se mode='wait', marca o parent como pausado
    if (mode === 'wait') {
      await client.query(
        `UPDATE fact_form_response
         SET sub_workflow_paused_at = NOW(),
             sub_workflow_spawned_id = $2
         WHERE firebase_id = $1`,
        [parentResponseId, subFirebaseId]
      );
    }

    // 5) Histórico
    await client.query(
      `INSERT INTO fact_workflow_history (
        response_key, form_key, stage_name_snap, action_type,
        performed_by_name, comment, entered_at, completed_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), NOW())`,
      [
        parent.response_key,
        parent.form_key,
        'Sub-workflow Spawn',
        'sub_workflow_spawn',
        spawnedByName || spawnedBy || 'sistema',
        `Invocou sub-workflow ${subWorkflowId} (mode=${mode})`,
      ]
    );

    await client.query('COMMIT');

    // 6) Audit log
    await auditLog({
      eventType: AuditEventType.WORKFLOW_ACTION,
      severity: 'info',
      actor: { id: spawnedBy || 'system', username: spawnedByName },
      target: { type: 'response', id: parentResponseId },
      payload: {
        action: 'sub_workflow_spawn',
        subWorkflowId,
        subInstanceId: subFirebaseId,
        mode,
        inputDataKeys: Object.keys(inputData),
      },
      request,
    });

    return NextResponse.json({
      success: true,
      data: {
        subInstanceId: subFirebaseId,
        subWorkflowId,
        mode,
        parentPaused: mode === 'wait',
      },
    });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('sub-workflow spawn error', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
