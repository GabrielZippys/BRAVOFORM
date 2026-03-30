import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';

export async function POST(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    const body = await request.json();
    const { catalogId, name, description, companyId, displayField, 
            searchFields, valueField } = body;

    await client.query('BEGIN');

    // Resolver company_key
    const companyRes = await client.query(
      'SELECT company_key FROM dim_companies WHERE firebase_id = $1', [companyId]
    );
    const companyKey = companyRes.rows[0]?.company_key || null;

    // UPSERT catálogo
    await client.query(`
      INSERT INTO dim_product_catalogs (
        firebase_id, name, description, company_key, display_field,
        search_fields, value_field, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      ON CONFLICT (firebase_id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        company_key = EXCLUDED.company_key,
        display_field = EXCLUDED.display_field,
        search_fields = EXCLUDED.search_fields,
        value_field = EXCLUDED.value_field,
        updated_at = NOW()
    `, [catalogId, name, description || '', companyKey, displayField || 'name',
        JSON.stringify(searchFields || []), valueField || 'id']);

    await client.query('COMMIT');

    console.log(`✅ PostgreSQL: catálogo ${catalogId} salvo (dim_product_catalogs)`);

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
    
    // Resolver catalog_key para deletar produtos associados
    const catRes = await client.query(
      'SELECT catalog_key FROM dim_product_catalogs WHERE firebase_id = $1', [catalogId]
    );
    const catalogKey = catRes.rows[0]?.catalog_key;
    
    if (catalogKey) {
      await client.query('DELETE FROM dim_products WHERE catalog_key = $1', [catalogKey]);
    }
    
    await client.query('DELETE FROM dim_product_catalogs WHERE firebase_id = $1', [catalogId]);
    
    await client.query('COMMIT');

    console.log(`✅ PostgreSQL: catálogo ${catalogId} e produtos deletados (dim_product_catalogs)`);

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
