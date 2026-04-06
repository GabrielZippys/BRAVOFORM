/**
 * Migra workflows do Firestore → PostgreSQL (SQL)
 * Uso: node scripts/migrate-workflows-from-firestore.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cred = JSON.parse(readFileSync(join(__dirname, '../firebase_cred.json'), 'utf8'));

// Inicializar Firebase Admin
initializeApp({ credential: cert(cred) });
const db = getFirestore();

const API_BASE = 'http://localhost:3001/api/dataconnect/workflows';

async function migrateWorkflows() {
  console.log('🔍 Lendo workflows do Firestore...');

  const snapshot = await db.collection('workflows').get();

  if (snapshot.empty) {
    console.log('⚠️  Nenhum workflow encontrado no Firestore.');
    return;
  }

  console.log(`📦 Encontrados ${snapshot.size} workflow(s). Iniciando migração...\n`);

  let success = 0;
  let failed = 0;

  for (const docSnap of snapshot.docs) {
    const wf = { id: docSnap.id, ...docSnap.data() };

    console.log(`→ Migrando: "${wf.name}" (${wf.id})`);
    console.log(`   Etapas: ${wf.stages?.length ?? 0}`);

    const payload = {
      workflowId:    wf.id,
      name:          wf.name          || 'Sem nome',
      description:   wf.description   || '',
      isActive:      wf.isActive       ?? true,
      companies:     wf.companies      || [],
      departments:   wf.departments    || [],
      createdBy:     wf.createdBy      || '',
      createdByName: wf.createdByName  || '',
      stages: (wf.stages || []).map((s, idx) => ({
        id:               s.id              || `${wf.id}_stage_${idx}`,
        name:             s.name            || `Etapa ${idx + 1}`,
        description:      s.description     || '',
        stageType:        s.stageType       || s.type || 'validation',
        order:            s.order           ?? idx,
        isInitialStage:   s.isInitialStage  ?? (idx === 0),
        isFinalStage:     s.isFinalStage    ?? false,
        requireComment:   s.requireComment  || false,
        requireAttachments: s.requireAttachments || false,
        assignedUsers:    s.assignedUsers   || [],
        allowedRoles:     s.allowedRoles    || [],
        allowedUsers:     s.allowedUsers    || [],
        autoNotifications: s.autoNotifications || { email: false, whatsapp: false },
        color:            s.color           || '#8b5cf6',
      })),
    };

    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (result.success) {
        console.log(`   ✅ OK\n`);
        success++;
      } else {
        console.error(`   ❌ Erro: ${result.error}\n`);
        failed++;
      }
    } catch (err) {
      console.error(`   ❌ Falha de rede: ${err.message}\n`);
      failed++;
    }
  }

  console.log('─────────────────────────────────────');
  console.log(`✅ Migrados com sucesso: ${success}`);
  if (failed > 0) console.log(`❌ Falhas: ${failed}`);
  console.log('─────────────────────────────────────');
}

migrateWorkflows().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
