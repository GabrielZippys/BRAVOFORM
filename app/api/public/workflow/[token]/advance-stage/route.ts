/**
 * POST /api/public/workflow/[token]/advance-stage
 *
 * Endpoint PÚBLICO (sem auth) que avança o workflow para a próxima etapa
 * após o colaborador completar a etapa atual no link público (/w/[token]).
 *
 * Tipos de etapa suportados (whitelist — outros são internos):
 *   - documentation  : leitura simples, avança ao clicar "Entendi"
 *   - approval       : action='approve' avança / action='reject' marca rejeitado
 *   - execution      : avança após "Marcar como concluído" (+ comentário)
 *   - completion     : marca workflow como concluído
 *   - custom         : trata como execution genérica
 *
 * Body:
 *   {
 *     responseId: string,
 *     stageId: string,
 *     action?: 'approve' | 'reject',  // só relevante p/ approval
 *     comment?: string,
 *     identityLabel?: string,         // se identidade já foi confirmada
 *   }
 *
 * Resposta:
 *   { success: true, data: { nextStageId: string | null, completed: boolean } }
 *
 * Segurança:
 *   - Rate limit 30/min/IP
 *   - Re-valida cada vez: token → workflow → instância pertence ao workflow
 *     do token → stageId == current_stage_fb_id
 *   - Whitelist de stage_type — não permite avançar tipos internos
 *     (parallel-*, sub-workflow, notification, waiting, validation)
 *   - Não confia em payload do cliente além do mínimo (comment, action)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';
import { ensurePublicLinkSchema } from '@/lib/db/publicLinkMigration';
import { ensureWorkflowSchema } from '@/lib/db/workflowMigration';
import { auditLog, AuditEventType } from '@/lib/audit';
import { rateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

const TOKEN_RE = /^[a-f0-9]{32,128}$/;

// Stages que o colaborador externo pode avançar (não são internas)
const PUBLIC_ADVANCEABLE_TYPES = new Set([
  'documentation',
  'approval',
  'execution',
  'completion',
  'custom',
  'start',
  'review',
]);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const rl = await rateLimit(request, { limit: 30, windowMs: 60_000, bucket: 'public-workflow-advance' });
  if (!rl.ok) return rl.response;

  const { token } = await context.params;

  if (!token || !TOKEN_RE.test(token)) {
    return NextResponse.json(
      { success: false, error: 'Link inválido' },
      { status: 404 }
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'JSON inválido' },
      { status: 400 }
    );
  }

  const { responseId, stageId, action, comment, identityLabel } = body || {};

  if (!responseId || !stageId) {
    return NextResponse.json(
      { success: false, error: 'responseId e stageId são obrigatórios' },
      { status: 400 }
    );
  }

  if (comment && String(comment).length > 2000) {
    return NextResponse.json(
      { success: false, error: 'Comentário muito longo' },
      { status: 400 }
    );
  }

  if (action !== undefined && action !== 'approve' && action !== 'reject') {
    return NextResponse.json(
      { success: false, error: 'action deve ser approve ou reject' },
      { status: 400 }
    );
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureWorkflowSchema(client);
    await ensurePublicLinkSchema(client);

    await client.query('BEGIN');

    // 1) Carrega contexto: instância + workflow + stage atual
    const ctxRes = await client.query(
      `SELECT
         fr.response_key, fr.form_key, fr.current_stage_fb_id,
         fr.public_link_token, fr.workflow_fb_id, fr.identity_label,
         ws.firebase_id AS stage_id, ws.stage_name, ws.stage_type, ws.stage_order
       FROM fact_form_response fr
       LEFT JOIN dim_workflow_stages ws
         ON ws.firebase_id = fr.current_stage_fb_id
       WHERE fr.firebase_id = $1
         AND fr.deleted_at IS NULL`,
      [responseId]
    );

    if (ctxRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: 'Instância não encontrada' },
        { status: 404 }
      );
    }

    const ctx = ctxRes.rows[0];

    // Segurança: a instância TEM que pertencer ao workflow do token
    if (ctx.public_link_token !== token) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: 'Instância não pertence a este link' },
        { status: 403 }
      );
    }

    if (ctx.current_stage_fb_id !== stageId) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: 'Etapa atual não corresponde à informada' },
        { status: 409 }
      );
    }

    if (!PUBLIC_ADVANCEABLE_TYPES.has(ctx.stage_type)) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: `Etapa do tipo '${ctx.stage_type}' não pode ser avançada pelo link público` },
        { status: 400 }
      );
    }

    // 2) Tratamento por stage_type
    let nextStageId: string | null = null;
    let completed = false;
    let actionType = 'forward';
    let historyLabel = ctx.stage_name || 'Etapa';

    if (ctx.stage_type === 'approval' && action === 'reject') {
      // Reprovação: marca instância como rejeitada e não avança
      await client.query(
        `UPDATE fact_form_response
         SET status = 'rejected',
             rejected_at = NOW(),
             rejection_reason = $2
         WHERE firebase_id = $1`,
        [responseId, String(comment || '').slice(0, 2000) || 'Reprovado pelo colaborador']
      );
      actionType = 'rejected';
      completed = true; // do ponto de vista do colaborador, o fluxo encerrou aqui
    } else if (ctx.stage_type === 'completion') {
      // Etapa de conclusão final
      await client.query(
        `UPDATE fact_form_response
         SET status = 'completed'
         WHERE firebase_id = $1`,
        [responseId]
      );
      actionType = 'completed';
      completed = true;
    } else {
      // Avanço normal: busca próxima etapa por stage_order + 1
      if (ctx.workflow_fb_id != null && ctx.stage_order != null) {
        const nextRes = await client.query<{ next_stage_id: string }>(
          `SELECT firebase_id AS next_stage_id
           FROM dim_workflow_stages
           WHERE workflow_fb_id = $1
             AND stage_order = $2
           LIMIT 1`,
          [ctx.workflow_fb_id, ctx.stage_order + 1]
        );
        nextStageId = nextRes.rows[0]?.next_stage_id || null;
      }

      if (nextStageId) {
        await client.query(
          `UPDATE fact_form_response
           SET current_stage_fb_id = $2,
               status = CASE WHEN status = 'pending' THEN 'in_progress' ELSE status END
           WHERE firebase_id = $1`,
          [responseId, nextStageId]
        );
      } else {
        // Sem próxima etapa — workflow encerrado
        await client.query(
          `UPDATE fact_form_response
           SET status = 'completed'
           WHERE firebase_id = $1`,
          [responseId]
        );
        completed = true;
      }

      if (action === 'approve') {
        actionType = 'approved';
      }
    }

    // 3) Histórico
    const actorName = identityLabel || ctx.identity_label || 'colaborador-publico';
    await client.query(
      `INSERT INTO fact_workflow_history (
        response_key, form_key, stage_name_snap, action_type,
        performed_by_name, comment, entered_at, completed_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), NOW())`,
      [
        ctx.response_key,
        ctx.form_key,
        historyLabel,
        actionType,
        String(actorName).slice(0, 200),
        String(comment || '').slice(0, 2000) || null,
      ]
    );

    await client.query('COMMIT');

    await auditLog({
      eventType: AuditEventType.WORKFLOW_ACTION,
      severity: 'info',
      target: { type: 'response', id: responseId, label: historyLabel },
      payload: {
        action: 'public_link_advance',
        stageType: ctx.stage_type,
        actionType,
        nextStageId,
        completed,
      },
      request,
    });

    return NextResponse.json({
      success: true,
      data: {
        nextStageId,
        completed,
      },
    });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('public/workflow/advance-stage error', error);
    return NextResponse.json(
      { success: false, error: 'Erro ao avançar etapa' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
