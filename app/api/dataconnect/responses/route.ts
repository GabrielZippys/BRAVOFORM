import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';

/**
 * GET  /api/dataconnect/responses
 *   ?trash=true          → itens na lixeira (deleted_at IS NOT NULL)
 *   ?id=xxx              → resposta específica por firebase_id
 *   ?formId=xxx
 *   ?companyId=xxx
 *   ?departmentId=xxx
 *   ?status=xxx
 *   ?userId=xxx          → collaborator firebase_id
 *   ?search=xxx          → busca em formTitle / collaboratorUsername
 *   ?limit=N (default 1000)
 *
 * PATCH /api/dataconnect/responses  { id, status?, deletedAt?, restore? }
 * DELETE /api/dataconnect/responses?id=xxx  → exclusão permanente
 */

export async function GET(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const { searchParams } = new URL(request.url);
    const trash       = searchParams.get('trash') === 'true';
    const id          = searchParams.get('id');
    const formId      = searchParams.get('formId');
    const companyId   = searchParams.get('companyId');
    const deptId      = searchParams.get('departmentId');
    const status      = searchParams.get('status');
    const userId      = searchParams.get('userId');
    const search      = searchParams.get('search');
    const lim         = parseInt(searchParams.get('limit') || '1000', 10);

    // Ensure deleted_at column exists
    await client.query(`
      ALTER TABLE fact_form_response
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255),
        ADD COLUMN IF NOT EXISTS deleted_by_username VARCHAR(255)
    `);

    if (id) {
      const r = await client.query(`
        SELECT
          fr.firebase_id            AS id,
          fr.response_key,
          fr.form_key,
          df.firebase_id            AS "formId",
          COALESCE(fr.form_title, df.title, '') AS "formTitle",
          fr.collaborator_username  AS "collaboratorUsername",
          dc.firebase_id            AS "companyId",
          dc.name                   AS "companyName",
          dd.firebase_id            AS "departmentId",
          COALESCE(dd.name, fr.department_name, '') AS "departmentName",
          dcol.firebase_id          AS "collaboratorId",
          fr.status,
          fr.submitted_at           AS "submittedAt",
          fr.created_at             AS "createdAt",
          fr.deleted_at             AS "deletedAt",
          fr.deleted_by             AS "deletedBy",
          fr.deleted_by_username    AS "deletedByUsername"
        FROM fact_form_response fr
        LEFT JOIN dim_forms         df   ON df.form_key         = fr.form_key
        LEFT JOIN dim_companies     dc   ON dc.company_key      = fr.company_key
        LEFT JOIN dim_departments   dd   ON dd.department_key   = fr.department_key
        LEFT JOIN dim_collaborators dcol ON dcol.collaborator_key = fr.collaborator_key
        WHERE fr.firebase_id = $1
      `, [id]);

      if (!r.rows[0]) return NextResponse.json({ success: true, data: null });

      const row = r.rows[0];
      const rk  = row.response_key;

      // Buscar respostas simples
      const answersRes = await client.query(
        `SELECT field_id, answer_text FROM fact_answers WHERE response_key = $1`, [rk]
      );
      // Buscar itens de pedido (Grade de Pedidos)
      const orderRes = await client.query(
        `SELECT field_id, field_label, item_index, product_name_snap AS product_name,
                quantity, unit, price_snap AS unit_price, subtotal AS total_price, extra_data
         FROM fact_order_items WHERE response_key = $1 ORDER BY item_index`, [rk]
      );
      // Buscar checkboxes
      const checkRes = await client.query(
        `SELECT field_id, option_value FROM fact_checkbox_answers WHERE response_key = $1`, [rk]
      );
      // Buscar tabelas
      const tableRes = await client.query(
        `SELECT field_id, row_id, column_id, cell_value FROM fact_table_answers WHERE response_key = $1`, [rk]
      );
      // Buscar anexos
      const attachRes = await client.query(
        `SELECT field_id, file_url, file_name FROM fact_attachments WHERE response_key = $1`, [rk]
      );

      // Montar objeto answers { fieldId: value }
      const answers: Record<string, any> = {};

      answersRes.rows.forEach((a: any) => { answers[a.field_id] = a.answer_text; });

      // Checkboxes: agrupar por field_id como array
      checkRes.rows.forEach((c: any) => {
        if (!answers[c.field_id]) answers[c.field_id] = [];
        if (Array.isArray(answers[c.field_id])) answers[c.field_id].push(c.option_value);
      });

      // Tabelas: { fieldId: { rowId: { colId: cellValue } } } — formato esperado pelo modal
      tableRes.rows.forEach((t: any) => {
        if (!answers[t.field_id]) answers[t.field_id] = {};
        if (!answers[t.field_id][t.row_id]) answers[t.field_id][t.row_id] = {};
        answers[t.field_id][t.row_id][t.column_id] = t.cell_value;
      });

      // Grade de Pedidos: agrupar por field_id como array de itens
      const orderMap: Record<string, any[]> = {};
      orderRes.rows.forEach((o: any) => {
        if (!orderMap[o.field_id]) orderMap[o.field_id] = [];
        // extra_data contém o item completo (incluindo unidade original)
        // mas garantimos que unit/unidade apareçam explicitamente no topo
        const extraData = o.extra_data || {};
        orderMap[o.field_id].push({
          ...extraData,           // nome, codigo, productId, unidade, quantidade originais
          productName: o.product_name,
          quantity: o.quantity,
          unit: o.unit || extraData.unidade || '',    // unidade explícita
          unidade: o.unit || extraData.unidade || '', // compatibilidade PT
          unitPrice: o.unit_price,
          totalPrice: o.total_price,
        });
      });
      Object.assign(answers, orderMap);

      // Anexos: agrupar por field_id como array de URLs
      attachRes.rows.forEach((a: any) => {
        if (!answers[a.field_id]) answers[a.field_id] = [];
        if (Array.isArray(answers[a.field_id])) answers[a.field_id].push(a.file_url);
        else answers[a.field_id] = [a.file_url];
      });

      return NextResponse.json({ success: true, data: { ...row, answers } });
    }

    const conditions: string[] = [];
    const params: any[] = [];
    let p = 1;

    if (trash) {
      conditions.push('fr.deleted_at IS NOT NULL');
    } else {
      conditions.push('fr.deleted_at IS NULL');
    }

    if (formId) {
      conditions.push(`df.firebase_id = $${p++}`);
      params.push(formId);
    }
    if (companyId) {
      conditions.push(`dc.firebase_id = $${p++}`);
      params.push(companyId);
    }
    if (deptId) {
      conditions.push(`dd.firebase_id = $${p++}`);
      params.push(deptId);
    }
    if (status && status !== 'all') {
      conditions.push(`fr.status = $${p++}`);
      params.push(status);
    }
    if (userId) {
      conditions.push(`dcol.firebase_id = $${p++}`);
      params.push(userId);
    }
    if (search) {
      conditions.push(`(fr.form_title ILIKE $${p} OR fr.collaborator_username ILIKE $${p})`);
      params.push(`%${search}%`);
      p++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await client.query(`
      SELECT
        fr.firebase_id            AS id,
        df.firebase_id            AS "formId",
        COALESCE(fr.form_title, df.title, '') AS "formTitle",
        fr.collaborator_username  AS "collaboratorUsername",
        dc.firebase_id            AS "companyId",
        COALESCE(dc.name, '')     AS "companyName",
        dd.firebase_id            AS "departmentId",
        COALESCE(dd.name, fr.department_name, '')     AS "departmentName",
        dcol.firebase_id          AS "collaboratorId",
        fr.status,
        fr.submitted_at           AS "submittedAt",
        fr.created_at             AS "createdAt",
        fr.deleted_at             AS "deletedAt",
        fr.deleted_by             AS "deletedBy",
        fr.deleted_by_username    AS "deletedByUsername"
      FROM fact_form_response fr
      LEFT JOIN dim_forms         df   ON df.form_key         = fr.form_key
      LEFT JOIN dim_companies     dc   ON dc.company_key      = fr.company_key
      LEFT JOIN dim_departments   dd   ON dd.department_key   = fr.department_key
      LEFT JOIN dim_collaborators dcol ON dcol.collaborator_key = fr.collaborator_key
      ${where}
      ORDER BY COALESCE(fr.submitted_at, fr.created_at) DESC
      LIMIT ${lim}
    `, params);

    return NextResponse.json({ success: true, data: result.rows, total: result.rowCount });
  } catch (error: any) {
    console.error('❌ Erro ao listar respostas:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PATCH(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const body = await request.json();
    const { id, restore, deletedBy, deletedByUsername, deletedAt } = body;

    if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });

    if (restore) {
      await client.query(
        'UPDATE fact_form_response SET deleted_at=NULL, deleted_by=NULL, deleted_by_username=NULL WHERE firebase_id=$1',
        [id]
      );
    } else {
      // soft-delete — aceita data customizada (para migração) ou usa NOW()
      const ts = deletedAt ? new Date(deletedAt) : new Date();
      await client.query(
        'UPDATE fact_form_response SET deleted_at=$2, deleted_by=$3, deleted_by_username=$4 WHERE firebase_id=$1',
        [id, ts, deletedBy || 'admin', deletedByUsername || 'Administrador']
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ Erro ao atualizar resposta:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });

    await client.query('BEGIN');
    // Buscar response_key
    const r = await client.query('SELECT response_key FROM fact_form_response WHERE firebase_id=$1', [id]);
    const rk = r.rows[0]?.response_key;
    if (rk) {
      await client.query('DELETE FROM fact_answers          WHERE response_key=$1', [rk]);
      await client.query('DELETE FROM fact_order_items      WHERE response_key=$1', [rk]);
      await client.query('DELETE FROM fact_checkbox_answers WHERE response_key=$1', [rk]);
      await client.query('DELETE FROM fact_table_answers    WHERE response_key=$1', [rk]);
      await client.query('DELETE FROM fact_attachments      WHERE response_key=$1', [rk]);
      await client.query('DELETE FROM fact_form_response    WHERE response_key=$1', [rk]);
    }
    await client.query('COMMIT');
    return NextResponse.json({ success: true });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Erro ao deletar resposta:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}
