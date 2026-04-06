import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';

// GET - Listar produtos por catálogo
export async function GET(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    const { searchParams } = new URL(request.url);
    const catalogId = searchParams.get('catalogId');

    if (!catalogId) {
      return NextResponse.json(
        { success: false, error: 'Catalog ID required' },
        { status: 400 }
      );
    }

    const result = await client.query(`
      SELECT 
        p.firebase_id as id,
        p.name as nome,
        p.codigo,
        p.unidade,
        p.quantidade_min as "quantidadeMin",
        p.quantidade_max as "quantidadeMax",
        p.preco_atual as preco,
        p.estoque
      FROM dim_products p
      JOIN dim_product_catalogs c ON p.catalog_key = c.catalog_key
      WHERE c.firebase_id = $1
      ORDER BY p.name ASC
    `, [catalogId]);

    return NextResponse.json({
      success: true,
      data: result.rows
    });

  } catch (error: any) {
    console.error('❌ Erro ao listar produtos:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
