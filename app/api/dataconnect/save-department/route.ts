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
    const { departmentId, name, companyId } = body;

    await client.query(`
      INSERT INTO departments (id, name, company_id, created_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (id) DO UPDATE SET 
        name = EXCLUDED.name,
        company_id = EXCLUDED.company_id
    `, [departmentId, name, companyId]);

    console.log(`✅ PostgreSQL: departamento ${departmentId} salvo`);
    return NextResponse.json({ success: true, data: { department_id: departmentId } });

  } catch (error: any) {
    console.error('❌ Erro ao salvar departamento:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(request: NextRequest) {
  const client = await pool.connect();
  
  try {
    const { searchParams } = new URL(request.url);
    const departmentId = searchParams.get('id');

    if (!departmentId) {
      return NextResponse.json({ success: false, error: 'Department ID required' }, { status: 400 });
    }

    await client.query('DELETE FROM departments WHERE id = $1', [departmentId]);
    console.log(`✅ PostgreSQL: departamento ${departmentId} deletado`);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('❌ Erro ao deletar departamento:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}
