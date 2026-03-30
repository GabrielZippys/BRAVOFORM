import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';

export async function POST(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const { id, deleted_by, deleted_by_username } = await request.json();

    // Soft-delete: marca deleted_at na fact_form_response
    const result = await client.query(`
      UPDATE fact_form_response
      SET deleted_at = NOW()
      WHERE firebase_id = $1
      RETURNING response_key
    `, [id]);

    const responseKey = result.rows[0]?.response_key;

    console.log(`✅ PostgreSQL: resposta ${id} marcada como deletada (response_key=${responseKey})`);

    return NextResponse.json({
      success: true,
      message: 'Resposta marcada como deletada no PostgreSQL',
      data: { id, response_key: responseKey }
    });

  } catch (error: any) {
    console.error('❌ Erro ao deletar resposta:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
