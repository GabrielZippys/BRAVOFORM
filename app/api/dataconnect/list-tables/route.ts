import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';

// Human-readable labels for star-schema columns
const COLUMN_LABELS: Record<string, string> = {
  response_key: 'ID Resposta', form_key: 'Formulário', company_key: 'Empresa',
  department_key: 'Departamento', collaborator_key: 'Colaborador', catalog_key: 'Catálogo',
  product_key: 'Produto', table_answer_key: 'ID', answer_key: 'ID', order_item_key: 'ID',
  checkbox_answer_key: 'ID', attachment_key: 'ID', workflow_history_key: 'ID',
  stage_key: 'ID Etapa', user_key: 'ID Usuário',
  firebase_id: 'Firebase ID', form_fb_id: 'Form Firebase ID',
  field_id: 'ID Campo', field_label: 'Campo', field_type: 'Tipo Campo',
  input_type: 'Tipo Input', answer_text: 'Resposta', answer_number: 'Valor Numérico',
  answer_date: 'Data Resposta', answer_boolean: 'Sim/Não',
  form_title: 'Título Formulário', department_name: 'Departamento',
  collaborator_username: 'Colaborador', status: 'Status',
  submitted_at: 'Enviado em', created_at: 'Criado em', updated_at: 'Atualizado em',
  deleted_at: 'Excluído em', deleted_by: 'Excluído por',
  product_fb_id: 'Produto Firebase ID', product_name_snap: 'Produto',
  product_code_snap: 'Código Produto', price_snap: 'Preço', quantity: 'Quantidade',
  unit: 'Unidade', subtotal: 'Subtotal', item_index: 'Índice',
  option_value: 'Opção', option_index: 'Índice Opção',
  table_data: 'Dados Tabela', row_count: 'Qtd Linhas', extra_data: 'Dados Extra',
  file_url: 'URL Arquivo', file_name: 'Nome Arquivo', file_type: 'Tipo Arquivo',
  name: 'Nome', description: 'Descrição', uid: 'UID', username: 'Usuário',
  email: 'E-mail', role: 'Perfil', active: 'Ativo', phone: 'Telefone',
  codigo: 'Código', ean: 'EAN', unidade: 'Unidade', preco_atual: 'Preço Atual',
  estoque: 'Estoque', quantidade_max: 'Qtd Máx', quantidade_min: 'Qtd Mín',
  is_active: 'Ativo', fields_json: 'Campos JSON', display_field: 'Campo Exibição',
  search_fields: 'Campos Busca', value_field: 'Campo Valor',
  workflow_fb_id: 'Workflow Firebase ID', workflow_name: 'Workflow',
  stage_name: 'Etapa', stage_type: 'Tipo Etapa', stage_order: 'Ordem',
  is_final_stage: 'Etapa Final', current_stage_fb_id: 'Etapa Atual',
  permissions_json: 'Permissões', can_view_history: 'Ver Histórico',
  can_edit_history: 'Editar Histórico', is_temporary_password: 'Senha Temporária',
};

// Primary key column per table
const PK_MAP: Record<string, string> = {
  dim_companies: 'company_key', dim_departments: 'department_key',
  dim_users: 'user_key', dim_collaborators: 'collaborator_key',
  dim_forms: 'form_key', dim_product_catalogs: 'catalog_key',
  dim_products: 'product_key', dim_workflow_stages: 'stage_key',
  fact_form_response: 'response_key', fact_answers: 'answer_key',
  fact_order_items: 'order_item_key', fact_checkbox_answers: 'checkbox_answer_key',
  fact_table_answers: 'table_answer_key', fact_attachments: 'attachment_key',
  fact_workflow_history: 'workflow_history_key',
};

// Columns to hide from default view (internal keys, large JSON)
const HIDDEN_COLS: string[] = [
  'fields_json', 'permissions_json', 'search_fields', 'extra_data',
];

export async function GET(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    const { searchParams } = new URL(request.url);
    const tableName = searchParams.get('table');

    // Se table especificada, retorna documentos + metadados
    if (tableName) {
      const pkCol = PK_MAP[tableName] || 'id';
      
      // Get column info
      const colsResult = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = $1 AND table_schema = 'public'
        ORDER BY ordinal_position
      `, [tableName]);

      const columns = colsResult.rows.map((c: any) => ({
        name: c.column_name,
        label: COLUMN_LABELS[c.column_name] || c.column_name.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
        type: c.data_type,
        hidden: HIDDEN_COLS.includes(c.column_name),
      }));

      let query = `SELECT * FROM ${tableName}`;
      // Try ordering by created_at, fallback to PK
      const hasCreatedAt = columns.some((c: any) => c.name === 'created_at');
      if (hasCreatedAt) {
        query += ` ORDER BY created_at DESC NULLS LAST`;
      } else {
        query += ` ORDER BY ${pkCol} DESC`;
      }
      query += ` LIMIT 1000`;

      const result = await client.query(query);
      
      return NextResponse.json({
        success: true,
        data: result.rows,
        count: result.rowCount || 0,
        meta: { pkColumn: pkCol, columns, tableName },
      });
    }

    // Senão, retorna lista de tabelas com estatísticas
    const tablesResult = await client.query(`
      SELECT 
        table_name,
        (SELECT COUNT(*) FROM information_schema.columns 
         WHERE table_name = t.table_name AND table_schema = 'public') as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const tables = await Promise.all(
      tablesResult.rows.map(async (table) => {
        const countResult = await client.query(`SELECT COUNT(*) FROM ${table.table_name}`);
        const count = parseInt(countResult.rows[0].count);
        
        return {
          name: table.table_name,
          documentCount: count,
          estimatedSize: count * 1024,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: tables.filter(t => t.documentCount > 0),
    });

  } catch (error: any) {
    console.error('❌ Erro ao listar tabelas PostgreSQL:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export async function DELETE(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    const { searchParams } = new URL(request.url);
    const tableName = searchParams.get('table');
    const id = searchParams.get('id');

    if (!tableName || !id) {
      return NextResponse.json(
        { success: false, error: 'Table name and ID required' },
        { status: 400 }
      );
    }

    // Detect PK column
    const pk = PK_MAP[tableName] || 'id';
    await client.query(`DELETE FROM ${tableName} WHERE ${pk} = $1`, [id]);

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('❌ Erro ao deletar registro:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export async function PATCH(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    const body = await request.json();
    const { tableName, id, field, value } = body;

    if (!tableName || !id || !field) {
      return NextResponse.json(
        { success: false, error: 'Table name, ID, and field required' },
        { status: 400 }
      );
    }

    // Detect PK column
    const pk = PK_MAP[tableName] || 'id';
    // Only set updated_at if column exists
    try {
      await client.query(
        `UPDATE ${tableName} SET ${field} = $1, updated_at = NOW() WHERE ${pk} = $2`,
        [value, id]
      );
    } catch (_e) {
      await client.query(
        `UPDATE ${tableName} SET ${field} = $1 WHERE ${pk} = $2`,
        [value, id]
      );
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('❌ Erro ao atualizar registro:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
