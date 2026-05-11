/**
 * POST /api/public/workflow/[token]/start
 *
 * Endpoint PÚBLICO (sem auth). Cria uma nova instância (fact_form_response)
 * para o workflow apontado pelo token e retorna o responseId.
 *
 * Pattern: o colaborador acessa /w/[token], a página chama esse endpoint
 * para "começar", recebe o responseId, salva em localStorage e renderiza
 * a primeira etapa do workflow.
 *
 * Rate limit: 10/min/IP — evita criar instâncias em massa.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';
import { ensurePublicLinkSchema } from '@/lib/db/publicLinkMigration';
import { auditLog, AuditEventType } from '@/lib/audit';
import { rateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

const TOKEN_RE = /^[a-f0-9]{32,128}$/;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  // Rate limit firme: 10 criações de instância por IP por minuto
  const rl = await rateLimit(request, { limit: 10, windowMs: 60_000, bucket: 'public-workflow-start' });
  if (!rl.ok) return rl.response;

  const { token } = await context.params;

  if (!token || !TOKEN_RE.test(token)) {
    return NextResponse.json(
      { success: false, error: 'Link inválido' },
      { status: 404 }
    );
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensurePublicLinkSchema(client);

    await client.query('BEGIN');

    // 1) Busca workflow + primeira etapa
    const wfRes = await client.query(
      `SELECT firebase_id, name, is_active, public_link_enabled
       FROM dim_workflows
       WHERE public_token = $1 AND deleted_at IS NULL
       LIMIT 1`,
      [token]
    );

    if (wfRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: 'Link não encontrado' },
        { status: 404 }
      );
    }

    const wf = wfRes.rows[0];

    if (!wf.public_link_enabled || !wf.is_active) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: 'Workflow indisponível no momento' },
        { status: 410 }
      );
    }

    const firstStageRes = await client.query(
      `SELECT firebase_id
       FROM dim_workflow_stages
       WHERE workflow_fb_id = $1
       ORDER BY stage_order ASC
       LIMIT 1`,
      [wf.firebase_id]
    );

    if (firstStageRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: 'Workflow sem etapas' },
        { status: 410 }
      );
    }

    const firstStageId = firstStageRes.rows[0].firebase_id;

    // 2) Cria nova instância
    const responseFbId = `pub_${crypto.randomBytes(10).toString('hex')}`;

    await client.query(
      `INSERT INTO fact_form_response (
        firebase_id, form_title, status, current_stage_fb_id,
        submitted_at, created_at,
        public_link_token, workflow_fb_id,
        collaborator_username
      ) VALUES (
        $1, $2, 'pending', $3,
        NOW(), NOW(),
        $4, $5,
        $6
      )`,
      [
        responseFbId,
        wf.name,
        firstStageId,
        token,
        wf.firebase_id,
        'public-link',  // placeholder até validar identidade
      ]
    );

    await client.query('COMMIT');

    // Audit (não bloqueia se falhar)
    await auditLog({
      eventType: AuditEventType.WORKFLOW_ACTION,
      severity: 'info',
      target: { type: 'response', id: responseFbId, label: wf.name },
      payload: {
        action: 'public_link_start',
        workflowId: wf.firebase_id,
        firstStageId,
      },
      request,
    });

    return NextResponse.json({
      success: true,
      data: {
        responseId: responseFbId,
        currentStageId: firstStageId,
      },
    });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('public/workflow/start error', error);
    return NextResponse.json(
      { success: false, error: 'Erro ao iniciar workflow' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
