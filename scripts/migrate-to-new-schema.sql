-- ============================================================
-- BravoForm — Migração de Dados para o Novo Schema
-- Versão: 2.0  |  Data: 2026-03-30
-- PRÉ-REQUISITO: criar-new-schema.sql já executado
-- ============================================================
-- FLUXO:
--   1. Popula dim_* a partir das tabelas antigas
--   2. Popula fact_form_response a partir de form_response
--   3. Popula fact_answers a partir de answer (campos simples)
--   4. Extrai e popula fact_order_items (Grade → JSON array)
--   5. Extrai e popula fact_checkbox_answers (Checkbox → JSON array)
--   6. Extrai e popula fact_table_answers (Tabela → JSON obj)
--   7. Verificação de contagens
-- ============================================================

BEGIN;

-- ============================================================
-- PASSO 1 — Migrar dimensões
-- ============================================================

-- dim_companies ← companies
INSERT INTO dim_companies (firebase_id, name, created_at)
SELECT id, name, created_at
FROM companies
ON CONFLICT (firebase_id) DO UPDATE
    SET name       = EXCLUDED.name,
        created_at = EXCLUDED.created_at;

-- dim_departments ← departments
INSERT INTO dim_departments (firebase_id, company_key, name, created_at)
SELECT
    d.id,
    dc.company_key,
    d.name,
    d.created_at
FROM departments d
LEFT JOIN dim_companies dc ON dc.firebase_id = d.company_id
ON CONFLICT (firebase_id) DO UPDATE
    SET name        = EXCLUDED.name,
        company_key = EXCLUDED.company_key;

-- dim_users ← users
INSERT INTO dim_users (firebase_id, name, email, role, company_key, department_key, created_at)
SELECT
    u.id,
    u.name,
    u.email,
    COALESCE(u.role, 'Admin'),
    dc.company_key,
    dd.department_key,
    u.created_at
FROM users u
LEFT JOIN dim_companies    dc ON dc.firebase_id = u.company_id
LEFT JOIN dim_departments  dd ON dd.firebase_id = u.department_id
ON CONFLICT (firebase_id) DO UPDATE
    SET name  = EXCLUDED.name,
        email = EXCLUDED.email;

-- dim_collaborators ← collaborators
INSERT INTO dim_collaborators (
    firebase_id, uid, username, name, email, role, active,
    company_key, department_key, department_name,
    can_view_history, can_edit_history, created_at
)
SELECT
    c.id,
    c.uid,
    c.username,
    COALESCE(c.name, c.username),
    c.email,
    COALESCE(c.role, 'collaborator'),
    COALESCE(c.active, TRUE),
    dc.company_key,
    dd.department_key,
    c.department_name,
    COALESCE(c.can_view_history, FALSE),
    COALESCE(c.can_edit_history, FALSE),
    c.created_at
FROM collaborators c
LEFT JOIN dim_companies   dc ON dc.firebase_id = c.company_id
LEFT JOIN dim_departments dd ON dd.firebase_id = c.department_id
ON CONFLICT (firebase_id) DO UPDATE
    SET username    = EXCLUDED.username,
        name        = EXCLUDED.name,
        active      = EXCLUDED.active;

-- dim_product_catalogs ← product_catalogs
INSERT INTO dim_product_catalogs (
    firebase_id, name, description, company_key,
    display_field, search_fields, value_field, created_at, updated_at
)
SELECT
    pc.id,
    pc.name,
    pc.description,
    dc.company_key,
    pc.display_field,
    pc.search_fields,
    pc.value_field,
    pc.created_at,
    pc.updated_at
FROM product_catalogs pc
LEFT JOIN dim_companies dc ON dc.firebase_id = pc.company_id
ON CONFLICT (firebase_id) DO UPDATE
    SET name = EXCLUDED.name;

-- dim_products ← products
INSERT INTO dim_products (
    firebase_id, catalog_key, company_key, name, codigo, ean,
    unidade, quantidade_max, quantidade_min, preco_atual,
    estoque, created_at, updated_at
)
SELECT
    p.id,
    dpc.catalog_key,
    dc.company_key,
    p.name,
    p.codigo,
    p.ean,
    p.unidade,
    p.quantidade_max,
    p.quantidade_min,
    p.preco,
    p.estoque,
    p.created_at,
    p.updated_at
FROM products p
LEFT JOIN dim_product_catalogs dpc ON dpc.firebase_id = p.catalog_id
LEFT JOIN dim_companies        dc  ON dc.firebase_id  = p.company_id
ON CONFLICT (firebase_id) DO UPDATE
    SET name        = EXCLUDED.name,
        preco_atual = EXCLUDED.preco_atual,
        estoque     = EXCLUDED.estoque;

-- dim_forms ← forms
-- fields_json era str() Python — não tenta converter, deixa NULL
-- o script Python irá popular com JSONB válido no próximo SYNC_ALL
INSERT INTO dim_forms (
    firebase_id, title, description, company_key, department_key,
    department_name, is_active, fields_json, created_at, updated_at
)
SELECT
    f.id,
    f.title,
    f.description,
    dc.company_key,
    dd.department_key,
    f.department_name,
    CASE WHEN f.is_active = 1 THEN TRUE ELSE FALSE END,
    NULL,   -- será preenchido pelo sync Python com JSON válido
    f.created_at,
    f.updated_at
FROM forms f
LEFT JOIN dim_companies   dc ON dc.firebase_id = f.company_id
LEFT JOIN dim_departments dd ON dd.firebase_id = f.department_id
ON CONFLICT (firebase_id) DO UPDATE
    SET title   = EXCLUDED.title,
        is_active = EXCLUDED.is_active;

-- ============================================================
-- PASSO 2 — fact_form_response ← form_response
-- ============================================================

INSERT INTO fact_form_response (
    firebase_id, form_key, company_key, department_key, collaborator_key,
    form_title, department_name, collaborator_username,
    status, current_stage_fb_id,
    submitted_at, created_at, deleted_at
)
SELECT
    fr.id,
    df.form_key,
    dc.company_key,
    dd.department_key,
    dco.collaborator_key,
    fr.form_title,
    fr.department_name,
    fr.collaborator_username,
    fr.status,
    fr.current_stage_id,
    fr.submitted_at,
    fr.created_at,
    fr.deleted_at
FROM form_response fr
LEFT JOIN dim_forms        df  ON df.firebase_id  = fr.form_id
LEFT JOIN dim_companies    dc  ON dc.firebase_id  = fr.company_id
LEFT JOIN dim_departments  dd  ON dd.firebase_id  = fr.department_id
LEFT JOIN dim_collaborators dco ON dco.firebase_id = fr.collaborator_id
ON CONFLICT (firebase_id) DO UPDATE
    SET status       = EXCLUDED.status,
        submitted_at = EXCLUDED.submitted_at,
        deleted_at   = EXCLUDED.deleted_at;

-- ============================================================
-- PASSO 3 — fact_answers ← answer (campos simples)
-- Exclui campos tipo Tabela, Grade de Pedidos e Caixa de Seleção
-- que serão tratados nos passos 4, 5 e 6
-- ============================================================

INSERT INTO fact_answers (
    response_key, form_key, field_id, field_label,
    field_type, input_type,
    answer_text, answer_number, answer_date, answer_boolean
)
SELECT
    ffr.response_key,
    ffr.form_key,
    a.field_id,
    a.field_label,
    a.field_type,
    -- Inferir input_type a partir do field_type e valores
    CASE
        WHEN a.field_type IN ('Tabela', 'table')              THEN 'table'
        WHEN a.field_type IN ('Grade de Pedidos', 'order')    THEN 'order'
        WHEN a.field_type IN ('Caixa de Seleção', 'checkbox') THEN 'checkbox'
        WHEN a.field_type IN ('Data', 'date')                 THEN 'date'
        WHEN a.field_type IN ('Assinatura', 'signature')      THEN 'signature'
        WHEN a.field_type IN ('Anexo', 'attachment')          THEN 'attachment'
        WHEN a.field_type IN ('Múltipla Escolha', 'radio')    THEN 'radio'
        WHEN a.answer_boolean IS NOT NULL                      THEN 'boolean'
        WHEN a.answer_number  IS NOT NULL                      THEN 'number'
        WHEN a.answer_date    IS NOT NULL                      THEN 'date'
        ELSE 'text'
    END                     AS input_type,
    a.answer_text,
    a.answer_number,
    a.answer_date,
    a.answer_boolean
FROM answer a
JOIN fact_form_response ffr ON ffr.firebase_id = a.response_id
-- Exclui os tipos que têm tabelas próprias (serão processados depois)
WHERE a.field_type NOT IN (
    'Tabela', 'table',
    'Grade de Pedidos', 'order',
    'Caixa de Seleção', 'checkbox'
);

-- ============================================================
-- PASSO 4 — fact_order_items ← answer (campo = Grade de Pedidos)
-- answer_text contém JSON array de objetos de produto
-- ============================================================

INSERT INTO fact_order_items (
    response_key, form_key, field_id, field_label,
    item_index, product_fb_id, product_key,
    product_name_snap, product_code_snap,
    price_snap, quantity, unit, subtotal, catalog_key, extra_data
)
SELECT
    ffr.response_key,
    ffr.form_key,
    a.field_id,
    a.field_label,
    (item.ordinality - 1)                           AS item_index,
    item.value->>'productId'                        AS product_fb_id,
    dp.product_key,
    COALESCE(item.value->>'productName', item.value->>'name', 'Produto') AS product_name_snap,
    COALESCE(item.value->>'productCode', item.value->>'codigo', '')       AS product_code_snap,
    (item.value->>'price')::NUMERIC                 AS price_snap,
    COALESCE((item.value->>'quantity')::NUMERIC, 0) AS quantity,
    COALESCE(item.value->>'unit', item.value->>'unidade', '')             AS unit,
    CASE
        WHEN (item.value->>'price') IS NOT NULL AND (item.value->>'quantity') IS NOT NULL
        THEN (item.value->>'price')::NUMERIC * (item.value->>'quantity')::NUMERIC
        ELSE 0
    END                                             AS subtotal,
    dpc.catalog_key,
    item.value                                      AS extra_data
FROM answer a
JOIN fact_form_response ffr ON ffr.firebase_id = a.response_id
-- Tenta converter answer_text para JSON array
JOIN LATERAL (
    SELECT value, ordinality
    FROM jsonb_array_elements(
        CASE
            WHEN a.answer_text IS NOT NULL
             AND a.answer_text LIKE '[%'
            THEN a.answer_text::JSONB
            ELSE '[]'::JSONB
        END
    ) WITH ORDINALITY
) AS item ON TRUE
LEFT JOIN dim_products         dp  ON dp.firebase_id  = item.value->>'productId'
LEFT JOIN dim_product_catalogs dpc ON dpc.firebase_id = item.value->>'catalogId'
WHERE a.field_type IN ('Grade de Pedidos', 'order')
  AND a.answer_text IS NOT NULL
  AND a.answer_text LIKE '[%';

-- ============================================================
-- PASSO 5 — fact_checkbox_answers ← answer (Caixa de Seleção)
-- answer_text contém JSON array de strings ex: ["Opção A","Opção B"]
-- ============================================================

INSERT INTO fact_checkbox_answers (
    response_key, form_key, field_id, field_label,
    option_value, option_index
)
SELECT
    ffr.response_key,
    ffr.form_key,
    a.field_id,
    a.field_label,
    opt.value #>> '{}'                  AS option_value,  -- extrai string do JSON
    (opt.ordinality - 1)::INTEGER       AS option_index
FROM answer a
JOIN fact_form_response ffr ON ffr.firebase_id = a.response_id
JOIN LATERAL (
    SELECT value, ordinality
    FROM jsonb_array_elements(
        CASE
            WHEN a.answer_text IS NOT NULL
             AND a.answer_text LIKE '[%'
            THEN a.answer_text::JSONB
            ELSE '[]'::JSONB
        END
    ) WITH ORDINALITY
) AS opt ON TRUE
WHERE a.field_type IN ('Caixa de Seleção', 'checkbox')
  AND a.answer_text IS NOT NULL
  AND a.answer_text LIKE '[%';

-- ============================================================
-- PASSO 6 — fact_table_answers ← answer (campo = Tabela)
-- answer_text contém JSON objeto aninhado {row_id: {col_id: valor}}
-- ============================================================

INSERT INTO fact_table_answers (
    response_key, form_key, field_id, field_label,
    table_data, row_count
)
SELECT
    ffr.response_key,
    ffr.form_key,
    a.field_id,
    a.field_label,
    a.answer_text::JSONB                AS table_data,
    jsonb_object_keys(a.answer_text::JSONB)::TEXT IS NOT NULL -- conta chaves
        -- row_count = número de chaves do objeto
    , (SELECT COUNT(*) FROM jsonb_object_keys(a.answer_text::JSONB))::INTEGER AS row_count
FROM answer a
JOIN fact_form_response ffr ON ffr.firebase_id = a.response_id
WHERE a.field_type IN ('Tabela', 'table')
  AND a.answer_text IS NOT NULL
  AND a.answer_text LIKE '{%';

COMMIT;

-- ============================================================
-- VERIFICAÇÃO — contagens antes vs depois
-- ============================================================

SELECT 'MIGRAÇÃO CONCLUÍDA' AS status;

SELECT
    'dim_companies'         AS tabela, COUNT(*) AS registros FROM dim_companies
UNION ALL SELECT 'dim_departments',   COUNT(*) FROM dim_departments
UNION ALL SELECT 'dim_users',         COUNT(*) FROM dim_users
UNION ALL SELECT 'dim_collaborators', COUNT(*) FROM dim_collaborators
UNION ALL SELECT 'dim_forms',         COUNT(*) FROM dim_forms
UNION ALL SELECT 'dim_product_catalogs', COUNT(*) FROM dim_product_catalogs
UNION ALL SELECT 'dim_products',      COUNT(*) FROM dim_products
UNION ALL SELECT 'fact_form_response',COUNT(*) FROM fact_form_response
UNION ALL SELECT 'fact_answers',      COUNT(*) FROM fact_answers
UNION ALL SELECT 'fact_order_items',  COUNT(*) FROM fact_order_items
UNION ALL SELECT 'fact_checkbox_answers', COUNT(*) FROM fact_checkbox_answers
UNION ALL SELECT 'fact_table_answers',COUNT(*) FROM fact_table_answers
ORDER BY tabela;

-- Comparação com tabelas antigas
SELECT
    'TABELAS ANTIGAS' AS origem,
    'companies'      AS tabela, COUNT(*) AS registros FROM companies
UNION ALL SELECT 'TABELAS ANTIGAS', 'form_response', COUNT(*) FROM form_response
UNION ALL SELECT 'TABELAS ANTIGAS', 'answer',         COUNT(*) FROM answer
UNION ALL SELECT 'TABELAS ANTIGAS', 'products',       COUNT(*) FROM products;
