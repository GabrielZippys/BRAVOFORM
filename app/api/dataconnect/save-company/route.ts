import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';

export async function POST(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    const body = await request.json();
    const { companyId, name } = body;

    await client.query(`
      INSERT INTO companies (id, name, created_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
    `, [companyId, name]);

    console.log(`✅ PostgreSQL: empresa ${companyId} salva`);
    return NextResponse.json({ success: true, data: { company_id: companyId } });

  } catch (error: any) {
    console.error('❌ Erro ao salvar empresa:', error.message);
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
    const companyId = searchParams.get('id');

    if (!companyId) {
      return NextResponse.json({ success: false, error: 'Company ID required' }, { status: 400 });
    }

    await client.query('DELETE FROM companies WHERE id = $1', [companyId]);
    console.log(`✅ PostgreSQL: empresa ${companyId} deletada`);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('❌ Erro ao deletar empresa:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}
