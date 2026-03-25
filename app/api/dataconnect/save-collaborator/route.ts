import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.PG_HOST || '34.39.165.146',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'formbravo-8854e-database',
  user: process.env.PG_USER || 'ipanema',
  password: process.env.PG_PASSWORD || 'Br@v0x00',
  ssl: false,
  max: 5,
  idleTimeoutMillis: 30000,
});

export async function POST(request: NextRequest) {
  const client = await pool.connect();
  
  try {
    const body = await request.json();
    const { collaboratorId, username, email, companyId, departmentId, 
            departmentName, isTemporaryPassword, canViewHistory, canEditHistory } = body;

    await client.query(`
      INSERT INTO collaborators (
        id, username, email, company_id, department_id, department_name,
        is_temporary_password, can_view_history, can_edit_history, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        email = EXCLUDED.email,
        department_id = EXCLUDED.department_id,
        department_name = EXCLUDED.department_name,
        is_temporary_password = EXCLUDED.is_temporary_password,
        can_view_history = EXCLUDED.can_view_history,
        can_edit_history = EXCLUDED.can_edit_history
    `, [collaboratorId, username, email || null, companyId, departmentId, 
        departmentName || '', isTemporaryPassword || false, 
        canViewHistory || false, canEditHistory || false]);

    console.log(`✅ PostgreSQL: colaborador ${collaboratorId} salvo`);
    return NextResponse.json({ success: true, data: { collaborator_id: collaboratorId } });

  } catch (error: any) {
    console.error('❌ Erro ao salvar colaborador:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(request: NextRequest) {
  const client = await pool.connect();
  
  try {
    const { searchParams } = new URL(request.url);
    const collaboratorId = searchParams.get('id');

    if (!collaboratorId) {
      return NextResponse.json({ success: false, error: 'Collaborator ID required' }, { status: 400 });
    }

    await client.query('DELETE FROM collaborators WHERE id = $1', [collaboratorId]);
    console.log(`✅ PostgreSQL: colaborador ${collaboratorId} deletado`);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('❌ Erro ao deletar colaborador:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}
