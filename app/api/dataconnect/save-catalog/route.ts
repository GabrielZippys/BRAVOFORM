import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';

// GET - Listar catálogos por empresa + produtos de um catálogo
export async function GET(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const { searchParams } = new URL(request.url);
    const companyId  = searchParams.get('companyId');
    const catalogId  = searchParams.get('catalogId'); // lista produtos deste catálogo

    // Listar produtos de um catálogo específico
    if (catalogId) {
      const res = await client.query(`
        SELECT
          p.firebase_id  AS id,
          p.name         AS nome,
          p.codigo,
          p.unidade,
          p.quantidade_min AS "quantidadeMin",
          p.quantidade_max AS "quantidadeMax",
          p.preco_atual    AS preco,
          p.estoque
        FROM dim_products p
        JOIN dim_product_catalogs c ON p.catalog_key = c.catalog_key
        WHERE c.firebase_id = $1
        ORDER BY p.name ASC
      `, [catalogId]);
      return NextResponse.json({ success: true, data: res.rows });
    }

    // Listar catálogos da empresa
    if (!companyId) {
      return NextResponse.json({ success: false, error: 'companyId ou catalogId obrigatório' }, { status: 400 });
    }

    const res = await client.query(`
      SELECT
        c.firebase_id  AS id,
        c.name,
        c.description,
        c.display_field  AS "displayField",
        c.value_field    AS "valueField",
        c.search_fields  AS "searchFields",
        c.created_at     AS "createdAt",
        c.updated_at     AS "updatedAt",
        co.firebase_id   AS "companyId",
        COUNT(p.product_key) AS product_count
      FROM dim_product_catalogs c
      LEFT JOIN dim_companies co ON co.company_key = c.company_key
      LEFT JOIN dim_products   p  ON p.catalog_key  = c.catalog_key
      WHERE co.firebase_id = $1
      GROUP BY c.catalog_key, c.firebase_id, c.name, c.description,
               c.display_field, c.value_field, c.search_fields,
               c.created_at, c.updated_at, co.firebase_id
      ORDER BY c.name ASC
    `, [companyId]);

    return NextResponse.json({ success: true, data: res.rows });
  } catch (error: any) {
    console.error('❌ Erro ao listar catálogos:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}

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
