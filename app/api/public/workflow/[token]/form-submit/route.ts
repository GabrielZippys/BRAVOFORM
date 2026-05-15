/**
 * POST /api/public/workflow/[token]/form-submit
 *
 * Recebe os valores do executionForm preenchidos pelo colaborador,
 * persiste em fact_form_response.execution_form_values e avança a etapa.
 *
 * Body:
 *   {
 *     responseId: string,
 *     stageId:    string,
 *     values:     Record<string, any>   // { fieldId: value, ... }
 *   }
 *
 * Comportamento:
 *   - Valida que a instância pertence ao token e está na stage informada
 *   - Verifica obrigatoriedade dos campos (required)
 *   - Persiste em execution_form_values (merge com já existente)
 *   - Avança a stage normalmente (mesmo padrão de /advance-stage)
 *   - Registra histórico com summary dos valores
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';
import { ensureWorkflowSchema } from '@/lib/db/workflowMigration';
import { ensurePublicLinkSchema } from '@/lib/db/publicLinkMigration';
import { ensureExecutionFormSchema } from '@/lib/db/executionFormMigration';
import { auditLog, AuditEventType } from '@/lib/audit';
import { rateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import type { ExecutionFormField } from '@/types';

const TOKEN_RE = /^[a-f0-9]{32,128}$/;
const MAX_FIELD_LEN = 4000;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const rl = await rateLimit(request, { limit: 30, windowMs: 60_000, bucket: 'public-form-submit' });
  if (!rl.ok) return rl.response;

  const { token } = await context.params;
  if (!token || !TOKEN_RE.test(token)) {
    return NextResponse.json({ success: false, error: 'Link inválido' }, { status: 404 });
  }

  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ success: false, error: 'JSON inválido' }, { status: 400 });
  }
  const { responseId, stageId, values } = body || {};
  if (!responseId || !stageId || !values || typeof values !== 'object') {
    return NextResponse.json(
      { success: false, error: 'responseId, stageId e values são obrigatórios' },
      { status: 400 }
    );
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureWorkflowSchema(client);
    await ensurePublicLinkSchema(client);
    await ensureExecutionFormSchema(client);

    await client.query('BEGIN');

    const ctxRes = await client.query(
      `SELECT
         fr.response_key, fr.form_key, fr.current_stage_fb_id,
         fr.public_link_token, fr.workflow_fb_id, fr.identity_label,
         fr.execution_form_values,
         ws.firebase_id AS stage_id, ws.stage_name, ws.stage_type,
         ws.stage_order, ws.execution_form
       FROM fact_form_response fr
       LEFT JOIN dim_workflow_stages ws ON ws.firebase_id = fr.current_stage_fb_id
       WHERE fr.firebase_id = $1
         AND fr.deleted_at IS NULL`,
      [responseId]
    );

    if (ctxRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ success: false, error: 'Instância não encontrada' }, { status: 404 });
    }
    const ctx = ctxRes.rows[0];

    if (ctx.public_link_token !== token) {
      await client.query('ROLLBACK');
      return NextResponse.json({ success: false, error: 'Instância não pertence a este link' }, { status: 403 });
    }
    if (ctx.current_stage_fb_id !== stageId) {
      await client.query('ROLLBACK');
      return NextResponse.json({ success: false, error: 'Etapa atual não corresponde' }, { status: 409 });
    }
    if (ctx.stage_type !== 'execution' && ctx.stage_type !== 'custom' && ctx.stage_type !== 'review') {
      await client.query('ROLLBACK');
      return NextResponse.json({ success: false, error: 'Etapa não suporta formulário' }, { status: 400 });
    }

    const exForm = ctx.execution_form;
    if (!exForm || !exForm.enabled || !Array.isArray(exForm.fields)) {
      await client.query('ROLLBACK');
      return NextResponse.json({ success: false, error: 'Etapa sem formulário configurado' }, { status: 400 });
    }
    const fields: ExecutionFormField[] = exForm.fields;

    // Valida obrigatórios + tamanho. Display fields são ignorados (read-only).
    const cleanValues: Record<string, any> = {};
    for (const f of fields) {
      if (f.type === 'display') continue;
      const raw = values[f.id];
      const isEmpty = raw === undefined || raw === null || raw === '' ||
        (Array.isArray(raw) && raw.length === 0);
      if (f.required && isEmpty) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { success: false, error: `Campo obrigatório não preenchido: ${f.label}` },
          { status: 400 }
        );
      }
      if (!isEmpty) {
        if (typeof raw === 'string' && raw.length > MAX_FIELD_LEN) {
          await client.query('ROLLBACK');
          return NextResponse.json(
            { success: false, error: `Campo ${f.label} excede ${MAX_FIELD_LEN} caracteres` },
            { status: 400 }
          );
        }
        cleanValues[f.id] = raw;
      }
    }

    // Merge com valores já existentes (caso o usuário tenha salvo parcial)
    const merged = { ...(ctx.execution_form_values || {}), ...cleanValues };

    // Persiste
    await client.query(
      `UPDATE fact_form_response
         SET execution_form_values = $2::jsonb
       WHERE firebase_id = $1`,
      [responseId, JSON.stringify(merged)]
    );

    // Avança stage
    let nextStageId: string | null = null;
    let completed = false;
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
      await client.query(
        `UPDATE fact_form_response SET status = 'completed' WHERE firebase_id = $1`,
        [responseId]
      );
      completed = true;
    }

    // Summary curto do que foi preenchido
    const summary = Object.entries(cleanValues).slice(0, 5).map(([k, v]) => {
      const f = fields.find((ff) => ff.id === k);
      const label = f?.label || k;
      let valTxt: string;
      if (Array.isArray(v)) {
        valTxt = v.length === 1 ? '1 item' : `${v.length} itens`;
      } else {
        valTxt = String(v).slice(0, 80);
      }
      return `${label}: ${valTxt}`;
    }).join(' · ');

    await client.query(
      `INSERT INTO fact_workflow_history (
         response_key, form_key, stage_name_snap, action_type,
         performed_by_name, comment, entered_at, completed_at, created_at
       ) VALUES ($1, $2, $3, 'forward', $4, $5, NOW(), NOW(), NOW())`,
      [
        ctx.response_key,
        ctx.form_key,
        ctx.stage_name || 'Formulário',
        String(ctx.identity_label || 'colaborador-publico').slice(0, 200),
        summary || 'Formulário preenchido',
      ]
    );

    await client.query('COMMIT');

    await auditLog({
      eventType: AuditEventType.WORKFLOW_ACTION,
      severity: 'info',
      target: { type: 'response', id: responseId, label: ctx.stage_name },
      payload: {
        action: 'public_form_submit',
        fieldCount: Object.keys(cleanValues).length,
        nextStageId,
        completed,
      },
      request,
    });

    return NextResponse.json({ success: true, data: { nextStageId, completed } });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('form-submit error', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao enviar formulário' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
