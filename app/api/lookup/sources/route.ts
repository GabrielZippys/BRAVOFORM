/**
 * /api/lookup/sources
 *
 * CRUD de Lookup Sources — fontes cadastradas pelo admin que serão
 * usadas como base para campos lookup em formulários.
 *
 * GET                          → lista todas as sources
 * GET    ?id=xxx               → busca uma
 * POST   { name, tableName, searchColumn, displayColumns[], ... }
 * PATCH  { id, ...changes }
 * DELETE ?id=xxx               → soft delete
 *
 * Defensivo: valida que tabela + colunas existem no PG antes de
 * cadastrar (evita criar Sources "broken").
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';
import { ensureLookupSchema } from '@/lib/db/lookupMigration';
import { auditLog, AuditEventType } from '@/lib/audit';
import { rateLimitMutation, rateLimitRead } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

const HIDDEN_TABLES = new Set([
  'fact_answers', 'fact_attachments', 'fact_audit_events',
  'fact_checkbox_answers', 'fact_form_response', 'fact_order_items',
  'fact_stage_comments', 'fact_table_answers', 'fact_workflow_history',
  'dim_lookup_sources', 'dim_workflow_stages', 'dim_workflow_versions',
]);

// Valida formato de identificador SQL
const SQL_IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;

interface DisplayColumn {
  column: string;
  label?: string;
}

async function tableExists(client: any, tableName: string): Promise<boolean> {
  if (HIDDEN_TABLES.has(tableName)) return false;
  const r = await client.query(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    ) AS e`,
    [tableName]
  );
  return r.rows[0]?.e === true;
}

async function getValidColumns(client: any, tableName: string): Promise<Set<string>> {
  const r = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return new Set(r.rows.map((row: any) => row.column_name));
}

// ─── GET ───────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const rl = await rateLimitRead(request);
  if (!rl.ok) return rl.response;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureLookupSchema(client);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
      const r = await client.query(
        `SELECT * FROM dim_lookup_sources
         WHERE firebase_id = $1 AND deleted_at IS NULL`,
        [id]
      );
      if (r.rows.length === 0) {
        return NextResponse.json({ success: false, error: 'Source não encontrada' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: r.rows[0] });
    }

    const r = await client.query(
      `SELECT * FROM dim_lookup_sources
       WHERE deleted_at IS NULL
       ORDER BY name ASC`
    );
    return NextResponse.json({ success: true, data: r.rows, count: r.rowCount });
  } catch (error: any) {
    logger.error('lookup/sources GET error', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}

// ─── POST: cadastrar nova Source ───────────────────────────────────
export async function POST(request: NextRequest) {
  const rl = await rateLimitMutation(request);
  if (!rl.ok) return rl.response;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureLookupSchema(client);

    const body = await request.json();
    const {
      name,
      description,
      tableName,
      searchColumn,
      searchColumnType = 'text',
      displayColumns,
      createdBy,
      createdByName,
    } = body;

    // Validações
    if (!name || !tableName || !searchColumn) {
      return NextResponse.json(
        { success: false, error: 'name, tableName e searchColumn são obrigatórios' },
        { status: 400 }
      );
    }

    if (!SQL_IDENT_RE.test(tableName) || !SQL_IDENT_RE.test(searchColumn)) {
      return NextResponse.json(
        { success: false, error: 'Identificadores SQL inválidos' },
        { status: 400 }
      );
    }

    if (!Array.isArray(displayColumns) || displayColumns.length === 0) {
      return NextResponse.json(
        { success: false, error: 'displayColumns deve ser array não-vazio' },
        { status: 400 }
      );
    }

    for (const dc of displayColumns as DisplayColumn[]) {
      if (!dc?.column || !SQL_IDENT_RE.test(dc.column)) {
        return NextResponse.json(
          { success: false, error: `Coluna inválida em displayColumns: ${dc?.column}` },
          { status: 400 }
        );
      }
    }

    // Verifica que a tabela existe
    if (!(await tableExists(client, tableName))) {
      return NextResponse.json(
        { success: false, error: `Tabela "${tableName}" não existe ou não está disponível para lookup` },
        { status: 400 }
      );
    }

    // Verifica que TODAS as colunas existem na tabela
    const validCols = await getValidColumns(client, tableName);
    if (!validCols.has(searchColumn)) {
      return NextResponse.json(
        { success: false, error: `Coluna de busca "${searchColumn}" não existe em "${tableName}"` },
        { status: 400 }
      );
    }
    for (const dc of displayColumns as DisplayColumn[]) {
      if (!validCols.has(dc.column)) {
        return NextResponse.json(
          { success: false, error: `Coluna de exibição "${dc.column}" não existe em "${tableName}"` },
          { status: 400 }
        );
      }
    }

    const firebaseId = `lookup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await client.query(
      `INSERT INTO dim_lookup_sources (
        firebase_id, name, description,
        table_name, search_column, search_column_type, display_columns,
        created_by, created_by_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        firebaseId,
        name,
        description || '',
        tableName,
        searchColumn,
        searchColumnType,
        JSON.stringify(displayColumns),
        createdBy || null,
        createdByName || null,
      ]
    );

    await auditLog({
      eventType: AuditEventType.CONFIG_CHANGED,
      severity: 'info',
      actor: { id: createdBy || 'unknown', username: createdByName },
      target: { type: 'lookup_source', id: firebaseId, label: name },
      payload: { tableName, searchColumn, displayColumnsCount: displayColumns.length },
      request,
    });

    return NextResponse.json({
      success: true,
      data: { firebaseId, name, tableName, searchColumn },
    });
  } catch (error: any) {
    logger.error('lookup/sources POST error', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}

// ─── PATCH: atualizar Source ──────────────────────────────────────
export async function PATCH(request: NextRequest) {
  const rl = await rateLimitMutation(request);
  if (!rl.ok) return rl.response;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureLookupSchema(client);

    const body = await request.json();
    const {
      id,
      name,
      description,
      tableName,
      searchColumn,
      searchColumnType,
      displayColumns,
      isActive,
      performedBy,
      performedByName,
    } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'id obrigatório' }, { status: 400 });
    }

    // Se admin mudou tabela/colunas, re-valida
    if (tableName || searchColumn || displayColumns) {
      const sourceRes = await client.query(
        `SELECT table_name FROM dim_lookup_sources WHERE firebase_id = $1`,
        [id]
      );
      const effectiveTable = tableName || sourceRes.rows[0]?.table_name;

      if (effectiveTable) {
        if (!SQL_IDENT_RE.test(effectiveTable) || !(await tableExists(client, effectiveTable))) {
          return NextResponse.json(
            { success: false, error: `Tabela inválida: ${effectiveTable}` },
            { status: 400 }
          );
        }
        const validCols = await getValidColumns(client, effectiveTable);
        if (searchColumn && !validCols.has(searchColumn)) {
          return NextResponse.json(
            { success: false, error: `Coluna de busca inválida: ${searchColumn}` },
            { status: 400 }
          );
        }
        if (Array.isArray(displayColumns)) {
          for (const dc of displayColumns as DisplayColumn[]) {
            if (!dc?.column || !validCols.has(dc.column)) {
              return NextResponse.json(
                { success: false, error: `Coluna de exibição inválida: ${dc?.column}` },
                { status: 400 }
              );
            }
          }
        }
      }
    }

    // Monta UPDATE dinâmico
    const updates: string[] = [];
    const values: any[] = [];
    let i = 1;

    if (name !== undefined)              { updates.push(`name = $${i++}`);              values.push(name); }
    if (description !== undefined)       { updates.push(`description = $${i++}`);       values.push(description); }
    if (tableName !== undefined)         { updates.push(`table_name = $${i++}`);        values.push(tableName); }
    if (searchColumn !== undefined)      { updates.push(`search_column = $${i++}`);     values.push(searchColumn); }
    if (searchColumnType !== undefined)  { updates.push(`search_column_type = $${i++}`); values.push(searchColumnType); }
    if (displayColumns !== undefined)    { updates.push(`display_columns = $${i++}`);   values.push(JSON.stringify(displayColumns)); }
    if (isActive !== undefined)          { updates.push(`is_active = $${i++}`);         values.push(isActive); }

    if (updates.length === 0) {
      return NextResponse.json({ success: false, error: 'Nada para atualizar' }, { status: 400 });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    await client.query(
      `UPDATE dim_lookup_sources SET ${updates.join(', ')} WHERE firebase_id = $${i}`,
      values
    );

    await auditLog({
      eventType: AuditEventType.CONFIG_CHANGED,
      actor: { id: performedBy || 'unknown', username: performedByName },
      target: { type: 'lookup_source', id },
      payload: { updates: Object.keys(body).filter((k) => k !== 'id') },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    logger.error('lookup/sources PATCH error', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}

// ─── DELETE (soft) ────────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  const rl = await rateLimitMutation(request);
  if (!rl.ok) return rl.response;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureLookupSchema(client);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'id obrigatório' }, { status: 400 });
    }

    await client.query(
      `UPDATE dim_lookup_sources SET deleted_at = NOW() WHERE firebase_id = $1`,
      [id]
    );

    await auditLog({
      eventType: AuditEventType.CONFIG_CHANGED,
      severity: 'warn',
      target: { type: 'lookup_source', id },
      payload: { action: 'soft_delete' },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    logger.error('lookup/sources DELETE error', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}
