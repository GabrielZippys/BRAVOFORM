/**
 * Deleta coleções do Firestore que foram migradas para PostgreSQL.
 * Uso: node scripts/delete-firestore-collections.mjs
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

const COLLECTIONS = [
  'workflows',
  'workflow_instances',
  'product_catalogs',
  'products',
  'purchase_orders',
  'excluded_orders',
];

async function deleteCollection(collectionName) {
  const snapshot = await db.collection(collectionName).get();
  if (snapshot.empty) {
    console.log(`   ⚪ "${collectionName}" — vazia ou inexistente`);
    return 0;
  }
  const batch = db.batch();
  snapshot.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  console.log(`   🗑️  "${collectionName}" — ${snapshot.size} documento(s) deletado(s)`);
  return snapshot.size;
}

async function main() {
  console.log('🔥 Iniciando deleção das coleções Firestore migradas para SQL...\n');
  let total = 0;
  for (const col of COLLECTIONS) {
    total += await deleteCollection(col);
  }
  console.log(`\n✅ Concluído. Total de documentos removidos: ${total}`);
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
