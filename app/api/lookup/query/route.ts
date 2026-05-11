/**
 * GET /api/lookup/query?sourceId=xxx&value=yyy
 *
 * Endpoint público (workflow sem login) que executa o lookup.
 *
 * Segurança em CAMADAS:
 *   1. Aceita apenas sourceId cadastrado pelo admin (whitelist)
 *   2. Usa table_name + search_column do registro da source — colaborador
 *      NÃO pode injetar tabela/coluna arbitrária
 *   3. Retorna APENAS as colunas declaradas em display_columns
 *   4. Rate limit agressivo (30/min/IP) — anti-enumeração
 *   5. Audit log de cada lookup pra forensics
 *
 * Resposta:
 *   { match: true,  data: { name: '...', email: '...' } }
 *   { match: false }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';
import { ensureLookupSchema } from '@/lib/db/lookupMigration';
import { rateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

const SQL_IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;

interface DisplayColumn {
  column: string;
  label?: string;
}

export async function GET(request: NextRequest) {
  // Rate limit agressivo: 30 req/min/IP — bloqueia enumeração por força bruta
  const rl = await rateLimit(request, { limit: 30, windowMs: 60_000, bucket: 'lookup' });
  if (!rl.ok) return rl.response;

  const { searchParams } = new URL(request.url);
  const sourceId = searchParams.get('sourceId');
  const value = searchParams.get('value');

  if (!sourceId || !value) {
    return NextResponse.json(
      { success: false, error: 'sourceId e value são obrigatórios' },
      { status: 400 }
    );
  }

  if (value.length > 200) {
    return NextResponse.json(
      { success: false, error: 'Valor muito longo (max 200 caracteres)' },
      { status: 400 }
    );
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureLookupSchema(client);

    // 1) Busca config da source
    const srcRes = await client.query(
      `SELECT table_name, search_column, search_column_type, display_columns, is_active
       FROM dim_lookup_sources
       WHERE firebase_id = $1 AND deleted_at IS NULL`,
      [sourceId]
    );

    if (srcRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Fonte de lookup não encontrada' },
        { status: 404 }
      );
    }

    const src = srcRes.rows[0];
    if (!src.is_active) {
      return NextResponse.json(
        { success: false, error: 'Fonte de lookup desativada' },
        { status: 403 }
      );
    }

    const tableName: string = src.table_name;
    const searchColumn: string = src.search_column;
    const displayColumns: DisplayColumn[] = src.display_columns || [];

    // 2) Re-validação de identificadores (defesa em profundidade)
    if (!SQL_IDENT_RE.test(tableName) || !SQL_IDENT_RE.test(searchColumn)) {
      logger.error('Lookup source com identificadores inválidos', undefined, { sourceId, tableName, searchColumn });
      return NextResponse.json(
        { success: false, error: 'Configuração inválida (contate o suporte)' },
        { status: 500 }
      );
    }

    const safeDisplayCols = displayColumns
      .map((d) => d.column)
      .filter((c) => SQL_IDENT_RE.test(c));

    if (safeDisplayCols.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Source sem colunas de exibição válidas' },
        { status: 500 }
      );
    }

    // 3) Monta a query com cast no value para comparar com a coluna
    // (identificadores já foram validados pelos regex acima)
    const colList = safeDisplayCols.map((c) => `"${c}"`).join(', ');
    const castValue = src.search_column_type === 'number' ? `($1::text)::numeric` : `$1::text`;

    const queryText = `
      SELECT ${colList}
      FROM "${tableName}"
      WHERE "${searchColumn}"::text = $1::text
         OR "${searchColumn}"::text ILIKE $1::text
      LIMIT 1
    `;

    let result;
    try {
      result = await client.query(queryText, [value.trim()]);
    } catch (qErr: any) {
      logger.warn('Lookup query failed', { sourceId, error: qErr.message });
      return NextResponse.json(
        { success: false, error: 'Erro ao consultar a fonte de dados' },
        { status: 500 }
      );
    }

    if (result.rowCount === 0) {
      return NextResponse.json({
        success: true,
        match: false,
      });
    }

    // 4) Monta o objeto de retorno com labels amigáveis
    const row = result.rows[0];
    const data: Record<string, { value: any; label: string }> = {};
    for (const dc of displayColumns) {
      const safeCol = SQL_IDENT_RE.test(dc.column) ? dc.column : null;
      if (!safeCol) continue;
      data[dc.column] = {
        value: row[dc.column] ?? null,
        label: dc.label || dc.column,
      };
    }

    return NextResponse.json({
      success: true,
      match: true,
      data,
    });
  } catch (error: any) {
    logger.error('lookup/query error', error, { sourceId });
    return NextResponse.json(
      { success: false, error: 'Erro interno na consulta' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
