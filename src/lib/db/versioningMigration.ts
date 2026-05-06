/**
 * BravoForm — Workflow Versioning
 *
 * Permite ter múltiplas versões de UM workflow:
 *   • v1 = active     → versão em produção (instâncias novas usam essa)
 *   • v2 = draft      → admin está editando, ainda não publicada
 *   • v0 = archived   → versão anterior, mantida para rastreabilidade
 *
 * Apenas 1 versão active por workflow. Instâncias em andamento ficam
 * "pinned" na versão em que foram criadas (workflow_version_id), não
 * são afetadas por mudanças posteriores.
 *
 * Pattern adotado por: Mendix, Flowable, Temporal, Camunda.
 *
 * Schema:
 *   dim_workflow_versions
 *     workflow_fb_id  → FK lógico para o workflow
 *     version_number  → INTEGER 1, 2, 3...
 *     status          → 'draft' | 'active' | 'archived'
 *     stages_json     → snapshot completo das stages na publicação
 *     published_at, published_by, ...
 *
 *   fact_form_response (acrescentado)
 *     workflow_version_id  → version do workflow no momento da criação
 *
 * Compatibilidade: para workflows pré-versioning, NULL em workflow_version_id
 * indica "use a versão active corrente" (graceful fallback).
 */

let migrationApplied = false;

export async function ensureVersioningSchema(client: any): Promise<void> {
  if (migrationApplied) return;

  // Tabela de versões
  await client.query(`
    CREATE TABLE IF NOT EXISTS dim_workflow_versions (
      version_id        BIGSERIAL    PRIMARY KEY,

      workflow_fb_id    VARCHAR(255) NOT NULL,
      version_number    INTEGER      NOT NULL,
      status            VARCHAR(16)  NOT NULL DEFAULT 'draft',

      -- Snapshot completo das etapas no momento da publicação
      stages_json       JSONB        NOT NULL DEFAULT '[]'::jsonb,
      activation_json   JSONB        DEFAULT '{}'::jsonb,
      metadata_json     JSONB        DEFAULT '{}'::jsonb,

      -- Auditoria
      created_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
      created_by        VARCHAR(255),
      created_by_name   VARCHAR(255),
      published_at      TIMESTAMP,
      published_by      VARCHAR(255),
      published_by_name VARCHAR(255),
      archived_at       TIMESTAMP,
      archived_by       VARCHAR(255),

      -- Notas de release (changelog do admin)
      change_notes      TEXT,

      CONSTRAINT chk_version_status CHECK (status IN ('draft', 'active', 'archived')),
      CONSTRAINT uq_workflow_version UNIQUE (workflow_fb_id, version_number)
    )
  `);

  // Índices
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_workflow_versions_wf
      ON dim_workflow_versions(workflow_fb_id);
    CREATE INDEX IF NOT EXISTS idx_workflow_versions_status
      ON dim_workflow_versions(workflow_fb_id, status);
    CREATE INDEX IF NOT EXISTS idx_workflow_versions_active
      ON dim_workflow_versions(workflow_fb_id) WHERE status = 'active';
  `);

  // Garante apenas 1 versão active por workflow (constraint via partial unique index)
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_per_workflow
      ON dim_workflow_versions(workflow_fb_id)
      WHERE status = 'active';
  `);

  // Adiciona pinning em fact_form_response
  await client.query(`
    ALTER TABLE fact_form_response
      ADD COLUMN IF NOT EXISTS workflow_version_id BIGINT;
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_ffr_workflow_version
      ON fact_form_response(workflow_version_id);
  `);

  migrationApplied = true;
  console.log('✅ ensureVersioningSchema: versioning schema aplicado');
}
