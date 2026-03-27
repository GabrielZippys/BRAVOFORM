-- ============================================================
-- MIGRAÇÃO: Adicionar form_id como chave em todas as tabelas
-- Executar no PostgreSQL do Data Connect (Cloud SQL)
-- ============================================================

-- 1. Adicionar coluna form_id nas tabelas filhas
-- (IF NOT EXISTS previne erro se já existir)

ALTER TABLE answer
  ADD COLUMN IF NOT EXISTS form_id VARCHAR(255);

ALTER TABLE attachment
  ADD COLUMN IF NOT EXISTS form_id VARCHAR(255);

ALTER TABLE workflow_history
  ADD COLUMN IF NOT EXISTS form_id VARCHAR(255);

ALTER TABLE table_item
  ADD COLUMN IF NOT EXISTS form_id VARCHAR(255);

-- ============================================================
-- 2. Backfill: preencher form_id nas linhas já existentes
--    via join com form_response (usando response_id como elo)
-- ============================================================

UPDATE answer a
SET form_id = fr.form_id
FROM form_response fr
WHERE a.response_id = fr.id
  AND a.form_id IS NULL;

UPDATE attachment att
SET form_id = fr.form_id
FROM form_response fr
WHERE att.response_id = fr.id
  AND att.form_id IS NULL;

UPDATE workflow_history wh
SET form_id = fr.form_id
FROM form_response fr
WHERE wh.response_id = fr.id
  AND wh.form_id IS NULL;

UPDATE table_item ti
SET form_id = fr.form_id
FROM form_response fr
WHERE ti.response_id = fr.id
  AND ti.form_id IS NULL;

-- ============================================================
-- 3. Criar índices para performance nas novas colunas
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_answer_form_id       ON answer(form_id);
CREATE INDEX IF NOT EXISTS idx_attachment_form_id   ON attachment(form_id);
CREATE INDEX IF NOT EXISTS idx_workflow_form_id     ON workflow_history(form_id);
CREATE INDEX IF NOT EXISTS idx_table_item_form_id   ON table_item(form_id);

-- ============================================================
-- 4. Atualizar views para incluir form_id
-- ============================================================

CREATE OR REPLACE VIEW vw_responses_summary AS
SELECT
    fr.id            AS response_id,
    fr.form_id,
    fr.form_title,
    fr.company_id,
    fr.department_id,
    fr.department_name,
    fr.collaborator_id,
    fr.collaborator_username,
    fr.status,
    fr.submitted_at,
    COUNT(DISTINCT a.id)   AS total_answers,
    COUNT(DISTINCT att.id) AS total_attachments
FROM form_response fr
LEFT JOIN answer a     ON fr.id = a.response_id
LEFT JOIN attachment att ON fr.id = att.response_id
WHERE fr.deleted_at IS NULL
GROUP BY fr.id, fr.form_id, fr.form_title, fr.company_id,
         fr.department_id, fr.department_name, fr.collaborator_id,
         fr.collaborator_username, fr.status, fr.submitted_at;

CREATE OR REPLACE VIEW vw_responses_with_values AS
SELECT
    fr.id            AS response_id,
    fr.form_id,
    fr.form_title,
    fr.company_id,
    fr.department_id,
    fr.department_name,
    fr.collaborator_id,
    fr.collaborator_username,
    fr.status,
    fr.submitted_at,
    SUM(CASE WHEN a.answer_number IS NOT NULL THEN a.answer_number ELSE 0 END) AS total_value
FROM form_response fr
LEFT JOIN answer a ON fr.id = a.response_id
WHERE fr.deleted_at IS NULL
GROUP BY fr.id, fr.form_id, fr.form_title, fr.company_id,
         fr.department_id, fr.department_name, fr.collaborator_id,
         fr.collaborator_username, fr.status, fr.submitted_at;

-- View flat para Power BI: todas as respostas com campos em linhas
CREATE OR REPLACE VIEW vw_flat_answers AS
SELECT
    fr.form_id,
    fr.form_title,
    fr.id            AS response_id,
    fr.company_id,
    fr.department_id,
    fr.department_name,
    fr.collaborator_id,
    fr.collaborator_username,
    fr.status,
    fr.submitted_at,
    a.field_id,
    a.field_label,
    a.field_type,
    a.answer_text,
    a.answer_number,
    a.answer_boolean,
    a.answer_date
FROM form_response fr
JOIN answer a ON fr.id = a.response_id
WHERE fr.deleted_at IS NULL;

-- ============================================================
-- 5. Verificar resultado da migração
-- ============================================================

SELECT
    'answer'           AS tabela,
    COUNT(*)           AS total_linhas,
    COUNT(form_id)     AS com_form_id,
    COUNT(*) - COUNT(form_id) AS sem_form_id
FROM answer
UNION ALL
SELECT 'attachment',     COUNT(*), COUNT(form_id), COUNT(*) - COUNT(form_id) FROM attachment
UNION ALL
SELECT 'workflow_history', COUNT(*), COUNT(form_id), COUNT(*) - COUNT(form_id) FROM workflow_history
UNION ALL
SELECT 'table_item',     COUNT(*), COUNT(form_id), COUNT(*) - COUNT(form_id) FROM table_item;
