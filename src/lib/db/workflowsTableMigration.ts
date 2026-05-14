/**
 * BravoForm — Tabela dim_workflows (master de metadados).
 *
 * Antes desta migration, os metadados de workflow viviam denormalizados
 * em dim_workflow_stages.workflow_name (replicados em todas as etapas).
 * Isso causava o bug: workflows criados SEM etapas (no setup modal antes
 * de ir pro canvas) não tinham nenhuma linha em dim_workflow_stages e
 * portanto não apareciam na lista.
 *
 * Solução: dim_workflows é a fonte de verdade dos metadados. As etapas
 * em dim_workflow_stages continuam existindo (com FK lógica via
 * workflow_fb_id) mas o workflow EXISTE mesmo sem etapas.
 *
 * Backfill: ao rodar a migration pela primeira vez, popula dim_workflows
 * com workflows existentes em dim_workflow_stages (DISTINCT workflow_fb_id).
 *
 * Idempotente — chama IF NOT EXISTS / ON CONFLICT DO NOTHING.
 */

let migrationApplied = false;

export async function ensureWorkflowsTable(client: any): Promise<void> {
  if (migrationApplied) return;

  // Tabela master
  await client.query(`
    CREATE TABLE IF NOT EXISTS dim_workflows (
      workflow_id          BIGSERIAL    PRIMARY KEY,
      firebase_id          VARCHAR(255) UNIQUE NOT NULL,

      name                 VARCHAR(500) NOT NULL,
      description          TEXT,
      is_active            BOOLEAN      DEFAULT TRUE,

      companies            JSONB        DEFAULT '[]'::jsonb,
      departments          JSONB        DEFAULT '[]'::jsonb,
      activation_settings  JSONB        DEFAULT '{}'::jsonb,
      metadata             JSONB        DEFAULT '{}'::jsonb,

      created_at           TIMESTAMP    DEFAULT NOW(),
      created_by           VARCHAR(255),
      created_by_name      VARCHAR(255),
      updated_at           TIMESTAMP    DEFAULT NOW(),

      deleted_at           TIMESTAMP,
      deleted_by           VARCHAR(255)
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_dim_workflows_firebase_id
      ON dim_workflows(firebase_id);
    CREATE INDEX IF NOT EXISTS idx_dim_workflows_active
      ON dim_workflows(is_active) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_dim_workflows_companies
      ON dim_workflows USING GIN(companies);
  `);

  // viewers: JSONB array de { id, username, name } — usuários que podem
  // acompanhar o histórico das instâncias desse workflow (read-only).
  // Idempotente — ADD COLUMN IF NOT EXISTS.
  await client.query(`
    ALTER TABLE dim_workflows
      ADD COLUMN IF NOT EXISTS viewers JSONB DEFAULT '[]'::jsonb;
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_dim_workflows_viewers
      ON dim_workflows USING GIN(viewers);
  `);

  // Backfill: popula dim_workflows com workflows existentes em dim_workflow_stages
  // (apenas se a tabela master estiver vazia — primeira execução)
  const countRes = await client.query(`SELECT COUNT(*)::int AS c FROM dim_workflows`);
  if ((countRes.rows[0]?.c || 0) === 0) {
    const existing = await client.query(`
      SELECT DISTINCT ON (workflow_fb_id)
        workflow_fb_id,
        workflow_name,
        description,
        is_active,
        companies,
        departments,
        activation_settings,
        created_by,
        created_by_name
      FROM dim_workflow_stages
      WHERE workflow_fb_id IS NOT NULL
      ORDER BY workflow_fb_id, stage_order ASC
    `);

    for (const row of existing.rows) {
      await client.query(
        `INSERT INTO dim_workflows (
          firebase_id, name, description, is_active,
          companies, departments, activation_settings,
          created_by, created_by_name
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (firebase_id) DO NOTHING`,
        [
          row.workflow_fb_id,
          row.workflow_name || 'Workflow sem nome',
          row.description || '',
          row.is_active ?? true,
          JSON.stringify(row.companies || []),
          JSON.stringify(row.departments || []),
          JSON.stringify(row.activation_settings || {}),
          row.created_by,
          row.created_by_name,
        ]
      );
    }

    console.log(`✅ ensureWorkflowsTable: backfill de ${existing.rowCount} workflow(s) existente(s)`);
  }

  migrationApplied = true;
  console.log('✅ ensureWorkflowsTable: dim_workflows pronto');
}

/**
 * UPSERT helper — chama no POST workflows ANTES de processar stages.
 * Cria (ou atualiza) o registro em dim_workflows independente das etapas.
 */
export async function upsertWorkflow(
  client: any,
  params: {
    workflowId: string;
    name: string;
    description?: string;
    isActive?: boolean;
    companies?: string[];
    departments?: string[];
    activationSettings?: any;
    createdBy?: string;
    createdByName?: string;
  }
): Promise<void> {
  await ensureWorkflowsTable(client);

  await client.query(
    `INSERT INTO dim_workflows (
      firebase_id, name, description, is_active,
      companies, departments, activation_settings,
      created_by, created_by_name, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    ON CONFLICT (firebase_id) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      is_active = EXCLUDED.is_active,
      companies = EXCLUDED.companies,
      departments = EXCLUDED.departments,
      activation_settings = EXCLUDED.activation_settings,
      updated_at = NOW()`,
    [
      params.workflowId,
      params.name,
      params.description || '',
      params.isActive ?? true,
      JSON.stringify(params.companies || []),
      JSON.stringify(params.departments || []),
      JSON.stringify(params.activationSettings || {}),
      params.createdBy || null,
      params.createdByName || null,
    ]
  );
}
