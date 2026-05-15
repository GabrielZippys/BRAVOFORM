/**
 * GET /api/public/workflow/[token]
 *
 * Endpoint PÚBLICO (sem auth) que retorna metadados do workflow para
 * a página /w/[token] renderizar a primeira etapa.
 *
 * Retorna APENAS o necessário para o colaborador iniciar — não expõe
 * dados sensíveis como company_id, departments, audit, etc.
 *
 * Status:
 *   • 200 — workflow encontrado e disponível
 *   • 404 — token inválido / workflow não existe
 *   • 410 — workflow desativado (link revogado ou is_active=false)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';
import { ensurePublicLinkSchema } from '@/lib/db/publicLinkMigration';
import { rateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

const TOKEN_RE = /^[a-f0-9]{32,128}$/;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  // Rate limit moderado: 120/min/IP — anti-enumeração de tokens
  const rl = await rateLimit(request, { limit: 120, windowMs: 60_000, bucket: 'public-workflow' });
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

    // 1) Busca workflow pelo token (LIMIT 1, indexed)
    const wfRes = await client.query(
      `SELECT firebase_id, name, description, is_active, public_link_enabled
       FROM dim_workflows
       WHERE public_token = $1 AND deleted_at IS NULL
       LIMIT 1`,
      [token]
    );

    if (wfRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Link não encontrado ou expirado' },
        { status: 404 }
      );
    }

    const wf = wfRes.rows[0];

    if (!wf.public_link_enabled) {
      return NextResponse.json(
        { success: false, error: 'Link desativado pelo administrador' },
        { status: 410 }
      );
    }

    if (!wf.is_active) {
      return NextResponse.json(
        { success: false, error: 'Workflow desativado no momento' },
        { status: 410 }
      );
    }

    // 2) Busca TODAS as etapas (ordenadas) — cliente vai renderizar a stage
    //    correspondente ao currentStageId da instância.
    const stageRes = await client.query(
      `SELECT firebase_id, stage_name, stage_description, stage_type, stage_order,
              lookup_table, lookup_search_column, lookup_display_columns,
              lookup_input_label, lookup_input_placeholder, lookup_confirm_text,
              lookup_require_match, lookup_match_fields, lookup_pre_select,
              execution_form
       FROM dim_workflow_stages
       WHERE workflow_fb_id = $1
       ORDER BY stage_order ASC`,
      [wf.firebase_id]
    );

    if (stageRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Workflow sem etapas configuradas' },
        { status: 410 }
      );
    }

    const stages = stageRes.rows.map((s) => ({
      id: s.firebase_id,
      name: s.stage_name,
      description: s.stage_description || '',
      stageType: s.stage_type,
      order: s.stage_order,
      lookupTable: s.lookup_table || undefined,
      lookupSearchColumn: s.lookup_search_column || undefined,
      lookupDisplayColumns: s.lookup_display_columns || [],
      lookupInputLabel: s.lookup_input_label || undefined,
      lookupInputPlaceholder: s.lookup_input_placeholder || undefined,
      lookupConfirmText: s.lookup_confirm_text || undefined,
      lookupRequireMatch: s.lookup_require_match ?? true,
      lookupMatchFields: Array.isArray(s.lookup_match_fields) ? s.lookup_match_fields : [],
      lookupPreSelect: s.lookup_pre_select && typeof s.lookup_pre_select === 'object'
        ? s.lookup_pre_select : undefined,
      executionForm: s.execution_form && typeof s.execution_form === 'object' && s.execution_form.enabled
        ? s.execution_form : undefined,
    }));

    return NextResponse.json({
      success: true,
      data: {
        workflowId: wf.firebase_id,
        workflowName: wf.name,
        workflowDescription: wf.description || '',
        firstStage: stages[0], // compat
        stages,
      },
    });
  } catch (error: any) {
    logger.error('public/workflow GET error', error);
    return NextResponse.json(
      { success: false, error: 'Erro ao carregar workflow' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
