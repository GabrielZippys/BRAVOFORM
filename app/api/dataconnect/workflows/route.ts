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
        // SLA preditivo
        slaTargetMinutes: r.sla_target_minutes ?? undefined,
        slaWarnThreshold: r.sla_warn_threshold ?? 80,
        slaCriticalThreshold: r.sla_critical_threshold ?? 100,
        slaBreachThreshold: r.sla_breach_threshold ?? 150,
        slaEscalateToRole: r.sla_escalate_to_role ?? undefined,
        slaEscalateToEmails: r.sla_escalate_to_emails ?? [],
        // Advanced flow (Sprint 6)
        subWorkflowId: r.sub_workflow_id ?? undefined,
        subWorkflowMode: r.sub_workflow_mode ?? 'wait',
        subWorkflowInputMapping: r.sub_workflow_input_mapping ?? {},
        parallelMinPathsToComplete: r.parallel_min_paths_to_complete ?? undefined,
        parallelTimeoutMinutes: r.parallel_timeout_minutes ?? undefined,
      })),
  };
}

// GET - Listar workflows ou carregar um específico
export async function GET(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await ensureColumns(client);

    // ⚠️ TODAS as migrations precisam rodar antes do SELECT — o GET pode
    // ser chamado em produção ANTES de qualquer POST que normalmente
    // disparasse essas migrations. Sem isso, colunas como sub_workflow_id,
    // sla_target_minutes etc. não existem e o SELECT quebra com 500.
    const { ensureWorkflowsTable } = await import('@/lib/db/workflowsTableMigration');
    const { ensureSlaSchema } = await import('@/lib/db/slaMigration');
    const { ensureAdvancedFlowSchema } = await import('@/lib/db/advancedFlowMigration');
    await ensureWorkflowsTable(client);
    await ensureSlaSchema(client);
    await ensureAdvancedFlowSchema(client);

    const { searchParams } = new URL(request.url);
    const isActiveParam = searchParams.get('isActive');
    const companyId = searchParams.get('companyId');
    const workflowId = searchParams.get('id');

    if (workflowId) {
      // ─── Carregar workflow específico ─────────────────────────────────────
      // 1) Metadados vêm de dim_workflows (existe mesmo se não houver stages)
      const wfMeta = await client.query(`
        SELECT firebase_id, name, description, is_active,
               companies, departments, activation_settings,
               created_by, created_by_name, created_at
        FROM dim_workflows
        WHERE firebase_id = $1
          AND deleted_at IS NULL
      `, [workflowId]);

      if (wfMeta.rows.length === 0) {
        // Fallback para workflows legacy não migrados ainda
        const legacy = await client.query(`
          SELECT
            workflow_fb_id, workflow_name, is_active, description,
            created_by, created_by_name, companies, departments, activation_settings,
            firebase_id   AS stage_firebase_id,
            stage_name, stage_description, stage_type, stage_order,
            is_initial, is_final, require_comment, require_attachments,
            assigned_users, color,
            sla_target_minutes, sla_warn_threshold, sla_critical_threshold,
            sla_breach_threshold, sla_escalate_to_role, sla_escalate_to_emails,
            sub_workflow_id, sub_workflow_mode, sub_workflow_input_mapping,
            parallel_min_paths_to_complete, parallel_timeout_minutes
          FROM dim_workflow_stages
          WHERE workflow_fb_id = $1
          ORDER BY stage_order ASC
        `, [workflowId]);

        const workflow = buildWorkflowFromStages(legacy.rows);
        if (!workflow) {
          return NextResponse.json({ success: false, error: 'Workflow not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true, data: workflow });
      }

      const meta = wfMeta.rows[0];

      // 2) Stages do workflow (pode estar vazio se workflow recém-criado)
      const stagesRes = await client.query(`
        SELECT
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
          color,
          sla_target_minutes,
          sla_warn_threshold,
          sla_critical_threshold,
          sla_breach_threshold,
          sla_escalate_to_role,
          sla_escalate_to_emails,
          sub_workflow_id,
          sub_workflow_mode,
          sub_workflow_input_mapping,
          parallel_min_paths_to_complete,
          parallel_timeout_minutes
        FROM dim_workflow_stages
        WHERE workflow_fb_id = $1
        ORDER BY stage_order ASC
      `, [workflowId]);

      // Constrói o workflow combinando metadados + stages
      const workflow = {
        id: meta.firebase_id,
        name: meta.name,
        description: meta.description || '',
        isActive: meta.is_active ?? true,
        createdAt: meta.created_at,
        createdBy: meta.created_by,
        createdByName: meta.created_by_name,
        companies: meta.companies || [],
        departments: meta.departments || [],
        activationSettings: meta.activation_settings || {},
        stages: stagesRes.rows
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
            slaTargetMinutes: r.sla_target_minutes ?? undefined,
            slaWarnThreshold: r.sla_warn_threshold ?? 80,
            slaCriticalThreshold: r.sla_critical_threshold ?? 100,
            slaBreachThreshold: r.sla_breach_threshold ?? 150,
            slaEscalateToRole: r.sla_escalate_to_role ?? undefined,
            slaEscalateToEmails: r.sla_escalate_to_emails ?? [],
            subWorkflowId: r.sub_workflow_id ?? undefined,
            subWorkflowMode: r.sub_workflow_mode ?? 'wait',
            subWorkflowInputMapping: r.sub_workflow_input_mapping ?? {},
            parallelMinPathsToComplete: r.parallel_min_paths_to_complete ?? undefined,
            parallelTimeoutMinutes: r.parallel_timeout_minutes ?? undefined,
          })),
      };

      return NextResponse.json({ success: true, data: workflow });
    }

    // ─── Listar todos os workflows ───────────────────────────────────────
    // Usa dim_workflows como base (workflow existe mesmo sem stages).
    let whereClause = 'WHERE w.deleted_at IS NULL';
    const params: any[] = [];
    let paramIndex = 1;

    if (isActiveParam !== null) {
      whereClause += ` AND w.is_active = $${paramIndex}`;
      params.push(isActiveParam === 'true');
      paramIndex++;
    }

    const result = await client.query(`
      SELECT
        w.firebase_id      AS id,
        w.name,
        w.is_active        AS "isActive",
        w.description,
        w.created_by       AS "createdBy",
        w.created_by_name  AS "createdByName",
        w.companies,
        w.departments,
        w.activation_settings AS "activationSettings",
        w.created_at       AS "createdAt",
        COALESCE(cnt.stage_count, 0)::int AS "stageCount"
      FROM dim_workflows w
      LEFT JOIN (
        SELECT workflow_fb_id, COUNT(*) AS stage_count
        FROM dim_workflow_stages
        GROUP BY workflow_fb_id
      ) cnt ON cnt.workflow_fb_id = w.firebase_id
      ${whereClause}
      ORDER BY w.created_at DESC, w.name ASC
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

    // Garante tabela master dim_workflows (fonte de verdade dos metadados)
    const { upsertWorkflow } = await import('@/lib/db/workflowsTableMigration');

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
      activationSettings,
    } = body;

    if (!workflowId || !name) {
      return NextResponse.json(
        { success: false, error: 'workflowId e name são obrigatórios' },
        { status: 400 }
      );
    }

    await client.query('BEGIN');

    // ⚠️ Sempre faz UPSERT em dim_workflows, INDEPENDENTE de ter stages.
    // Isso resolve o bug de "workflow criado sem etapas não aparece na lista".
    await upsertWorkflow(client, {
      workflowId,
      name,
      description,
      isActive,
      companies,
      departments,
      activationSettings,
      createdBy,
      createdByName,
    });

    if (stages && stages.length > 0) {
      // ⚠️ INVARIANTES garantidas no backend:
      //   1) `stage_order` é sempre um inteiro contíguo começando em 0
      //   2) A etapa com `stage_order = 0` é SEMPRE marcada como inicial
      //   3) A última etapa (sem aresta de saída no canvas) é marcada como final
      //
      // Mesmo que o frontend envie order/isInitialStage incorretos, o backend
      // recalcula a ordem com base na posição no array recebido (que já vem
      // ordenado por posição X do canvas).
      //
      // Substituição completa: deleta stages antigas e insere novas
      await client.query(
        'DELETE FROM dim_workflow_stages WHERE workflow_fb_id = $1',
        [workflowId]
      );

      // Reordenar para garantir contiguidade (caso venha com gaps)
      const orderedStages = [...stages].sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));

      // Garante colunas SLA + advanced flow antes do INSERT (idempotente)
      const { ensureSlaSchema } = await import('@/lib/db/slaMigration');
      const { ensureAdvancedFlowSchema } = await import('@/lib/db/advancedFlowMigration');
      await ensureSlaSchema(client);
      await ensureAdvancedFlowSchema(client);

      for (let idx = 0; idx < orderedStages.length; idx++) {
        const stage = orderedStages[idx];
        const isFirst = idx === 0;
        const isLast  = idx === orderedStages.length - 1;

        await client.query(`
          INSERT INTO dim_workflow_stages (
            firebase_id, workflow_fb_id, workflow_name, description,
            stage_name, stage_description, stage_type, stage_order,
            is_initial, is_final, require_comment, require_attachments,
            assigned_users, color, is_active,
            created_by, created_by_name, companies, departments,
            sla_target_minutes, sla_warn_threshold, sla_critical_threshold, sla_breach_threshold,
            sla_escalate_to_role, sla_escalate_to_emails,
            sub_workflow_id, sub_workflow_mode, sub_workflow_input_mapping,
            parallel_min_paths_to_complete, parallel_timeout_minutes
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
            $20,$21,$22,$23,$24,$25,
            $26,$27,$28,$29,$30
          )
        `, [
          stage.id || `${workflowId}_stage_${idx}`,
          workflowId,
          name,
          description || '',
          stage.name,
          stage.description || '',
          stage.stageType || stage.type || 'validation',
          idx,
          isFirst,
          isLast || (stage.isFinalStage ?? false),
          stage.requireComment || false,
          stage.requireAttachments || false,
          JSON.stringify(stage.assignedUsers || []),
          stage.color || '#8b5cf6',
          isActive ?? true,
          createdBy || '',
          createdByName || '',
          JSON.stringify(companies || []),
          JSON.stringify(departments || []),
          stage.slaTargetMinutes || null,
          stage.slaWarnThreshold ?? 80,
          stage.slaCriticalThreshold ?? 100,
          stage.slaBreachThreshold ?? 150,
          stage.slaEscalateToRole || null,
          JSON.stringify(stage.slaEscalateToEmails || []),
          stage.subWorkflowId || null,
          stage.subWorkflowMode || 'wait',
          JSON.stringify(stage.subWorkflowInputMapping || {}),
          stage.parallelMinPathsToComplete ?? null,
          stage.parallelTimeoutMinutes ?? null,
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
    const { ensureWorkflowsTable } = await import('@/lib/db/workflowsTableMigration');
    await ensureWorkflowsTable(client);

    const body = await request.json();
    const { workflowId, isActive, activationSettings, name, description, companies, departments } = body;

    if (!workflowId) {
      return NextResponse.json({ success: false, error: 'Workflow ID required' }, { status: 400 });
    }

    // Atualiza dim_workflows (master)
    const updates: string[] = [];
    const values: any[] = [];
    let i = 1;

    if (isActive !== undefined) {
      updates.push(`is_active = $${i++}`);
      values.push(isActive);
    }
    if (name !== undefined) {
      updates.push(`name = $${i++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${i++}`);
      values.push(description);
    }
    if (companies !== undefined) {
      updates.push(`companies = $${i++}`);
      values.push(JSON.stringify(companies));
    }
    if (departments !== undefined) {
      updates.push(`departments = $${i++}`);
      values.push(JSON.stringify(departments));
    }
    if (activationSettings !== undefined) {
      updates.push(`activation_settings = $${i++}`);
      values.push(JSON.stringify(activationSettings));
    }

    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`);
      values.push(workflowId);
      await client.query(
        `UPDATE dim_workflows SET ${updates.join(', ')} WHERE firebase_id = $${i}`,
        values
      );
    }

    // Mantém compatibilidade com dim_workflow_stages (denormalização legacy)
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

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('❌ Erro ao atualizar workflow:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}

// DELETE - Deletar workflow (soft delete em dim_workflows + hard delete em stages)
export async function DELETE(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const { ensureWorkflowsTable } = await import('@/lib/db/workflowsTableMigration');
    await ensureWorkflowsTable(client);

    const { searchParams } = new URL(request.url);
    const workflowId = searchParams.get('id');

    if (!workflowId) {
      return NextResponse.json({ success: false, error: 'Workflow ID required' }, { status: 400 });
    }

    await client.query('BEGIN');

    // Soft delete em dim_workflows (preserva trilha de auditoria)
    await client.query(
      `UPDATE dim_workflows
       SET deleted_at = NOW()
       WHERE firebase_id = $1`,
      [workflowId]
    );

    // Hard delete em dim_workflow_stages (não tem auditoria — pode ir)
    await client.query(
      'DELETE FROM dim_workflow_stages WHERE workflow_fb_id = $1',
      [workflowId]
    );

    await client.query('COMMIT');
    return NextResponse.json({ success: true });

  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Erro ao deletar workflow:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}
