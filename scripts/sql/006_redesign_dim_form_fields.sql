-- ============================================================================
-- BravoForm: Redesign dim_form_fields — Uma linha por combinação (campo × linha × coluna)
-- Versão: 2.0  |  Data: 2026-03-30
-- Objetivo: Eliminar JSONB concatenado. Para campos Tabela/Grade, cada combinação
--           (campo, row, column) vira uma linha separada.
--           Para campos simples (texto, data, etc.), uma linha por campo.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Backup da estrutura antiga (opcional)
-- ============================================================================
-- Se quiser manter backup, descomente:
-- CREATE TABLE dim_form_fields_old AS SELECT * FROM dim_form_fields;

-- ============================================================================
-- 2. Drop tabelas antigas
-- ============================================================================
DROP TABLE IF EXISTS dim_table_structure CASCADE;
DROP TABLE IF EXISTS dim_form_fields CASCADE;

-- ============================================================================
-- 3. Criar nova dim_form_fields (explodida)
-- ============================================================================

CREATE TABLE dim_form_fields (
    field_key          SERIAL       PRIMARY KEY,
    form_key           INTEGER      NOT NULL REFERENCES dim_forms(form_key) ON DELETE CASCADE,
    form_fb_id         VARCHAR(255) NOT NULL,   -- firebase_id do formulário
    field_id           VARCHAR(255) NOT NULL,   -- ID do campo
    field_label        VARCHAR(500),            -- label do campo
    field_type         VARCHAR(100),            -- 'Tabela' | 'Grade de Pedidos' | 'Texto' | 'Data' | etc.
    input_type         VARCHAR(100),            -- 'table' | 'order' | 'text' | 'number' | 'date' | etc.
    field_order        INTEGER,                 -- posição do campo no formulário (0-based)
    is_required        BOOLEAN      DEFAULT FALSE,
    
    -- Para campos simples (texto, número, data, etc.): NULL
    -- Para campos Tabela/Grade: preenchido
    row_id             VARCHAR(255),            -- ID da linha (ex: "row_seg", "row_1770065448344_147")
    row_label          VARCHAR(500),            -- Label da linha (ex: "Segunda-feira", "ALCATRA COMPLETA")
    row_index          INTEGER,                 -- Posição da linha (0-based)
    
    column_id          VARCHAR(255),            -- ID da coluna (ex: "col_aberto", "1753899728404")
    column_label       VARCHAR(500),            -- Label da coluna (ex: "Aberto/Fechado", "Estoque")
    column_type        VARCHAR(100),            -- Tipo da coluna: 'text' | 'number' | 'select' | 'date'
    column_index       INTEGER,                 -- Posição da coluna (0-based)
    
    -- Para campos de seleção (Múltipla Escolha, Checkbox): opções como array
    -- Mantido como JSONB apenas para opções de select (não é dado de resposta)
    options_json       JSONB,                   -- ["Opção A", "Opção B"] - só para campos de seleção
    
    created_at         TIMESTAMP    DEFAULT NOW(),
    
    -- Constraint: para campos simples, (form_key, field_id) único
    --             para campos Tabela/Grade, (form_key, field_id, row_id, column_id) único
    UNIQUE (form_key, field_id, row_id, column_id)
);

-- Índices para performance
CREATE INDEX idx_dff_form_key   ON dim_form_fields(form_key);
CREATE INDEX idx_dff_field_id   ON dim_form_fields(field_id);
CREATE INDEX idx_dff_field_type ON dim_form_fields(field_type);
CREATE INDEX idx_dff_input_type ON dim_form_fields(input_type);

-- Índice composto para JOIN com fact_table_answers
CREATE INDEX idx_dff_join_fact 
    ON dim_form_fields(field_id, row_id, column_id)
    WHERE row_id IS NOT NULL AND column_id IS NOT NULL;

-- Índice para campos simples (sem row/column)
CREATE INDEX idx_dff_simple_fields
    ON dim_form_fields(field_id)
    WHERE row_id IS NULL AND column_id IS NULL;

-- ============================================================================
-- 4. Popular a partir de dim_forms.fields_json
-- ============================================================================

-- 4.1. Campos SIMPLES (não Tabela/Grade): uma linha por campo
INSERT INTO dim_form_fields (
    form_key, form_fb_id, field_id, field_label, field_type, input_type,
    field_order, is_required, options_json,
    row_id, row_label, row_index, column_id, column_label, column_type, column_index
)
SELECT
    df.form_key,
    df.firebase_id AS form_fb_id,
    f.value->>'id' AS field_id,
    f.value->>'label' AS field_label,
    f.value->>'type' AS field_type,
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
    ) AS input_type,
    (f.ordinality - 1)::INTEGER AS field_order,
    COALESCE((f.value->>'required')::BOOLEAN, FALSE) AS is_required,
    -- Opções para campos de seleção
    CASE
        WHEN f.value->>'type' IN ('Múltipla Escolha', 'Caixa de Seleção')
             AND jsonb_typeof(f.value->'options') = 'array'
        THEN f.value->'options'
        ELSE NULL
    END AS options_json,
    -- Campos de linha/coluna: NULL para campos simples
    NULL AS row_id,
    NULL AS row_label,
    NULL AS row_index,
    NULL AS column_id,
    NULL AS column_label,
    NULL AS column_type,
    NULL AS column_index
FROM dim_forms df
JOIN LATERAL jsonb_array_elements(df.fields_json) WITH ORDINALITY AS f(value, ordinality)
    ON TRUE
WHERE df.fields_json IS NOT NULL
  AND jsonb_typeof(df.fields_json) = 'array'
  AND (f.value->>'id') IS NOT NULL
  AND (f.value->>'type') NOT IN ('Tabela', 'Grade de Pedidos', 'Cabeçalho');

-- 4.2. Campos TABELA/GRADE: uma linha por combinação (campo × row × column)
INSERT INTO dim_form_fields (
    form_key, form_fb_id, field_id, field_label, field_type, input_type,
    field_order, is_required, options_json,
    row_id, row_label, row_index,
    column_id, column_label, column_type, column_index
)
SELECT
    df.form_key,
    df.firebase_id AS form_fb_id,
    f.value->>'id' AS field_id,
    f.value->>'label' AS field_label,
    f.value->>'type' AS field_type,
    CASE f.value->>'type'
        WHEN 'Tabela'           THEN 'table'
        WHEN 'Grade de Pedidos' THEN 'order'
    END AS input_type,
    (f.ordinality - 1)::INTEGER AS field_order,
    COALESCE((f.value->>'required')::BOOLEAN, FALSE) AS is_required,
    NULL AS options_json,
    -- Linha
    row_elem.value->>'id' AS row_id,
    row_elem.value->>'label' AS row_label,
    (row_elem.ordinality - 1)::INTEGER AS row_index,
    -- Coluna
    col_elem.value->>'id' AS column_id,
    col_elem.value->>'label' AS column_label,
    COALESCE(col_elem.value->>'type', 'text') AS column_type,
    (col_elem.ordinality - 1)::INTEGER AS column_index
FROM dim_forms df
JOIN LATERAL jsonb_array_elements(df.fields_json) WITH ORDINALITY AS f(value, ordinality)
    ON TRUE
-- Explode rows
CROSS JOIN LATERAL jsonb_array_elements(f.value->'rows') 
    WITH ORDINALITY AS row_elem(value, ordinality)
-- Explode columns
CROSS JOIN LATERAL jsonb_array_elements(f.value->'columns') 
    WITH ORDINALITY AS col_elem(value, ordinality)
WHERE df.fields_json IS NOT NULL
  AND jsonb_typeof(df.fields_json) = 'array'
  AND (f.value->>'id') IS NOT NULL
  AND (f.value->>'type') IN ('Tabela', 'Grade de Pedidos')
  AND jsonb_typeof(f.value->'rows') = 'array'
  AND jsonb_typeof(f.value->'columns') = 'array';

COMMIT;

-- ============================================================================
-- Verificação
-- ============================================================================

-- Total de linhas por tipo
SELECT
    field_type,
    COUNT(*) AS total_linhas,
    COUNT(DISTINCT field_id) AS campos_unicos,
    COUNT(*) FILTER (WHERE row_id IS NOT NULL) AS linhas_com_row,
    COUNT(*) FILTER (WHERE column_id IS NOT NULL) AS linhas_com_column
FROM dim_form_fields
GROUP BY field_type
ORDER BY total_linhas DESC;

-- Total geral
SELECT 
    COUNT(*) AS total_linhas,
    COUNT(DISTINCT field_id) AS campos_unicos,
    COUNT(DISTINCT form_key) AS formularios
FROM dim_form_fields;

-- Sample de campos simples
SELECT form_fb_id, field_label, field_type, input_type, is_required
FROM dim_form_fields
WHERE row_id IS NULL
LIMIT 10;

-- Sample de campos Tabela (explodidos)
SELECT 
    field_label,
    row_label,
    column_label,
    column_type
FROM dim_form_fields
WHERE row_id IS NOT NULL
LIMIT 10;
