import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';

export async function POST(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    const body = await request.json();
    const { departmentId, name, companyId } = body;

    // Resolver company_key a partir do firebase_id
    const companyRes = await client.query(
      'SELECT company_key FROM dim_companies WHERE firebase_id = $1', [companyId]
    );
    const companyKey = companyRes.rows[0]?.company_key || null;

    await client.query(`
      INSERT INTO dim_departments (firebase_id, company_key, name, created_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (firebase_id) DO UPDATE SET 
        name = EXCLUDED.name,
        company_key = EXCLUDED.company_key
    `, [departmentId, companyKey, name]);

    console.log(`✅ PostgreSQL: departamento ${departmentId} salvo (dim_departments)`);
    return NextResponse.json({ success: true, data: { department_id: departmentId } });

  } catch (error: any) {
    console.error('❌ Erro ao salvar departamento:', error.message);
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
    const departmentId = searchParams.get('id');

    if (!departmentId) {
      return NextResponse.json({ success: false, error: 'Department ID required' }, { status: 400 });
    }

    await client.query('DELETE FROM dim_departments WHERE firebase_id = $1', [departmentId]);
    console.log(`✅ PostgreSQL: departamento ${departmentId} deletado (dim_departments)`);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('❌ Erro ao deletar departamento:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}
