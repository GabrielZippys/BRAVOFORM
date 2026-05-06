-- ============================================================================
-- BravoFlow — Migração 002: Suporte a Workflow de Retirada
-- - Roles diferenciados em dim_collaborators
-- - Campos de aprovação/réplica/cancelamento em fact_form_response
-- - Tabela fact_workflow_retirada (motorista, placa, boletim, protocolo)
-- - Índices para o dashboard de métricas
-- Execução: psql -h <host> -U <user> -d <db> -f 002_workflow_retirada.sql
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) Roles em dim_collaborators (já existe coluna `role`, expandimos default e
--    adicionamos lista secundária `roles` para múltiplos papéis)
-- ----------------------------------------------------------------------------
ALTER TABLE dim_collaborators
    ALTER COLUMN role SET DEFAULT 'Colaborador';

ALTER TABLE dim_collaborators
    ADD COLUMN IF NOT EXISTS roles JSONB DEFAULT '[]'::jsonb;

-- Índice para busca por papel (ex: "todos os AprovadorQualidade da empresa X")
CREATE INDEX IF NOT EXISTS idx_dim_collaborators_role
    ON dim_collaborators(role);
CREATE INDEX IF NOT EXISTS idx_dim_collaborators_roles
    ON dim_collaborators USING GIN(roles);

-- ----------------------------------------------------------------------------
-- 2) fact_form_response: aprovação, réplica, cancelamento e dados do workflow
--    de Retirada (motorista, placa, boletim, protocolo)
-- ----------------------------------------------------------------------------
ALTER TABLE fact_form_response
    -- Aprovação / reprovação
    ADD COLUMN IF NOT EXISTS approved_at           TIMESTAMP,
    ADD COLUMN IF NOT EXISTS approved_by           VARCHAR(255),
    ADD COLUMN IF NOT EXISTS approved_by_username  VARCHAR(255),
    ADD COLUMN IF NOT EXISTS rejected_at           TIMESTAMP,
    ADD COLUMN IF NOT EXISTS rejected_by           VARCHAR(255),
    ADD COLUMN IF NOT EXISTS rejected_by_username  VARCHAR(255),
    ADD COLUMN IF NOT EXISTS rejection_reason      TEXT,
    -- Réplica (reenvio após reprovação)
    ADD COLUMN IF NOT EXISTS parent_response_fb_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS replica_count         INTEGER DEFAULT 0,
    -- Roteirização / Operação (workflow de Retirada)
    ADD COLUMN IF NOT EXISTS motorista              VARCHAR(255),
    ADD COLUMN IF NOT EXISTS placa                  VARCHAR(50),
    ADD COLUMN IF NOT EXISTS boletim                TEXT,
    ADD COLUMN IF NOT EXISTS protocolo_cancelamento VARCHAR(255),
    ADD COLUMN IF NOT EXISTS motivo_cancelamento    TEXT,
    -- Informações trazidas pelo aprovador
    ADD COLUMN IF NOT EXISTS setor_entrega          VARCHAR(255),
    ADD COLUMN IF NOT EXISTS endereco_entrega       TEXT,
    ADD COLUMN IF NOT EXISTS dias_entrega           VARCHAR(255),
    ADD COLUMN IF NOT EXISTS produto_existe_nf      BOOLEAN,
    ADD COLUMN IF NOT EXISTS pdf_nota_fiscal_url    TEXT;

CREATE INDEX IF NOT EXISTS idx_ffr_status            ON fact_form_response(status);
CREATE INDEX IF NOT EXISTS idx_ffr_current_stage    ON fact_form_response(current_stage_fb_id);
CREATE INDEX IF NOT EXISTS idx_ffr_parent_response  ON fact_form_response(parent_response_fb_id);
CREATE INDEX IF NOT EXISTS idx_ffr_motorista        ON fact_form_response(motorista);

-- ----------------------------------------------------------------------------
-- 3) View para o dashboard de métricas do BravoFlow
--    Conta instâncias por status e por estágio atual.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_workflow_metrics AS
SELECT
    fr.form_key,
    f.firebase_id      AS form_id,
    f.title            AS form_title,
    fr.company_key,
    c.name             AS empresa,
    fr.status,
    fr.current_stage_fb_id,
    COUNT(*)           AS total_instancias,
    COUNT(*) FILTER (WHERE fr.status = 'pending')    AS pendentes,
    COUNT(*) FILTER (WHERE fr.status = 'approved')   AS aprovadas,
    COUNT(*) FILTER (WHERE fr.status = 'rejected')   AS reprovadas,
    COUNT(*) FILTER (WHERE fr.status = 'cancelled')  AS canceladas,
    COUNT(*) FILTER (WHERE fr.status = 'completed')  AS finalizadas,
    COUNT(*) FILTER (WHERE fr.status = 'in_routing') AS em_roteirizacao,
    COUNT(*) FILTER (WHERE fr.status = 'in_pickup')  AS em_retirada,
    MIN(fr.submitted_at) AS primeira_submissao,
    MAX(fr.submitted_at) AS ultima_submissao
FROM fact_form_response fr
JOIN dim_forms f         ON fr.form_key    = f.form_key
JOIN dim_companies c     ON fr.company_key = c.company_key
WHERE fr.deleted_at IS NULL
GROUP BY fr.form_key, f.firebase_id, f.title, fr.company_key, c.name,
         fr.status, fr.current_stage_fb_id;

-- ----------------------------------------------------------------------------
-- 4) View específica para o Painel de Retirada (todas pendentes)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_retiradas_painel AS
SELECT
    fr.firebase_id          AS response_id,
    fr.form_title,
    fr.collaborator_username AS solicitante,
    fr.status,
    fr.current_stage_fb_id,
    fr.submitted_at,
    fr.approved_at,
    fr.motorista,
    fr.placa,
    fr.setor_entrega,
    fr.endereco_entrega,
    fr.dias_entrega,
    fr.boletim,
    fr.protocolo_cancelamento,
    fr.motivo_cancelamento,
    fr.replica_count,
    fr.parent_response_fb_id,
    EXTRACT(EPOCH FROM (NOW() - fr.submitted_at)) / 3600 AS horas_em_aberto
FROM fact_form_response fr
WHERE fr.deleted_at IS NULL
  AND fr.status IN ('pending', 'approved', 'in_routing', 'in_pickup');

COMMIT;
