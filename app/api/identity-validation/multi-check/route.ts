/**
 * POST /api/identity-validation/multi-check
 *
 * Endpoint público (sem auth) que recebe N campos preenchidos pelo
 * colaborador na etapa de identity-validation, valida TODOS contra a
 * tabela configurada, e — em caso de match — avança o workflow.
 *
 * Não expõe dados ao cliente: a resposta é apenas sucesso/erro.
 * Em caso de match, retorna nextStageId + identityLabel para o cliente
 * saber qual etapa renderizar.
 *
 * Body:
 *   {
 *     responseId: string,
 *     stageId: string,
 *     inputs: { [column]: string }  // chaves devem corresponder a lookup_match_fields[i].column
 *   }
 *
 * Comportamento:
 *   1. Valida que a instância existe e está na etapa de identity-validation
 *   2. Carrega lookup_match_fields (ou cai pra lookup_search_column como fallback)
 *   3. Constrói WHERE col1=$1 AND col2=$2 AND ... com TRIM + ILIKE (case-insensitive)
 *   4. Se 0 linhas → 404 (barrar usuário)
 *   5. Se ≥1 → persiste identity_* e avança stage_order + 1
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';
import { ensureWorkflowSchema } from '@/lib/db/workflowMigration';
import { ensureIdentityValidationSchema } from '@/lib/db/identityValidationMigration';
import { auditLog, AuditEventType } from '@/lib/audit';
import { rateLimitMutation } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

const SQL_IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;
const MAX_FIELD_LEN = 200;
const MAX_FIELDS = 10;

export async function POST(request: NextRequest) {
  const rl = await rateLimitMutation(request);
  if (!rl.ok) return rl.response;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureWorkflowSchema(client);
    await ensureIdentityValidationSchema(client);

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { success: false, error: 'JSON inválido' },
        { status: 400 }
      );
    }

    const { responseId, stageId, inputs } = body;

    if (!responseId || !stageId || !inputs || typeof inputs !== 'object') {
      return NextResponse.json(
        { success: false, error: 'responseId, stageId e inputs são obrigatórios' },
        { status: 400 }
      );
    }

    const inputKeys = Object.keys(inputs);
    if (inputKeys.length === 0 || inputKeys.length > MAX_FIELDS) {
      return NextResponse.json(
        { success: false, error: `Forneça entre 1 e ${MAX_FIELDS} campos` },
        { status: 400 }
      );
    }

    // Sanitiza valores: trim, limita tamanho, descarta vazios
    const cleanInputs: Record<string, string> = {};
    for (const k of inputKeys) {
      if (!SQL_IDENT_RE.test(k)) continue;
      const v = String(inputs[k] ?? '').trim();
      if (v.length === 0) continue;
      if (v.length > MAX_FIELD_LEN) {
        return NextResponse.json(
          { success: false, error: `Campo ${k} excede ${MAX_FIELD_LEN} caracteres` },
          { status: 400 }
        );
      }
      cleanInputs[k] = v;
    }

    const cleanKeys = Object.keys(cleanInputs);
    if (cleanKeys.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Preencha pelo menos um campo' },
        { status: 400 }
      );
    }

    await client.query('BEGIN');

    // 1) Carrega instância + config da etapa
    const ctxRes = await client.query(
      `SELECT
         fr.response_key, fr.form_key, fr.current_stage_fb_id,
         ws.workflow_fb_id,
         ws.lookup_table, ws.lookup_search_column, ws.lookup_display_columns,
         ws.lookup_match_fields, ws.lookup_require_match,
         ws.stage_order, ws.stage_type
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

    if (ctx.current_stage_fb_id !== stageId) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: 'Etapa atual não corresponde à informada' },
        { status: 409 }
      );
    }

    if (ctx.stage_type !== 'identity-validation') {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: 'Etapa atual não é de validação de identidade' },
        { status: 400 }
      );
    }

    const tableName: string = ctx.lookup_table;
    if (!tableName || !SQL_IDENT_RE.test(tableName)) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: 'Etapa mal configurada (admin)' },
        { status: 500 }
      );
    }

    // 2) Determina as colunas que precisam ser validadas
    type MatchField = { column: string; label?: string };
    const configuredFields: MatchField[] = Array.isArray(ctx.lookup_match_fields) && ctx.lookup_match_fields.length > 0
      ? ctx.lookup_match_fields
      : (ctx.lookup_search_column
          ? [{ column: ctx.lookup_search_column, label: ctx.lookup_search_column }]
          : []);

    if (configuredFields.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: 'Etapa mal configurada — sem campos de identificação (admin)' },
        { status: 500 }
      );
    }

    // O admin define quais campos. O cliente DEVE enviar todos eles.
    const missing = configuredFields
      .map((f) => f.column)
      .filter((c) => !cleanInputs[c]);
    if (missing.length > 0) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: `Preencha todos os campos: ${missing.join(', ')}` },
        { status: 400 }
      );
    }

    // Whitelist de identifiers
    const safeFields = configuredFields.filter((f) => SQL_IDENT_RE.test(f.column));
    if (safeFields.length !== configuredFields.length) {
      await client.query('ROLLBACK');
      logger.warn('multi-check: lookup_match_fields tem coluna inválida', {
        responseId, configured: configuredFields.map((f) => f.column),
      });
      return NextResponse.json(
        { success: false, error: 'Configuração de etapa inválida (admin)' },
        { status: 500 }
      );
    }

    // 3) Re-valida server-side: WHERE col1::text ILIKE $1 AND col2::text ILIKE $2 ...
    const whereParts: string[] = [];
    const params: string[] = [];
    safeFields.forEach((f, i) => {
      whereParts.push(`TRIM("${f.column}"::text) ILIKE $${i + 1}`);
      params.push(cleanInputs[f.column]);
    });

    // Também carrega as display columns pra persistir identity_data
    const displayColumns: Array<{ column: string; label: string }> = ctx.lookup_display_columns || [];
    const safeDisplayCols = displayColumns
      .map((d) => d.column)
      .filter((c) => SQL_IDENT_RE.test(c));
    const matchCols = safeFields.map((f) => `"${f.column}"`);
    const selectCols = Array.from(new Set([
      ...matchCols,
      ...safeDisplayCols.map((c) => `"${c}"`),
    ]));

    const lookupSql = `
      SELECT ${selectCols.join(', ')}
      FROM "${tableName}"
      WHERE ${whereParts.join(' AND ')}
      LIMIT 1
    `;

    let row: any = null;
    try {
      const lookupRes = await client.query(lookupSql, params);
      if (lookupRes.rowCount && lookupRes.rowCount > 0) {
        row = lookupRes.rows[0];
      }
    } catch (qErr: any) {
      await client.query('ROLLBACK');
      logger.warn('multi-check server lookup failed', {
        responseId, tableName, error: qErr.message,
      });
      return NextResponse.json(
        { success: false, error: 'Erro ao consultar identidade' },
        { status: 500 }
      );
    }

    if (!row) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: 'Identidade não localizada — acesso negado' },
        { status: 404 }
      );
    }

    // 4) Monta identity_data com display columns + match (sempre incluindo match,
    //    pra rastreabilidade)
    const identityData: Record<string, any> = {};
    for (const dc of displayColumns) {
      if (SQL_IDENT_RE.test(dc.column)) {
        identityData[dc.column] = { value: row[dc.column] ?? null, label: dc.label || dc.column };
      }
    }
    for (const f of safeFields) {
      if (!identityData[f.column]) {
        identityData[f.column] = { value: row[f.column] ?? null, label: (f as any).label || f.column };
      }
    }

    // Label amigável = junção dos display values (ou o primeiro field)
    const labelParts = Object.values(identityData)
      .map((d: any) => String(d.value ?? '').trim())
      .filter(Boolean);
    const identityLabel = labelParts.slice(0, 3).join(' — ').slice(0, 500);

    // 5) Persiste identidade
    const firstFieldCol = safeFields[0].column;
    const firstFieldValue = cleanInputs[firstFieldCol];
    await client.query(
      `UPDATE fact_form_response SET
         identity_validated_at = NOW(),
         identity_table         = $2,
         identity_search_column = $3,
         identity_search_value  = $4,
         identity_data          = $5,
         identity_label         = $6
       WHERE firebase_id = $1`,
      [
        responseId,
        tableName,
        firstFieldCol,
        firstFieldValue,
        JSON.stringify(identityData),
        identityLabel || null,
      ]
    );

    // 6) Avança pra próxima etapa
    let nextStageId: string | null = null;
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
        `UPDATE fact_form_response
         SET status = 'completed'
         WHERE firebase_id = $1`,
        [responseId]
      );
    }

    // 7) Histórico
    await client.query(
      `INSERT INTO fact_workflow_history (
        response_key, form_key, stage_name_snap, action_type,
        performed_by_name, comment, entered_at, completed_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), NOW())`,
      [
        ctx.response_key,
        ctx.form_key,
        'Validação de Identidade',
        'identity_confirmed',
        identityLabel || firstFieldValue,
        `Identidade validada via ${safeFields.length} campo(s): ${safeFields.map((f) => f.column).join(', ')}`,
      ]
    );

    await client.query('COMMIT');

    await auditLog({
      eventType: AuditEventType.WORKFLOW_ACTION,
      severity: 'info',
      actor: { id: firstFieldValue, username: identityLabel || firstFieldValue },
      target: { type: 'response', id: responseId },
      payload: {
        action: 'identity_multi_validated',
        table: tableName,
        fieldsValidated: safeFields.map((f) => f.column),
        nextStageId,
      },
      request,
    });

    return NextResponse.json({
      success: true,
      data: {
        responseId,
        nextStageId,
        identityLabel,
      },
    });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('identity-validation/multi-check error', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao validar identidade' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
