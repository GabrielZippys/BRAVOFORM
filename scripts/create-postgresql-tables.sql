-- Script para criar tabelas relacionais no PostgreSQL
-- Otimizado para análise no Power BI

-- Tabela principal de respostas
CREATE TABLE IF NOT EXISTS form_response (
    id VARCHAR(255) PRIMARY KEY,
    form_id VARCHAR(255) NOT NULL,
    form_title VARCHAR(500) NOT NULL,
    company_id VARCHAR(255) NOT NULL,
    department_id VARCHAR(255) NOT NULL,
    department_name VARCHAR(255),
    collaborator_id VARCHAR(255) NOT NULL,
    collaborator_username VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'submitted',
    current_stage_id VARCHAR(255),
    assigned_to VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_at TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(255),
    deleted_by_username VARCHAR(255)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_form_response_form_id ON form_response(form_id);
CREATE INDEX IF NOT EXISTS idx_form_response_company_id ON form_response(company_id);
CREATE INDEX IF NOT EXISTS idx_form_response_department_id ON form_response(department_id);
CREATE INDEX IF NOT EXISTS idx_form_response_status ON form_response(status);
CREATE INDEX IF NOT EXISTS idx_form_response_submitted_at ON form_response(submitted_at);

-- Tabela de respostas individuais (normalizada)
CREATE TABLE IF NOT EXISTS answer (
    id SERIAL PRIMARY KEY,
    response_id VARCHAR(255) NOT NULL,
    field_id VARCHAR(255) NOT NULL,
    field_label VARCHAR(500) NOT NULL,
    field_type VARCHAR(50) NOT NULL,
    answer_text TEXT,
    answer_number NUMERIC,
    answer_date DATE,
    answer_boolean BOOLEAN,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (response_id) REFERENCES form_response(id) ON DELETE CASCADE
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_answer_response_id ON answer(response_id);
CREATE INDEX IF NOT EXISTS idx_answer_field_id ON answer(field_id);

-- Tabela de anexos
CREATE TABLE IF NOT EXISTS attachment (
    id SERIAL PRIMARY KEY,
    response_id VARCHAR(255) NOT NULL,
    field_id VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_name VARCHAR(500) NOT NULL,
    file_type VARCHAR(100) NOT NULL,
    file_size INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (response_id) REFERENCES form_response(id) ON DELETE CASCADE
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_attachment_response_id ON attachment(response_id);

-- Tabela de histórico de workflow
CREATE TABLE IF NOT EXISTS workflow_history (
    id SERIAL PRIMARY KEY,
    response_id VARCHAR(255) NOT NULL,
    stage_id VARCHAR(255) NOT NULL,
    stage_name VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    performed_by VARCHAR(255) NOT NULL,
    performed_by_username VARCHAR(255) NOT NULL,
    comment TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (response_id) REFERENCES form_response(id) ON DELETE CASCADE
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_workflow_history_response_id ON workflow_history(response_id);
CREATE INDEX IF NOT EXISTS idx_workflow_history_created_at ON workflow_history(created_at);

-- Tabela de itens de grade/tabela
CREATE TABLE IF NOT EXISTS table_item (
    id SERIAL PRIMARY KEY,
    response_id VARCHAR(255) NOT NULL,
    field_id VARCHAR(255) NOT NULL,
    row_index INTEGER NOT NULL,
    column_id VARCHAR(255) NOT NULL,
    column_label VARCHAR(255) NOT NULL,
    value TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (response_id) REFERENCES form_response(id) ON DELETE CASCADE
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_table_item_response_id ON table_item(response_id);
CREATE INDEX IF NOT EXISTS idx_table_item_field_id ON table_item(field_id);

-- Inserir dados de teste
INSERT INTO form_response (id, form_id, form_title, company_id, department_id, department_name, collaborator_id, collaborator_username, status, submitted_at)
VALUES 
    ('test-resp-001', 'form-001', 'Formulário de Vendas', 'comp-001', 'dept-vendas', 'Vendas', 'colab-001', 'João Silva', 'approved', '2026-03-01 10:30:00'),
    ('test-resp-002', 'form-001', 'Formulário de Vendas', 'comp-001', 'dept-vendas', 'Vendas', 'colab-002', 'Maria Santos', 'submitted', '2026-03-15 14:20:00'),
    ('test-resp-003', 'form-002', 'Formulário de Compras', 'comp-001', 'dept-compras', 'Compras', 'colab-003', 'Pedro Costa', 'approved', '2026-03-20 09:15:00')
ON CONFLICT (id) DO NOTHING;

INSERT INTO answer (response_id, field_id, field_label, field_type, answer_text, answer_number)
VALUES 
    ('test-resp-001', 'field-cliente', 'Nome do Cliente', 'text', 'Empresa ABC Ltda', NULL),
    ('test-resp-001', 'field-valor', 'Valor da Venda', 'number', NULL, 15000.00),
    ('test-resp-002', 'field-cliente', 'Nome do Cliente', 'text', 'Empresa XYZ S.A.', NULL),
    ('test-resp-002', 'field-valor', 'Valor da Venda', 'number', NULL, 25000.00),
    ('test-resp-003', 'field-fornecedor', 'Nome do Fornecedor', 'text', 'Fornecedor 123', NULL),
    ('test-resp-003', 'field-valor', 'Valor da Compra', 'number', NULL, 8500.00);

INSERT INTO workflow_history (response_id, stage_id, stage_name, action, performed_by, performed_by_username, comment)
VALUES 
    ('test-resp-001', 'stage-analise', 'Análise', 'approved', 'user-admin', 'Admin', 'Aprovado conforme política'),
    ('test-resp-003', 'stage-analise', 'Análise', 'approved', 'user-admin', 'Admin', 'Compra aprovada');

-- Views úteis para Power BI
CREATE OR REPLACE VIEW vw_responses_summary AS
SELECT 
    fr.id,
    fr.form_title,
    fr.department_name,
    fr.collaborator_username,
    fr.status,
    fr.submitted_at,
    COUNT(DISTINCT a.id) as total_answers,
    COUNT(DISTINCT att.id) as total_attachments
FROM form_response fr
LEFT JOIN answer a ON fr.id = a.response_id
LEFT JOIN attachment att ON fr.id = att.response_id
WHERE fr.deleted_at IS NULL
GROUP BY fr.id, fr.form_title, fr.department_name, fr.collaborator_username, fr.status, fr.submitted_at;

CREATE OR REPLACE VIEW vw_responses_with_values AS
SELECT 
    fr.id,
    fr.form_title,
    fr.department_name,
    fr.collaborator_username,
    fr.status,
    fr.submitted_at,
    SUM(CASE WHEN a.answer_number IS NOT NULL THEN a.answer_number ELSE 0 END) as total_value
FROM form_response fr
LEFT JOIN answer a ON fr.id = a.response_id
WHERE fr.deleted_at IS NULL
GROUP BY fr.id, fr.form_title, fr.department_name, fr.collaborator_username, fr.status, fr.submitted_at;

-- Comentários nas tabelas para documentação
COMMENT ON TABLE form_response IS 'Tabela principal com informações das respostas de formulários';
COMMENT ON TABLE answer IS 'Respostas individuais normalizadas por campo';
COMMENT ON TABLE attachment IS 'Anexos e arquivos das respostas';
COMMENT ON TABLE workflow_history IS 'Histórico de ações no workflow';
COMMENT ON TABLE table_item IS 'Itens de grades e tabelas dos formulários';
