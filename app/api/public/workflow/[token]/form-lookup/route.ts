/**
 * POST /api/public/workflow/[token]/form-lookup
 *
 * Endpoint PÚBLICO. Resolve um lookup de campo do executionForm da etapa
 * atual da instância. Usado pelo ExecutionFormStage no /w/[token] para:
 *   - Resolver um lookup-input (busca uma linha pela searchColumn)
 *   - Listar opções de um lookup-dropdown (com filtros cascading)
 *
 * Body:
 *   {
 *     responseId: string,
 *     stageId:    string,
 *     fieldId:    string,                   // id do field a resolver
 *     contextValues?: Record<string, any>,  // valores dos outros campos
 *     searchValue?: string,                 // só para lookup-input
 *   }
 *
 * Resposta:
 *   - lookup-input: { match: { ...colunas... } | null }
 *   - lookup-dropdown: { rows: Array<{ value, label, ...resolveColumns }> }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';
import { ensurePublicLinkSchema } from '@/lib/db/publicLinkMigration';
import { ensureExecutionFormSchema } from '@/lib/db/executionFormMigration';
import { rateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import { buildLookupQuery, findField } from '@/lib/executionForm';
import type { ExecutionFormField } from '@/types';

const TOKEN_RE = /^[a-f0-9]{32,128}$/;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const rl = await rateLimit(request, { limit: 120, windowMs: 60_000, bucket: 'public-form-lookup' });
  if (!rl.ok) return rl.response;

  const { token } = await context.params;
  if (!token || !TOKEN_RE.test(token)) {
    return NextResponse.json({ success: false, error: 'Link inválido' }, { status: 404 });
  }

  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ success: false, error: 'JSON inválido' }, { status: 400 });
  }
  const { responseId, stageId, fieldId, contextValues, searchValue } = body || {};
  if (!responseId || !stageId || !fieldId) {
    return NextResponse.json(
      { success: false, error: 'responseId, stageId e fieldId são obrigatórios' },
      { status: 400 }
    );
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensurePublicLinkSchema(client);
    await ensureExecutionFormSchema(client);

    // 1) Confirma que a instância pertence ao workflow do token e está na stage informada
    const ctxRes = await client.query(
      `SELECT fr.current_stage_fb_id, fr.public_link_token, ws.execution_form
         FROM fact_form_response fr
         LEFT JOIN dim_workflow_stages ws ON ws.firebase_id = $2
         WHERE fr.firebase_id = $1
           AND fr.deleted_at IS NULL`,
      [responseId, stageId]
    );
    if (ctxRes.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Instância não encontrada' }, { status: 404 });
    }
    const ctx = ctxRes.rows[0];
    if (ctx.public_link_token !== token) {
      return NextResponse.json({ success: false, error: 'Instância não pertence a este link' }, { status: 403 });
    }
    if (ctx.current_stage_fb_id !== stageId) {
      return NextResponse.json({ success: false, error: 'Etapa atual não corresponde' }, { status: 409 });
    }

    const exForm = ctx.execution_form;
    if (!exForm || !exForm.enabled || !Array.isArray(exForm.fields)) {
      return NextResponse.json({ success: false, error: 'Etapa sem formulário configurado' }, { status: 400 });
    }
    const fields: ExecutionFormField[] = exForm.fields;
    const field = findField(fields, fieldId);
    if (!field) {
      return NextResponse.json({ success: false, error: 'Campo não existe na etapa' }, { status: 400 });
    }
    if (field.type !== 'lookup-input' && field.type !== 'lookup-dropdown') {
      return NextResponse.json({ success: false, error: 'Campo não é de lookup' }, { status: 400 });
    }
    if (!field.lookup) {
      return NextResponse.json({ success: false, error: 'Campo sem config de lookup' }, { status: 400 });
    }

    // 2) Monta query
    const built = buildLookupQuery(
      field.lookup,
      contextValues || {},
      field.type === 'lookup-input' && searchValue !== undefined ? { searchValue: String(searchValue) } : {}
    );
    if (!built) {
      return NextResponse.json(
        { success: false, error: 'Configuração de lookup inválida (admin)' },
        { status: 500 }
      );
    }

    // 3) Executa
    let rows: any[] = [];
    try {
      const r = await client.query(built.sql, built.params);
      rows = r.rows;
    } catch (qErr: any) {
      logger.warn('form-lookup query failed', {
        responseId, fieldId, table: field.lookup.table, error: qErr.message,
      });
      return NextResponse.json(
        { success: false, error: 'Erro ao consultar dados' },
        { status: 500 }
      );
    }

    // 4) Resposta por tipo
    if (field.type === 'lookup-input') {
      const match = rows[0] || null;
      return NextResponse.json({ success: true, match });
    }

    // lookup-dropdown
    const valueCol = field.lookup.selectColumn || built.selectedColumns[0];
    const labelCol = field.lookup.labelColumn;
    const result = rows.map((r) => {
      const value = r[valueCol];
      const label = labelCol ? (r[labelCol] ?? value) : value;
      // Extras: outras colunas resolvidas (pra display fields conseguirem ler)
      const extras: Record<string, any> = {};
      for (const c of built.selectedColumns) {
        if (c !== valueCol && c !== labelCol) extras[c] = r[c];
      }
      return { value, label: String(label ?? value ?? ''), ...extras };
    });

    return NextResponse.json({ success: true, rows: result });
  } catch (error: any) {
    logger.error('form-lookup error', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao resolver lookup' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
