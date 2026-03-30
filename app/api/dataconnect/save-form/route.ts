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

    await client.query('BEGIN');

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

    // Sincroniza dim_form_fields para que novas respostas já linkem corretamente
    const formKeyRes = await client.query(
      'SELECT form_key FROM dim_forms WHERE firebase_id = $1', [formId]
    );
    const formKey = formKeyRes.rows[0]?.form_key;

    if (formKey && Array.isArray(fieldsJson)) {
      const TYPE_TO_INPUT: Record<string, string> = {
        'Tabela':           'table',
        'Grade de Pedidos': 'order',
        'Caixa de Seleção': 'checkbox',
        'Data':             'date',
        'Assinatura':       'signature',
        'Anexo':            'attachment',
        'Cabeçalho':        'header',
        'Múltipla Escolha': 'radio',
      };

      for (let i = 0; i < fieldsJson.length; i++) {
        const f = fieldsJson[i] as any;
        if (!f?.id || f.type === 'Cabeçalho') continue;

        const inputType = f.inputType || TYPE_TO_INPUT[f.type] || 'text';
        const tableRows = (f.type === 'Tabela' || f.type === 'Grade de Pedidos') && Array.isArray(f.rows)
          ? JSON.stringify(f.rows) : null;
        const tableCols = (f.type === 'Tabela' || f.type === 'Grade de Pedidos') && Array.isArray(f.columns)
          ? JSON.stringify(f.columns) : null;
        const options = (f.type === 'Múltipla Escolha' || f.type === 'Caixa de Seleção') && Array.isArray(f.options)
          ? JSON.stringify(f.options) : null;

        await client.query(`
          INSERT INTO dim_form_fields (
            form_key, form_fb_id,
            field_id, field_label, field_type, input_type,
            field_order, is_required,
            table_rows_json, table_columns_json, options_json
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb)
          ON CONFLICT (form_key, field_id) DO UPDATE SET
            field_label        = EXCLUDED.field_label,
            field_type         = EXCLUDED.field_type,
            input_type         = EXCLUDED.input_type,
            field_order        = EXCLUDED.field_order,
            is_required        = EXCLUDED.is_required,
            table_rows_json    = EXCLUDED.table_rows_json,
            table_columns_json = EXCLUDED.table_columns_json,
            options_json       = EXCLUDED.options_json
        `, [formKey, formId,
            String(f.id), f.label || '', f.type || '', inputType,
            i, !!f.required,
            tableRows, tableCols, options]);
      }
    }

    await client.query('COMMIT');

    console.log(`✅ PostgreSQL: formulário ${formId} salvo (dim_forms + dim_form_fields)`);

    return NextResponse.json({ success: true, data: { form_id: formId } });

  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
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
