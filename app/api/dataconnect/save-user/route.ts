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
    const { userId, name, email, role, companyId, departmentId } = body;

    await client.query(`
      INSERT INTO users (id, name, email, role, company_id, department_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        company_id = EXCLUDED.company_id,
        department_id = EXCLUDED.department_id
    `, [userId, name, email, role || 'Admin', companyId || null, departmentId || null]);

    console.log(`✅ PostgreSQL: usuário ${userId} salvo`);
    return NextResponse.json({ success: true, data: { user_id: userId } });

  } catch (error: any) {
    console.error('❌ Erro ao salvar usuário:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(request: NextRequest) {
  const client = await pool.connect();
  
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('id');

    if (!userId) {
      return NextResponse.json({ success: false, error: 'User ID required' }, { status: 400 });
    }

    await client.query('DELETE FROM users WHERE id = $1', [userId]);
    console.log(`✅ PostgreSQL: usuário ${userId} deletado`);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('❌ Erro ao deletar usuário:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}
