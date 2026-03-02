/**
 * Script para migrar collaboratorId de UID do Firebase Auth para ID do documento Firestore
 * 
 * Este script:
 * 1. Busca todos os colaboradores
 * 2. Cria um mapa de UID -> ID do documento
 * 3. Atualiza todas as respostas que usam o UID antigo
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, updateDoc, doc, collectionGroup } from 'firebase/firestore';

// Configuração do Firebase (copie do seu firebase/config.ts)
const firebaseConfig = {
  apiKey: "AIzaSyD5QTf_loBVvL56v_I5LN-pXNCQXjVfvy4",
  authDomain: "formbravo-8854e.firebaseapp.com",
  projectId: "formbravo-8854e",
  storageBucket: "formbravo-8854e.firebasestorage.app",
  messagingSenderId: "1027060856533",
  appId: "1:1027060856533:web:c3a9a4e0e8b0e8b0e8b0e8"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function migrateCollaboratorIds() {
  console.log('🚀 Iniciando migração de IDs de colaboradores...');

  try {
    // 1. Buscar todos os colaboradores e criar mapa UID -> ID do documento
    console.log('📋 Buscando colaboradores...');
    const collaboratorsSnapshot = await getDocs(collection(db, 'collaborators'));
    const uidToDocIdMap: Record<string, string> = {};
    
    collaboratorsSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.uid) {
        uidToDocIdMap[data.uid] = doc.id;
        console.log(`  ✓ Mapeado: ${data.username} (UID: ${data.uid} -> Doc ID: ${doc.id})`);
      }
    });

    console.log(`\n📊 Total de colaboradores mapeados: ${Object.keys(uidToDocIdMap).length}`);

    // 2. Buscar todas as respostas usando collectionGroup
    console.log('\n📋 Buscando respostas...');
    const responsesSnapshot = await getDocs(collectionGroup(db, 'responses'));
    
    let totalResponses = 0;
    let updatedResponses = 0;
    let skippedResponses = 0;

    console.log(`\n📊 Total de respostas encontradas: ${responsesSnapshot.size}`);
    console.log('\n🔄 Atualizando respostas...\n');

    // 3. Atualizar cada resposta
    for (const responseDoc of responsesSnapshot.docs) {
      totalResponses++;
      const data = responseDoc.data();
      const oldCollaboratorId = data.collaboratorId;

      // Verificar se o collaboratorId atual é um UID que precisa ser migrado
      if (oldCollaboratorId && uidToDocIdMap[oldCollaboratorId]) {
        const newCollaboratorId = uidToDocIdMap[oldCollaboratorId];
        
        try {
          await updateDoc(responseDoc.ref, {
            collaboratorId: newCollaboratorId
          });
          
          updatedResponses++;
          console.log(`  ✓ [${updatedResponses}/${totalResponses}] Atualizado: ${oldCollaboratorId} -> ${newCollaboratorId}`);
        } catch (error) {
          console.error(`  ✗ Erro ao atualizar resposta ${responseDoc.id}:`, error);
        }
      } else {
        skippedResponses++;
        console.log(`  ⊘ [${totalResponses}] Pulado (já atualizado ou sem mapeamento): ${oldCollaboratorId}`);
      }
    }

    console.log('\n✅ Migração concluída!');
    console.log(`📊 Estatísticas:`);
    console.log(`   - Total de respostas: ${totalResponses}`);
    console.log(`   - Respostas atualizadas: ${updatedResponses}`);
    console.log(`   - Respostas puladas: ${skippedResponses}`);

  } catch (error) {
    console.error('❌ Erro durante a migração:', error);
    throw error;
  }
}

// Executar migração
migrateCollaboratorIds()
  .then(() => {
    console.log('\n🎉 Script finalizado com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script finalizado com erro:', error);
    process.exit(1);
  });
