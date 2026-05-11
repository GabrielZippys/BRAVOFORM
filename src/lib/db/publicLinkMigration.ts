/**
 * BravoForm — Schema para links públicos de workflow.
 *
 * Adiciona:
 *   • dim_workflows.public_token (UNIQUE) — token aleatório que vira URL pública
 *   • dim_workflows.public_link_enabled    — admin pode habilitar/desabilitar
 *   • fact_form_response.public_link_token — rastreia qual link gerou cada instância
 *   • fact_form_response.form_key NULLABLE — instâncias de workflow podem não ter form
 *
 * Idempotente — pode ser chamado quantas vezes precisar.
 */

let migrationApplied = false;

export async function ensurePublicLinkSchema(client: any): Promise<void> {
  if (migrationApplied) return;

  // Tabela master de workflows: token + flag
  await client.query(`
    ALTER TABLE dim_workflows
      ADD COLUMN IF NOT EXISTS public_token         VARCHAR(64),
      ADD COLUMN IF NOT EXISTS public_link_enabled  BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS public_token_created_at TIMESTAMP;
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_dim_workflows_public_token
      ON dim_workflows(public_token)
      WHERE public_token IS NOT NULL;
  `);

  // Instâncias: rastreia qual link público gerou
  await client.query(`
    ALTER TABLE fact_form_response
      ADD COLUMN IF NOT EXISTS public_link_token VARCHAR(64),
      ADD COLUMN IF NOT EXISTS workflow_fb_id    VARCHAR(255);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_ffr_public_link_token
      ON fact_form_response(public_link_token)
      WHERE public_link_token IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_ffr_workflow_fb_id
      ON fact_form_response(workflow_fb_id)
      WHERE workflow_fb_id IS NOT NULL;
  `);

  // form_key precisa permitir NULL — instâncias criadas via link público
  // de workflow puro podem não ter form vinculado (a primeira etapa é
  // identity-validation, não exige form).
  // Tenta tornar nullable; se já for, é no-op.
  try {
    await client.query(`
      ALTER TABLE fact_form_response
        ALTER COLUMN form_key DROP NOT NULL;
    `);
  } catch (e: any) {
    // Pode já estar NULL ou não ter constraint — ignora
    if (!String(e.message).includes('does not exist')) {
      console.warn('⚠️ Could not drop NOT NULL from form_key (talvez já seja nullable):', e.message);
    }
  }

  migrationApplied = true;
  console.log('✅ ensurePublicLinkSchema: schema aplicado');
}
