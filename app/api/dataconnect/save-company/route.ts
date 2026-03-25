import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.PG_HOST || '34.39.165.146',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'formbravo-8854e-database',
  user: process.env.PG_USER || 'ipanema',
  password: process.env.PG_PASSWORD || 'Br@v0x00',
  ssl: false,
  max: 5,
  idleTimeoutMillis: 30000,
});

export async function POST(request: NextRequest) {
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
