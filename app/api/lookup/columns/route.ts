/**
 * GET /api/lookup/columns?table=xxx
 *
 * Lista colunas + tipos de uma tabela específica para o admin
 * escolher quais usar como coluna de busca e quais exibir.
 *
 * Valida que a tabela existe no schema public antes de retornar
 * (defesa contra path injection).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';
import { rateLimitRead } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

// Mesma lista de tabelas ocultas que /api/lookup/tables
const HIDDEN_TABLES = new Set([
  'fact_answers', 'fact_attachments', 'fact_audit_events',
  'fact_checkbox_answers', 'fact_form_response', 'fact_order_items',
  'fact_stage_comments', 'fact_table_answers', 'fact_workflow_history',
  'dim_lookup_sources', 'dim_workflow_stages', 'dim_workflow_versions',
]);

// Colunas que não fazem sentido ser usadas como search/display
// (internas, sensíveis, ou puramente técnicas)
const HIDDEN_COLUMNS = new Set([
  'password', 'password_hash', 'auth_token', 'reset_token',
  'created_at_raw', 'tsvector_search',
]);

export async function GET(request: NextRequest) {
  const rl = await rateLimitRead(request);
  if (!rl.ok) return rl.response;

  const { searchParams } = new URL(request.url);
  const tableName = searchParams.get('table');

  if (!tableName) {
    return NextResponse.json(
      { success: false, error: 'Parâmetro table é obrigatório' },
      { status: 400 }
    );
  }

  // Validação básica anti-injection
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(tableName)) {
    return NextResponse.json(
      { success: false, error: 'Nome de tabela inválido' },
      { status: 400 }
    );
  }

  if (HIDDEN_TABLES.has(tableName)) {
    return NextResponse.json(
      { success: false, error: 'Tabela não disponível para lookup' },
      { status: 403 }
    );
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    // Verifica que a tabela existe no schema public
    const existsRes = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      ) AS exists`,
      [tableName]
    );

    if (!existsRes.rows[0]?.exists) {
      return NextResponse.json(
        { success: false, error: 'Tabela não encontrada' },
        { status: 404 }
      );
    }

    const result = await client.query<{ column_name: string; data_type: string; is_nullable: string }>(`
      SELECT
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
    `, [tableName]);

    const columns = result.rows
      .filter((c) => !HIDDEN_COLUMNS.has(c.column_name))
      .map((c) => ({
        name: c.column_name,
        type: c.data_type,
        nullable: c.is_nullable === 'YES',
        // Classificação amigável pro UI
        category: classifyType(c.data_type),
      }));

    return NextResponse.json({
      success: true,
      table: tableName,
      data: columns,
      count: columns.length,
    });
  } catch (error: any) {
    logger.error('lookup/columns error', error, { tableName });
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

function classifyType(dataType: string): 'text' | 'number' | 'date' | 'boolean' | 'json' | 'other' {
  const t = dataType.toLowerCase();
  if (t.includes('char') || t === 'text' || t === 'uuid') return 'text';
  if (t.includes('int') || t.includes('numeric') || t === 'real' || t === 'double precision') return 'number';
  if (t.includes('timestamp') || t === 'date' || t === 'time') return 'date';
  if (t === 'boolean') return 'boolean';
  if (t === 'jsonb' || t === 'json') return 'json';
  return 'other';
}
