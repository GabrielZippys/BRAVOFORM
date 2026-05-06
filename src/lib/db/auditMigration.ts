/**
 * BravoForm — Migração idempotente da tabela `fact_audit_events`.
 *
 * Tabela central de audit log compliance-ready (SOC 2, LGPD, ISO 27001).
 * Registra TODOS eventos sensíveis: login/logout, acesso a dados, mudanças
 * de permissão, exports, deletes, ações de workflow.
 *
 * Schema deliberadamente normalizado para queries rápidas:
 *   • `event_type`     — discriminador (login, workflow.action, dsar.export, ...)
 *   • `actor_id`       — quem fez (collaboratorId / 'system' / 'anonymous')
 *   • `actor_username` — denormalizado p/ não precisar JOIN
 *   • `target_type`    — tipo do objeto (response, workflow, user, ...)
 *   • `target_id`      — id do objeto afetado
 *   • `company_id`     — multi-tenancy: TODA query filtra por isso
 *   • `ip_address`     — exigido por LGPD em log de acesso
 *   • `user_agent`     — forensics
 *   • `payload`        — JSONB com detalhes (diff, valores antigo/novo)
 *   • `severity`       — info | warn | critical (alerta SOC)
 *   • `created_at`     — imutável, append-only
 *
 * Padrão append-only: nunca atualizar/deletar linhas dessa tabela.
 * Retenção: 7 anos (exigência LGPD para logs de processamento).
 */

let migrationApplied = false;

export async function ensureAuditSchema(client: any): Promise<void> {
  if (migrationApplied) return;

  // Tabela principal
  await client.query(`
    CREATE TABLE IF NOT EXISTS fact_audit_events (
      audit_id          BIGSERIAL    PRIMARY KEY,
      event_type        VARCHAR(80)  NOT NULL,
      severity          VARCHAR(16)  NOT NULL DEFAULT 'info',

      -- Quem fez
      actor_id          VARCHAR(255),
      actor_username    VARCHAR(255),
      actor_role        VARCHAR(80),

      -- O que foi afetado
      target_type       VARCHAR(80),
      target_id         VARCHAR(255),
      target_label      VARCHAR(500),

      -- Contexto multi-tenant
      company_id        VARCHAR(255),
      department_id     VARCHAR(255),

      -- Forensics (LGPD exige)
      ip_address        VARCHAR(64),
      user_agent        TEXT,

      -- Payload livre (diff, valores antigos, contexto extra)
      payload           JSONB        DEFAULT '{}'::jsonb,

      -- Status do evento
      success           BOOLEAN      NOT NULL DEFAULT true,
      error_message     TEXT,

      -- Timestamp imutável
      created_at        TIMESTAMP    NOT NULL DEFAULT NOW()
    )
  `);

  // Índices para queries comuns (filtros do dashboard de audit)
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_audit_created_at  ON fact_audit_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_event_type  ON fact_audit_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_audit_actor       ON fact_audit_events(actor_id);
    CREATE INDEX IF NOT EXISTS idx_audit_target      ON fact_audit_events(target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_audit_company     ON fact_audit_events(company_id);
    CREATE INDEX IF NOT EXISTS idx_audit_severity    ON fact_audit_events(severity);
    CREATE INDEX IF NOT EXISTS idx_audit_payload_gin ON fact_audit_events USING GIN (payload);
  `);

  // Comentários (úteis para psql \\d e ferramentas de exploração)
  await client.query(`
    COMMENT ON TABLE fact_audit_events IS
      'Append-only audit log compliance-ready (SOC 2, LGPD, ISO 27001). Retenção: 7 anos.';
    COMMENT ON COLUMN fact_audit_events.event_type IS
      'login | logout | login.failed | workflow.created | workflow.action | workflow.deleted | response.viewed | response.exported | dsar.export | dsar.forget | rbac.denied | rate_limit.exceeded';
    COMMENT ON COLUMN fact_audit_events.severity IS
      'info | warn | critical';
  `);

  migrationApplied = true;
  console.log('✅ ensureAuditSchema: fact_audit_events schema aplicado');
}

/** Reset do flag para testes (não usar em produção) */
export function resetAuditMigrationCache() {
  migrationApplied = false;
}
