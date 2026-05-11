/**
 * GET /api/lookup/query
 *   ?table=dim_apetito_motoristas
 *   &searchColumn=matricula
 *   &value=1234
 *   &displayColumns=nome,empresa,setor              (CSV)
 *   &displayLabels=Nome,Empresa,Setor               (CSV, opcional, alinhado a displayColumns)
 *
 * Endpoint público (workflow sem login) que faz o lookup direto na
 * tabela apontada pelo formulário. Não há camada intermediária de
 * "Lookup Source" cadastrada — a configuração vive no próprio campo
 * do formulário.
 *
 * Segurança em CAMADAS (essencial — endpoint é público):
 *   1. HIDDEN_TABLES (whitelist negativa) — bloqueia tabelas internas
 *      do BravoForm (fact_*, audit, etc.)
 *   2. Regex SQL_IDENT_RE em TODOS identificadores (table, search,
 *      display columns) — impede SQL injection via parâmetros
 *   3. Verificação server-side de que a tabela EXISTE em information_schema
 *   4. Verificação server-side de que TODAS as colunas existem na tabela
 *   5. HIDDEN_COLUMNS bloqueia colunas sensíveis (password, auth_token)
 *   6. Rate limit agressivo 30/min/IP — anti-enumeração por força bruta
 *   7. Cache em memória de "tabela → colunas válidas" — não faz query
 *      de validação em toda request
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';
import { rateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

const SQL_IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;

const HIDDEN_TABLES = new Set([
  'fact_answers', 'fact_attachments', 'fact_audit_events',
  'fact_checkbox_answers', 'fact_form_response', 'fact_order_items',
  'fact_stage_comments', 'fact_table_answers', 'fact_workflow_history',
  'dim_workflow_stages', 'dim_workflow_versions',
]);

const HIDDEN_COLUMNS = new Set([
  'password', 'password_hash', 'auth_token', 'reset_token',
  'api_key', 'secret', 'secret_key',
]);

// Cache em memória: tabela → Set de colunas válidas
// Evita query em information_schema a cada request. TTL implícito = vida do lambda warm.
const tableColumnsCache = new Map<string, Set<string>>();

async function getValidColumns(client: any, tableName: string): Promise<Set<string>> {
  const cached = tableColumnsCache.get(tableName);
  if (cached) return cached;

  const r = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  const cols = new Set<string>(r.rows.map((row: any) => row.column_name));
  tableColumnsCache.set(tableName, cols);
  return cols;
}

export async function GET(request: NextRequest) {
  // Rate limit agressivo: 30 req/min/IP — bloqueia enumeração por força bruta
  const rl = await rateLimit(request, { limit: 30, windowMs: 60_000, bucket: 'lookup' });
  if (!rl.ok) return rl.response;

  const { searchParams } = new URL(request.url);
  const tableName = searchParams.get('table');
  const searchColumn = searchParams.get('searchColumn');
  const value = searchParams.get('value');
  const displayColsCsv = searchParams.get('displayColumns') || '';
  const displayLabelsCsv = searchParams.get('displayLabels') || '';

  // ─── Validação básica ──────────────────────────────────────────────────
  if (!tableName || !searchColumn || !value) {
    return NextResponse.json(
      { success: false, error: 'table, searchColumn e value são obrigatórios' },
      { status: 400 }
    );
  }

  if (value.length > 200) {
    return NextResponse.json(
      { success: false, error: 'Valor muito longo (max 200 caracteres)' },
      { status: 400 }
    );
  }

  if (!SQL_IDENT_RE.test(tableName) || !SQL_IDENT_RE.test(searchColumn)) {
    return NextResponse.json(
      { success: false, error: 'Identificador SQL inválido' },
      { status: 400 }
    );
  }

  if (HIDDEN_TABLES.has(tableName)) {
    return NextResponse.json(
      { success: false, error: 'Tabela não disponível para lookup' },
      { status: 403 }
    );
  }

  const displayColumns = displayColsCsv
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  if (displayColumns.length === 0) {
    return NextResponse.json(
      { success: false, error: 'displayColumns é obrigatório (CSV)' },
      { status: 400 }
    );
  }

  if (displayColumns.length > 30) {
    return NextResponse.json(
      { success: false, error: 'Máximo de 30 colunas de exibição' },
      { status: 400 }
    );
  }

  for (const col of displayColumns) {
    if (!SQL_IDENT_RE.test(col) || HIDDEN_COLUMNS.has(col)) {
      return NextResponse.json(
        { success: false, error: `Coluna inválida ou não permitida: ${col}` },
        { status: 400 }
      );
    }
  }

  const displayLabels = displayLabelsCsv.split(',').map((l) => l.trim());

  const pool = getPool();
  const client = await pool.connect();
  try {
    // ─── Validação server-side: colunas existem na tabela ─────────────────
    const validCols = await getValidColumns(client, tableName);

    if (validCols.size === 0) {
      return NextResponse.json(
        { success: false, error: 'Tabela não encontrada' },
        { status: 404 }
      );
    }

    if (!validCols.has(searchColumn)) {
      return NextResponse.json(
        { success: false, error: `Coluna de busca "${searchColumn}" não existe em "${tableName}"` },
        { status: 400 }
      );
    }

    for (const col of displayColumns) {
      if (!validCols.has(col)) {
        return NextResponse.json(
          { success: false, error: `Coluna de exibição "${col}" não existe em "${tableName}"` },
          { status: 400 }
        );
      }
    }

    // ─── Query (identificadores já validados duas vezes — regex + existência) ──
    const colList = displayColumns.map((c) => `"${c}"`).join(', ');
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
      logger.warn('Lookup query failed', { tableName, searchColumn, error: qErr.message });
      return NextResponse.json(
        { success: false, error: 'Erro ao consultar a fonte de dados' },
        { status: 500 }
      );
    }

    if (result.rowCount === 0) {
      return NextResponse.json({ success: true, match: false });
    }

    // ─── Monta resposta com labels alinhados a displayColumns ─────────────
    const row = result.rows[0];
    const data: Record<string, { value: any; label: string }> = {};
    for (let i = 0; i < displayColumns.length; i++) {
      const col = displayColumns[i];
      data[col] = {
        value: row[col] ?? null,
        label: displayLabels[i] || col,
      };
    }

    return NextResponse.json({
      success: true,
      match: true,
      data,
    });
  } catch (error: any) {
    logger.error('lookup/query error', error, { tableName });
    return NextResponse.json(
      { success: false, error: 'Erro interno na consulta' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
