import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';

export async function POST(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const { id, status, current_stage_id, assigned_to } = await request.json();

    const result = await client.query(`
      UPDATE fact_form_response
      SET status = $2,
          current_stage_fb_id = $3
      WHERE firebase_id = $1
      RETURNING response_key
    `, [id, status, current_stage_id || null]);

    const responseKey = result.rows[0]?.response_key;

    console.log(`✅ PostgreSQL: status da resposta ${id} atualizado para '${status}' (response_key=${responseKey})`);

    return NextResponse.json({
      success: true,
      message: 'Status atualizado no PostgreSQL',
      data: { id, status, response_key: responseKey }
    });

  } catch (error: any) {
    console.error('❌ Erro ao atualizar status:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
