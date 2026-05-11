/**
 * GET /api/lookup/tables
 *
 * Lista todas as tabelas do schema "public" do PostgreSQL para o admin
 * escolher ao criar uma Lookup Source.
 *
 * Filtra tabelas internas do BravoForm (fact_*, dim_audit_*, sequences,
 * tabelas técnicas) — só expõe tabelas "user-data" que façam sentido
 * para lookup (incluindo as alimentadas externamente via ETL).
 *
 * ?includeAll=true para listar TUDO (apenas troubleshooting).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';
import { rateLimitRead } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

// Tabelas que NÃO devem aparecer no seletor (internas do sistema)
const HIDDEN_TABLES = new Set([
  'fact_answers',
  'fact_attachments',
  'fact_audit_events',
  'fact_checkbox_answers',
  'fact_form_response',
  'fact_order_items',
  'fact_stage_comments',
  'fact_table_answers',
  'fact_workflow_history',
  'dim_lookup_sources',     // não pode ser fonte de si mesma
  'dim_workflow_stages',    // técnico — não faz sentido para lookup
  'dim_workflow_versions',
]);

export async function GET(request: NextRequest) {
  const rl = await rateLimitRead(request);
  if (!rl.ok) return rl.response;

  const pool = getPool();
  const client = await pool.connect();
  try {
    const { searchParams } = new URL(request.url);
    const includeAll = searchParams.get('includeAll') === 'true';

    const result = await client.query<{ table_name: string; table_schema: string; estimated_rows: number }>(`
      SELECT
        t.table_name,
        t.table_schema,
        COALESCE(s.n_live_tup, 0)::int AS estimated_rows
      FROM information_schema.tables t
      LEFT JOIN pg_stat_user_tables s
        ON s.relname = t.table_name AND s.schemaname = t.table_schema
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name
    `);

    let tables = result.rows;

    if (!includeAll) {
      tables = tables.filter((t) => !HIDDEN_TABLES.has(t.table_name));
    }

    return NextResponse.json({
      success: true,
      data: tables.map((t) => ({
        name: t.table_name,
        schema: t.table_schema,
        estimatedRows: t.estimated_rows,
      })),
      count: tables.length,
    });
  } catch (error: any) {
    logger.error('lookup/tables error', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
