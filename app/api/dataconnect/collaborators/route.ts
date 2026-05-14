/**
 * GET /api/dataconnect/collaborators?q=...&limit=50
 *
 * Lista colaboradores do banco para uso em seletores (Viewers de workflow,
 * atribuição de etapa, etc). Retorna apenas dados básicos (id, username,
 * email, nome, departamento) — sem informações sensíveis.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const limit = Math.min(Number(searchParams.get('limit')) || 50, 200);

  const pool = getPool();
  const client = await pool.connect();
  try {
    const params: any[] = [];
    let where = '';
    if (q.length > 0) {
      params.push(`%${q}%`);
      where = `WHERE (username ILIKE $1 OR email ILIKE $1 OR name ILIKE $1)`;
    }

    const res = await client.query(
      `SELECT firebase_id AS id, username, email, name, department_name
       FROM dim_collaborators
       ${where}
       ORDER BY username ASC
       LIMIT ${limit}`,
      params
    );

    return NextResponse.json({
      success: true,
      data: res.rows.map((r) => ({
        id: r.id,
        username: r.username,
        email: r.email || '',
        name: r.name || r.username,
        department: r.department_name || '',
      })),
    });
  } catch (error: any) {
    logger.error('collaborators GET error', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao listar colaboradores' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
