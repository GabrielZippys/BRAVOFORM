import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { db } from '../../../../firebase/config';
import { doc, getDoc } from 'firebase/firestore';

export async function POST(request: NextRequest) {
  try {
    const { profileId, tableName } = await request.json();

    if (!profileId || !tableName) {
      return NextResponse.json(
        { success: false, error: 'profileId e tableName são obrigatórios' },
        { status: 400 }
      );
    }

    // Buscar perfil SQL
    const profileDoc = await getDoc(doc(db, 'sql_profiles', profileId));
    if (!profileDoc.exists()) {
      return NextResponse.json(
        { success: false, error: 'Perfil SQL não encontrado' },
        { status: 404 }
      );
    }

    const profile = profileDoc.data();

    // Conectar ao banco PostgreSQL
    const pool = new Pool({
      host: profile.host,
      port: profile.port || 5432,
      database: profile.database,
      user: profile.user,
      password: profile.password,
      ssl: false,
      connectionTimeoutMillis: 5000,
    });

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
