import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';
import { ensureWorkflowSchema } from '@/lib/db/workflowMigration';
import { auditLog, AuditEventType } from '@/lib/audit';
import { rateLimitMutation } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

// Mapeia ações BravoFlow → permissão RBAC esperada (referência;
// a verificação efetiva é feita no readActorFromRequest do RBAC).
// Hoje aplicamos audit + rate limit; permissão completa exige UI propagar
// headers x-bravo-* — release gradual para não quebrar fluxo atual.
const ACTION_PERMISSION_MAP: Record<string, string> = {
  approve:          'workflow.approve',
  reject:           'workflow.reject',
  route:            'workflow.route',
  'mark-picked-up': 'workflow.pickup',
  cancel:           'workflow.cancel',
  replicate:        'workflow.replicate',
  transition:       'workflow.update',
};

/**
 * POST /api/dataconnect/workflow-action
 *
 * Aplica uma ação de workflow sobre uma resposta existente.
 *
 * Body:
 *   {
 *     responseId: string,            // firebase_id da resposta
 *     action: 'approve' | 'reject' | 'replicate' | 'route' | 'mark-picked-up' | 'cancel' | 'transition',
 *     // Quem está agindo:
 *     performedBy: string,           // collaboratorId
 *     performedByUsername: string,
 *     // Campos específicos por ação:
 *     rejectionReason?: string,      // (reject)
 *     setorEntrega?: string,         // (approve) info trazida pelo aprovador
 *     enderecoEntrega?: string,
 *     diasEntrega?: string,
 *     produtoExisteNF?: boolean,
 *     pdfNotaFiscalUrl?: string,
 *     parentResponseId?: string,     // (replicate) firebase_id da resposta original
 *     motorista?: string,            // (route)
 *     placa?: string,
 *     boletim?: string,              // (mark-picked-up)
 *     protocoloCancelamento?: string, // (cancel)
 *     motivoCancelamento?: string,
 *     newStatus?: string,            // (transition)
 *     currentStageId?: string,       // (transition) novo estágio
 *     comment?: string,
 *   }
 *
 * Cada ação atualiza fact_form_response e registra um histórico em
 * fact_workflow_history para auditoria e SLA.
 */
export async function POST(request: NextRequest) {
  // ─── 1) Rate limit (anti-abuse: 30 req/min/IP) ────────────────────────
  const rl = await rateLimitMutation(request);
  if (!rl.ok) return rl.response;

  const pool = getPool();
  const client = await pool.connect();

  try {
    // Garante que as colunas do BravoFlow existam (idempotente)
    await ensureWorkflowSchema(client);

    const body = await request.json();
    const {
      responseId,
      action,
      performedBy,
      performedByUsername,
      rejectionReason,
      setorEntrega, enderecoEntrega, diasEntrega, produtoExisteNF, pdfNotaFiscalUrl,
      parentResponseId,
      motorista, placa,
      boletim,
      protocoloCancelamento, motivoCancelamento,
      newStatus, currentStageId,
      comment,
    } = body;

    if (!responseId || !action) {
      return NextResponse.json(
        { success: false, error: 'responseId e action são obrigatórios' },
        { status: 400 }
      );
    }

    await client.query('BEGIN');

    // Buscar a resposta-alvo
    const respRes = await client.query(
      `SELECT response_key, form_key, status, current_stage_fb_id
         FROM fact_form_response
         WHERE firebase_id = $1`,
      [responseId]
    );
    if (!respRes.rows[0]) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: 'Resposta não encontrada' },
        { status: 404 }
      );
    }
    const { response_key: responseKey, form_key: formKey, current_stage_fb_id: prevStageId } = respRes.rows[0];

    let updateSql = '';
    let updateParams: any[] = [];
    let actionType = action;
    let stageNameSnap = '';

    switch (action) {
      case 'approve':
        updateSql = `
          UPDATE fact_form_response SET
            status = 'approved',
            approved_at = NOW(),
            approved_by = $2,
            approved_by_username = $3,
            setor_entrega = COALESCE($4, setor_entrega),
            endereco_entrega = COALESCE($5, endereco_entrega),
            dias_entrega = COALESCE($6, dias_entrega),
            produto_existe_nf = COALESCE($7, produto_existe_nf),
            pdf_nota_fiscal_url = COALESCE($8, pdf_nota_fiscal_url),
            current_stage_fb_id = COALESCE($9, current_stage_fb_id)
          WHERE firebase_id = $1
        `;
        updateParams = [responseId, performedBy, performedByUsername,
                        setorEntrega || null, enderecoEntrega || null, diasEntrega || null,
                        produtoExisteNF ?? null, pdfNotaFiscalUrl || null, currentStageId || null];
        stageNameSnap = 'Aprovação Qualidade';
        break;

      case 'reject':
        updateSql = `
          UPDATE fact_form_response SET
            status = 'rejected',
            rejected_at = NOW(),
            rejected_by = $2,
            rejected_by_username = $3,
            rejection_reason = $4,
            current_stage_fb_id = COALESCE($5, current_stage_fb_id)
          WHERE firebase_id = $1
        `;
        updateParams = [responseId, performedBy, performedByUsername,
                        rejectionReason || '', currentStageId || null];
        stageNameSnap = 'Reprovação';
        break;

      case 'replicate':
        // Apenas marca esta resposta como "réplica" do parent — a criação
        // da nova resposta é feita por POST /api/dataconnect/save-response.
        // Aqui apenas incrementamos o contador no parent.
        if (!parentResponseId) {
          await client.query('ROLLBACK');
          return NextResponse.json(
            { success: false, error: 'parentResponseId é obrigatório para replicate' },
            { status: 400 }
          );
        }
        updateSql = `
          UPDATE fact_form_response SET
            parent_response_fb_id = $2,
            replica_count = COALESCE(replica_count, 0) + 1,
            status = 'pending'
          WHERE firebase_id = $1
        `;
        updateParams = [responseId, parentResponseId];
        // Também incrementa o contador de réplicas no parent
        await client.query(
          `UPDATE fact_form_response SET replica_count = COALESCE(replica_count, 0) + 1
             WHERE firebase_id = $1`,
          [parentResponseId]
        );
        stageNameSnap = 'Réplica';
        break;

      case 'route':
        updateSql = `
          UPDATE fact_form_response SET
            status = 'in_routing',
            motorista = COALESCE($2, motorista),
            placa = COALESCE($3, placa),
            current_stage_fb_id = COALESCE($4, current_stage_fb_id)
          WHERE firebase_id = $1
        `;
        updateParams = [responseId, motorista || null, placa || null, currentStageId || null];
        stageNameSnap = 'Roteirização';
        break;

      case 'mark-picked-up':
        updateSql = `
          UPDATE fact_form_response SET
            status = 'completed',
            boletim = COALESCE($2, boletim),
            current_stage_fb_id = COALESCE($3, current_stage_fb_id)
          WHERE firebase_id = $1
        `;
        updateParams = [responseId, boletim || null, currentStageId || null];
        stageNameSnap = 'Retirada Concluída';
        break;

      case 'cancel':
        updateSql = `
          UPDATE fact_form_response SET
            status = 'cancelled',
            protocolo_cancelamento = COALESCE($2, protocolo_cancelamento),
            motivo_cancelamento = COALESCE($3, motivo_cancelamento),
            current_stage_fb_id = COALESCE($4, current_stage_fb_id)
          WHERE firebase_id = $1
        `;
        updateParams = [responseId, protocoloCancelamento || null,
                        motivoCancelamento || null, currentStageId || null];
        stageNameSnap = 'Cancelamento';
        break;

      case 'transition':
        // Mudança genérica de estágio sem semântica específica
        updateSql = `
          UPDATE fact_form_response SET
            status = COALESCE($2, status),
            current_stage_fb_id = COALESCE($3, current_stage_fb_id)
          WHERE firebase_id = $1
        `;
        updateParams = [responseId, newStatus || null, currentStageId || null];
        stageNameSnap = currentStageId || 'Transição';
        break;

      default:
        await client.query('ROLLBACK');
        return NextResponse.json(
          { success: false, error: `Ação desconhecida: ${action}` },
          { status: 400 }
        );
    }

    await client.query(updateSql, updateParams);

    // Histórico
    await client.query(`
      INSERT INTO fact_workflow_history (
        response_key, form_key, stage_name_snap, action_type,
        performed_by_name, comment, entered_at, completed_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), NOW())
    `, [responseKey, formKey, stageNameSnap, actionType,
        performedByUsername || performedBy || 'sistema', comment || null]);

    await client.query('COMMIT');

    // ─── Audit log estruturado (compliance SOC2/LGPD) ────────────────────────
    const expectedPermission = ACTION_PERMISSION_MAP[action] || 'workflow.unknown';
    await auditLog({
      eventType: AuditEventType.WORKFLOW_ACTION,
      severity: action === 'cancel' || action === 'reject' ? 'warn' : 'info',
      actor: {
        id: performedBy || 'unknown',
        username: performedByUsername || 'unknown',
      },
      target: {
        type: 'response',
        id: responseId,
      },
      payload: {
        action,
        expectedPermission,
        previousStageId: prevStageId,
        currentStageId,
        ...(rejectionReason && { rejectionReason }),
        ...(motorista && { motorista }),
        ...(placa && { placa }),
        ...(boletim && { boletim }),
        ...(motivoCancelamento && { motivoCancelamento }),
        ...(comment && { comment }),
      },
      success: true,
      request,
    });

    // ── Despacha notificações via Cloud Function (fire-and-forget) ────────────
    // Configura BRAVOFORM_CF_NOTIFY_URL e BRAVOFLOW_CF_SECRET no .env.local:
    //   BRAVOFORM_CF_NOTIFY_URL=https://us-central1-PROJETO.cloudfunctions.net/bravoflowNotify
    //   BRAVOFLOW_CF_SECRET=mesmo-valor-de-BRAVOFLOW_NOTIFY_SECRET-nas-functions
    //
    // Busca dados extras (formTitle, solicitante) para enriquecer a notificação
    const cfNotifyUrl = process.env.BRAVOFORM_CF_NOTIFY_URL;
    if (cfNotifyUrl) {
      // Busca dados de exibição (best-effort, não bloqueia a resposta)
      client.query(`
        SELECT
          COALESCE(fr.form_title, df.title, '') AS form_title,
          fr.collaborator_username              AS solicitante_username,
          dcol.firebase_id                      AS solicitante_id,
          dc.firebase_id                        AS company_id,
          fr.setor_entrega,
          fr.endereco_entrega,
          fr.motorista,
          fr.placa,
          fr.boletim,
          fr.rejection_reason,
          fr.protocolo_cancelamento,
          fr.motivo_cancelamento
        FROM fact_form_response fr
        LEFT JOIN dim_forms         df   ON df.form_key        = fr.form_key
        LEFT JOIN dim_companies     dc   ON dc.company_key     = fr.company_key
        LEFT JOIN dim_collaborators dcol ON dcol.collaborator_key = fr.collaborator_key
        WHERE fr.firebase_id = $1
      `, [responseId]).then((r) => {
        const row = r.rows[0] || {};
        const payload = {
          action,
          responseId,
          formTitle:             row.form_title,
          companyId:             row.company_id,
          solicitanteId:         row.solicitante_id,
          solicitanteUsername:   row.solicitante_username,
          performedByUsername:   performedByUsername || performedBy,
          // Campos específicos por ação (do body original)
          motorista:             motorista || row.motorista,
          placa:                 placa || row.placa,
          boletim:               boletim || row.boletim,
          rejectionReason:       rejectionReason || row.rejection_reason,
          protocoloCancelamento: protocoloCancelamento || row.protocolo_cancelamento,
          motivoCancelamento:    motivoCancelamento || row.motivo_cancelamento,
          setorEntrega:          setorEntrega || row.setor_entrega,
          enderecoEntrega:       enderecoEntrega || row.endereco_entrega,
          diasEntrega,
          newStatus,
          comment,
        };
        return fetch(cfNotifyUrl, {
          method:  'POST',
          headers: {
            'Content-Type':          'application/json',
            'x-bravoflow-secret':    process.env.BRAVOFLOW_CF_SECRET || '',
          },
          body: JSON.stringify(payload),
        });
      }).catch((e) => {
        logger.warn('workflow-action: notificação CF falhou', { error: (e as Error).message });
      });
    }

    return NextResponse.json({
      success: true,
      data: { responseId, action, previousStageId: prevStageId },
    });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('workflow-action error', error, { responseId, action });

    // Audit log de falha (severity warn)
    await auditLog({
      eventType: AuditEventType.WORKFLOW_ACTION,
      severity: 'warn',
      actor: { id: performedBy || 'unknown', username: performedByUsername || 'unknown' },
      target: { type: 'response', id: responseId },
      payload: { action },
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
