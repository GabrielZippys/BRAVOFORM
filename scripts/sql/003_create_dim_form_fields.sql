-- ============================================================================
-- BravoForm: dim_form_fields — Dimensão de Campos de Formulário
-- Versão: 1.0  |  Data: 2026-03-30
-- Objetivo: Uma linha por campo por formulário, com field_id já separado.
--           Elimina a necessidade de ETL sobre fields_json no Power BI.
--           Campos Tabela incluem definições de linhas e colunas em JSONB.
-- Execução: psql -h 34.39.165.146 -U ipanema -d formbravo-8854e-database -f 003_create_dim_form_fields.sql
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Criar tabela dim_form_fields
-- ============================================================================

CREATE TABLE IF NOT EXISTS dim_form_fields (
    field_key          SERIAL       PRIMARY KEY,
    form_key           INTEGER      NOT NULL REFERENCES dim_forms(form_key) ON DELETE CASCADE,
    form_fb_id         VARCHAR(255) NOT NULL,   -- firebase_id do formulário (evita JOIN frequente)
    field_id           VARCHAR(255) NOT NULL,   -- ID do campo dentro do formulário
    field_label        VARCHAR(500),            -- rótulo legível do campo
    field_type         VARCHAR(100),            -- 'Tabela' | 'Grade de Pedidos' | 'Texto' | 'Data' | etc.
    input_type         VARCHAR(100),            -- subtipo: 'table' | 'order' | 'text' | 'number' | 'date' | etc.
    field_order        INTEGER,                 -- posição no formulário (0-based)
    is_required        BOOLEAN      DEFAULT FALSE,
    -- Campos Tabela e Grade de Pedidos: estrutura de linhas e colunas
    table_rows_json    JSONB,   -- [{"id":"row_seg","label":"Segunda-feira"}, ...]
    table_columns_json JSONB,   -- [{"id":"col_aberto","label":"Aberto/Fechado","type":"select"}, ...]
    -- Campos de seleção: opções disponíveis
    options_json       JSONB,   -- ["Opção A", "Opção B", "Opção C"]
    UNIQUE (form_key, field_id)
);

CREATE INDEX IF NOT EXISTS idx_dff_form     ON dim_form_fields(form_key);
CREATE INDEX IF NOT EXISTS idx_dff_field_id ON dim_form_fields(field_id);
CREATE INDEX IF NOT EXISTS idx_dff_type     ON dim_form_fields(field_type);
CREATE INDEX IF NOT EXISTS idx_dff_rows     ON dim_form_fields USING GIN(table_rows_json)    WHERE table_rows_json    IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dff_cols     ON dim_form_fields USING GIN(table_columns_json) WHERE table_columns_json IS NOT NULL;

-- ============================================================================
-- 2. Popular a partir do fields_json já existente em dim_forms
--    Usa jsonb_array_elements WITH ORDINALITY para preservar a ordem
-- ============================================================================

INSERT INTO dim_form_fields (
    form_key, form_fb_id,
    field_id, field_label, field_type, input_type,
    field_order, is_required,
    table_rows_json, table_columns_json, options_json
)
SELECT
    df.form_key,
    df.firebase_id                            AS form_fb_id,
    f.value->>'id'                            AS field_id,
    f.value->>'label'                         AS field_label,
    f.value->>'type'                          AS field_type,
    -- input_type: usa o campo do Firestore se existir, senão infere do type
    COALESCE(
        NULLIF(f.value->>'inputType', ''),
        CASE f.value->>'type'
            WHEN 'Tabela'           THEN 'table'
            WHEN 'Grade de Pedidos' THEN 'order'
            WHEN 'Caixa de Seleção' THEN 'checkbox'
            WHEN 'Data'             THEN 'date'
            WHEN 'Assinatura'       THEN 'signature'
            WHEN 'Anexo'            THEN 'attachment'
            WHEN 'Cabeçalho'        THEN 'header'
            WHEN 'Múltipla Escolha' THEN 'radio'
            ELSE 'text'
        END
    )                                         AS input_type,
    (f.ordinality - 1)::INTEGER               AS field_order,
    COALESCE((f.value->>'required')::BOOLEAN, FALSE) AS is_required,
    -- Linhas da Tabela / Grade
    CASE
        WHEN f.value->>'type' IN ('Tabela', 'Grade de Pedidos')
             AND jsonb_typeof(f.value->'rows') = 'array'
        THEN f.value->'rows'
        ELSE NULL
    END                                       AS table_rows_json,
    -- Colunas da Tabela / Grade
    CASE
        WHEN f.value->>'type' IN ('Tabela', 'Grade de Pedidos')
             AND jsonb_typeof(f.value->'columns') = 'array'
        THEN f.value->'columns'
        ELSE NULL
    END                                       AS table_columns_json,
    -- Opções de seleção (Múltipla Escolha, Caixa de Seleção)
    CASE
        WHEN f.value->>'type' IN ('Múltipla Escolha', 'Caixa de Seleção')
             AND jsonb_typeof(f.value->'options') = 'array'
        THEN f.value->'options'
        ELSE NULL
    END                                       AS options_json
FROM dim_forms df
-- Explode o array de campos
JOIN LATERAL jsonb_array_elements(df.fields_json) WITH ORDINALITY AS f(value, ordinality)
    ON TRUE
WHERE df.fields_json IS NOT NULL
  AND jsonb_typeof(df.fields_json) = 'array'
  AND (f.value->>'id') IS NOT NULL        -- descarta entradas sem id
  AND (f.value->>'type') != 'Cabeçalho'  -- campos visuais sem resposta não precisam entrar
ON CONFLICT (form_key, field_id) DO UPDATE
    SET field_label        = EXCLUDED.field_label,
        field_type         = EXCLUDED.field_type,
        input_type         = EXCLUDED.input_type,
        field_order        = EXCLUDED.field_order,
        is_required        = EXCLUDED.is_required,
        table_rows_json    = EXCLUDED.table_rows_json,
        table_columns_json = EXCLUDED.table_columns_json,
        options_json       = EXCLUDED.options_json;

COMMIT;

-- ============================================================================
-- Verificação
-- ============================================================================

SELECT
    df.firebase_id          AS form_fb_id,
    df.title                AS formulario,
    COUNT(dff.field_key)    AS total_campos,
    COUNT(*) FILTER (WHERE dff.field_type = 'Tabela')           AS campos_tabela,
    COUNT(*) FILTER (WHERE dff.field_type = 'Grade de Pedidos') AS campos_grade,
    COUNT(*) FILTER (WHERE dff.field_type = 'Caixa de Seleção') AS campos_checkbox,
    COUNT(*) FILTER (WHERE dff.table_rows_json IS NOT NULL)     AS com_linhas_definidas,
    COUNT(*) FILTER (WHERE dff.table_columns_json IS NOT NULL)  AS com_colunas_definidas
FROM dim_form_fields dff
JOIN dim_forms df ON dff.form_key = df.form_key
GROUP BY df.firebase_id, df.title
ORDER BY df.title;

SELECT COUNT(*) AS total_campos_dim FROM dim_form_fields;
