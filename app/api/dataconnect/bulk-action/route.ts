/**
 * POST /api/dataconnect/bulk-action
 *
 * Aplica uma ação em LOTE sobre múltiplas instâncias de workflow.
 *
 * Use cases enterprise:
 *   • Supervisor recebe 50 retiradas pendentes às 18h. Seleciona todas
 *     que são do mesmo motorista e aplica `route` em lote.
 *   • Após cancelamento de pedido por cliente, cancelar 12 instâncias relacionadas.
 *   • Export CSV de 200 instâncias para reporting.
 *
 * Body:
 *   {
 *     action: 'cancel' | 'route' | 'mark-picked-up' | 'transition' | 'soft-delete' | 'export',
 *     instanceIds: string[],         // firebase_ids
 *     performedBy, performedByUsername,
 *     // Campos comuns por ação:
 *     motorista?, placa?, boletim?,
 *     newStatus?, comment?,
 *     motivoCancelamento?, protocoloCancelamento?,
 *   }
 *
 * Retorno:
 *   {
 *     success: true,
 *     summary: { total, succeeded, failed },
 *     results: [{ id, ok, error? }, ...]
 *   }
 *
 * Cada item é processado individualmente (transação por item) — falha em
 * um não trava os demais. Audit log de batch + por item.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';
import { ensureWorkflowSchema } from '@/lib/db/workflowMigration';
import { auditLog, AuditEventType } from '@/lib/audit';
import { rateLimitMutation } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

const ALLOWED_ACTIONS = new Set([
  'cancel',
  'route',
  'mark-picked-up',
  'transition',
  'soft-delete',
  'export',
]);

const MAX_BULK_SIZE = 200;

interface BulkResult {
  id: string;
  ok: boolean;
  error?: string;
}

export async function POST(request: NextRequest) {
  // Rate limit MUITO agressivo: 10 bulks/min/IP (cada bulk pode ser 200 items)
  const rl = await rateLimitMutation(request);
  if (!rl.ok) return rl.response;

  const pool = getPool();
  const client = await pool.connect();

  try {
    await ensureWorkflowSchema(client);

    const body = await request.json();
    const {
      action,
      instanceIds,
      performedBy,
      performedByUsername,
      motorista,
      placa,
      boletim,
      newStatus,
      comment,
      motivoCancelamento,
      protocoloCancelamento,
    } = body;

    // Validação
    if (!action || !ALLOWED_ACTIONS.has(action)) {
      return NextResponse.json(
        { success: false, error: `action inválida. Permitidas: ${Array.from(ALLOWED_ACTIONS).join(', ')}` },
        { status: 400 }
      );
    }

    if (!Array.isArray(instanceIds) || instanceIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'instanceIds (array não-vazio) é obrigatório' },
        { status: 400 }
      );
    }

    if (instanceIds.length > MAX_BULK_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: `Máximo de ${MAX_BULK_SIZE} instâncias por bulk (recebido: ${instanceIds.length})`,
        },
        { status: 400 }
      );
    }

    const results: BulkResult[] = [];
    const startedAt = Date.now();

    // ─── EXPORT (apenas leitura — gera CSV/JSON) ──────────────────────────
    if (action === 'export') {
      const placeholders = instanceIds.map((_, i) => `$${i + 1}`).join(',');
      const exportRes = await client.query(
        `
        SELECT
          fr.firebase_id            AS id,
          fr.form_title             AS "formTitle",
          fr.collaborator_username  AS "solicitante",
          fr.status,
          fr.current_stage_fb_id    AS "currentStageId",
          fr.motorista,
          fr.placa,
          fr.boletim,
          fr.protocolo_cancelamento AS "protocoloCancelamento",
          fr.motivo_cancelamento    AS "motivoCancelamento",
          fr.setor_entrega          AS "setorEntrega",
          fr.endereco_entrega       AS "enderecoEntrega",
          fr.submitted_at           AS "submittedAt",
          fr.approved_at            AS "approvedAt",
          fr.rejection_reason       AS "rejectionReason"
        FROM fact_form_response fr
        WHERE fr.firebase_id IN (${placeholders})
        ORDER BY fr.submitted_at DESC
      `,
        instanceIds
      );

      await auditLog({
        eventType: AuditEventType.RESPONSE_EXPORTED,
        severity: 'info',
        actor: { id: performedBy || 'unknown', username: performedByUsername },
        target: { type: 'response', id: 'bulk', label: `${exportRes.rowCount} instâncias` },
        payload: { action: 'bulk_export', count: exportRes.rowCount, requestedIds: instanceIds.length },
        request,
      });

      return NextResponse.json({
        success: true,
        action: 'export',
        summary: {
          total: instanceIds.length,
          exported: exportRes.rowCount,
        },
        data: exportRes.rows,
      });
    }

    // ─── MUTATIONS (cancel | route | mark-picked-up | transition | soft-delete) ─
    for (const id of instanceIds) {
      try {
        let updateSql = '';
        let updateParams: any[] = [];

        switch (action) {
          case 'cancel':
            updateSql = `
              UPDATE fact_form_response SET
                status = 'cancelled',
                protocolo_cancelamento = COALESCE($2, protocolo_cancelamento),
                motivo_cancelamento = COALESCE($3, motivo_cancelamento)
              WHERE firebase_id = $1
            `;
            updateParams = [id, protocoloCancelamento || null, motivoCancelamento || null];
            break;

          case 'route':
            updateSql = `
              UPDATE fact_form_response SET
                status = 'in_routing',
                motorista = COALESCE($2, motorista),
                placa = COALESCE($3, placa)
              WHERE firebase_id = $1
            `;
            updateParams = [id, motorista || null, placa || null];
            break;

          case 'mark-picked-up':
            updateSql = `
              UPDATE fact_form_response SET
                status = 'completed',
                boletim = COALESCE($2, boletim)
              WHERE firebase_id = $1
            `;
            updateParams = [id, boletim || null];
            break;

          case 'transition':
            updateSql = `
              UPDATE fact_form_response SET
                status = COALESCE($2, status)
              WHERE firebase_id = $1
            `;
            updateParams = [id, newStatus || null];
            break;

          case 'soft-delete':
            updateSql = `
              UPDATE fact_form_response SET
                deleted_at = NOW(),
                deleted_by = $2,
                deleted_by_username = $3
              WHERE firebase_id = $1
                AND deleted_at IS NULL
            `;
            updateParams = [id, performedBy || 'admin', performedByUsername || 'Administrador'];
            break;
        }

        const updateRes = await client.query(updateSql, updateParams);

        if ((updateRes.rowCount || 0) === 0) {
          results.push({ id, ok: false, error: 'Instância não encontrada ou sem mudança' });
          continue;
        }

        // Histórico individual
        const respKeyRes = await client.query(
          `SELECT response_key, form_key FROM fact_form_response WHERE firebase_id = $1`,
          [id]
        );
        const responseKey = respKeyRes.rows[0]?.response_key;
        const formKey = respKeyRes.rows[0]?.form_key;

        if (responseKey) {
          await client.query(
            `INSERT INTO fact_workflow_history (
              response_key, form_key, stage_name_snap, action_type,
              performed_by_name, comment, entered_at, completed_at, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), NOW())`,
            [
              responseKey,
              formKey,
              `Bulk ${action}`,
              action,
              performedByUsername || performedBy || 'sistema',
              comment || `Bulk action: ${action}`,
            ]
          );
        }

        results.push({ id, ok: true });
      } catch (err: any) {
        results.push({ id, ok: false, error: err.message });
        logger.warn('bulk-action item failed', { id, action, error: err.message });
      }
    }

    const succeeded = results.filter((r) => r.ok).length;
    const failed = results.length - succeeded;
    const durationMs = Date.now() - startedAt;

    // Audit log do batch (severity=warn se houve falhas)
    await auditLog({
      eventType: AuditEventType.WORKFLOW_ACTION,
      severity: failed > 0 ? 'warn' : 'info',
      actor: { id: performedBy || 'unknown', username: performedByUsername },
      target: { type: 'response', id: 'bulk', label: `${results.length} instâncias` },
      payload: {
        action: `bulk_${action}`,
        total: results.length,
        succeeded,
        failed,
        durationMs,
        ...(failed > 0 && {
          failedIds: results.filter((r) => !r.ok).map((r) => ({ id: r.id, error: r.error })),
        }),
      },
      request,
    });

    return NextResponse.json({
      success: true,
      action,
      summary: { total: results.length, succeeded, failed, durationMs },
      results,
    });
  } catch (error: any) {
    logger.error('bulk-action error', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
