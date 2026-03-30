-- ============================================================================
-- BravoForm: dim_table_structure — Estrutura de Tabelas Explodida
-- Versão: 1.0  |  Data: 2026-03-30
-- Objetivo: Uma linha por combinação (campo, linha, coluna) de campos Tabela.
--           Permite relacionamento direto com fact_table_answers via IDs.
--           Elimina JSONB arrays — tudo relacional puro.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Criar tabela dim_table_structure
-- ============================================================================

CREATE TABLE IF NOT EXISTS dim_table_structure (
    table_structure_key SERIAL       PRIMARY KEY,
    field_key           INTEGER      NOT NULL REFERENCES dim_form_fields(field_key) ON DELETE CASCADE,
    form_key            INTEGER      NOT NULL REFERENCES dim_forms(form_key) ON DELETE CASCADE,
    form_fb_id          VARCHAR(255) NOT NULL,   -- firebase_id do formulário
    field_id            VARCHAR(255) NOT NULL,   -- ID do campo
    field_label         VARCHAR(500),            -- label do campo (desnormalizado para performance)
    field_type          VARCHAR(100),            -- 'Tabela' | 'Grade de Pedidos'
    
    -- Linha da tabela
    row_id              VARCHAR(255) NOT NULL,   -- ID da linha (ex: "row_seg", "row_1770065448344_147")
    row_label           VARCHAR(500),            -- Label da linha (ex: "Segunda-feira", "ALCATRA COMPLETA (PL)")
    row_index           INTEGER,                 -- Posição da linha (0-based)
    
    -- Coluna da tabela
    column_id           VARCHAR(255) NOT NULL,   -- ID da coluna (ex: "col_aberto", "1753899728404")
    column_label        VARCHAR(500),            -- Label da coluna (ex: "Aberto/Fechado", "Estoque (em caixas)")
    column_type         VARCHAR(100),            -- Tipo da coluna: 'text' | 'number' | 'select' | 'date'
    column_index        INTEGER,                 -- Posição da coluna (0-based)
    
    created_at          TIMESTAMP    DEFAULT NOW(),
    
    -- Constraint: combinação única de (field_key, row_id, column_id)
    UNIQUE (field_key, row_id, column_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_dts_field_key  ON dim_table_structure(field_key);
CREATE INDEX IF NOT EXISTS idx_dts_form_key   ON dim_table_structure(form_key);
CREATE INDEX IF NOT EXISTS idx_dts_field_id   ON dim_table_structure(field_id);
CREATE INDEX IF NOT EXISTS idx_dts_row_id     ON dim_table_structure(row_id);
CREATE INDEX IF NOT EXISTS idx_dts_column_id  ON dim_table_structure(column_id);

-- Índice composto para JOIN com fact_table_answers
CREATE INDEX IF NOT EXISTS idx_dts_join_fact 
    ON dim_table_structure(field_id, row_id, column_id);

-- ============================================================================
-- 2. Popular a partir de dim_form_fields (explodir rows × columns)
-- ============================================================================

INSERT INTO dim_table_structure (
    field_key, form_key, form_fb_id, field_id, field_label, field_type,
    row_id, row_label, row_index,
    column_id, column_label, column_type, column_index
)
SELECT
    dff.field_key,
    dff.form_key,
    dff.form_fb_id,
    dff.field_id,
    dff.field_label,
    dff.field_type,
    -- Linha
    row_elem.value->>'id'    AS row_id,
    row_elem.value->>'label' AS row_label,
    (row_elem.ordinality - 1)::INTEGER AS row_index,
    -- Coluna
    col_elem.value->>'id'    AS column_id,
    col_elem.value->>'label' AS column_label,
    COALESCE(col_elem.value->>'type', 'text') AS column_type,
    (col_elem.ordinality - 1)::INTEGER AS column_index
FROM dim_form_fields dff
-- Explode rows
CROSS JOIN LATERAL jsonb_array_elements(dff.table_rows_json) 
    WITH ORDINALITY AS row_elem(value, ordinality)
-- Explode columns
CROSS JOIN LATERAL jsonb_array_elements(dff.table_columns_json) 
    WITH ORDINALITY AS col_elem(value, ordinality)
WHERE dff.field_type IN ('Tabela', 'Grade de Pedidos')
  AND dff.table_rows_json IS NOT NULL
  AND dff.table_columns_json IS NOT NULL
  AND jsonb_typeof(dff.table_rows_json) = 'array'
  AND jsonb_typeof(dff.table_columns_json) = 'array'
ON CONFLICT (field_key, row_id, column_id) DO UPDATE
    SET row_label    = EXCLUDED.row_label,
        row_index    = EXCLUDED.row_index,
        column_label = EXCLUDED.column_label,
        column_type  = EXCLUDED.column_type,
        column_index = EXCLUDED.column_index;

COMMIT;

-- ============================================================================
-- Verificação
-- ============================================================================

-- Total de combinações (células) por formulário
SELECT
    df.title AS formulario,
    dff.field_label AS campo,
    COUNT(*) AS total_celulas,
    COUNT(DISTINCT dts.row_id) AS num_linhas,
    COUNT(DISTINCT dts.column_id) AS num_colunas
FROM dim_table_structure dts
JOIN dim_forms df ON dts.form_key = df.form_key
JOIN dim_form_fields dff ON dts.field_key = dff.field_key
GROUP BY df.title, dff.field_label
ORDER BY total_celulas DESC
LIMIT 10;

-- Total geral
SELECT 
    COUNT(*) AS total_estruturas,
    COUNT(DISTINCT field_key) AS campos_tabela_unicos,
    COUNT(DISTINCT form_key) AS formularios_com_tabela
FROM dim_table_structure;

-- Sample de 10 estruturas
SELECT
    df.title AS formulario,
    dff.field_label AS campo,
    dts.row_label,
    dts.column_label,
    dts.column_type
FROM dim_table_structure dts
JOIN dim_forms df ON dts.form_key = df.form_key
JOIN dim_form_fields dff ON dts.field_key = dff.field_key
ORDER BY dts.table_structure_key
LIMIT 10;
