-- ============================================================================
-- 004_explode_fact_table_answers.sql
-- Redesign fact_table_answers: one row per CELL instead of one JSONB blob
-- This eliminates concatenated NoSQL data from the analytical database.
-- ============================================================================

-- 1) Drop old table (JSONB blob design)
DROP TABLE IF EXISTS fact_table_answers CASCADE;

-- 2) Recreate with one-row-per-cell design
CREATE TABLE fact_table_answers (
    table_answer_key  SERIAL       PRIMARY KEY,
    response_key      INTEGER      NOT NULL REFERENCES fact_form_response(response_key),
    form_key          INTEGER,
    field_id          VARCHAR(255) NOT NULL,
    field_label       VARCHAR(500),            -- "Horários de Recebimento"
    row_id            VARCHAR(255) NOT NULL,    -- ID da linha (ex: "row_seg", "1753901919619")
    row_label         VARCHAR(500),            -- Label legível (ex: "Segunda-feira")
    column_id         VARCHAR(255) NOT NULL,    -- ID da coluna (ex: "col_aberto", "1753901904913")
    column_label      VARCHAR(500),            -- Label legível (ex: "Aberto/Fechado")
    cell_value        TEXT,                    -- Valor da célula
    row_index         INTEGER,                 -- Posição da linha (0-based)
    column_index      INTEGER,                 -- Posição da coluna (0-based)
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3) Indexes for Power BI performance
CREATE INDEX idx_fta_response ON fact_table_answers(response_key);
CREATE INDEX idx_fta_field    ON fact_table_answers(field_id);
CREATE INDEX idx_fta_row      ON fact_table_answers(row_id);
CREATE INDEX idx_fta_col      ON fact_table_answers(column_id);
CREATE INDEX idx_fta_label    ON fact_table_answers(field_label);

-- 4) Update vw_respostas_planas is not affected (only uses fact_answers)
-- No view changes needed.
