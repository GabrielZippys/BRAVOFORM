import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';

export async function POST(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    const body = await request.json();
    const { formId, title, description, companyId, departmentId, 
            departmentName, isActive, fieldsJson } = body;

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
      INSERT INTO dim_forms (
        firebase_id, title, description, company_key, department_key, department_name,
        is_active, created_at, updated_at, fields_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), $8::jsonb)
      ON CONFLICT (firebase_id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        company_key = EXCLUDED.company_key,
        department_key = EXCLUDED.department_key,
        department_name = EXCLUDED.department_name,
        is_active = EXCLUDED.is_active,
        fields_json = EXCLUDED.fields_json,
        updated_at = NOW()
    `, [formId, title, description || '', companyKey, deptKey, 
        departmentName || '', isActive !== false, fieldsJson || null]);

    console.log(`✅ PostgreSQL: formulário ${formId} salvo (dim_forms)`);

    return NextResponse.json({ success: true, data: { form_id: formId } });

  } catch (error: any) {
    console.error('❌ Erro ao salvar formulário:', error.message);
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
    const formId = searchParams.get('id');

    if (!formId) {
      return NextResponse.json({ success: false, error: 'Form ID required' }, { status: 400 });
    }

    await client.query('DELETE FROM dim_forms WHERE firebase_id = $1', [formId]);
    console.log(`✅ PostgreSQL: formulário ${formId} deletado (dim_forms)`);

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('❌ Erro ao deletar formulário:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}
