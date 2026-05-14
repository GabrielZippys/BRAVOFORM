/**
 * GET /api/dataconnect/instance-detail/[id]
 *
 * Retorna o detalhamento completo de uma instância de workflow:
 *   - Dados base (formTitle, status, datas, identidade)
 *   - Workflow + stages (com nomes e tipos)
 *   - Histórico completo (cada transição com ator, comentário, timing)
 *   - Campos operacionais (motorista, placa, boletim, setor, etc.)
 *
 * Usado pelo modal "Ver detalhes" na aba Instâncias do BravoFlow.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';
import { logger } from '@/lib/logger';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ success: false, error: 'id obrigatório' }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    // 1) Instância
    const instRes = await client.query(
      `SELECT
         fr.firebase_id, fr.response_key, fr.form_key, fr.form_title,
         fr.status, fr.submitted_at, fr.current_stage_fb_id,
         fr.workflow_fb_id, fr.public_link_token, fr.collaborator_username,
         fr.identity_label, fr.identity_data, fr.identity_table,
         fr.identity_search_value, fr.identity_validated_at,
         fr.identity_pre_select_value,
         fr.motorista, fr.placa, fr.boletim,
         fr.setor_entrega, fr.endereco_entrega, fr.dias_entrega,
         fr.protocolo_cancelamento, fr.motivo_cancelamento,
         fr.rejection_reason, fr.rejected_at, fr.approved_at,
         fr.replica_count, fr.parent_response_fb_id
       FROM fact_form_response fr
       WHERE fr.firebase_id = $1
         AND fr.deleted_at IS NULL
       LIMIT 1`,
      [id]
    );

    if (instRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Instância não encontrada' },
        { status: 404 }
      );
    }

    const inst = instRes.rows[0];

    // 2) Workflow + stages (se tiver workflow_fb_id)
    let workflow: any = null;
    let stages: any[] = [];
    if (inst.workflow_fb_id) {
      const wfRes = await client.query(
        `SELECT firebase_id, name, description
         FROM dim_workflows
         WHERE firebase_id = $1`,
        [inst.workflow_fb_id]
      );
      workflow = wfRes.rows[0] || null;

      const stRes = await client.query(
        `SELECT firebase_id, stage_name, stage_description, stage_type, stage_order
         FROM dim_workflow_stages
         WHERE workflow_fb_id = $1
         ORDER BY stage_order ASC`,
        [inst.workflow_fb_id]
      );
      stages = stRes.rows.map((s) => ({
        id: s.firebase_id,
        name: s.stage_name,
        description: s.stage_description || '',
        stageType: s.stage_type,
        order: s.stage_order,
        isCurrent: s.firebase_id === inst.current_stage_fb_id,
      }));
    }

    // 3) Histórico — usa response_key (FK)
    const histRes = await client.query(
      `SELECT history_key, stage_name_snap, action_type,
              performed_by_name, comment, entered_at, completed_at, duration_minutes
       FROM fact_workflow_history
       WHERE response_key = $1
       ORDER BY COALESCE(completed_at, entered_at, created_at) ASC`,
      [inst.response_key]
    );

    const history = histRes.rows.map((h) => ({
      id: h.history_key,
      stageName: h.stage_name_snap || '—',
      actionType: h.action_type,
      performedByName: h.performed_by_name || null,
      comment: h.comment || null,
      enteredAt: h.entered_at,
      completedAt: h.completed_at,
      durationMinutes: h.duration_minutes,
    }));

    return NextResponse.json({
      success: true,
      data: {
        id: inst.firebase_id,
        formTitle: inst.form_title || workflow?.name || 'Instância',
        status: inst.status,
        submittedAt: inst.submitted_at,
        currentStageId: inst.current_stage_fb_id,
        isPublicLink: !!inst.public_link_token,
        collaboratorUsername: inst.collaborator_username,
        identity: inst.identity_label
          ? {
              label: inst.identity_label,
              table: inst.identity_table,
              searchValue: inst.identity_search_value,
              data: inst.identity_data || {},
              validatedAt: inst.identity_validated_at,
              preSelectValue: inst.identity_pre_select_value || null,
            }
          : null,
        operational: {
          motorista: inst.motorista || null,
          placa: inst.placa || null,
          boletim: inst.boletim || null,
          setorEntrega: inst.setor_entrega || null,
          enderecoEntrega: inst.endereco_entrega || null,
          diasEntrega: inst.dias_entrega || null,
          protocoloCancelamento: inst.protocolo_cancelamento || null,
          motivoCancelamento: inst.motivo_cancelamento || null,
        },
        approval: {
          rejectionReason: inst.rejection_reason || null,
          rejectedAt: inst.rejected_at,
          approvedAt: inst.approved_at,
        },
        replica: {
          count: inst.replica_count || 0,
          parentResponseId: inst.parent_response_fb_id || null,
        },
        workflow,
        stages,
        history,
      },
    });
  } catch (error: any) {
    logger.error('instance-detail GET error', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao carregar detalhes' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
