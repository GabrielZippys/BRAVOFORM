/**
 * GET /api/dsar/export?userId=xxx
 *
 * LGPD Art. 18 — Direito de portabilidade dos dados (Right to Data Portability).
 *
 * Exporta TODOS os dados pessoais de um usuário em formato JSON estruturado,
 * conforme exigência da Lei Geral de Proteção de Dados (Lei 13.709/2018).
 *
 * O DSAR (Data Subject Access Request) deve ser respondido em até 15 dias
 * úteis (LGPD Art. 19, §1º).
 *
 * Retorna:
 *   {
 *     success: true,
 *     subjectId: string,
 *     generatedAt: ISO timestamp,
 *     data: {
 *       profile: { ...dados do colaborador... },
 *       responses: [ ...todas as respostas que ele submeteu... ],
 *       workflowActions: [ ...todas as acoes de workflow que ele executou... ],
 *       auditTrail: [ ...eventos de audit relacionados... ],
 *     },
 *     summary: { totalResponses, totalActions, totalAuditEvents }
 *   }
 *
 * Permissão: dsar.execute (admin/supervisor) ou self-service (próprio user).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';
import { auditLog, AuditEventType } from '@/lib/audit';
import { rateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  // DSAR é raro mas pesado — limita a 5 por IP/min
  const rl = await rateLimit(request, { limit: 5, windowMs: 60_000, bucket: 'dsar' });
  if (!rl.ok) return rl.response;

  const pool = getPool();
  const client = await pool.connect();

  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const requestedBy = searchParams.get('requestedBy') || 'self';
    const requestedByUsername = searchParams.get('requestedByUsername') || 'self-service';

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId é obrigatório' },
        { status: 400 }
      );
    }

    // 1) Profile do colaborador
    const profileRes = await client.query(
      `SELECT
         dcol.firebase_id      AS id,
         dcol.username,
         dcol.name,
         dcol.email,
         dcol.role,
         dcol.roles,
         dcol.created_at,
         dd.firebase_id        AS department_id,
         dd.name               AS department_name,
         dc.firebase_id        AS company_id,
         dc.name               AS company_name
       FROM dim_collaborators dcol
       LEFT JOIN dim_departments dd ON dd.department_key = dcol.department_key
       LEFT JOIN dim_companies   dc ON dc.company_key    = dcol.company_key
       WHERE dcol.firebase_id = $1`,
      [userId]
    );

    const profile = profileRes.rows[0] || null;

    // 2) Todas as respostas que esse user submeteu
    const responsesRes = await client.query(
      `SELECT
         fr.firebase_id   AS id,
         fr.form_title,
         fr.status,
         fr.submitted_at,
         fr.created_at,
         fr.deleted_at,
         fr.approved_at,
         fr.rejected_at,
         fr.rejection_reason,
         fr.motorista,
         fr.placa,
         fr.boletim,
         fr.setor_entrega,
         fr.endereco_entrega
       FROM fact_form_response fr
       LEFT JOIN dim_collaborators dcol ON dcol.collaborator_key = fr.collaborator_key
       WHERE dcol.firebase_id = $1
       ORDER BY fr.created_at DESC`,
      [userId]
    );

    // 3) Histórico de workflow (ações que esse user executou)
    const historyRes = await client.query(
      `SELECT
         wh.stage_name_snap,
         wh.action_type,
         wh.performed_by_name,
         wh.comment,
         wh.entered_at,
         wh.completed_at,
         wh.duration_minutes,
         fr.firebase_id   AS response_id,
         fr.form_title
       FROM fact_workflow_history wh
       JOIN fact_form_response fr ON fr.response_key = wh.response_key
       LEFT JOIN dim_collaborators dcol ON dcol.collaborator_key = fr.collaborator_key
       WHERE dcol.firebase_id = $1
          OR wh.performed_by_name = $2
       ORDER BY wh.created_at DESC`,
      [userId, profile?.username || '']
    );

    // 4) Eventos de audit relacionados (apenas onde ele é actor OU target)
    const auditRes = await client.query(
      `SELECT
         audit_id, event_type, severity,
         actor_id, actor_username,
         target_type, target_id, target_label,
         ip_address, user_agent,
         payload, success, error_message,
         created_at
       FROM fact_audit_events
       WHERE actor_id = $1
          OR (target_type = 'user' AND target_id = $1)
       ORDER BY created_at DESC
       LIMIT 5000`,
      [userId]
    );

    const exportData = {
      success: true,
      subjectId: userId,
      generatedAt: new Date().toISOString(),
      lgpd: {
        article: 'LGPD Art. 18 — Direito de portabilidade',
        responseDeadline: '15 dias úteis',
        controller: 'BravoForm',
      },
      data: {
        profile,
        responses: responsesRes.rows,
        workflowActions: historyRes.rows,
        auditTrail: auditRes.rows,
      },
      summary: {
        totalResponses: responsesRes.rows.length,
        totalWorkflowActions: historyRes.rows.length,
        totalAuditEvents: auditRes.rows.length,
      },
    };

    // Audit CRÍTICO: alguém exportou dados de um titular
    await auditLog({
      eventType: AuditEventType.DSAR_EXPORT,
      severity: 'critical',
      actor: { id: requestedBy, username: requestedByUsername },
      target: { type: 'user', id: userId, label: profile?.username || profile?.name },
      payload: {
        recordCounts: exportData.summary,
      },
      request,
    });

    // Headers para download direto (Content-Disposition)
    return NextResponse.json(exportData, {
      headers: {
        'Content-Disposition': `attachment; filename="dsar-export-${userId}-${Date.now()}.json"`,
      },
    });
  } catch (error: any) {
    logger.error('DSAR export error', error);

    await auditLog({
      eventType: AuditEventType.DSAR_EXPORT,
      severity: 'critical',
      payload: { error: error.message },
      success: false,
      errorMessage: error.message,
      request,
    });

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
