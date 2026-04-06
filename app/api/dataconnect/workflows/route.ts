import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';

/** Garante que colunas extras existam na tabela de stages */
async function ensureColumns(client: any) {
  await client.query(`
    ALTER TABLE dim_workflow_stages
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS description TEXT,
      ADD COLUMN IF NOT EXISTS created_by VARCHAR(255),
      ADD COLUMN IF NOT EXISTS created_by_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS require_attachments BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS assigned_users JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS color VARCHAR(50),
      ADD COLUMN IF NOT EXISTS stage_description TEXT,
      ADD COLUMN IF NOT EXISTS companies JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS departments JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS activation_settings JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS allowed_roles JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS allowed_users_list JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS auto_notifications JSONB DEFAULT '{"email":false,"whatsapp":false}'
  `);
}

/** Mapeia linhas de stages para o objeto WorkflowTemplate */
function buildWorkflowFromStages(rows: any[]): any {
  if (rows.length === 0) return null;
  const first = rows[0];
  return {
    id: first.workflow_fb_id,
    name: first.workflow_name,
    description: first.description || '',
    isActive: first.is_active ?? true,
    createdAt: first.created_at,
    createdBy: first.created_by,
    createdByName: first.created_by_name,
    companies: first.companies || [],
    departments: first.departments || [],
    activationSettings: first.activation_settings || {},
    stages: rows
      .filter(r => r.stage_firebase_id)
      .sort((a, b) => (a.stage_order ?? 0) - (b.stage_order ?? 0))
      .map(r => ({
        id: r.stage_firebase_id,
        name: r.stage_name,
        description: r.stage_description || '',
        stageType: r.stage_type || 'validation',
        order: r.stage_order,
        isInitialStage: r.is_initial ?? false,
        isFinalStage: r.is_final ?? false,
        requireComment: r.require_comment ?? false,
        requireAttachments: r.require_attachments ?? false,
        assignedUsers: r.assigned_users || [],
        allowedRoles: r.allowed_roles || [],
        allowedUsers: r.allowed_users_list || [],
        autoNotifications: r.auto_notifications || { email: false, whatsapp: false },
        color: r.color || '#8b5cf6',
      })),
  };
}

// GET - Listar workflows ou carregar um específico
export async function GET(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await ensureColumns(client);

    const { searchParams } = new URL(request.url);
    const isActiveParam = searchParams.get('isActive');
    const companyId = searchParams.get('companyId');
    const workflowId = searchParams.get('id');

    if (workflowId) {
      // Carregar workflow específico com todas as suas stages
      const result = await client.query(`
        SELECT
          workflow_fb_id,
          workflow_name,
          is_active,
          description,
          created_by,
          created_by_name,
          companies,
          departments,
          activation_settings,
          firebase_id   AS stage_firebase_id,
          stage_name,
          stage_description,
          stage_type,
          stage_order,
          is_initial,
          is_final,
          require_comment,
          require_attachments,
          assigned_users,
          color
        FROM dim_workflow_stages
        WHERE workflow_fb_id = $1
        ORDER BY stage_order ASC
      `, [workflowId]);

      const workflow = buildWorkflowFromStages(result.rows);
      if (!workflow) {
        return NextResponse.json({ success: false, error: 'Workflow not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: workflow });
    }

    // Listar todos os workflows (uma linha por workflow, pegando metadados da primeira stage)
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (isActiveParam !== null) {
      whereClause += ` AND is_active = $${paramIndex}`;
      params.push(isActiveParam === 'true');
      paramIndex++;
    }

    const result = await client.query(`
      SELECT
        w.workflow_fb_id AS id,
        w.workflow_name  AS name,
        w.is_active      AS "isActive",
        w.description,
        w.created_by     AS "createdBy",
        w.created_by_name AS "createdByName",
        w.companies,
        w.departments,
        cnt.stage_count  AS "stageCount"
      FROM (
        SELECT DISTINCT ON (workflow_fb_id)
          workflow_fb_id, workflow_name, is_active, description,
          created_by, created_by_name, companies, departments
        FROM dim_workflow_stages
        ${whereClause}
        ORDER BY workflow_fb_id, stage_order ASC
      ) w
      JOIN (
        SELECT workflow_fb_id, COUNT(*) AS stage_count
        FROM dim_workflow_stages
        GROUP BY workflow_fb_id
      ) cnt ON cnt.workflow_fb_id = w.workflow_fb_id
      ORDER BY w.workflow_name
    `, params);

    return NextResponse.json({ success: true, data: result.rows });

  } catch (error: any) {
    console.error('❌ Erro ao listar workflows:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}

// POST - Criar/Atualizar workflow
export async function POST(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await ensureColumns(client);

    const body = await request.json();
    const {
      workflowId,
      name,
      description,
      stages,
      companies,
      departments,
      isActive,
      createdBy,
      createdByName,
    } = body;

    await client.query('BEGIN');

    if (stages && stages.length > 0) {
      // Substituição completa: deletar stages antigas e inserir novas
      await client.query(
        'DELETE FROM dim_workflow_stages WHERE workflow_fb_id = $1',
        [workflowId]
      );

      for (const stage of stages) {
        await client.query(`
          INSERT INTO dim_workflow_stages (
            firebase_id, workflow_fb_id, workflow_name, description,
            stage_name, stage_description, stage_type, stage_order,
            is_initial, is_final, require_comment, require_attachments,
            assigned_users, color, is_active,
            created_by, created_by_name, companies, departments
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        `, [
          stage.id || `${workflowId}_stage_${stage.order ?? 0}`,
          workflowId,
          name,
          description || '',
          stage.name,
          stage.description || '',
          stage.stageType || stage.type || 'validation',
          stage.order ?? 0,
          stage.isInitialStage ?? stage.isInitial ?? false,
          stage.isFinalStage ?? stage.isFinal ?? false,
          stage.requireComment || false,
          stage.requireAttachments || false,
          JSON.stringify(stage.assignedUsers || []),
          stage.color || '#8b5cf6',
          isActive ?? true,
          createdBy || '',
          createdByName || '',
          JSON.stringify(companies || []),
          JSON.stringify(departments || []),
        ]);
      }
    } else {
      // Atualização parcial: apenas metadados (sem tocar nas stages)
      const updates: string[] = [];
      const vals: any[] = [];
      let i = 1;
      if (name        !== undefined) { updates.push(`workflow_name = $${i++}`);    vals.push(name); }
      if (description !== undefined) { updates.push(`description = $${i++}`);      vals.push(description); }
      if (isActive    !== undefined) { updates.push(`is_active = $${i++}`);        vals.push(isActive); }
      if (companies   !== undefined) { updates.push(`companies = $${i++}`);        vals.push(JSON.stringify(companies)); }
      if (departments !== undefined) { updates.push(`departments = $${i++}`);      vals.push(JSON.stringify(departments)); }
      if (updates.length > 0) {
        vals.push(workflowId);
        await client.query(
          `UPDATE dim_workflow_stages SET ${updates.join(', ')} WHERE workflow_fb_id = $${i}`,
          vals
        );
      }
    }

    await client.query('COMMIT');
    console.log(`✅ PostgreSQL: workflow ${workflowId} salvo com ${stages?.length ?? 0} etapas`);

    return NextResponse.json({ success: true, data: { workflow_id: workflowId } });

  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Erro ao salvar workflow:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}

// PATCH - Atualizar is_active ou activation_settings
export async function PATCH(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await ensureColumns(client);

    const body = await request.json();
    const { workflowId, isActive, activationSettings } = body;

    if (!workflowId) {
      return NextResponse.json({ success: false, error: 'Workflow ID required' }, { status: 400 });
    }

    if (isActive !== undefined) {
      await client.query(
        'UPDATE dim_workflow_stages SET is_active = $1 WHERE workflow_fb_id = $2',
        [isActive, workflowId]
      );
    }

    if (activationSettings !== undefined) {
      await client.query(
        'UPDATE dim_workflow_stages SET activation_settings = $1 WHERE workflow_fb_id = $2',
        [JSON.stringify(activationSettings), workflowId]
      );
    }

    console.log(`✅ PostgreSQL: workflow ${workflowId} atualizado`);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('❌ Erro ao atualizar workflow:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}

// DELETE - Deletar workflow
export async function DELETE(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const { searchParams } = new URL(request.url);
    const workflowId = searchParams.get('id');

    if (!workflowId) {
      return NextResponse.json({ success: false, error: 'Workflow ID required' }, { status: 400 });
    }

    await client.query(
      'DELETE FROM dim_workflow_stages WHERE workflow_fb_id = $1',
      [workflowId]
    );

    console.log(`✅ PostgreSQL: workflow ${workflowId} deletado`);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('❌ Erro ao deletar workflow:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}
