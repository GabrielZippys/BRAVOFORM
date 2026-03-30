-- ============================================================================
-- BravoForm: Migração para Star Schema com Surrogate Keys
-- Execução: psql -h 34.39.165.146 -U ipanema -d formbravo-8854e-database -f 001_create_star_schema.sql
-- ============================================================================

BEGIN;

-- ============================================================================
-- DIMENSÕES
-- ============================================================================

-- dim_companies
CREATE TABLE IF NOT EXISTS dim_companies (
    company_key  SERIAL       PRIMARY KEY,
    firebase_id  VARCHAR(255) UNIQUE NOT NULL,
    name         VARCHAR(500) NOT NULL,
    created_at   TIMESTAMP
);

-- dim_departments
CREATE TABLE IF NOT EXISTS dim_departments (
    department_key  SERIAL       PRIMARY KEY,
    firebase_id     VARCHAR(255) UNIQUE NOT NULL,
    company_key     INTEGER      REFERENCES dim_companies(company_key),
    name            VARCHAR(500) NOT NULL,
    created_at      TIMESTAMP
);

-- dim_users
CREATE TABLE IF NOT EXISTS dim_users (
    user_key     SERIAL       PRIMARY KEY,
    firebase_id  VARCHAR(255) UNIQUE NOT NULL,
    name         VARCHAR(500),
    email        VARCHAR(500),
    role         VARCHAR(100),
    company_key  INTEGER REFERENCES dim_companies(company_key),
    department_key INTEGER REFERENCES dim_departments(department_key),
    created_at   TIMESTAMP
);

-- dim_collaborators
CREATE TABLE IF NOT EXISTS dim_collaborators (
    collaborator_key  SERIAL       PRIMARY KEY,
    firebase_id       VARCHAR(255) UNIQUE NOT NULL,
    uid               VARCHAR(255),
    username          VARCHAR(500) NOT NULL,
    name              VARCHAR(500),
    email             VARCHAR(500),
    role              VARCHAR(100) DEFAULT 'collaborator',
    active            BOOLEAN      DEFAULT TRUE,
    company_key       INTEGER REFERENCES dim_companies(company_key),
    department_key    INTEGER REFERENCES dim_departments(department_key),
    department_name   VARCHAR(255),
    can_view_history  BOOLEAN DEFAULT FALSE,
    can_edit_history  BOOLEAN DEFAULT FALSE,
    created_at        TIMESTAMP
);

-- dim_forms
CREATE TABLE IF NOT EXISTS dim_forms (
    form_key       SERIAL       PRIMARY KEY,
    firebase_id    VARCHAR(255) UNIQUE NOT NULL,
    title          VARCHAR(500) NOT NULL,
    description    TEXT,
    company_key    INTEGER REFERENCES dim_companies(company_key),
    department_key INTEGER REFERENCES dim_departments(department_key),
    department_name VARCHAR(255),
    is_active      BOOLEAN      DEFAULT TRUE,
    fields_json    JSONB,
    created_at     TIMESTAMP,
    updated_at     TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dim_forms_fields ON dim_forms USING GIN(fields_json);

-- dim_product_catalogs
CREATE TABLE IF NOT EXISTS dim_product_catalogs (
    catalog_key    SERIAL       PRIMARY KEY,
    firebase_id    VARCHAR(255) UNIQUE NOT NULL,
    name           VARCHAR(500) NOT NULL,
    description    TEXT,
    company_key    INTEGER REFERENCES dim_companies(company_key),
    display_field  VARCHAR(255),
    search_fields  TEXT,
    value_field    VARCHAR(255),
    created_at     TIMESTAMP,
    updated_at     TIMESTAMP
);

-- dim_products
CREATE TABLE IF NOT EXISTS dim_products (
    product_key     SERIAL       PRIMARY KEY,
    firebase_id     VARCHAR(255) UNIQUE NOT NULL,
    catalog_key     INTEGER      REFERENCES dim_product_catalogs(catalog_key),
    name            VARCHAR(500) NOT NULL,
    codigo          VARCHAR(255),
    ean             VARCHAR(255),
    unidade         VARCHAR(50),
    quantidade_max  INTEGER,
    quantidade_min  INTEGER,
    preco_atual     NUMERIC(12,2),
    estoque         INTEGER,
    company_key     INTEGER REFERENCES dim_companies(company_key),
    created_at      TIMESTAMP,
    updated_at      TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dim_products_catalog ON dim_products(catalog_key);
CREATE INDEX IF NOT EXISTS idx_dim_products_codigo  ON dim_products(codigo);

-- dim_workflow_stages
CREATE TABLE IF NOT EXISTS dim_workflow_stages (
    stage_key       SERIAL       PRIMARY KEY,
    firebase_id     VARCHAR(255) UNIQUE NOT NULL,
    workflow_fb_id  VARCHAR(255) NOT NULL,
    workflow_name   VARCHAR(500),
    stage_name      VARCHAR(255) NOT NULL,
    stage_type      VARCHAR(50),
    stage_order     INTEGER,
    is_initial      BOOLEAN DEFAULT FALSE,
    is_final        BOOLEAN DEFAULT FALSE,
    require_comment BOOLEAN DEFAULT FALSE
);

-- ============================================================================
-- FATOS
-- ============================================================================

-- fact_form_response
CREATE TABLE IF NOT EXISTS fact_form_response (
    response_key        SERIAL       PRIMARY KEY,
    firebase_id         VARCHAR(255) UNIQUE NOT NULL,
    form_key            INTEGER      REFERENCES dim_forms(form_key),
    company_key         INTEGER      REFERENCES dim_companies(company_key),
    department_key      INTEGER      REFERENCES dim_departments(department_key),
    collaborator_key    INTEGER      REFERENCES dim_collaborators(collaborator_key),
    form_title          VARCHAR(500),
    department_name     VARCHAR(255),
    collaborator_username VARCHAR(255),
    status              VARCHAR(50),
    current_stage_fb_id VARCHAR(255),
    submitted_at        TIMESTAMP    NOT NULL,
    created_at          TIMESTAMP,
    deleted_at          TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ffr_form_submitted ON fact_form_response(form_key, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_ffr_company_dept   ON fact_form_response(company_key, department_key);
CREATE INDEX IF NOT EXISTS idx_ffr_firebase       ON fact_form_response(firebase_id);

-- fact_answers
CREATE TABLE IF NOT EXISTS fact_answers (
    answer_key      SERIAL       PRIMARY KEY,
    response_key    INTEGER      NOT NULL REFERENCES fact_form_response(response_key),
    form_key        INTEGER,
    field_id        VARCHAR(255) NOT NULL,
    field_label     VARCHAR(500),
    field_type      VARCHAR(50),
    input_type      VARCHAR(50),
    answer_text     TEXT,
    answer_number   NUMERIC,
    answer_date     DATE,
    answer_boolean  BOOLEAN,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fa_response   ON fact_answers(response_key);
CREATE INDEX IF NOT EXISTS idx_fa_form       ON fact_answers(form_key);
CREATE INDEX IF NOT EXISTS idx_fa_field      ON fact_answers(field_id);
CREATE INDEX IF NOT EXISTS idx_fa_input_type ON fact_answers(input_type);

-- fact_order_items
CREATE TABLE IF NOT EXISTS fact_order_items (
    order_item_key    SERIAL       PRIMARY KEY,
    response_key      INTEGER      NOT NULL REFERENCES fact_form_response(response_key),
    form_key          INTEGER,
    field_id          VARCHAR(255),
    field_label       VARCHAR(500),
    item_index        INTEGER NOT NULL,
    product_fb_id     VARCHAR(255),
    product_key       INTEGER,
    product_name_snap VARCHAR(500) NOT NULL,
    product_code_snap VARCHAR(100),
    price_snap        NUMERIC(12,2),
    quantity          NUMERIC      NOT NULL,
    unit              VARCHAR(50),
    subtotal          NUMERIC(12,2),
    catalog_key       INTEGER REFERENCES dim_product_catalogs(catalog_key),
    extra_data        JSONB,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_foi_response ON fact_order_items(response_key);
CREATE INDEX IF NOT EXISTS idx_foi_product  ON fact_order_items(product_fb_id);
CREATE INDEX IF NOT EXISTS idx_foi_form     ON fact_order_items(form_key);

-- fact_checkbox_answers
CREATE TABLE IF NOT EXISTS fact_checkbox_answers (
    checkbox_key    SERIAL       PRIMARY KEY,
    response_key    INTEGER      NOT NULL REFERENCES fact_form_response(response_key),
    form_key        INTEGER,
    field_id        VARCHAR(255) NOT NULL,
    field_label     VARCHAR(500),
    option_value    TEXT         NOT NULL,
    option_index    INTEGER      NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fca_response ON fact_checkbox_answers(response_key);
CREATE INDEX IF NOT EXISTS idx_fca_field    ON fact_checkbox_answers(field_id);

-- fact_table_answers
CREATE TABLE IF NOT EXISTS fact_table_answers (
    table_answer_key  SERIAL       PRIMARY KEY,
    response_key      INTEGER      NOT NULL REFERENCES fact_form_response(response_key),
    form_key          INTEGER,
    field_id          VARCHAR(255) NOT NULL,
    field_label       VARCHAR(500),
    table_data        JSONB        NOT NULL,
    row_count         INTEGER,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fta_response ON fact_table_answers(response_key);
CREATE INDEX IF NOT EXISTS idx_fta_data     ON fact_table_answers USING GIN(table_data);

-- fact_attachments
CREATE TABLE IF NOT EXISTS fact_attachments (
    attachment_key  SERIAL       PRIMARY KEY,
    response_key    INTEGER      NOT NULL REFERENCES fact_form_response(response_key),
    form_key        INTEGER,
    field_id        VARCHAR(255),
    field_label     VARCHAR(500),
    field_type      VARCHAR(50),
    file_url        TEXT NOT NULL,
    file_name       VARCHAR(500),
    file_type       VARCHAR(100),
    file_size_kb    INTEGER,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- fact_workflow_history
CREATE TABLE IF NOT EXISTS fact_workflow_history (
    history_key         SERIAL       PRIMARY KEY,
    response_key        INTEGER      REFERENCES fact_form_response(response_key),
    form_key            INTEGER,
    stage_key           INTEGER      REFERENCES dim_workflow_stages(stage_key),
    stage_name_snap     VARCHAR(255),
    workflow_name_snap  VARCHAR(255),
    action_type         VARCHAR(50),
    performed_by_key    INTEGER,
    performed_by_name   VARCHAR(255),
    comment             TEXT,
    entered_at          TIMESTAMP,
    completed_at        TIMESTAMP,
    duration_minutes    INTEGER,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fwh_response ON fact_workflow_history(response_key);
CREATE INDEX IF NOT EXISTS idx_fwh_stage    ON fact_workflow_history(stage_key);

-- ============================================================================
-- VIEWS PARA POWER BI
-- ============================================================================

-- vw_respostas_planas
CREATE OR REPLACE VIEW vw_respostas_planas AS
SELECT
    fr.response_key, fr.firebase_id AS response_id,
    f.form_key, f.firebase_id AS form_id, f.title AS form_title,
    c.company_key, c.name AS empresa,
    d.department_key, d.name AS departamento,
    col.collaborator_key, col.username AS colaborador,
    fr.status, fr.submitted_at,
    a.field_label, a.field_type, a.input_type,
    a.answer_text, a.answer_number, a.answer_date, a.answer_boolean,
    COALESCE(a.answer_number::TEXT, a.answer_text) AS valor_unificado
FROM fact_form_response fr
JOIN dim_forms f        ON fr.form_key = f.form_key
JOIN dim_companies c    ON fr.company_key = c.company_key
LEFT JOIN dim_departments d  ON fr.department_key = d.department_key
LEFT JOIN dim_collaborators col ON fr.collaborator_key = col.collaborator_key
JOIN fact_answers a     ON fr.response_key = a.response_key
WHERE fr.deleted_at IS NULL;

-- vw_pedidos_produtos
CREATE OR REPLACE VIEW vw_pedidos_produtos AS
SELECT
    fr.response_key, fr.submitted_at,
    f.title AS formulario,
    c.name AS empresa, d.name AS departamento,
    col.username AS colaborador,
    oi.field_label AS grade_nome,
    oi.product_fb_id, oi.product_name_snap, oi.product_code_snap,
    oi.quantity, oi.unit, oi.price_snap, oi.subtotal,
    p.preco_atual,
    pc.name AS catalogo
FROM fact_form_response fr
JOIN dim_forms f              ON fr.form_key = f.form_key
JOIN dim_companies c          ON fr.company_key = c.company_key
LEFT JOIN dim_departments d        ON fr.department_key = d.department_key
LEFT JOIN dim_collaborators col    ON fr.collaborator_key = col.collaborator_key
JOIN fact_order_items oi      ON fr.response_key = oi.response_key
LEFT JOIN dim_products p      ON oi.product_key = p.product_key
LEFT JOIN dim_product_catalogs pc ON oi.catalog_key = pc.catalog_key
WHERE fr.deleted_at IS NULL;

-- vw_sla_workflow
CREATE OR REPLACE VIEW vw_sla_workflow AS
SELECT
    fr.firebase_id AS response_id,
    f.title AS formulario,
    d.name AS departamento,
    wh.workflow_name_snap,
    wh.stage_name_snap,
    wh.action_type,
    wh.performed_by_name,
    wh.entered_at, wh.completed_at,
    wh.duration_minutes,
    CASE
        WHEN wh.duration_minutes <= 60   THEN 'Dentro do SLA'
        WHEN wh.duration_minutes <= 1440 THEN 'Atenção'
        ELSE 'SLA Estourado'
    END AS sla_status
FROM fact_workflow_history wh
JOIN fact_form_response fr ON wh.response_key = fr.response_key
JOIN dim_forms f           ON fr.form_key = f.form_key
LEFT JOIN dim_departments d     ON fr.department_key = d.department_key;

COMMIT;
