'use client';

import { useState } from 'react';
import { collection, getDocs, query, where, limit, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { FormResponse } from '@/types';
import { ResponseStorageService } from '@/services/responseStorageService';
import styles from '../../app/styles/DataMigrationTool.module.css';

export default function DataMigrationTool() {
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [progress, setProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });
  const [logs, setLogs] = useState<string[]>([]);
  const [batchSize, setBatchSize] = useState(50);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev].slice(0, 100));
  };

  const migrateResponses = async () => {
    setStatus('running');
    setProgress({ current: 0, total: 0, success: 0, failed: 0 });
    setLogs([]);
    addLog('🚀 Iniciando migração de respostas do Firestore para PostgreSQL...');

    try {
      // 1. Contar total de respostas
      addLog('📊 Contando respostas no Firestore...');
      const responsesRef = collection(db, 'responses');
      const snapshot = await getDocs(responsesRef);
      const totalResponses = snapshot.size;
      
      setProgress(prev => ({ ...prev, total: totalResponses }));
      addLog(`✅ Total de respostas encontradas: ${totalResponses}`);

      if (totalResponses === 0) {
        addLog('⚠️ Nenhuma resposta encontrada para migrar');
        setStatus('completed');
        return;
      }

      // 2. Processar em lotes
      const responses: FormResponse[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        responses.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt || Timestamp.now(),
          submittedAt: data.submittedAt || data.createdAt || Timestamp.now()
        } as FormResponse);
      });

      addLog(`📦 Processando ${responses.length} respostas em lotes de ${batchSize}...`);

      // 3. Migrar em lotes
      let successCount = 0;
      let failedCount = 0;

      for (let i = 0; i < responses.length; i += batchSize) {
        const batch = responses.slice(i, i + batchSize);
        addLog(`🔄 Migrando lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(responses.length / batchSize)}...`);

        const result = await ResponseStorageService.saveBatch(batch);
        successCount += result.success;
        failedCount += result.failed;

        if (result.errors.length > 0) {
          result.errors.forEach(error => addLog(`❌ ${error}`));
        }

        setProgress({
          current: i + batch.length,
          total: totalResponses,
          success: successCount,
          failed: failedCount
        });

        // Pequeno delay entre lotes para não sobrecarregar
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      addLog('✅ Migração concluída!');
      addLog(`📊 Resumo: ${successCount} sucesso, ${failedCount} falhas`);
      setStatus('completed');

    } catch (error: any) {
      addLog(`❌ Erro durante migração: ${error.message}`);
      setStatus('error');
    }
  };

  const testMigration = async () => {
    setStatus('running');
    setLogs([]);
    addLog('🧪 Testando migração com 5 respostas...');

    try {
      const responsesRef = collection(db, 'responses');
      const testQuery = query(responsesRef, limit(5));
      const snapshot = await getDocs(testQuery);

      const responses: FormResponse[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        responses.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt || Timestamp.now(),
          submittedAt: data.submittedAt || data.createdAt || Timestamp.now()
        } as FormResponse);
      });

      addLog(`📦 Testando com ${responses.length} respostas...`);

      const result = await ResponseStorageService.saveBatch(responses);
      
      addLog(`✅ Teste concluído: ${result.success} sucesso, ${result.failed} falhas`);
      if (result.errors.length > 0) {
        result.errors.forEach(error => addLog(`❌ ${error}`));
      }

      setStatus('completed');

    } catch (error: any) {
      addLog(`❌ Erro no teste: ${error.message}`);
      setStatus('error');
    }
  };

  return (
    <div className={styles.container}>
      <h2>🔄 Migração de Dados: Firestore → PostgreSQL</h2>
      
      <div className={styles.info}>
        <h3>ℹ️ Informações Importantes:</h3>
        <ul>
          <li>✅ <strong>Firestore permanece intacto</strong> - nada será deletado</li>
          <li>✅ <strong>Novas respostas</strong> são salvas em ambos automaticamente</li>
          <li>✅ <strong>Respostas antigas</strong> serão copiadas para PostgreSQL</li>
          <li>⚠️ <strong>Processo pode demorar</strong> dependendo do volume de dados</li>
        </ul>
      </div>

      <div className={styles.controls}>
        <div className={styles.setting}>
          <label>Tamanho do lote:</label>
          <input 
            type="number" 
            value={batchSize}
            onChange={(e) => setBatchSize(Number(e.target.value))}
            min={10}
            max={100}
            disabled={status === 'running'}
          />
          <span className={styles.hint}>Respostas por lote (10-100)</span>
        </div>

        <div className={styles.actions}>
          <button 
            onClick={testMigration}
            disabled={status === 'running'}
            className={styles.testBtn}
          >
            🧪 Testar (5 respostas)
          </button>

          <button 
            onClick={migrateResponses}
            disabled={status === 'running'}
            className={styles.migrateBtn}
          >
            {status === 'running' ? '⏳ Migrando...' : '🚀 Migrar Todas'}
          </button>
        </div>
      </div>

      {progress.total > 0 && (
        <div className={styles.progress}>
          <div className={styles.progressBar}>
            <div 
              className={styles.progressFill}
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
          <div className={styles.progressStats}>
            <span>Progresso: {progress.current}/{progress.total}</span>
            <span className={styles.success}>✅ {progress.success}</span>
            <span className={styles.failed}>❌ {progress.failed}</span>
          </div>
        </div>
      )}

      <div className={styles.logs}>
        <h3>📋 Logs:</h3>
        <div className={styles.logsList}>
          {logs.length === 0 ? (
            <p className={styles.noLogs}>Nenhum log ainda. Clique em "Testar" ou "Migrar Todas".</p>
          ) : (
            logs.map((log, index) => (
              <div key={index} className={styles.logEntry}>
                {log}
              </div>
            ))
          )}
        </div>
      </div>

      <div className={styles.warning}>
        <h3>⚠️ Antes de migrar:</h3>
        <ol>
          <li>Faça backup do Firestore (opcional, mas recomendado)</li>
          <li>Teste com 5 respostas primeiro</li>
          <li>Verifique os logs para garantir que está funcionando</li>
          <li>Só então execute a migração completa</li>
        </ol>
      </div>
    </div>
  );
}
