/**
 * BravoForm — Schema migration para flows avançados (Sprint 6).
 *
 * Adiciona suporte a:
 *   • Branches paralelos: parallel_path_index, parallel_paths_total,
 *     parallel_paths_completed, parallel_join_target_stage_id
 *   • Sub-workflows: sub_workflow_id, sub_parent_response_fb_id (já existe
 *     parent_response_fb_id que reusamos), sub_invoked_at, sub_completed_at
 *
 * E na tabela dim_workflow_stages:
 *   • sub_workflow_id: aponta pra outro workflow
 *   • sub_workflow_mode: 'wait' | 'fire-and-forget'
 *   • parallel_min_paths_to_complete: int
 *   • parallel_timeout_minutes: int
 *
 * Idempotente — chama ALTER TABLE ADD IF NOT EXISTS.
 */

let migrationApplied = false;

export async function ensureAdvancedFlowSchema(client: any): Promise<void> {
  if (migrationApplied) return;

  // dim_workflow_stages — config de fluxos avançados
  await client.query(`
    ALTER TABLE dim_workflow_stages
      ADD COLUMN IF NOT EXISTS sub_workflow_id                VARCHAR(255),
      ADD COLUMN IF NOT EXISTS sub_workflow_mode              VARCHAR(20) DEFAULT 'wait',
      ADD COLUMN IF NOT EXISTS sub_workflow_input_mapping     JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS parallel_min_paths_to_complete INTEGER,
      ADD COLUMN IF NOT EXISTS parallel_timeout_minutes       INTEGER;
  `);

  // fact_form_response — runtime tracking dos flows avançados
  await client.query(`
    ALTER TABLE fact_form_response
      ADD COLUMN IF NOT EXISTS parallel_path_index           INTEGER,
      ADD COLUMN IF NOT EXISTS parallel_paths_total          INTEGER,
      ADD COLUMN IF NOT EXISTS parallel_join_target          VARCHAR(255),
      ADD COLUMN IF NOT EXISTS parallel_paths_completed      JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS sub_workflow_spawned_id       VARCHAR(255),
      ADD COLUMN IF NOT EXISTS sub_workflow_paused_at        TIMESTAMP,
      ADD COLUMN IF NOT EXISTS sub_workflow_resumed_at       TIMESTAMP,
      ADD COLUMN IF NOT EXISTS is_sub_workflow_instance      BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS sub_parent_stage_id           VARCHAR(255);
  `);

  // Índices para queries comuns
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_ffr_parallel_join
      ON fact_form_response(parallel_join_target)
      WHERE parallel_join_target IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_ffr_sub_workflow
      ON fact_form_response(sub_workflow_spawned_id)
      WHERE sub_workflow_spawned_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_ffr_is_sub_instance
      ON fact_form_response(is_sub_workflow_instance, parent_response_fb_id)
      WHERE is_sub_workflow_instance = TRUE;
  `);

  migrationApplied = true;
  console.log('✅ ensureAdvancedFlowSchema: parallel + sub-workflow schema aplicado');
}
