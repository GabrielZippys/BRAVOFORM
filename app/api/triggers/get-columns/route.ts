import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

// Credenciais do PostgreSQL Data Connect (hardcoded)
const PG_CONFIG = {
  host: '34.39.165.146',
  port: 5432,
  database: 'formbravo-8854e-database',
  user: 'ipanema',
  password: 'Br@v0x00',
  ssl: false,
  connectionTimeoutMillis: 5000,
};

export async function POST(request: NextRequest) {
  try {
    const { tableName } = await request.json();

    if (!tableName) {
      return NextResponse.json(
        { success: false, error: 'tableName é obrigatório' },
        { status: 400 }
      );
    }

    const pool = new Pool(PG_CONFIG);

    try {
      // Listar colunas da tabela
      const columnsResult = await pool.query(`
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);

      const columns = columnsResult.rows.map(row => ({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === 'YES',
        default: row.column_default
      }));

      await pool.end();

      return NextResponse.json({
        success: true,
        columns
      });

    } catch (dbError: any) {
      await pool.end();
      console.error('Erro ao consultar colunas:', dbError);
      return NextResponse.json(
        { success: false, error: `Erro ao consultar colunas: ${dbError.message}` },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('Erro ao listar colunas:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
