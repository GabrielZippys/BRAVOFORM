import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';

/**
 * GET /api/dataconnect/workflow-metrics
 *
 * Query params (todos opcionais):
 *   ?formId=xxx        → filtra por formulário (firebase_id)
 *   ?companyId=xxx     → filtra por empresa
 *   ?from=2025-01-01   → data inicial (submitted_at)
 *   ?to=2025-12-31     → data final (submitted_at)
 *
 * Retorna:
 * {
 *   totals: { iniciados, pendentes, aprovadas, reprovadas, canceladas,
 *             em_roteirizacao, em_retirada, finalizadas, replicas },
 *   byForm: [ { formId, formTitle, total, ... } ],
 *   byStage: [ { stageId, count } ],
 *   byStatus: [ { status, count } ],
 *   recent: [ ...últimas 20 instâncias ],
 *   sla: { avgMinutesPerStage }
 * }
 */
export async function GET(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const { searchParams } = new URL(request.url);
    const formId    = searchParams.get('formId');
    const companyId = searchParams.get('companyId');
    const from      = searchParams.get('from');
    const to        = searchParams.get('to');

    const conds: string[] = ['fr.deleted_at IS NULL'];
    const params: any[] = [];
    let p = 1;

    if (formId)    { conds.push(`f.firebase_id = $${p++}`); params.push(formId); }
    if (companyId) { conds.push(`c.firebase_id = $${p++}`); params.push(companyId); }
    if (from)      { conds.push(`fr.submitted_at >= $${p++}`); params.push(from); }
    if (to)        { conds.push(`fr.submitted_at <= $${p++}`); params.push(to); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    // 1) Totais agregados
    const totalsRes = await client.query(`
      SELECT
        COUNT(*)::int                                              AS iniciados,
        COUNT(*) FILTER (WHERE fr.status = 'pending')::int         AS pendentes,
        COUNT(*) FILTER (WHERE fr.status = 'approved')::int        AS aprovadas,
        COUNT(*) FILTER (WHERE fr.status = 'rejected')::int        AS reprovadas,
        COUNT(*) FILTER (WHERE fr.status = 'cancelled')::int       AS canceladas,
        COUNT(*) FILTER (WHERE fr.status = 'in_routing')::int      AS em_roteirizacao,
        COUNT(*) FILTER (WHERE fr.status = 'in_pickup')::int       AS em_retirada,
        COUNT(*) FILTER (WHERE fr.status = 'completed')::int       AS finalizadas,
        COALESCE(SUM(fr.replica_count), 0)::int                    AS replicas
      FROM fact_form_response fr
      LEFT JOIN dim_forms     f ON fr.form_key    = f.form_key
      LEFT JOIN dim_companies c ON fr.company_key = c.company_key
      ${where}
    `, params);

    // 2) Por formulário
    const byFormRes = await client.query(`
      SELECT
        f.firebase_id                                          AS "formId",
        COALESCE(f.title, fr.form_title, 'Sem título')         AS "formTitle",
        COUNT(*)::int                                          AS total,
        COUNT(*) FILTER (WHERE fr.status = 'pending')::int     AS pendentes,
        COUNT(*) FILTER (WHERE fr.status = 'approved')::int    AS aprovadas,
        COUNT(*) FILTER (WHERE fr.status = 'rejected')::int    AS reprovadas,
        COUNT(*) FILTER (WHERE fr.status = 'completed')::int   AS finalizadas
      FROM fact_form_response fr
      LEFT JOIN dim_forms     f ON fr.form_key    = f.form_key
      LEFT JOIN dim_companies c ON fr.company_key = c.company_key
      ${where}
      GROUP BY f.firebase_id, f.title, fr.form_title
      ORDER BY total DESC
      LIMIT 50
    `, params);

    // 3) Por estágio atual
    const byStageRes = await client.query(`
      SELECT
        COALESCE(fr.current_stage_fb_id, '(sem etapa)') AS "stageId",
        COUNT(*)::int                                   AS count
      FROM fact_form_response fr
      LEFT JOIN dim_forms     f ON fr.form_key    = f.form_key
      LEFT JOIN dim_companies c ON fr.company_key = c.company_key
      ${where}
      GROUP BY fr.current_stage_fb_id
      ORDER BY count DESC
    `, params);

    // 4) Por status
    const byStatusRes = await client.query(`
      SELECT fr.status, COUNT(*)::int AS count
      FROM fact_form_response fr
      LEFT JOIN dim_forms     f ON fr.form_key    = f.form_key
      LEFT JOIN dim_companies c ON fr.company_key = c.company_key
      ${where}
      GROUP BY fr.status
      ORDER BY count DESC
    `, params);

    // 5) Instâncias recentes
    const recentRes = await client.query(`
      SELECT
        fr.firebase_id           AS id,
        fr.form_title            AS "formTitle",
        fr.collaborator_username AS "solicitante",
        fr.status,
        fr.current_stage_fb_id   AS "currentStageId",
        fr.motorista,
        fr.placa,
        fr.replica_count         AS "replicaCount",
        fr.submitted_at          AS "submittedAt",
        fr.approved_at           AS "approvedAt",
        fr.rejected_at           AS "rejectedAt",
        fr.rejection_reason      AS "rejectionReason"
      FROM fact_form_response fr
      LEFT JOIN dim_forms     f ON fr.form_key    = f.form_key
      LEFT JOIN dim_companies c ON fr.company_key = c.company_key
      ${where}
      ORDER BY fr.submitted_at DESC
      LIMIT 20
    `, params);

    // 6) SLA médio por estágio
    const slaRes = await client.query(`
      SELECT
        wh.stage_name_snap                              AS "stageName",
        ROUND(AVG(wh.duration_minutes)::numeric, 1)::float AS "avgMinutes",
        COUNT(*)::int                                    AS "transitions"
      FROM fact_workflow_history wh
      JOIN fact_form_response fr ON wh.response_key = fr.response_key
      LEFT JOIN dim_forms     f ON fr.form_key    = f.form_key
      LEFT JOIN dim_companies c ON fr.company_key = c.company_key
      ${where} ${where ? ' AND ' : 'WHERE '} wh.duration_minutes IS NOT NULL
      GROUP BY wh.stage_name_snap
      ORDER BY "avgMinutes" DESC
      LIMIT 20
    `, params);

    return NextResponse.json({
      success: true,
      data: {
        totals:   totalsRes.rows[0],
        byForm:   byFormRes.rows,
        byStage:  byStageRes.rows,
        byStatus: byStatusRes.rows,
        recent:   recentRes.rows,
        sla:      slaRes.rows,
      },
    });
  } catch (error: any) {
    console.error('❌ workflow-metrics error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
