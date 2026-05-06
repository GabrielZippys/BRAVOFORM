import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';

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
  const pool = getPool();
  const client = await pool.connect();

  try {
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

    return NextResponse.json({
      success: true,
      data: { responseId, action, previousStageId: prevStageId },
    });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ workflow-action error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
