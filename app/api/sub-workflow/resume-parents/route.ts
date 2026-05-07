/**
 * POST /api/sub-workflow/resume-parents
 *
 * Detecta parents pausados cujos sub-workflows já completaram, e os retoma
 * automaticamente. Idempotente — pode rodar a cada N min via cron.
 *
 * Lógica:
 *   1. SELECT fact_form_response WHERE sub_workflow_paused_at IS NOT NULL
 *      AND sub_workflow_resumed_at IS NULL
 *   2. Para cada um, verifica o status do sub_workflow_spawned_id
 *   3. Se sub.status = completed/cancelled/rejected, retoma o pai:
 *      - Marca sub_workflow_resumed_at = NOW()
 *      - Avança current_stage para a próxima etapa do workflow pai
 *   4. Audit log da retomada
 *
 * Body opcional: { dryRun: true } — apenas reporta sem mutar
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';
import { ensureAdvancedFlowSchema } from '@/lib/db/advancedFlowMigration';
import { auditLog, AuditEventType } from '@/lib/audit';
import { rateLimitMutation } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

interface ResumeRow {
  response_key: number;
  parent_id: string;
  current_stage: string | null;
  workflow_id: string;
  sub_id: string;
  sub_status: string;
}

export async function POST(request: NextRequest) {
  const rl = await rateLimitMutation(request);
  if (!rl.ok) return rl.response;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureAdvancedFlowSchema(client);

    const body = await request.json().catch(() => ({}));
    const dryRun = !!body?.dryRun;

    // Encontra parents prontos pra retomar
    const candidatesRes = await client.query<ResumeRow>(`
      SELECT
        parent.response_key,
        parent.firebase_id        AS parent_id,
        parent.current_stage_fb_id AS current_stage,
        ws.workflow_fb_id         AS workflow_id,
        sub.firebase_id           AS sub_id,
        sub.status                AS sub_status
      FROM fact_form_response parent
      JOIN fact_form_response sub
        ON sub.firebase_id = parent.sub_workflow_spawned_id
      LEFT JOIN dim_workflow_stages ws
        ON ws.firebase_id = parent.current_stage_fb_id
      WHERE parent.sub_workflow_paused_at IS NOT NULL
        AND parent.sub_workflow_resumed_at IS NULL
        AND sub.status IN ('completed', 'cancelled', 'rejected')
        AND parent.deleted_at IS NULL
      LIMIT 100
    `);

    const resumed: Array<{ parentId: string; subId: string; subStatus: string; nextStage: string | null }> = [];

    for (const row of candidatesRes.rows) {
      try {
        // Encontra próxima etapa no workflow do parent
        let nextStageId: string | null = null;

        if (row.current_stage && row.workflow_id) {
          const nextRes = await client.query<{ next_stage_id: string }>(
            `SELECT firebase_id AS next_stage_id
             FROM dim_workflow_stages ws_next
             WHERE ws_next.workflow_fb_id = $1
               AND ws_next.stage_order = (
                 SELECT stage_order + 1
                 FROM dim_workflow_stages
                 WHERE firebase_id = $2
                   AND workflow_fb_id = $1
                 LIMIT 1
               )
             LIMIT 1`,
            [row.workflow_id, row.current_stage]
          );
          nextStageId = nextRes.rows[0]?.next_stage_id || null;
        }

        if (dryRun) {
          resumed.push({
            parentId: row.parent_id,
            subId: row.sub_id,
            subStatus: row.sub_status,
            nextStage: nextStageId,
          });
          continue;
        }

        await client.query('BEGIN');

        // Marca pai como retomado e avança a etapa
        if (nextStageId) {
          await client.query(
            `UPDATE fact_form_response
             SET sub_workflow_resumed_at = NOW(),
                 current_stage_fb_id = $2,
                 status = CASE WHEN $3 = 'rejected' THEN 'rejected' ELSE status END
             WHERE firebase_id = $1`,
            [row.parent_id, nextStageId, row.sub_status]
          );
        } else {
          // Não há próxima etapa → fluxo concluído
          await client.query(
            `UPDATE fact_form_response
             SET sub_workflow_resumed_at = NOW(),
                 status = CASE
                   WHEN $2 = 'rejected' THEN 'rejected'
                   WHEN $2 = 'cancelled' THEN 'cancelled'
                   ELSE 'completed'
                 END
             WHERE firebase_id = $1`,
            [row.parent_id, row.sub_status]
          );
        }

        // Histórico
        await client.query(
          `INSERT INTO fact_workflow_history (
            response_key, stage_name_snap, action_type,
            performed_by_name, comment, entered_at, completed_at, created_at
          ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), NOW())`,
          [
            row.response_key,
            'Sub-workflow Return',
            'sub_workflow_resume',
            'sistema',
            `Sub-workflow ${row.sub_id} terminou com ${row.sub_status}. ${nextStageId ? 'Avançando para próxima etapa.' : 'Fluxo encerrado.'}`,
          ]
        );

        await client.query('COMMIT');

        await auditLog({
          eventType: AuditEventType.WORKFLOW_ACTION,
          severity: 'info',
          target: { type: 'response', id: row.parent_id },
          payload: {
            action: 'sub_workflow_resume',
            subInstanceId: row.sub_id,
            subFinalStatus: row.sub_status,
            nextStageId,
          },
          request,
        });

        resumed.push({
          parentId: row.parent_id,
          subId: row.sub_id,
          subStatus: row.sub_status,
          nextStage: nextStageId,
        });
      } catch (err: any) {
        await client.query('ROLLBACK').catch(() => {});
        logger.warn('sub-workflow resume failed for parent', {
          parentId: row.parent_id,
          error: err.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      candidates: candidatesRes.rowCount,
      resumed: resumed.length,
      detail: resumed,
    });
  } catch (error: any) {
    logger.error('sub-workflow resume-parents error', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
