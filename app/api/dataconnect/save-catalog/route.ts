import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';

export async function POST(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    const body = await request.json();
    const { catalogId, name, description, companyId, displayField, 
            searchFields, valueField, fields, additionalFields } = body;

    await client.query('BEGIN');

    // UPSERT catálogo
    await client.query(`
      INSERT INTO product_catalogs (
        id, name, description, company_id, display_field, search_fields,
        value_field, fields, additional_fields, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        display_field = EXCLUDED.display_field,
        search_fields = EXCLUDED.search_fields,
        value_field = EXCLUDED.value_field,
        fields = EXCLUDED.fields,
        additional_fields = EXCLUDED.additional_fields,
        updated_at = NOW()
    `, [catalogId, name, description || '', companyId || '', displayField || 'name',
        JSON.stringify(searchFields || []), valueField || 'id', 
        JSON.stringify(fields || []), JSON.stringify(additionalFields || [])]);

    await client.query('COMMIT');

    console.log(`✅ PostgreSQL: catálogo ${catalogId} salvo`);

    return NextResponse.json({
      success: true,
      data: { catalog_id: catalogId }
    });

  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Erro ao salvar catálogo no PostgreSQL:', error.message);
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
    const catalogId = searchParams.get('id');

    if (!catalogId) {
      return NextResponse.json(
        { success: false, error: 'Catalog ID required' },
        { status: 400 }
      );
    }

    await client.query('BEGIN');
    
    // Deletar produtos do catálogo primeiro (FK constraint)
    await client.query('DELETE FROM products WHERE catalog_id = $1', [catalogId]);
    
    // Deletar catálogo
    await client.query('DELETE FROM product_catalogs WHERE id = $1', [catalogId]);
    
    await client.query('COMMIT');

    console.log(`✅ PostgreSQL: catálogo ${catalogId} e produtos deletados`);

    return NextResponse.json({ success: true });

  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Erro ao deletar catálogo:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
