import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';

export async function GET(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    const { searchParams } = new URL(request.url);
    const tableName = searchParams.get('table');

    // Se table especificada, retorna documentos
    if (tableName) {
      const result = await client.query(`SELECT * FROM ${tableName} ORDER BY created_at DESC NULLS LAST LIMIT 1000`);
      
      return NextResponse.json({
        success: true,
        data: result.rows,
        count: result.rowCount || 0,
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
          estimatedSize: count * 1024, // Estimativa aproximada
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

    await client.query(`DELETE FROM ${tableName} WHERE id = $1`, [id]);

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

    await client.query(
      `UPDATE ${tableName} SET ${field} = $1, updated_at = NOW() WHERE id = $2`,
      [value, id]
    );

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
