import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';

export async function POST(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    const body = await request.json();
    const { formId, title, description, companyId, departmentId, 
            departmentName, isActive, fieldsJson } = body;

    await client.query(`
      INSERT INTO forms (
        id, title, description, company_id, department_id, department_name,
        is_active, created_at, updated_at, fields_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), $8)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        department_name = EXCLUDED.department_name,
        is_active = EXCLUDED.is_active,
        fields_json = EXCLUDED.fields_json,
        updated_at = NOW()
    `, [formId, title, description || '', companyId, departmentId, 
        departmentName || '', isActive ? 1 : 0, fieldsJson]);

    console.log(`✅ PostgreSQL: formulário ${formId} salvo`);

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

    await client.query('DELETE FROM forms WHERE id = $1', [formId]);
    console.log(`✅ PostgreSQL: formulário ${formId} deletado`);

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('❌ Erro ao deletar formulário:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}
