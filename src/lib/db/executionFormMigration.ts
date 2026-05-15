/**
 * BravoForm — Schema para formulários customizados em etapas execution.
 *
 * Permite que uma stage do tipo `execution` tenha um formulário rico:
 *   - lookup-input    : input que resolve um nome ao digitar um ID
 *   - display         : campo read-only auto-preenchido de outro
 *   - lookup-dropdown : dropdown filtrado por valores de outros campos
 *   - text/number/textarea : básicos
 *   - file            : upload com suporte a câmera (capture)
 *
 * Cascading lookups: cada lookup pode declarar `where` com fromField pra
 * filtrar resultados baseados em campos anteriores.
 */

let migrationApplied = false;

export async function ensureExecutionFormSchema(client: any): Promise<void> {
  if (migrationApplied) return;

  await client.query(`
    ALTER TABLE dim_workflow_stages
      ADD COLUMN IF NOT EXISTS execution_form JSONB DEFAULT '{}'::jsonb;
  `);

  await client.query(`
    ALTER TABLE fact_form_response
      ADD COLUMN IF NOT EXISTS execution_form_values JSONB DEFAULT '{}'::jsonb;
  `);

  migrationApplied = true;
  console.log('✅ ensureExecutionFormSchema: schema aplicado');
}
