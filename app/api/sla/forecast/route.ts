/**
 * GET  /api/sla/forecast
 *   ?status=at_risk,critical,breached  → filtro de status (default: todos não-ok)
 *   ?limit=100                          → limite (default 100, max 500)
 *
 * POST /api/sla/forecast/recompute
 *   { responseIds?: string[] }          → recalcula predições e persiste sla_status
 *
 * Retorna predições agregadas para todas as instâncias workflow-only ativas.
 *
 * Para uma demo killer, este endpoint é chamado a cada 30s pelo SLA Insights
 * Panel. Cada chamada é cacheável (Cache-Control: private, max-age=30) para
 * reduzir custo computacional.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';
import { ensureWorkflowSchema } from '@/lib/db/workflowMigration';
import { ensureSlaSchema } from '@/lib/db/slaMigration';
import { computePrediction, SlaPrediction, SlaStatus } from '@/lib/sla';
import { rateLimitRead, rateLimitMutation } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import { auditLog, AuditEventType } from '@/lib/audit';

interface ForecastResponse {
  success: boolean;
  data: SlaPrediction[];
  summary: {
    total: number;
    ok: number;
    at_risk: number;
    critical: number;
    breached: number;
    no_target: number;
  };
  generatedAt: string;
}

export async function GET(request: NextRequest) {
  const rl = await rateLimitRead(request);
  if (!rl.ok) return rl.response;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureWorkflowSchema(client);
    await ensureSlaSchema(client);

    const { searchParams } = new URL(request.url);
    const filterStatuses = searchParams.get('status')?.split(',').filter(Boolean);
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);

    // Carrega todas instances ativas (não-deleted, não-finalizadas) com SLA target da etapa atual
    const result = await client.query(`
      SELECT
        fr.firebase_id            AS response_id,
        fr.form_key,
        fr.current_stage_fb_id    AS stage_id,
        fr.status,
        fr.motorista,
        fr.collaborator_username  AS solicitante,
        fr.form_title,
        COALESCE(fr.submitted_at, fr.created_at) AS stage_entered_at,

        -- SLA target da etapa atual (se houver)
        ws.sla_target_minutes,
        COALESCE(ws.sla_warn_threshold, 80)      AS warn_threshold,
        COALESCE(ws.sla_critical_threshold, 100) AS critical_threshold,
        COALESCE(ws.sla_breach_threshold, 150)   AS breach_threshold
      FROM fact_form_response fr
      LEFT JOIN dim_workflow_stages ws
        ON ws.firebase_id = fr.current_stage_fb_id
      WHERE fr.deleted_at IS NULL
        AND fr.status NOT IN ('completed', 'cancelled', 'rejected')
      ORDER BY fr.submitted_at DESC NULLS LAST
      LIMIT $1
    `, [limit]);

    const predictions: SlaPrediction[] = [];

    for (const row of result.rows) {
      try {
        const pred = await computePrediction(client, {
          responseId: row.response_id,
          stageId: row.stage_id,
          formKey: row.form_key,
          status: row.status,
          motorista: row.motorista,
          stageEnteredAt: new Date(row.stage_entered_at),
          targetMinutes: row.sla_target_minutes,
          warnThreshold: row.warn_threshold,
          criticalThreshold: row.critical_threshold,
          breachThreshold: row.breach_threshold,
        });

        predictions.push(pred);
      } catch (e) {
        logger.warn('SLA forecast: failed for instance', {
          responseId: row.response_id,
          error: (e as Error).message,
        });
      }
    }

    // Aplica filtro
    const filtered = filterStatuses
      ? predictions.filter((p) => filterStatuses.includes(p.status))
      : predictions;

    // Resumo
    const summary = {
      total: predictions.length,
      ok:        predictions.filter((p) => p.status === 'ok').length,
      at_risk:   predictions.filter((p) => p.status === 'at_risk').length,
      critical:  predictions.filter((p) => p.status === 'critical').length,
      breached:  predictions.filter((p) => p.status === 'breached').length,
      no_target: predictions.filter((p) => p.status === 'no_target').length,
    };

    // Ordena: breached → critical → at_risk → ok
    const statusOrder: Record<SlaStatus, number> = {
      breached: 0, critical: 1, at_risk: 2, ok: 3, no_target: 4,
    };
    filtered.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

    const response: ForecastResponse = {
      success: true,
      data: filtered,
      summary,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'private, max-age=20',
      },
    });
  } catch (error: any) {
    logger.error('SLA forecast error', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}

// POST: recomputa e persiste o sla_status nas instances (escalation cascade)
export async function POST(request: NextRequest) {
  const rl = await rateLimitMutation(request);
  if (!rl.ok) return rl.response;

  const pool = getPool();
  const client = await pool.connect();

  try {
    await ensureWorkflowSchema(client);
    await ensureSlaSchema(client);

    const body = await request.json().catch(() => ({}));
    const responseIds: string[] | undefined = Array.isArray(body?.responseIds) ? body.responseIds : undefined;

    let whereClause = '';
    const params: any[] = [];
    if (responseIds && responseIds.length > 0) {
      whereClause = 'AND fr.firebase_id = ANY($1)';
      params.push(responseIds);
    }

    const result = await client.query(`
      SELECT
        fr.firebase_id            AS response_id,
        fr.form_key,
        fr.current_stage_fb_id    AS stage_id,
        fr.status,
        fr.motorista,
        fr.sla_status             AS prev_sla_status,
        COALESCE(fr.submitted_at, fr.created_at) AS stage_entered_at,
        ws.sla_target_minutes,
        COALESCE(ws.sla_warn_threshold, 80)      AS warn_threshold,
        COALESCE(ws.sla_critical_threshold, 100) AS critical_threshold,
        COALESCE(ws.sla_breach_threshold, 150)   AS breach_threshold
      FROM fact_form_response fr
      LEFT JOIN dim_workflow_stages ws
        ON ws.firebase_id = fr.current_stage_fb_id
      WHERE fr.deleted_at IS NULL
        AND fr.status NOT IN ('completed', 'cancelled', 'rejected')
        ${whereClause}
    `, params);

    const escalations: Array<{ responseId: string; from: string | null; to: SlaStatus }> = [];

    for (const row of result.rows) {
      try {
        const pred = await computePrediction(client, {
          responseId: row.response_id,
          stageId: row.stage_id,
          formKey: row.form_key,
          status: row.status,
          motorista: row.motorista,
          stageEnteredAt: new Date(row.stage_entered_at),
          targetMinutes: row.sla_target_minutes,
          warnThreshold: row.warn_threshold,
          criticalThreshold: row.critical_threshold,
          breachThreshold: row.breach_threshold,
        });

        const breachAt = pred.minutesUntilBreach !== null && pred.targetMinutes
          ? new Date(Date.now() + pred.minutesUntilBreach * 60_000)
          : null;

        await client.query(`
          UPDATE fact_form_response
          SET sla_status = $2,
              sla_predicted_minutes = $3,
              sla_elapsed_minutes = $4,
              sla_target_minutes = $5,
              sla_evaluated_at = NOW(),
              sla_breach_predicted_at = $6
          WHERE firebase_id = $1
        `, [
          row.response_id,
          pred.status,
          pred.predictedMinutes,
          pred.elapsedMinutes,
          pred.targetMinutes,
          breachAt,
        ]);

        // Detecta escalation (status piorou)
        const prev = (row.prev_sla_status as SlaStatus | null) || 'ok';
        const order: Record<SlaStatus, number> = {
          ok: 0, at_risk: 1, critical: 2, breached: 3, no_target: -1,
        };
        if (order[pred.status] > order[prev]) {
          escalations.push({ responseId: row.response_id, from: prev, to: pred.status });

          // Audit log da escalation (severity sobe junto)
          const sev = pred.status === 'breached' ? 'critical'
                    : pred.status === 'critical' ? 'warn'
                    : 'info';
          await auditLog({
            eventType: 'workflow.action' as any,
            severity: sev as any,
            target: { type: 'response', id: row.response_id },
            payload: {
              event: 'sla_escalation',
              from: prev,
              to: pred.status,
              percentOfTarget: pred.percentOfTarget,
              suggestion: pred.suggestion,
            },
            request,
          });
        }
      } catch (e) {
        logger.warn('SLA recompute: failed for instance', {
          responseId: row.response_id,
          error: (e as Error).message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: result.rowCount,
      escalations: escalations.length,
      escalationsDetail: escalations,
    });
  } catch (error: any) {
    logger.error('SLA recompute error', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}
