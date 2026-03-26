import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '../../../../src/lib/db/postgresql';

export async function GET(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    const result = await client.query(`
      SELECT response_id, form_id, collaborator_id, collaborator_username, status, submitted_at 
      FROM form_response 
      ORDER BY submitted_at DESC 
      LIMIT 10
    `);

    return NextResponse.json({
      success: true,
      data: result.rows
    });

  } catch (error: any) {
    console.error('Erro ao buscar respostas:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
