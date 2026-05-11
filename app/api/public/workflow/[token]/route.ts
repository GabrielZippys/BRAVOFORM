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

    // 2) Busca a primeira etapa (stage_order = 0)
    const stageRes = await client.query(
      `SELECT firebase_id, stage_name, stage_description, stage_type, stage_order,
              lookup_table, lookup_search_column, lookup_display_columns,
              lookup_input_label, lookup_input_placeholder, lookup_confirm_text,
              lookup_require_match
       FROM dim_workflow_stages
       WHERE workflow_fb_id = $1
       ORDER BY stage_order ASC
       LIMIT 1`,
      [wf.firebase_id]
    );

    if (stageRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Workflow sem etapas configuradas' },
        { status: 410 }
      );
    }

    const firstStage = stageRes.rows[0];

    return NextResponse.json({
      success: true,
      data: {
        workflowId: wf.firebase_id,
        workflowName: wf.name,
        workflowDescription: wf.description || '',
        firstStage: {
          id: firstStage.firebase_id,
          name: firstStage.stage_name,
          description: firstStage.stage_description || '',
          stageType: firstStage.stage_type,
          // Config do identity-validation (se for o caso)
          lookupTable: firstStage.lookup_table || undefined,
          lookupSearchColumn: firstStage.lookup_search_column || undefined,
          lookupDisplayColumns: firstStage.lookup_display_columns || [],
          lookupInputLabel: firstStage.lookup_input_label || undefined,
          lookupInputPlaceholder: firstStage.lookup_input_placeholder || undefined,
          lookupConfirmText: firstStage.lookup_confirm_text || undefined,
          lookupRequireMatch: firstStage.lookup_require_match ?? true,
        },
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
