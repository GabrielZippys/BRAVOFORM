import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';

export async function POST(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    const body = await request.json();
    const { collaboratorId, uid, username, name, email, role, active,
            companyId, departmentId, departmentName, 
            isTemporaryPassword, canViewHistory, canEditHistory, permissions } = body;

    // permissions pode vir como objeto aninhado do Firestore
    const viewHistory = canViewHistory || permissions?.canViewHistory || false;
    const editHistory = canEditHistory || permissions?.canEditHistory || false;

    await client.query(`
      INSERT INTO collaborators (
        id, uid, username, name, email, role, active, company_id, department_id, department_name,
        is_temporary_password, can_view_history, can_edit_history, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      ON CONFLICT (id) DO UPDATE SET
        uid = COALESCE(EXCLUDED.uid, collaborators.uid),
        username = EXCLUDED.username,
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        active = EXCLUDED.active,
        department_id = EXCLUDED.department_id,
        department_name = EXCLUDED.department_name,
        is_temporary_password = EXCLUDED.is_temporary_password,
        can_view_history = EXCLUDED.can_view_history,
        can_edit_history = EXCLUDED.can_edit_history
    `, [collaboratorId, uid || null, username, name || username || '', 
        email || null, role || 'collaborator', active !== false,
        companyId || '', departmentId || '', departmentName || '', 
        isTemporaryPassword || false, viewHistory, editHistory]);

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
  const pool = getPool();
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
