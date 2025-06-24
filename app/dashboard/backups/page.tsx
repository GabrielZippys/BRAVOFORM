'use client';

import React, { useState, useEffect } from 'react';
import styles from '../../styles/Backups.module.css';
import { db } from '../../../firebase/config';
// CORREÇÃO: Removido 'collectionGroup' que não estava sendo usado.
import { collection, getDocs } from 'firebase/firestore';

export default function BackupsPage() {
  const [storageUsed, setStorageUsed] = useState(0);
  const [loading, setLoading] = useState(true);
  
  const storageTotal = 10; // Capacidade total de armazenamento em GB (exemplo)

  useEffect(() => {
    const calculateStorage = async () => {
      setLoading(true);
      try {
        const collectionsToCount = ['companies', 'users', 'forms'];
        let totalDocs = 0;

        for (const col of collectionsToCount) {
          const querySnapshot = await getDocs(collection(db, col));
          totalDocs += querySnapshot.size;
        }

        const simulatedUsage = totalDocs * 0.01; 
        
        setStorageUsed(simulatedUsage);
      } catch (error) {
        console.error("Erro ao calcular o uso de armazenamento:", error);
      } finally {
        setLoading(false);
      }
    };

    calculateStorage();
  }, []);

  const usagePercentage = (storageUsed / storageTotal) * 100;

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2 className={styles.title}>Backups e Armazenamento</h2>
      </div>

      <div className={styles.frame}>
        <h3 className={styles.frameTitle}>Uso de Armazenamento</h3>
        
        {loading ? (
            <p className={styles.storageText}>Calculando uso...</p>
        ) : (
            <div className={styles.storageUsage}>
              <div className={styles.progressBarContainer}>
                <div 
                  className={styles.progressBar} 
                  style={{ width: `${usagePercentage}%` }}
                >
                </div>
              </div>
              <p className={styles.storageText}>
                Utilizado: {storageUsed.toFixed(2)} GB de {storageTotal} GB
              </p>
            </div>
        )}
      </div>

       <div className={styles.frame}>
        <h3 className={styles.frameTitle}>Configurações de Backup</h3>
        <p style={{color: 'rgba(240, 234, 214, 0.7)', fontSize: '0.875rem', marginBottom: '1.5rem'}}>
            Configure backups automáticos dos seus dados ou gere um backup completo a qualquer momento.
        </p>
      </div>
    </div>
  );
}
