/**
 * GET /api/dataconnect/my-workflows?userId=...&username=...
 *
 * Retorna a lista de workflows que o usuário pode "acompanhar" (viewer).
 * Um viewer aparece no array `dim_workflows.viewers` JSONB como
 * `{ id, username, name }`. A consulta usa o operador @> do GIN index
 * para filtrar eficientemente.
 *
 * Inclui contagem de instâncias por status (in_progress / completed).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';
import { ensureWorkflowsTable } from '@/lib/db/workflowsTableMigration';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId') || '';
  const username = searchParams.get('username') || '';

  if (!userId && !username) {
    return NextResponse.json(
      { success: false, error: 'Informe userId ou username' },
      { status: 400 }
    );
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureWorkflowsTable(client);

    // viewers JSONB é um array de objetos. Procuramos por id OU username.
    // jsonb @> matching: [{id: X}] ou [{username: Y}]
    const conditions: string[] = [];
    const params: any[] = [];
    let i = 1;
    if (userId)   { conditions.push(`viewers @> $${i++}::jsonb`); params.push(JSON.stringify([{ id: userId }])); }
    if (username) { conditions.push(`viewers @> $${i++}::jsonb`); params.push(JSON.stringify([{ username }])); }

    const where = conditions.join(' OR ');

    const wfRes = await client.query(
      `SELECT firebase_id AS id, name, description, is_active AS "isActive"
       FROM dim_workflows
       WHERE deleted_at IS NULL
         AND (${where})
       ORDER BY name ASC`,
      params
    );

    if (wfRes.rows.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Conta instâncias por workflow + status
    const ids = wfRes.rows.map((w) => w.id);
    const countRes = await client.query(
      `SELECT workflow_fb_id, status, COUNT(*)::int AS n
       FROM fact_form_response
       WHERE workflow_fb_id = ANY($1::text[])
         AND deleted_at IS NULL
       GROUP BY workflow_fb_id, status`,
      [ids]
    );

    const counts: Record<string, { total: number; byStatus: Record<string, number> }> = {};
    for (const id of ids) counts[id] = { total: 0, byStatus: {} };
    for (const row of countRes.rows) {
      const c = counts[row.workflow_fb_id];
      if (!c) continue;
      c.byStatus[row.status] = row.n;
      c.total += row.n;
    }

    return NextResponse.json({
      success: true,
      data: wfRes.rows.map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description || '',
        isActive: w.isActive,
        instances: counts[w.id] || { total: 0, byStatus: {} },
      })),
    });
  } catch (error: any) {
    logger.error('my-workflows GET error', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao carregar workflows' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
