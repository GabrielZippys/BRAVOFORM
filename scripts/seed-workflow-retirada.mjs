// Cria o workflow "Retirada Qualidade" (do PDF) direto no banco,
// com token público gerado pronto para uso via /w/[token].
//
// Reproduz o fluxo:
//   0. Identifique-se               (identity-validation, busca em dim_collaborators)
//   1. Preencher Solicitação         (execution — Dados Coletados do PDF)
//   2. Aprovação Qualidade           (approval — Aprova/Reprova, Informações Trazidas)
//   3. Roteirização                  (execution — Motorista + Placa)
//   4. Distribuir Retiradas          (execution — Ordem de Retirada + NF)
//   5. Confirmar Retirada            (approval — Retirado / Cancelada)
//   6. Encerramento                  (completion)
//
// Os ramos do PDF (Réplica em caso de reprova, painel 19h30 etc.)
// continuam sendo tratados pelas funções e UI já existentes do BravoForm.
//
// Uso: node scripts/seed-workflow-retirada.mjs

import pg from 'pg';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import crypto from 'crypto';

for (const file of ['.env.local', '.env']) {
  try {
    const txt = readFileSync(resolve(file), 'utf-8');
    for (const ln of txt.split(/\r?\n/)) {
      const m = ln.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {}
}

const { Pool } = pg;
const pool = new Pool({
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT),
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const NOW = Date.now();
const WORKFLOW_ID = `wf_retirada_qualidade_${NOW}`;
const WORKFLOW_NAME = 'Retirada de Qualidade';
const WORKFLOW_DESCRIPTION =
  'Fluxo oficial de retirada com aprovação de qualidade, roteirização de motorista e confirmação de operador. Baseado no diagrama Retirada Qualidade.';

const TOKEN = crypto.randomBytes(32).toString('hex');

const STAGES = [
  {
    id: `stage_id_${NOW}`,
    name: 'Identifique-se',
    description: 'Digite seu username de colaborador para iniciar a solicitação de retirada.',
    stageType: 'identity-validation',
    order: 0,
    lookup_table: 'dim_collaborators',
    lookup_search_column: 'username',
    lookup_display_columns: [
      { column: 'username', label: 'Nome' },
      { column: 'email', label: 'E-mail' },
      { column: 'department_name', label: 'Departamento' },
    ],
    lookup_input_label: 'Seu username',
    lookup_input_placeholder: 'Ex: joao.silva',
    lookup_confirm_text: 'Sou eu, iniciar retirada',
    lookup_require_match: true,
  },
  {
    id: `stage_form_${NOW}`,
    name: 'Preencher Solicitação de Retirada',
    description:
`Informe abaixo os dados da retirada (Dados Coletados):

• Unidade
• Código e Nome do Vendedor
• Código e Nome do Cliente
• Número da Nota Fiscal
• Código e Nome do Produto
• Quantidade
• Fotos do produto
• Breve relato do problema

Quando concluir, clique em "Marcar como concluído" para enviar à Qualidade.`,
    stageType: 'execution',
    order: 1,
  },
  {
    id: `stage_aprov_${NOW}`,
    name: 'Aprovação Qualidade',
    description:
`Revisão pela equipe de Qualidade. Verifica se o produto consta na NF, complementa Informações Trazidas (Setor de Entrega, Endereço, Dias de Entrega, PDF da NF) e decide:

✅ Aprovar — segue para Roteirização e o solicitante recebe e-mail com regras
❌ Reprovar — solicitante recebe e-mail com motivo e pode reenviar como réplica`,
    stageType: 'approval',
    order: 2,
  },
  {
    id: `stage_route_${NOW}`,
    name: 'Roteirização',
    description:
`Roteirizador define o motorista e a placa do veículo que fará a retirada.

Insira no comentário:
• Nome do motorista
• Placa do veículo
• Data prevista da retirada`,
    stageType: 'execution',
    order: 3,
  },
  {
    id: `stage_distrib_${NOW}`,
    name: 'Distribuir Retiradas',
    description:
`Imprima a Ordem de Retirada e a Nota Fiscal. Entregue ao motorista junto com as orientações de segurança.

Marque como concluído após a entrega física dos documentos.`,
    stageType: 'execution',
    order: 4,
  },
  {
    id: `stage_confirm_${NOW}`,
    name: 'Confirmar Retirada',
    description:
`Operador confirma o status da retirada após execução em campo:

✅ Aprovar — Retirada concluída. Digite o número do boletim no comentário.
❌ Reprovar — Retirada cancelada. Digite o protocolo de cancelamento e a opção/motivo.`,
    stageType: 'approval',
    order: 5,
  },
  {
    id: `stage_end_${NOW}`,
    name: 'Encerramento',
    description: 'Retirada finalizada. E-mail de encerramento será enviado ao solicitante.',
    stageType: 'completion',
    order: 6,
  },
];

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Garantindo schema (public link)...');
    await client.query(`
      ALTER TABLE dim_workflows
        ADD COLUMN IF NOT EXISTS public_token            VARCHAR(64),
        ADD COLUMN IF NOT EXISTS public_link_enabled     BOOLEAN DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS public_token_created_at TIMESTAMP;
    `);

    console.log(`\nCriando workflow ${WORKFLOW_ID}...`);
    await client.query(
      `INSERT INTO dim_workflows (
        firebase_id, name, description, is_active,
        public_token, public_link_enabled, public_token_created_at,
        companies, departments, activation_settings, updated_at
      ) VALUES ($1, $2, $3, true, $4, true, NOW(), $5, $6, $7, NOW())
      ON CONFLICT (firebase_id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        is_active = true,
        public_token = EXCLUDED.public_token,
        public_link_enabled = true,
        updated_at = NOW()`,
      [
        WORKFLOW_ID,
        WORKFLOW_NAME,
        WORKFLOW_DESCRIPTION,
        TOKEN,
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify({ mode: 'on_request' }),
      ]
    );
    console.log(`  ✅ workflow gravado`);

    console.log('\nCriando stages...');
    for (const s of STAGES) {
      await client.query(
        `INSERT INTO dim_workflow_stages (
          firebase_id, workflow_fb_id, workflow_name,
          stage_name, stage_description, stage_type, stage_order, is_active,
          lookup_table, lookup_search_column, lookup_display_columns,
          lookup_input_label, lookup_input_placeholder, lookup_confirm_text,
          lookup_require_match
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (firebase_id) DO UPDATE SET
          workflow_fb_id = EXCLUDED.workflow_fb_id,
          stage_name = EXCLUDED.stage_name,
          stage_description = EXCLUDED.stage_description,
          stage_type = EXCLUDED.stage_type,
          stage_order = EXCLUDED.stage_order,
          is_active = true,
          lookup_table = EXCLUDED.lookup_table,
          lookup_search_column = EXCLUDED.lookup_search_column,
          lookup_display_columns = EXCLUDED.lookup_display_columns,
          lookup_input_label = EXCLUDED.lookup_input_label,
          lookup_input_placeholder = EXCLUDED.lookup_input_placeholder,
          lookup_confirm_text = EXCLUDED.lookup_confirm_text,
          lookup_require_match = EXCLUDED.lookup_require_match`,
        [
          s.id, WORKFLOW_ID, WORKFLOW_NAME,
          s.name, s.description, s.stageType, s.order,
          s.lookup_table || null,
          s.lookup_search_column || null,
          s.lookup_display_columns ? JSON.stringify(s.lookup_display_columns) : null,
          s.lookup_input_label || null,
          s.lookup_input_placeholder || null,
          s.lookup_confirm_text || null,
          s.lookup_require_match ?? null,
        ]
      );
      console.log(`  [${s.order}] ${s.stageType.padEnd(20)} ${s.name}`);
    }

    await client.query('COMMIT');

    // Detecta base URL — preferência: NEXT_PUBLIC_BASE_URL, senão localhost:3001
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001';
    const publicUrl = `${baseUrl}/w/${TOKEN}`;

    console.log('\n══════════════════════════════════════════════════════════════');
    console.log('✅ Workflow Retirada de Qualidade criado com sucesso');
    console.log('══════════════════════════════════════════════════════════════');
    console.log(`  Workflow ID:  ${WORKFLOW_ID}`);
    console.log(`  Token:        ${TOKEN}`);
    console.log(`  Link público: ${publicUrl}`);
    console.log('══════════════════════════════════════════════════════════════\n');

    // Verifica se há colaboradores p/ o lookup funcionar
    const collabRes = await client.query(`SELECT COUNT(*)::int AS n FROM dim_collaborators WHERE username IS NOT NULL`);
    console.log(`Colaboradores com username em dim_collaborators: ${collabRes.rows[0].n}`);
    if (collabRes.rows[0].n === 0) {
      console.log('⚠️  Nenhum colaborador com username — o lookup da etapa 0 vai falhar.');
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
