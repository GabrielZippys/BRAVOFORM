/**
 * BravoForm — Schema para etapa de "Identity Validation" no workflow.
 *
 * Em workflows sem login (público), a primeira etapa pode ser uma
 * IDENTIFICAÇÃO: o colaborador digita seu ID, o sistema busca os dados
 * em uma tabela externa (alimentada pelo Pentaho, por exemplo) e o
 * colaborador confirma "Sou eu". A identidade fica gravada na instância.
 *
 * Adiciona:
 *   • dim_workflow_stages: colunas lookup_* para CONFIG da etapa
 *   • fact_form_response: colunas identity_* para o RESULTADO da validação
 */

let migrationApplied = false;

export async function ensureIdentityValidationSchema(client: any): Promise<void> {
  if (migrationApplied) return;

  // Config da etapa
  await client.query(`
    ALTER TABLE dim_workflow_stages
      ADD COLUMN IF NOT EXISTS lookup_table              VARCHAR(255),
      ADD COLUMN IF NOT EXISTS lookup_search_column      VARCHAR(255),
      ADD COLUMN IF NOT EXISTS lookup_display_columns    JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS lookup_input_label        VARCHAR(255),
      ADD COLUMN IF NOT EXISTS lookup_input_placeholder  VARCHAR(255),
      ADD COLUMN IF NOT EXISTS lookup_confirm_text       VARCHAR(255),
      ADD COLUMN IF NOT EXISTS lookup_require_match      BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS lookup_match_fields       JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS lookup_pre_select         JSONB DEFAULT '{}'::jsonb;
  `);
  // lookup_match_fields: array de { column, label, placeholder }
  //   - Quando vazio: usa lookup_search_column (modo legacy, 1 campo)
  //   - Quando tem N: o user precisa preencher N campos e TODOS precisam
  //     bater com a mesma linha da tabela.
  //
  // lookup_pre_select: { enabled, label, placeholder, required, options[] }
  //   - Antes dos match_fields, mostra um dropdown manual (valores cadastrados
  //     pelo admin). Cada option pode sobrescrever lookupTable e matchFields.
  //   - Caso de uso: "Selecione sua unidade" → SP usa tabela X, RJ usa Y.

  // Identidade validada — fica na resposta/instância
  await client.query(`
    ALTER TABLE fact_form_response
      ADD COLUMN IF NOT EXISTS identity_validated_at     TIMESTAMP,
      ADD COLUMN IF NOT EXISTS identity_table            VARCHAR(255),
      ADD COLUMN IF NOT EXISTS identity_search_column    VARCHAR(255),
      ADD COLUMN IF NOT EXISTS identity_search_value     TEXT,
      ADD COLUMN IF NOT EXISTS identity_data             JSONB,
      ADD COLUMN IF NOT EXISTS identity_label            VARCHAR(500),
      ADD COLUMN IF NOT EXISTS identity_pre_select_value VARCHAR(120);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_ffr_identity_value
      ON fact_form_response(identity_search_value)
      WHERE identity_search_value IS NOT NULL;
  `);

  migrationApplied = true;
  console.log('✅ ensureIdentityValidationSchema: schema aplicado');
}
