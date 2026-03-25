import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.PG_HOST || '34.39.165.146',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'formbravo-8854e-database',
  user: process.env.PG_USER || 'ipanema',
  password: process.env.PG_PASSWORD || 'Br@v0x00',
  ssl: false,
  max: 5,
  idleTimeoutMillis: 30000,
});

export async function POST(request: NextRequest) {
  const client = await pool.connect();
  
  try {
    const body = await request.json();
    const { productId, catalogId, name, codigo, ean, unidade, 
            quantidadeMax, quantidadeMin, collection, companyId } = body;

    await client.query('BEGIN');

    // UPSERT produto
    await client.query(`
      INSERT INTO products (
        id, catalog_id, name, codigo, ean, unidade, quantidade_max,
        quantidade_min, collection, company_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        codigo = EXCLUDED.codigo,
        ean = EXCLUDED.ean,
        unidade = EXCLUDED.unidade,
        quantidade_max = EXCLUDED.quantidade_max,
        quantidade_min = EXCLUDED.quantidade_min,
        updated_at = NOW()
    `, [productId, catalogId, name, codigo || '', ean || '', unidade || '',
        quantidadeMax || null, quantidadeMin || null, collection || 'products', companyId || '']);

    await client.query('COMMIT');

    console.log(`✅ PostgreSQL: produto ${productId} salvo`);

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

    await client.query('DELETE FROM products WHERE id = $1', [productId]);

    console.log(`✅ PostgreSQL: produto ${productId} deletado`);

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
