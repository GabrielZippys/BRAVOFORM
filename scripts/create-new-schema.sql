-- ============================================================
-- BravoForm — Novo Schema PostgreSQL (Star Schema)
-- Versão: 2.0  |  Data: 2026-03-30
-- Substitui tabelas antigas por dim_* e fact_* com surrogate keys
-- ============================================================
-- ATENÇÃO: Execute este script ANTES do migrate-to-new-schema.sql
-- As tabelas antigas (companies, form_response, answer, etc.) são
-- preservadas para migração e dropadas ao final do outro script.
-- ============================================================

BEGIN;

-- ============================================================
-- TABELAS DIMENSÃO (dim_*)
-- Cada tabela tem:
--   *_key   SERIAL PRIMARY KEY  → usado nos JOINs e FKs do Power BI
--   firebase_id VARCHAR UNIQUE   → usado pelo Python para UPSERT
-- ============================================================

CREATE TABLE IF NOT EXISTS dim_companies (
    company_key  SERIAL        PRIMARY KEY,
    firebase_id  VARCHAR(255)  UNIQUE NOT NULL,
    name         VARCHAR(500)  NOT NULL,
    created_at   TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dim_comp_fbid ON dim_companies(firebase_id);

-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS dim_departments (
    department_key  SERIAL        PRIMARY KEY,
    firebase_id     VARCHAR(255)  UNIQUE NOT NULL,
    company_key     INTEGER       REFERENCES dim_companies(company_key) ON DELETE SET NULL,
    name            VARCHAR(500)  NOT NULL,
    created_at      TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dim_dept_fbid    ON dim_departments(firebase_id);
CREATE INDEX IF NOT EXISTS idx_dim_dept_company ON dim_departments(company_key);

-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS dim_users (
    user_key        SERIAL        PRIMARY KEY,
    firebase_id     VARCHAR(255)  UNIQUE NOT NULL,
    name            VARCHAR(500),
    email           VARCHAR(500),
    role            VARCHAR(100)  DEFAULT 'Admin',
    company_key     INTEGER       REFERENCES dim_companies(company_key) ON DELETE SET NULL,
    department_key  INTEGER       REFERENCES dim_departments(department_key) ON DELETE SET NULL,
    created_at      TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dim_users_fbid ON dim_users(firebase_id);

-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS dim_collaborators (
    collaborator_key   SERIAL        PRIMARY KEY,
    firebase_id        VARCHAR(255)  UNIQUE NOT NULL,
    uid                VARCHAR(255),
    username           VARCHAR(500)  NOT NULL,
    name               VARCHAR(500),
    email              VARCHAR(500),
    role               VARCHAR(100)  DEFAULT 'collaborator',
    active             BOOLEAN       DEFAULT TRUE,
    company_key        INTEGER       REFERENCES dim_companies(company_key) ON DELETE SET NULL,
    department_key     INTEGER       REFERENCES dim_departments(department_key) ON DELETE SET NULL,
    department_name    VARCHAR(255),
    can_view_history   BOOLEAN       DEFAULT FALSE,
    can_edit_history   BOOLEAN       DEFAULT FALSE,
    created_at         TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dim_collab_fbid    ON dim_collaborators(firebase_id);
CREATE INDEX IF NOT EXISTS idx_dim_collab_company ON dim_collaborators(company_key);
CREATE INDEX IF NOT EXISTS idx_dim_collab_dept    ON dim_collaborators(department_key);

-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS dim_forms (
    form_key        SERIAL        PRIMARY KEY,
    firebase_id     VARCHAR(255)  UNIQUE NOT NULL,
    title           VARCHAR(500)  NOT NULL,
    description     TEXT,
    company_key     INTEGER       REFERENCES dim_companies(company_key) ON DELETE SET NULL,
    department_key  INTEGER       REFERENCES dim_departments(department_key) ON DELETE SET NULL,
    department_name VARCHAR(255),
    is_active       BOOLEAN       DEFAULT TRUE,
    fields_json     JSONB,        -- JSON válido com definição dos campos (não str() Python)
    created_at      TIMESTAMP,
    updated_at      TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dim_forms_fbid    ON dim_forms(firebase_id);
CREATE INDEX IF NOT EXISTS idx_dim_forms_company ON dim_forms(company_key);
CREATE INDEX IF NOT EXISTS idx_dim_forms_fields  ON dim_forms USING GIN(fields_json);

-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS dim_product_catalogs (
    catalog_key    SERIAL        PRIMARY KEY,
    firebase_id    VARCHAR(255)  UNIQUE NOT NULL,
    name           VARCHAR(500)  NOT NULL,
    description    TEXT,
    company_key    INTEGER       REFERENCES dim_companies(company_key) ON DELETE SET NULL,
    display_field  VARCHAR(255),
    search_fields  TEXT,          -- JSON array dos campos pesquisáveis
    value_field    VARCHAR(255),
    created_at     TIMESTAMP,
    updated_at     TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dim_cat_fbid    ON dim_product_catalogs(firebase_id);
CREATE INDEX IF NOT EXISTS idx_dim_cat_company ON dim_product_catalogs(company_key);

-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS dim_products (
    product_key     SERIAL        PRIMARY KEY,
    firebase_id     VARCHAR(255)  UNIQUE NOT NULL,
    catalog_key     INTEGER       REFERENCES dim_product_catalogs(catalog_key) ON DELETE SET NULL,
    company_key     INTEGER       REFERENCES dim_companies(company_key) ON DELETE SET NULL,
    name            VARCHAR(500)  NOT NULL,
    codigo          VARCHAR(255),
    ean             VARCHAR(255),
    unidade         VARCHAR(50),
    quantidade_max  INTEGER,
    quantidade_min  INTEGER,
    preco_atual     NUMERIC(12,2),  -- preço ATUAL — não usar para análises históricas de pedidos
    estoque         INTEGER,
    created_at      TIMESTAMP,
    updated_at      TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dim_prod_fbid    ON dim_products(firebase_id);
CREATE INDEX IF NOT EXISTS idx_dim_prod_catalog ON dim_products(catalog_key);
CREATE INDEX IF NOT EXISTS idx_dim_prod_codigo  ON dim_products(codigo);

-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS dim_workflow_stages (
    stage_key       SERIAL        PRIMARY KEY,
    firebase_id     VARCHAR(255)  UNIQUE NOT NULL,
    workflow_fb_id  VARCHAR(255)  NOT NULL,
    workflow_name   VARCHAR(500),
    stage_name      VARCHAR(255)  NOT NULL,
    stage_type      VARCHAR(50),   -- 'validation'|'execution'|'wait'|'final'
    stage_order     INTEGER,
    is_initial      BOOLEAN       DEFAULT FALSE,
    is_final        BOOLEAN       DEFAULT FALSE,
    require_comment BOOLEAN       DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_dim_wfs_fbid       ON dim_workflow_stages(firebase_id);
CREATE INDEX IF NOT EXISTS idx_dim_wfs_workflow   ON dim_workflow_stages(workflow_fb_id);

-- ============================================================
-- TABELAS FATO (fact_*)
-- Todas as FKs são inteiros (surrogate keys das dim_*)
-- ============================================================

CREATE TABLE IF NOT EXISTS fact_form_response (
    response_key          SERIAL        PRIMARY KEY,
    firebase_id           VARCHAR(255)  UNIQUE NOT NULL,
    form_key              INTEGER       REFERENCES dim_forms(form_key) ON DELETE SET NULL,
    company_key           INTEGER       REFERENCES dim_companies(company_key) ON DELETE SET NULL,
    department_key        INTEGER       REFERENCES dim_departments(department_key) ON DELETE SET NULL,
    collaborator_key      INTEGER       REFERENCES dim_collaborators(collaborator_key) ON DELETE SET NULL,
    -- Caches desnormalizados (evita JOINs extras para filtros comuns no Power BI)
    form_title            VARCHAR(500),
    department_name       VARCHAR(255),
    collaborator_username VARCHAR(255),
    -- Status
    status                VARCHAR(50)   DEFAULT 'submitted',
    current_stage_fb_id   VARCHAR(255),
    -- Datas
    submitted_at          TIMESTAMP     NOT NULL,
    created_at            TIMESTAMP,
    deleted_at            TIMESTAMP     -- NULL = ativa
);
CREATE INDEX IF NOT EXISTS idx_ffr_firebase      ON fact_form_response(firebase_id);
CREATE INDEX IF NOT EXISTS idx_ffr_form_sub      ON fact_form_response(form_key, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_ffr_company_dept  ON fact_form_response(company_key, department_key);
CREATE INDEX IF NOT EXISTS idx_ffr_collab        ON fact_form_response(collaborator_key);
CREATE INDEX IF NOT EXISTS idx_ffr_status        ON fact_form_response(status);
CREATE INDEX IF NOT EXISTS idx_ffr_submitted     ON fact_form_response(submitted_at DESC);

-- -------------------------------------------------------
-- fact_answers: campos simples (texto, número, data, radio, dropdown)
-- NÃO inclui: table, order, checkbox → têm tabelas próprias
-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS fact_answers (
    answer_key      SERIAL        PRIMARY KEY,
    response_key    INTEGER       NOT NULL REFERENCES fact_form_response(response_key) ON DELETE CASCADE,
    form_key        INTEGER,      -- join direto (evita passar por fact_form_response)
    field_id        VARCHAR(255)  NOT NULL,
    field_label     VARCHAR(500),
    field_type      VARCHAR(50),  -- 'Texto'|'Data'|'Múltipla Escolha'|'Assinatura'|'Anexo'
    input_type      VARCHAR(50),  -- subtipo: 'text'|'number'|'decimal'|'email'|'tel'|'paragraph'|'radio'|'dropdown'|'date'
    answer_text     TEXT,
    answer_number   NUMERIC,
    answer_date     DATE,
    answer_boolean  BOOLEAN,
    created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fa_response   ON fact_answers(response_key);
CREATE INDEX IF NOT EXISTS idx_fa_form       ON fact_answers(form_key);
CREATE INDEX IF NOT EXISTS idx_fa_field      ON fact_answers(field_id);
CREATE INDEX IF NOT EXISTS idx_fa_input_type ON fact_answers(input_type);

-- -------------------------------------------------------
-- fact_order_items: Grade de Pedidos — 1 linha por produto
-- SNAPSHOT: preço e nome copiados no momento do envio
-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS fact_order_items (
    order_item_key    SERIAL        PRIMARY KEY,
    response_key      INTEGER       NOT NULL REFERENCES fact_form_response(response_key) ON DELETE CASCADE,
    form_key          INTEGER,
    field_id          VARCHAR(255),
    field_label       VARCHAR(500),
    item_index        INTEGER       NOT NULL DEFAULT 0,
    -- Snapshot do produto (NUNCA alterar retroativamente)
    product_fb_id     VARCHAR(255),
    product_key       INTEGER,     -- dim_products.product_key (só lookup de atributos atuais)
    product_name_snap VARCHAR(500) NOT NULL,
    product_code_snap VARCHAR(100),
    price_snap        NUMERIC(12,2),
    quantity          NUMERIC      NOT NULL DEFAULT 0,
    unit              VARCHAR(50),
    subtotal          NUMERIC(12,2),   -- quantity × price_snap
    catalog_key       INTEGER       REFERENCES dim_product_catalogs(catalog_key) ON DELETE SET NULL,
    extra_data        JSONB,           -- campos adicionais do catálogo
    created_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_foi_response ON fact_order_items(response_key);
CREATE INDEX IF NOT EXISTS idx_foi_form     ON fact_order_items(form_key);
CREATE INDEX IF NOT EXISTS idx_foi_product  ON fact_order_items(product_fb_id);
CREATE INDEX IF NOT EXISTS idx_foi_catalog  ON fact_order_items(catalog_key);

-- -------------------------------------------------------
-- fact_checkbox_answers: Caixa de Seleção — 1 linha por opção marcada
-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS fact_checkbox_answers (
    checkbox_key    SERIAL        PRIMARY KEY,
    response_key    INTEGER       NOT NULL REFERENCES fact_form_response(response_key) ON DELETE CASCADE,
    form_key        INTEGER,
    field_id        VARCHAR(255)  NOT NULL,
    field_label     VARCHAR(500),
    option_value    TEXT          NOT NULL,
    option_index    INTEGER       NOT NULL DEFAULT 0,
    created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fca_response ON fact_checkbox_answers(response_key);
CREATE INDEX IF NOT EXISTS idx_fca_form     ON fact_checkbox_answers(form_key);
CREATE INDEX IF NOT EXISTS idx_fca_field    ON fact_checkbox_answers(field_id);

-- -------------------------------------------------------
-- fact_table_answers: campos Tabela — 1 linha por campo, JSONB completo
-- Evita explosão de linhas; views extraem colunas com operadores JSONB
-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS fact_table_answers (
    table_answer_key  SERIAL        PRIMARY KEY,
    response_key      INTEGER       NOT NULL REFERENCES fact_form_response(response_key) ON DELETE CASCADE,
    form_key          INTEGER,
    field_id          VARCHAR(255)  NOT NULL,
    field_label       VARCHAR(500),
    table_data        JSONB         NOT NULL,
    row_count         INTEGER,
    created_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fta_response ON fact_table_answers(response_key);
CREATE INDEX IF NOT EXISTS idx_fta_form     ON fact_table_answers(form_key);
CREATE INDEX IF NOT EXISTS idx_fta_data     ON fact_table_answers USING GIN(table_data);

-- -------------------------------------------------------
-- fact_attachments: URLs de arquivos e assinaturas (nunca base64)
-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS fact_attachments (
    attachment_key  SERIAL        PRIMARY KEY,
    response_key    INTEGER       NOT NULL REFERENCES fact_form_response(response_key) ON DELETE CASCADE,
    form_key        INTEGER,
    field_id        VARCHAR(255),
    field_label     VARCHAR(500),
    field_type      VARCHAR(50),  -- 'Assinatura' | 'Anexo'
    file_url        TEXT          NOT NULL,
    file_name       VARCHAR(500),
    file_type_mime  VARCHAR(100),
    file_size_kb    INTEGER,
    created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fat_response ON fact_attachments(response_key);
CREATE INDEX IF NOT EXISTS idx_fat_form     ON fact_attachments(form_key);

-- -------------------------------------------------------
-- fact_workflow_history: log de movimentações de workflow
-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS fact_workflow_history (
    history_key         SERIAL        PRIMARY KEY,
    response_key        INTEGER       REFERENCES fact_form_response(response_key) ON DELETE CASCADE,
    form_key            INTEGER,
    stage_key           INTEGER       REFERENCES dim_workflow_stages(stage_key) ON DELETE SET NULL,
    stage_name_snap     VARCHAR(255),
    workflow_name_snap  VARCHAR(255),
    action_type         VARCHAR(50),  -- 'forward'|'backward'|'reassigned'|'validated'|'rejected'
    performed_by_fb_id  VARCHAR(255),
    performed_by_name   VARCHAR(255),
    comment             TEXT,
    entered_at          TIMESTAMP,
    completed_at        TIMESTAMP,
    duration_minutes    INTEGER,
    created_at          TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fwh_response ON fact_workflow_history(response_key);
CREATE INDEX IF NOT EXISTS idx_fwh_stage    ON fact_workflow_history(stage_key);
CREATE INDEX IF NOT EXISTS idx_fwh_action   ON fact_workflow_history(action_type);

COMMIT;

-- ============================================================
-- VIEWS PARA POWER BI
-- ============================================================

CREATE OR REPLACE VIEW vw_respostas_planas AS
SELECT
    fr.response_key,
    fr.firebase_id           AS response_id,
    f.form_key,
    f.firebase_id            AS form_id,
    f.title                  AS form_title,
    c.company_key,
    c.name                   AS empresa,
    d.department_key,
    d.name                   AS departamento,
    col.collaborator_key,
    col.username             AS colaborador,
    col.name                 AS colaborador_nome,
    fr.status,
    fr.submitted_at,
    a.field_id,
    a.field_label,
    a.field_type,
    a.input_type,
    a.answer_text,
    a.answer_number,
    a.answer_date,
    a.answer_boolean,
    COALESCE(a.answer_number::TEXT, a.answer_text) AS valor_unificado
FROM fact_form_response fr
JOIN dim_forms f              ON fr.form_key = f.form_key
JOIN dim_companies c          ON fr.company_key = c.company_key
JOIN dim_departments d        ON fr.department_key = d.department_key
JOIN dim_collaborators col    ON fr.collaborator_key = col.collaborator_key
JOIN fact_answers a           ON fr.response_key = a.response_key
WHERE fr.deleted_at IS NULL;

-- -------------------------------------------------------

CREATE OR REPLACE VIEW vw_pedidos_produtos AS
SELECT
    fr.response_key,
    fr.firebase_id           AS response_id,
    fr.submitted_at,
    f.title                  AS formulario,
    c.name                   AS empresa,
    d.name                   AS departamento,
    col.username             AS colaborador,
    oi.field_label           AS grade_nome,
    oi.item_index,
    oi.product_fb_id,
    oi.product_name_snap,
    oi.product_code_snap,
    oi.quantity,
    oi.unit,
    oi.price_snap,
    oi.subtotal,
    p.preco_atual,           -- preço atual do catálogo (só comparação, não histórico)
    pc.name                  AS catalogo
FROM fact_form_response fr
JOIN dim_forms f                    ON fr.form_key = f.form_key
JOIN dim_companies c                ON fr.company_key = c.company_key
JOIN dim_departments d              ON fr.department_key = d.department_key
JOIN dim_collaborators col          ON fr.collaborator_key = col.collaborator_key
JOIN fact_order_items oi            ON fr.response_key = oi.response_key
LEFT JOIN dim_products p            ON oi.product_key = p.product_key
LEFT JOIN dim_product_catalogs pc   ON oi.catalog_key = pc.catalog_key
WHERE fr.deleted_at IS NULL;

-- -------------------------------------------------------

CREATE OR REPLACE VIEW vw_sla_workflow AS
SELECT
    fr.firebase_id           AS response_id,
    f.title                  AS formulario,
    d.name                   AS departamento,
    wh.workflow_name_snap,
    wh.stage_name_snap,
    wh.action_type,
    wh.performed_by_name,
    wh.entered_at,
    wh.completed_at,
    wh.duration_minutes,
    CASE
        WHEN wh.duration_minutes IS NULL  THEN 'Em andamento'
        WHEN wh.duration_minutes <= 60    THEN 'Dentro do SLA'
        WHEN wh.duration_minutes <= 1440  THEN 'Atenção'
        ELSE 'SLA Estourado'
    END                      AS sla_status
FROM fact_workflow_history wh
JOIN fact_form_response fr  ON wh.response_key = fr.response_key
JOIN dim_forms f            ON fr.form_key = f.form_key
JOIN dim_departments d      ON fr.department_key = d.department_key;

-- -------------------------------------------------------
-- Comentários nas tabelas
-- -------------------------------------------------------

COMMENT ON TABLE dim_companies         IS 'Dimensão: empresas cadastradas no BravoForm';
COMMENT ON TABLE dim_departments       IS 'Dimensão: departamentos por empresa';
COMMENT ON TABLE dim_users             IS 'Dimensão: admins e gestores';
COMMENT ON TABLE dim_collaborators     IS 'Dimensão: colaboradores que preenchem formulários';
COMMENT ON TABLE dim_forms             IS 'Dimensão: metadados dos formulários (fields_json como JSONB válido)';
COMMENT ON TABLE dim_product_catalogs  IS 'Dimensão: catálogos de produtos para Grade de Pedidos';
COMMENT ON TABLE dim_products          IS 'Dimensão: produtos dos catálogos (preco_atual ≠ histórico)';
COMMENT ON TABLE dim_workflow_stages   IS 'Dimensão: etapas de workflow definidas pelos admins';
COMMENT ON TABLE fact_form_response    IS 'Fato: cabeçalho de cada resposta de formulário enviada';
COMMENT ON TABLE fact_answers          IS 'Fato: campos simples respondidos (texto/número/data/radio) — exclui tabela/grade/checkbox';
COMMENT ON TABLE fact_order_items      IS 'Fato: itens de Grade de Pedidos com snapshot de preço e nome';
COMMENT ON TABLE fact_checkbox_answers IS 'Fato: opções marcadas em campos Caixa de Seleção';
COMMENT ON TABLE fact_table_answers    IS 'Fato: dados de campos Tabela como JSONB — use views dedicadas para extrair colunas';
COMMENT ON TABLE fact_attachments      IS 'Fato: URLs de anexos e assinaturas (nunca base64)';
COMMENT ON TABLE fact_workflow_history IS 'Fato: log de movimentações de workflow com duration_minutes';
