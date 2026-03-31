import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { db } from '../../../../firebase/config';
import { doc, getDoc } from 'firebase/firestore';

export async function POST(request: NextRequest) {
  try {
    const { profileId } = await request.json();

    if (!profileId) {
      return NextResponse.json(
        { success: false, error: 'profileId é obrigatório' },
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
      // Testar conexão
      await pool.query('SELECT 1');

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
        message: 'Conexão estabelecida com sucesso',
        tables
      });

    } catch (dbError: any) {
      await pool.end();
      console.error('Erro ao conectar ao banco SQL:', dbError);
      return NextResponse.json(
        { success: false, error: `Erro de conexão: ${dbError.message}` },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('Erro ao testar conexão:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
