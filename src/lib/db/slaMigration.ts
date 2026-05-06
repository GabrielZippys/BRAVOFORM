/**
 * BravoForm — SLA + Predictive Engine schema
 *
 * Modelo:
 *   • dim_workflow_stages.sla_target_minutes  → meta de SLA por etapa
 *   • dim_workflow_stages.sla_warn_threshold  → % do alvo p/ alerta amarelo (default 80)
 *   • dim_workflow_stages.sla_critical_threshold → % p/ alerta vermelho (default 100)
 *   • fact_form_response.sla_status             → ok | at_risk | critical | breached
 *   • fact_form_response.sla_predicted_minutes  → predição de duração total
 *   • fact_form_response.sla_evaluated_at       → última avaliação do preditivo
 *
 * Campos novos em fact_form_response são populados pelo SLA forecast cron.
 * O hist é fornecido por fact_workflow_history (já existe).
 *
 * Idempotente — pode chamar quantas vezes precisar.
 */

let migrationApplied = false;

export async function ensureSlaSchema(client: any): Promise<void> {
  if (migrationApplied) return;

  // Estende dim_workflow_stages
  await client.query(`
    ALTER TABLE dim_workflow_stages
      ADD COLUMN IF NOT EXISTS sla_target_minutes      INTEGER,
      ADD COLUMN IF NOT EXISTS sla_warn_threshold      INTEGER DEFAULT 80,
      ADD COLUMN IF NOT EXISTS sla_critical_threshold  INTEGER DEFAULT 100,
      ADD COLUMN IF NOT EXISTS sla_breach_threshold    INTEGER DEFAULT 150,
      ADD COLUMN IF NOT EXISTS sla_escalate_to_role    VARCHAR(80),
      ADD COLUMN IF NOT EXISTS sla_escalate_to_emails  JSONB DEFAULT '[]'::jsonb;
  `);

  // Estende fact_form_response com colunas preditivas
  await client.query(`
    ALTER TABLE fact_form_response
      ADD COLUMN IF NOT EXISTS sla_status               VARCHAR(20),
      ADD COLUMN IF NOT EXISTS sla_predicted_minutes    NUMERIC(10, 2),
      ADD COLUMN IF NOT EXISTS sla_elapsed_minutes      NUMERIC(10, 2),
      ADD COLUMN IF NOT EXISTS sla_target_minutes       INTEGER,
      ADD COLUMN IF NOT EXISTS sla_evaluated_at         TIMESTAMP,
      ADD COLUMN IF NOT EXISTS sla_breach_predicted_at  TIMESTAMP;
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_ffr_sla_status
      ON fact_form_response(sla_status);
    CREATE INDEX IF NOT EXISTS idx_ffr_sla_evaluated
      ON fact_form_response(sla_evaluated_at);
  `);

  migrationApplied = true;
  console.log('✅ ensureSlaSchema: SLA + predictive schema aplicado');
}
