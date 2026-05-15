/**
 * BravoForm — Helpers para o executionForm (formulário customizado em
 * etapas de execution com cascading lookups).
 *
 * Concentra a validação de identifiers SQL, construção de queries
 * parametrizadas (sem string interpolation de input do usuário) e
 * encontrar a config de um field específico.
 */

import type { ExecutionFormField, LookupConfig } from '@/types';

export const SQL_IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;
export const MAX_LOOKUP_LIMIT = 500;
export const DEFAULT_LOOKUP_LIMIT = 200;

/**
 * Tabelas/views proibidas de aparecer em executionForm.lookup.table.
 * Protege contra acesso a tabelas com dados sensíveis ou de auth.
 */
const FORBIDDEN_TABLE_PREFIXES = ['pg_', 'information_schema', 'auth_'];
const FORBIDDEN_TABLES = new Set([
  'fact_form_response',
  'fact_workflow_history',
  'dim_collaborators',     // só acessada via lookup_table de identity-validation
  'dim_workflows',
  'dim_workflow_stages',
  'audit_events',
]);

export function isSafeIdentifier(s: string | undefined | null): boolean {
  return !!s && SQL_IDENT_RE.test(s);
}

export function isSafeTable(table: string | undefined | null): boolean {
  if (!table || !SQL_IDENT_RE.test(table)) return false;
  const lower = table.toLowerCase();
  if (FORBIDDEN_TABLES.has(lower)) return false;
  for (const p of FORBIDDEN_TABLE_PREFIXES) {
    if (lower.startsWith(p)) return false;
  }
  return true;
}

/** Acha o field pelo id dentro de uma lista. */
export function findField(fields: ExecutionFormField[], id: string): ExecutionFormField | null {
  return fields.find((f) => f.id === id) || null;
}

/**
 * Constrói uma query parametrizada de lookup a partir do LookupConfig
 * e do contexto de valores já preenchidos pelo usuário.
 *
 * - SQL identifiers (table, column) são validados por regex (whitelist)
 * - Valores vão como parâmetros $1, $2, ... (nunca interpolados)
 * - WHERE com fromField é resolvido a partir do `contextValues`
 *
 * Retorna { sql, params } ou null se config inválida.
 */
export function buildLookupQuery(
  lookup: LookupConfig,
  contextValues: Record<string, any>,
  options: { searchValue?: string } = {}
): { sql: string; params: any[]; selectedColumns: string[] } | null {
  if (!isSafeTable(lookup.table)) return null;

  // Determina o SELECT
  const selectCols: string[] = [];

  // selectColumn (valor do dropdown)
  if (lookup.selectColumn) {
    if (!isSafeIdentifier(lookup.selectColumn)) return null;
    selectCols.push(lookup.selectColumn);
  }
  // labelColumn (rótulo do dropdown, opcional)
  if (lookup.labelColumn) {
    if (!isSafeIdentifier(lookup.labelColumn)) return null;
    if (!selectCols.includes(lookup.labelColumn)) selectCols.push(lookup.labelColumn);
  }
  // resolveColumns (colunas extras pra serem referenciadas por display fields)
  for (const c of lookup.resolveColumns || []) {
    if (!isSafeIdentifier(c)) return null;
    if (!selectCols.includes(c)) selectCols.push(c);
  }
  // searchColumn (para lookup-input retornar a linha encontrada)
  if (lookup.searchColumn) {
    if (!isSafeIdentifier(lookup.searchColumn)) return null;
    if (!selectCols.includes(lookup.searchColumn)) selectCols.push(lookup.searchColumn);
  }

  if (selectCols.length === 0) return null;

  // WHERE conditions
  const whereParts: string[] = [];
  const params: any[] = [];

  // Condição opcional: searchColumn LIKE %searchValue% (para lookup-input).
  // Usa substring match porque o usuário pode digitar parte do código
  // (ex: "12049" deve achar "12049 - APETITO").
  if (options.searchValue !== undefined && lookup.searchColumn) {
    params.push(`%${String(options.searchValue).trim()}%`);
    whereParts.push(`TRIM("${lookup.searchColumn}"::text) ILIKE $${params.length}`);
  }

  // WHERE configurado (cascading filters) — match exato pra usar índice btree.
  // O cliente envia o valor canônico (já substituído pelo lookup-input após
  // resolver), então igualdade é o suficiente e bem mais rápido que ILIKE.
  for (const w of lookup.where || []) {
    if (!isSafeIdentifier(w.column)) return null;
    let value: any = w.value;
    if (w.fromField) {
      value = contextValues?.[w.fromField];
      // Se a dependência não foi preenchida, a query retorna 0 resultados
      // (mais seguro do que falhar)
      if (value === undefined || value === null || value === '') {
        return { sql: 'SELECT 1 WHERE FALSE', params: [], selectedColumns: selectCols };
      }
    }
    params.push(String(value).trim());
    whereParts.push(`"${w.column}"::text = $${params.length}`);
  }

  const where = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
  const distinct = lookup.distinct ? 'DISTINCT' : '';
  const orderBy = lookup.orderBy && isSafeIdentifier(lookup.orderBy)
    ? `ORDER BY "${lookup.orderBy}" ASC`
    : `ORDER BY "${selectCols[0]}" ASC`;
  const limit = Math.min(Math.max(1, lookup.limit ?? DEFAULT_LOOKUP_LIMIT), MAX_LOOKUP_LIMIT);

  const colsSql = selectCols.map((c) => `"${c}"`).join(', ');
  const sql = `SELECT ${distinct} ${colsSql} FROM "${lookup.table}" ${where} ${orderBy} LIMIT ${limit}`;

  return { sql, params, selectedColumns: selectCols };
}
