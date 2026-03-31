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

export async function GET(request: NextRequest) {
  const pool = new Pool(PG_CONFIG);

  try {
    // Listar tabelas disponíveis
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const tables = tablesResult.rows.map(row => row.table_name);

    await pool.end();

    return NextResponse.json({
      success: true,
      tables
    });

  } catch (error: any) {
    await pool.end();
    console.error('Erro ao listar tabelas:', error);
    return NextResponse.json(
      { success: false, error: `Erro ao conectar ao banco: ${error.message}` },
      { status: 500 }
    );
  }
}
