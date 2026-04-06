import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';

// Garante que a tabela existe antes de qualquer operação
async function ensureTable(client: any) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS fact_workflow_instances (
      instance_key    SERIAL       PRIMARY KEY,
      instance_id     VARCHAR(255) NOT NULL UNIQUE,
      workflow_fb_id  VARCHAR(255) NOT NULL,
      workflow_name   VARCHAR(500),
      current_stage_id    VARCHAR(255),
      current_stage_index INTEGER  DEFAULT 0,
      assigned_to     VARCHAR(255),
      assigned_to_name    VARCHAR(255),
      status          VARCHAR(50)  DEFAULT 'in_progress',
      started_at      TIMESTAMP    DEFAULT NOW(),
      completed_at    TIMESTAMP,
      stage_history   JSONB        DEFAULT '[]',
      field_data      JSONB        DEFAULT '{}',
      company_id      VARCHAR(255),
      department_id   VARCHAR(255),
      created_at      TIMESTAMP    DEFAULT NOW(),
      updated_at      TIMESTAMP    DEFAULT NOW()
    )
  `);
}

// GET - Listar instâncias com filtros
export async function GET(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureTable(client);

    const { searchParams } = new URL(request.url);
    const instanceId  = searchParams.get('id');
    const workflowId  = searchParams.get('workflowId');
    const status      = searchParams.get('status');
    const assignedTo  = searchParams.get('assignedTo');
    const companyId   = searchParams.get('companyId');
    const departmentId = searchParams.get('departmentId');

    // Buscar instância específica por ID
    if (instanceId) {
      const res = await client.query(
        'SELECT * FROM fact_workflow_instances WHERE instance_id = $1',
        [instanceId]
      );
      if (res.rows.length === 0) {
        return NextResponse.json({ success: false, error: 'Instância não encontrada' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: mapRow(res.rows[0]) });
    }

    // Montar filtros dinâmicos
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (workflowId)   { conditions.push(`workflow_fb_id = $${idx++}`);  params.push(workflowId); }
    if (status)       { conditions.push(`status = $${idx++}`);          params.push(status); }
    if (assignedTo)   { conditions.push(`assigned_to = $${idx++}`);     params.push(assignedTo); }
    if (companyId)    { conditions.push(`company_id = $${idx++}`);      params.push(companyId); }
    if (departmentId) { conditions.push(`department_id = $${idx++}`);   params.push(departmentId); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const res = await client.query(
      `SELECT * FROM fact_workflow_instances ${where} ORDER BY started_at DESC`,
      params
    );

    return NextResponse.json({ success: true, data: res.rows.map(mapRow) });
  } catch (error: any) {
    console.error('❌ Erro ao listar instâncias:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}

// POST - Criar nova instância
export async function POST(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureTable(client);
    const body = await request.json();
    const {
      workflowId, workflowName, assignedTo, assignedToName,
      companyId, departmentId, status,
      currentStageId, currentStageIndex, stageHistory, fieldData,
    } = body;

    const instanceId = `wf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const res = await client.query(`
      INSERT INTO fact_workflow_instances (
        instance_id, workflow_fb_id, workflow_name,
        current_stage_id, current_stage_index,
        assigned_to, assigned_to_name, status,
        stage_history, field_data, company_id, department_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12)
      RETURNING *
    `, [
      instanceId, workflowId, workflowName || '',
      currentStageId || '', currentStageIndex ?? 0,
      assignedTo || '', assignedToName || '',
      status || 'in_progress',
      JSON.stringify(stageHistory || []),
      JSON.stringify(fieldData || {}),
      companyId || '', departmentId || '',
    ]);

    console.log(`✅ Instância criada: ${instanceId}`);
    return NextResponse.json({ success: true, data: mapRow(res.rows[0]) });
  } catch (error: any) {
    console.error('❌ Erro ao criar instância:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}

// PATCH - Atualizar instância (avançar etapa, cancelar, etc.)
export async function PATCH(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureTable(client);
    const body = await request.json();
    const {
      instanceId, status, currentStageId, currentStageIndex,
      assignedTo, assignedToName, stageHistory, fieldData, completedAt,
    } = body;

    if (!instanceId) {
      return NextResponse.json({ success: false, error: 'instanceId obrigatório' }, { status: 400 });
    }

    const sets: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    let idx = 1;

    if (status !== undefined)             { sets.push(`status = $${idx++}`);                params.push(status); }
    if (currentStageId !== undefined)     { sets.push(`current_stage_id = $${idx++}`);      params.push(currentStageId); }
    if (currentStageIndex !== undefined)  { sets.push(`current_stage_index = $${idx++}`);   params.push(currentStageIndex); }
    if (assignedTo !== undefined)         { sets.push(`assigned_to = $${idx++}`);           params.push(assignedTo); }
    if (assignedToName !== undefined)     { sets.push(`assigned_to_name = $${idx++}`);      params.push(assignedToName); }
    if (stageHistory !== undefined)       { sets.push(`stage_history = $${idx++}::jsonb`);  params.push(JSON.stringify(stageHistory)); }
    if (fieldData !== undefined)          { sets.push(`field_data = $${idx++}::jsonb`);     params.push(JSON.stringify(fieldData)); }
    if (completedAt !== undefined)        { sets.push(`completed_at = $${idx++}`);          params.push(completedAt); }

    params.push(instanceId);
    const res = await client.query(
      `UPDATE fact_workflow_instances SET ${sets.join(', ')} WHERE instance_id = $${idx} RETURNING *`,
      params
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Instância não encontrada' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: mapRow(res.rows[0]) });
  } catch (error: any) {
    console.error('❌ Erro ao atualizar instância:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}

// DELETE - Deletar instância
export async function DELETE(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureTable(client);
    const { searchParams } = new URL(request.url);
    const instanceId = searchParams.get('id');

    if (!instanceId) {
      return NextResponse.json({ success: false, error: 'ID obrigatório' }, { status: 400 });
    }

    await client.query('DELETE FROM fact_workflow_instances WHERE instance_id = $1', [instanceId]);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ Erro ao deletar instância:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}

// Mapeia linha do banco para o formato WorkflowInstance usado no front
function mapRow(row: any) {
  return {
    id:                 row.instance_id,
    workflowId:         row.workflow_fb_id,
    workflowName:       row.workflow_name,
    currentStageId:     row.current_stage_id,
    currentStageIndex:  row.current_stage_index,
    assignedTo:         row.assigned_to,
    assignedToName:     row.assigned_to_name,
    status:             row.status,
    startedAt:          row.started_at,
    completedAt:        row.completed_at,
    stageHistory:       row.stage_history || [],
    fieldData:          row.field_data || {},
    companyId:          row.company_id,
    departmentId:       row.department_id,
  };
}
