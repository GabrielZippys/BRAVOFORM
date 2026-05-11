/**
 * POST /api/identity-validation/confirm
 *
 * Confirma a identidade do colaborador numa etapa de "identity-validation"
 * e avança o workflow para a próxima etapa.
 *
 * Body:
 *   {
 *     responseId: string,          // firebase_id da instância do workflow
 *     stageId: string,             // ID da etapa atual (identity-validation)
 *     inputValue: string,          // valor digitado pelo colaborador (ID)
 *     resolved: {                  // dados retornados por /api/lookup/query
 *       [col]: { value, label }
 *     },
 *     label?: string,              // rótulo amigável (ex: "João Silva — Frigorífico ACME")
 *   }
 *
 * Comportamento:
 *   1. Valida que a instância existe e está na etapa do tipo identity-validation
 *   2. Re-executa o lookup server-side para validar (defesa em profundidade —
 *      não confia no `resolved` enviado pelo cliente)
 *   3. Persiste identity_* na fact_form_response
 *   4. Avança a instância para a próxima etapa
 *   5. Registra histórico em fact_workflow_history
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';
import { ensureWorkflowSchema } from '@/lib/db/workflowMigration';
import { ensureIdentityValidationSchema } from '@/lib/db/identityValidationMigration';
import { auditLog, AuditEventType } from '@/lib/audit';
import { rateLimitMutation } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

const SQL_IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;

export async function POST(request: NextRequest) {
  // Rate limit firme — endpoint público em workflow sem login
  const rl = await rateLimitMutation(request);
  if (!rl.ok) return rl.response;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureWorkflowSchema(client);
    await ensureIdentityValidationSchema(client);

    const body = await request.json();
    const { responseId, stageId, inputValue, label } = body;

    if (!responseId || !stageId || !inputValue) {
      return NextResponse.json(
        { success: false, error: 'responseId, stageId e inputValue são obrigatórios' },
        { status: 400 }
      );
    }

    if (String(inputValue).length > 200) {
      return NextResponse.json(
        { success: false, error: 'inputValue muito longo' },
        { status: 400 }
      );
    }

    await client.query('BEGIN');

    // 1) Busca instância + config da etapa atual
    const ctxRes = await client.query(
      `SELECT
         fr.response_key, fr.form_key, fr.current_stage_fb_id,
         ws.workflow_fb_id,
         ws.lookup_table, ws.lookup_search_column, ws.lookup_display_columns,
         ws.lookup_require_match,
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
    const searchColumn: string = ctx.lookup_search_column;
    const displayColumns: Array<{ column: string; label: string }> = ctx.lookup_display_columns || [];
    const requireMatch: boolean = ctx.lookup_require_match ?? true;

    if (!tableName || !searchColumn) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: 'Etapa não configurada corretamente (admin)' },
        { status: 500 }
      );
    }

    // 2) Re-executa o lookup server-side (defesa: não confia no cliente)
    let resolvedServerSide: Record<string, any> | null = null;

    if (SQL_IDENT_RE.test(tableName) && SQL_IDENT_RE.test(searchColumn)) {
      const safeDisplayCols = displayColumns
        .map((d) => d.column)
        .filter((c) => SQL_IDENT_RE.test(c));

      if (safeDisplayCols.length > 0) {
        const colList = safeDisplayCols.map((c) => `"${c}"`).join(', ');
        try {
          const lookupRes = await client.query(
            `SELECT ${colList}
             FROM "${tableName}"
             WHERE "${searchColumn}"::text = $1::text
                OR "${searchColumn}"::text ILIKE $1::text
             LIMIT 1`,
            [String(inputValue).trim()]
          );
          if (lookupRes.rowCount && lookupRes.rowCount > 0) {
            const row = lookupRes.rows[0];
            resolvedServerSide = {};
            for (const dc of displayColumns) {
              if (SQL_IDENT_RE.test(dc.column)) {
                resolvedServerSide[dc.column] = {
                  value: row[dc.column] ?? null,
                  label: dc.label || dc.column,
                };
              }
            }
          }
        } catch (qErr: any) {
          logger.warn('identity-validation server lookup failed', {
            responseId, tableName, error: qErr.message,
          });
        }
      }
    }

    // 3) Se requireMatch e não achou, bloqueia
    if (requireMatch && !resolvedServerSide) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: 'ID não encontrado na base. Contate o suporte do sistema.' },
        { status: 404 }
      );
    }

    // 4) Persiste a identidade na instância
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
        searchColumn,
        String(inputValue).trim(),
        JSON.stringify(resolvedServerSide || {}),
        String(label || '').slice(0, 500) || null,
      ]
    );

    // 5) Avança para a próxima etapa do workflow
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
      // Sem próxima etapa — workflow encerrado
      await client.query(
        `UPDATE fact_form_response
         SET status = 'completed'
         WHERE firebase_id = $1`,
        [responseId]
      );
    }

    // 6) Histórico
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
        label || String(inputValue).trim(),
        `ID "${inputValue}" validado na tabela ${tableName}`,
      ]
    );

    await client.query('COMMIT');

    // Audit log
    await auditLog({
      eventType: AuditEventType.WORKFLOW_ACTION,
      severity: 'info',
      actor: { id: String(inputValue), username: String(label || inputValue) },
      target: { type: 'response', id: responseId },
      payload: {
        action: 'identity_validated',
        table: tableName,
        searchColumn,
        identityLabel: label,
        nextStageId,
      },
      request,
    });

    return NextResponse.json({
      success: true,
      data: {
        responseId,
        nextStageId,
        identityLabel: label,
        resolved: resolvedServerSide,
      },
    });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('identity-validation/confirm error', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
