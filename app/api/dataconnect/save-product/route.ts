import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';

export async function POST(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    const body = await request.json();
    const { productId, catalogId, nome, name, codigo, ean, unidade, 
            quantidadeMax, quantidadeMin, preco, estoque, companyId } = body;

    // Firestore usa 'nome' (pt-BR), aceitar ambos
    const productName = nome || name || '';

    await client.query('BEGIN');

    // Resolver surrogate keys
    const catRes = await client.query(
      'SELECT catalog_key FROM dim_product_catalogs WHERE firebase_id = $1', [catalogId]
    );
    const catalogKey = catRes.rows[0]?.catalog_key || null;

    const companyRes = await client.query(
      'SELECT company_key FROM dim_companies WHERE firebase_id = $1', [companyId]
    );
    const companyKey = companyRes.rows[0]?.company_key || null;

    // UPSERT produto
    await client.query(`
      INSERT INTO dim_products (
        firebase_id, catalog_key, company_key, name, codigo, ean, unidade,
        quantidade_max, quantidade_min, preco_atual, estoque, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      ON CONFLICT (firebase_id) DO UPDATE SET
        name = EXCLUDED.name,
        catalog_key = EXCLUDED.catalog_key,
        codigo = EXCLUDED.codigo,
        ean = EXCLUDED.ean,
        unidade = EXCLUDED.unidade,
        quantidade_max = EXCLUDED.quantidade_max,
        quantidade_min = EXCLUDED.quantidade_min,
        preco_atual = EXCLUDED.preco_atual,
        estoque = EXCLUDED.estoque,
        updated_at = NOW()
    `, [productId, catalogKey, companyKey, productName, codigo || '', ean || '', unidade || '',
        quantidadeMax || null, quantidadeMin || null, preco || null, estoque || null]);

    await client.query('COMMIT');

    console.log(`✅ PostgreSQL: produto ${productId} salvo (dim_products)`);

    return NextResponse.json({
      success: true,
      data: { product_id: productId }
    });

  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Erro ao salvar produto no PostgreSQL:', error.message);
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
    const productId = searchParams.get('id');

    if (!productId) {
      return NextResponse.json(
        { success: false, error: 'Product ID required' },
        { status: 400 }
      );
    }

    await client.query('DELETE FROM dim_products WHERE firebase_id = $1', [productId]);

    console.log(`✅ PostgreSQL: produto ${productId} deletado (dim_products)`);

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('❌ Erro ao deletar produto:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
