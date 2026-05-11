/**
 * BravoForm — Schema para Lookup Sources (campos de busca em formulários).
 *
 * Permite admin cadastrar fontes de dados de qualquer tabela do PG e
 * usá-las em formulários como campos "lookup" — colaborador digita um ID
 * e o sistema mostra os dados relacionados (nome, empresa, etc.) antes
 * dele continuar.
 *
 * Use case típico:
 *   • Admin tem tabela `funcionarios` populada via ETL do RH (5000 reg)
 *   • Cria uma Lookup Source apontando para essa tabela
 *   • Define: coluna de busca = "matricula", colunas exibidas = "nome, setor, empresa"
 *   • Adiciona campo "Lookup" no formulário com essa Source
 *   • Colaborador no workflow digita matrícula, vê seus dados, segue
 *
 * Segurança:
 *   • Apenas tabelas com Lookup Source cadastrada podem ser consultadas
 *   • Apenas colunas declaradas em display_columns podem ser retornadas
 *   • Rate limit no endpoint público de query
 */

let migrationApplied = false;

export async function ensureLookupSchema(client: any): Promise<void> {
  if (migrationApplied) return;

  await client.query(`
    CREATE TABLE IF NOT EXISTS dim_lookup_sources (
      source_id         BIGSERIAL    PRIMARY KEY,
      firebase_id       VARCHAR(255) UNIQUE NOT NULL,

      name              VARCHAR(255) NOT NULL,
      description       TEXT,

      -- Tabela do PostgreSQL onde buscar
      table_name        VARCHAR(255) NOT NULL,
      -- Schema do PG (default: public)
      schema_name       VARCHAR(255) DEFAULT 'public',

      -- Coluna usada para buscar pelo valor digitado pelo colaborador
      search_column     VARCHAR(255) NOT NULL,
      -- Tipo da coluna de busca (text, integer, uuid) — usado pra cast
      search_column_type VARCHAR(50) DEFAULT 'text',

      -- Colunas a exibir após match. Formato:
      -- [ { "column": "name", "label": "Nome" },
      --   { "column": "company", "label": "Empresa" } ]
      display_columns   JSONB        NOT NULL DEFAULT '[]'::jsonb,

      -- Estado
      is_active         BOOLEAN      DEFAULT TRUE,

      -- Auditoria
      created_at        TIMESTAMP    DEFAULT NOW(),
      created_by        VARCHAR(255),
      created_by_name   VARCHAR(255),
      updated_at        TIMESTAMP    DEFAULT NOW(),
      deleted_at        TIMESTAMP
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_lookup_sources_firebase_id
      ON dim_lookup_sources(firebase_id);
    CREATE INDEX IF NOT EXISTS idx_lookup_sources_active
      ON dim_lookup_sources(is_active) WHERE deleted_at IS NULL;
  `);

  migrationApplied = true;
  console.log('✅ ensureLookupSchema: dim_lookup_sources pronto');
}
