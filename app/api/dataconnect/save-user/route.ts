import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';

export async function POST(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    const body = await request.json();
    const { userId, name, email, role, companyId, departmentId } = body;

    // Resolver surrogate keys
    const companyRes = await client.query(
      'SELECT company_key FROM dim_companies WHERE firebase_id = $1', [companyId]
    );
    const companyKey = companyRes.rows[0]?.company_key || null;

    const deptRes = await client.query(
      'SELECT department_key FROM dim_departments WHERE firebase_id = $1', [departmentId]
    );
    const deptKey = deptRes.rows[0]?.department_key || null;

    await client.query(`
      INSERT INTO dim_users (firebase_id, name, email, role, company_key, department_key, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (firebase_id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        company_key = EXCLUDED.company_key,
        department_key = EXCLUDED.department_key
    `, [userId, name, email, role || 'Admin', companyKey, deptKey]);

    console.log(`✅ PostgreSQL: usuário ${userId} salvo (dim_users)`);
    return NextResponse.json({ success: true, data: { user_id: userId } });

  } catch (error: any) {
    console.error('❌ Erro ao salvar usuário:', error.message);
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
    const userId = searchParams.get('id');

    if (!userId) {
      return NextResponse.json({ success: false, error: 'User ID required' }, { status: 400 });
    }

    await client.query('DELETE FROM dim_users WHERE firebase_id = $1', [userId]);
    console.log(`✅ PostgreSQL: usuário ${userId} deletado (dim_users)`);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('❌ Erro ao deletar usuário:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}
