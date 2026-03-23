'use client';

import React, { useState, useEffect } from 'react';
import styles from '../../styles/Backups.module.css';
import { db } from '../../../firebase/config';
import { collection, getDocs } from 'firebase/firestore';
import FirestoreExplorer from '../../../src/components/FirestoreExplorer';

export default function BackupsPage() {
  const [storageUsed, setStorageUsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [totalDocuments, setTotalDocuments] = useState(0);
  const [collectionsCount, setCollectionsCount] = useState(0);
  
  const storageTotal = 1; // 1 GB = limite do plano gratuito do Firestore

  // Lista completa de collections do sistema
  const allCollections = [
    'companies',
    'departments', 
    'collaborators',
    'forms',
    'form_responses',
    'workflows',
    'workflow_instances',
    'purchase_orders',
    'excluded_orders',
    'integrations',
    'notifications',
    'users'
  ];

  useEffect(() => {
    calculateRealStorage();
    
    // Atualizar dados a cada 2 segundos
    const interval = setInterval(() => {
      calculateRealStorage();
    }, 2000);
    
    return () => clearInterval(interval);
  }, []);

  const estimateDocumentSize = (data: any): number => {
    const jsonString = JSON.stringify(data);
    return new Blob([jsonString]).size;
  };

  const calculateRealStorage = async () => {
    setLoading(true);
    try {
      let totalSize = 0;
      let totalDocs = 0;
      let existingCollections = 0;

      for (const collectionName of allCollections) {
        try {
          const collectionRef = collection(db, collectionName);
          const snapshot = await getDocs(collectionRef);
          
          if (snapshot.size > 0) {
            existingCollections++;
            totalDocs += snapshot.size;

            snapshot.forEach((doc) => {
              const docSize = estimateDocumentSize(doc.data());
              totalSize += docSize;
              
              // Adicionar overhead do Firestore (nome do documento, índices, etc)
              totalSize += doc.id.length * 2; // ID do documento
              totalSize += 32; // Overhead de metadados
            });
          }
        } catch (error) {
          console.error(`Erro ao processar collection ${collectionName}:`, error);
        }
      }

      // Converter bytes para GB
      const sizeInGB = totalSize / (1024 * 1024 * 1024);
      
      setStorageUsed(sizeInGB);
      setTotalDocuments(totalDocs);
      setCollectionsCount(existingCollections);
    } catch (error) {
      console.error("Erro ao calcular o uso de armazenamento:", error);
    } finally {
      setLoading(false);
    }
  };

  const usagePercentage = Math.min((storageUsed / storageTotal) * 100, 100);

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2 className={styles.title}>Backups e Armazenamento</h2>
      </div>

      <div className={styles.frame}>
        <h3 className={styles.frameTitle}>Uso de Armazenamento em Tempo Real</h3>
        
        {loading ? (
            <div style={{textAlign: 'center', padding: '2rem'}}>
              <p className={styles.storageText}>🔄 Calculando uso real do Firestore...</p>
              <p style={{color: 'rgba(240, 234, 214, 0.5)', fontSize: '0.75rem', marginTop: '0.5rem'}}>
                Analisando todas as collections e documentos
              </p>
            </div>
        ) : (
            <>
              <div className={styles.storageUsage}>
                <div className={styles.progressBarContainer}>
                  <div 
                    className={styles.progressBar} 
                    style={{ 
                      width: `${usagePercentage}%`,
                      backgroundColor: usagePercentage > 80 ? '#ef4444' : usagePercentage > 50 ? '#f59e0b' : '#10b981'
                    }}
                  >
                  </div>
                </div>
                <p className={styles.storageText}>
                  Utilizado: {storageUsed < 0.01 ? (storageUsed * 1024).toFixed(2) + ' MB' : storageUsed.toFixed(3) + ' GB'} de {storageTotal} GB
                  <span style={{marginLeft: '1rem', color: 'rgba(240, 234, 214, 0.6)', fontSize: '0.875rem'}}>
                    ({usagePercentage.toFixed(2)}%)
                  </span>
                </p>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '1rem',
                marginTop: '1.5rem'
              }}>
                <div style={{
                  background: 'rgba(99, 179, 237, 0.1)',
                  padding: '1rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(99, 179, 237, 0.3)'
                }}>
                  <p style={{color: 'rgba(240, 234, 214, 0.6)', fontSize: '0.75rem', margin: '0 0 0.5rem 0'}}>
                    Collections Ativas
                  </p>
                  <p style={{color: '#63b3ed', fontSize: '1.5rem', fontWeight: '700', margin: 0}}>
                    {collectionsCount}
                  </p>
                </div>

                <div style={{
                  background: 'rgba(16, 185, 129, 0.1)',
                  padding: '1rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(16, 185, 129, 0.3)'
                }}>
                  <p style={{color: 'rgba(240, 234, 214, 0.6)', fontSize: '0.75rem', margin: '0 0 0.5rem 0'}}>
                    Total de Documentos
                  </p>
                  <p style={{color: '#10b981', fontSize: '1.5rem', fontWeight: '700', margin: 0}}>
                    {totalDocuments.toLocaleString('pt-BR')}
                  </p>
                </div>

                <div style={{
                  background: 'rgba(245, 158, 11, 0.1)',
                  padding: '1rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(245, 158, 11, 0.3)'
                }}>
                  <p style={{color: 'rgba(240, 234, 214, 0.6)', fontSize: '0.75rem', margin: '0 0 0.5rem 0'}}>
                    Espaço Disponível
                  </p>
                  <p style={{color: '#f59e0b', fontSize: '1.5rem', fontWeight: '700', margin: 0}}>
                    {(storageTotal - storageUsed).toFixed(3)} GB
                  </p>
                </div>
              </div>
            </>
        )}
      </div>

      {/* Explorador do Firestore */}
      <FirestoreExplorer />

      {/* Indicador de atualização em tempo real */}
      <div style={{
        textAlign: 'center',
        padding: '1rem',
        color: 'rgba(240, 234, 214, 0.5)',
        fontSize: '0.75rem'
      }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#10b981',
            animation: 'pulse 2s infinite'
          }}></span>
          Dados atualizados em tempo real (a cada 2 segundos)
        </span>
      </div>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.3;
          }
        }
      `}</style>
    </div>
  );
}
