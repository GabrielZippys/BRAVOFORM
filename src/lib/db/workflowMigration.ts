/**
 * Migração idempotente das colunas do workflow de Retirada.
 *
 * Espelha scripts/sql/002_workflow_retirada.sql, mas pode ser executada
 * dentro de qualquer rota antes do primeiro SELECT/UPDATE que dependa
 * dessas colunas. Idempotente: usa ADD COLUMN IF NOT EXISTS / CREATE
 * INDEX IF NOT EXISTS / CREATE OR REPLACE VIEW.
 *
 * Por que existe:
 *   O codebase já adota o padrão de "auto-migrate on first call" em
 *   /api/dataconnect/responses (ALTER TABLE ... ADD deleted_at). Aqui
 *   centralizamos a versão do schema do BravoFlow para evitar repetir
 *   o ALTER em 3+ rotas.
 *
 * Cache: usa um flag em memória para garantir que cada instância serverless
 * só rode o ALTER uma vez por processo.
 */

let migrationApplied = false;

export async function ensureWorkflowSchema(client: any): Promise<void> {
  if (migrationApplied) return;

  await client.query(`
    -- dim_collaborators: lista de papéis BravoFlow
    ALTER TABLE dim_collaborators
      ALTER COLUMN role SET DEFAULT 'Colaborador';
    ALTER TABLE dim_collaborators
      ADD COLUMN IF NOT EXISTS roles JSONB DEFAULT '[]'::jsonb;

    -- fact_form_response: aprovação / réplica / cancelamento
    ALTER TABLE fact_form_response
      ADD COLUMN IF NOT EXISTS approved_at           TIMESTAMP,
      ADD COLUMN IF NOT EXISTS approved_by           VARCHAR(255),
      ADD COLUMN IF NOT EXISTS approved_by_username  VARCHAR(255),
      ADD COLUMN IF NOT EXISTS rejected_at           TIMESTAMP,
      ADD COLUMN IF NOT EXISTS rejected_by           VARCHAR(255),
      ADD COLUMN IF NOT EXISTS rejected_by_username  VARCHAR(255),
      ADD COLUMN IF NOT EXISTS rejection_reason      TEXT,
      ADD COLUMN IF NOT EXISTS parent_response_fb_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS replica_count         INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS motorista              VARCHAR(255),
      ADD COLUMN IF NOT EXISTS placa                  VARCHAR(50),
      ADD COLUMN IF NOT EXISTS boletim                TEXT,
      ADD COLUMN IF NOT EXISTS protocolo_cancelamento VARCHAR(255),
      ADD COLUMN IF NOT EXISTS motivo_cancelamento    TEXT,
      ADD COLUMN IF NOT EXISTS setor_entrega          VARCHAR(255),
      ADD COLUMN IF NOT EXISTS endereco_entrega       TEXT,
      ADD COLUMN IF NOT EXISTS dias_entrega           VARCHAR(255),
      ADD COLUMN IF NOT EXISTS produto_existe_nf      BOOLEAN,
      ADD COLUMN IF NOT EXISTS pdf_nota_fiscal_url    TEXT;
  `);

  // Índices em comandos separados (CREATE INDEX IF NOT EXISTS não aceita
  // ser misturado com ALTER TABLE no mesmo statement em algumas versões)
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_dim_collaborators_role  ON dim_collaborators(role);
    CREATE INDEX IF NOT EXISTS idx_dim_collaborators_roles ON dim_collaborators USING GIN(roles);
    CREATE INDEX IF NOT EXISTS idx_ffr_status              ON fact_form_response(status);
    CREATE INDEX IF NOT EXISTS idx_ffr_current_stage       ON fact_form_response(current_stage_fb_id);
    CREATE INDEX IF NOT EXISTS idx_ffr_parent_response     ON fact_form_response(parent_response_fb_id);
    CREATE INDEX IF NOT EXISTS idx_ffr_motorista           ON fact_form_response(motorista);
  `);

  migrationApplied = true;
  console.log('✅ ensureWorkflowSchema: migração aplicada (ou já estava em dia)');
}
