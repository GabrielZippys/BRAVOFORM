/**
 * Sincroniza itens da lixeira do Firestore → PostgreSQL
 * Lê todas as respostas com deletedAt != null e espelha no SQL,
 * preservando a data original de exclusão (para cálculo de dias restantes).
 *
 * Uso: node scripts/sync-firestore-trash-to-sql.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cred = JSON.parse(readFileSync(join(__dirname, '../firebase_cred.json'), 'utf8'));

initializeApp({ credential: cert(cred) });
const db = getFirestore();

const API_BASE = 'http://localhost:3001/api/dataconnect/responses';

async function main() {
  console.log('🔍 Buscando itens na lixeira do Firestore...\n');

  // collectionGroup 'responses' — todos os subgrupos de todos os forms
  const snapshot = await db.collectionGroup('responses').get();

  const trashItems = snapshot.docs.filter(d => d.data().deletedAt != null);

  if (trashItems.length === 0) {
    console.log('⚪ Nenhum item na lixeira do Firestore.');
    return;
  }

  console.log(`📦 Encontrados ${trashItems.length} item(s) na lixeira. Sincronizando...\n`);

  let success = 0;
  let skipped = 0;
  let failed  = 0;

  for (const doc of trashItems) {
    const data       = doc.data();
    const id         = doc.id;
    const deletedAt  = data.deletedAt?.toDate?.() ?? null;
    const deletedBy  = data.deletedBy  || 'desconhecido';
    const deletedByUsername = data.deletedByUsername || 'Desconhecido';

    if (!deletedAt) { skipped++; continue; }

    const label = `${data.formTitle || id} — excluída em ${deletedAt.toLocaleDateString('pt-BR')} por ${deletedByUsername}`;
    console.log(`→ ${label}`);

    try {
      const res = await fetch(API_BASE, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          deletedBy,
          deletedByUsername,
          deletedAt: deletedAt.toISOString(),   // data original preservada
        }),
      });

      const result = await res.json();
      if (result.success) {
        const daysLeft = Math.max(0, Math.ceil(
          (deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000 - Date.now()) / (1000 * 60 * 60 * 24)
        ));
        console.log(`   ✅ OK  (${daysLeft} dia(s) restante(s) até exclusão permanente)\n`);
        success++;
      } else {
        console.warn(`   ⚠️  Não encontrado no SQL (resposta pode não ter sido migrada): ${result.error}\n`);
        skipped++;
      }
    } catch (err) {
      console.error(`   ❌ Falha: ${err.message}\n`);
      failed++;
    }
  }

  console.log('─────────────────────────────────────────────');
  console.log(`✅ Sincronizados: ${success}`);
  if (skipped > 0) console.log(`⚪ Ignorados (sem data ou sem registro SQL): ${skipped}`);
  if (failed  > 0) console.log(`❌ Falhas: ${failed}`);
  console.log('─────────────────────────────────────────────');
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
