'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, getDoc, query, limit } from 'firebase/firestore';
import { Database, ChevronRight, ChevronDown, FileText, Folder, RefreshCw } from 'lucide-react';
import { db } from '../../firebase/config';
import styles from '../../app/styles/FirestoreExplorer.module.css';

interface CollectionStats {
  name: string;
  documentCount: number;
  estimatedSize: number;
  isExpanded: boolean;
}

interface DocumentPreview {
  id: string;
  data: any;
  size: number;
}

export default function FirestoreExplorer() {
  const [collections, setCollections] = useState<CollectionStats[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentPreview[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<DocumentPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [totalSize, setTotalSize] = useState(0);

  // Lista de collections conhecidas do sistema
  const knownCollections = [
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
    loadCollections();
  }, []);

  const estimateDocumentSize = (data: any): number => {
    const jsonString = JSON.stringify(data);
    return new Blob([jsonString]).size;
  };

  const loadCollections = async () => {
    setLoading(true);
    try {
      const collectionStats: CollectionStats[] = [];
      let total = 0;

      for (const collectionName of knownCollections) {
        try {
          const collectionRef = collection(db, collectionName);
          const snapshot = await getDocs(collectionRef);
          
          let collectionSize = 0;
          snapshot.forEach((doc) => {
            const size = estimateDocumentSize(doc.data());
            collectionSize += size;
          });

          total += collectionSize;

          collectionStats.push({
            name: collectionName,
            documentCount: snapshot.size,
            estimatedSize: collectionSize,
            isExpanded: false
          });
        } catch (error) {
          console.error(`Erro ao carregar collection ${collectionName}:`, error);
        }
      }

      setCollections(collectionStats.sort((a, b) => b.estimatedSize - a.estimatedSize));
      setTotalSize(total);
    } catch (error) {
      console.error('Erro ao carregar collections:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDocuments = async (collectionName: string) => {
    setLoadingDocs(true);
    setSelectedCollection(collectionName);
    setSelectedDocument(null);
    
    try {
      const collectionRef = collection(db, collectionName);
      const q = query(collectionRef, limit(50)); // Limitar a 50 documentos
      const snapshot = await getDocs(q);
      
      const docs: DocumentPreview[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        docs.push({
          id: doc.id,
          data,
          size: estimateDocumentSize(data)
        });
      });

      setDocuments(docs);
    } catch (error) {
      console.error('Erro ao carregar documentos:', error);
    } finally {
      setLoadingDocs(false);
    }
  };

  const toggleCollection = (collectionName: string) => {
    const collection = collections.find(c => c.name === collectionName);
    if (collection && !collection.isExpanded) {
      loadDocuments(collectionName);
    } else {
      setSelectedCollection(null);
      setDocuments([]);
      setSelectedDocument(null);
    }

    setCollections(collections.map(c => 
      c.name === collectionName 
        ? { ...c, isExpanded: !c.isExpanded }
        : { ...c, isExpanded: false }
    ));
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatJSON = (obj: any): string => {
    return JSON.stringify(obj, null, 2);
  };

  const renderValue = (value: any): string => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'object') {
      if (value.toDate && typeof value.toDate === 'function') {
        return value.toDate().toLocaleString('pt-BR');
      }
      if (Array.isArray(value)) {
        return `Array(${value.length})`;
      }
      return 'Object';
    }
    if (typeof value === 'string') return `"${value}"`;
    return String(value);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Database size={24} />
          <div>
            <h3>Explorador do Firestore</h3>
            <p>Visualize todas as collections e documentos em tempo real</p>
          </div>
        </div>
        <button onClick={loadCollections} className={styles.refreshButton} disabled={loading}>
          <RefreshCw size={18} className={loading ? styles.spinning : ''} />
          Atualizar
        </button>
      </div>

      <div className={styles.stats}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total de Collections</span>
          <span className={styles.statValue}>{collections.length}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total de Documentos</span>
          <span className={styles.statValue}>
            {collections.reduce((sum, c) => sum + c.documentCount, 0).toLocaleString('pt-BR')}
          </span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Tamanho Estimado</span>
          <span className={styles.statValue}>{formatBytes(totalSize)}</span>
        </div>
      </div>

      <div className={styles.explorer}>
        <div className={styles.collectionsPanel}>
          <h4>Collections</h4>
          {loading ? (
            <div className={styles.loading}>
              <RefreshCw size={24} className={styles.spinning} />
              <span>Carregando...</span>
            </div>
          ) : (
            <div className={styles.collectionsList}>
              {collections.map((col) => (
                <div key={col.name} className={styles.collectionItem}>
                  <div 
                    className={`${styles.collectionHeader} ${col.isExpanded ? styles.active : ''}`}
                    onClick={() => toggleCollection(col.name)}
                  >
                    <div className={styles.collectionInfo}>
                      {col.isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      <Folder size={18} />
                      <span className={styles.collectionName}>{col.name}</span>
                    </div>
                    <div className={styles.collectionMeta}>
                      <span className={styles.docCount}>{col.documentCount} docs</span>
                      <span className={styles.size}>{formatBytes(col.estimatedSize)}</span>
                    </div>
                  </div>

                  {col.isExpanded && (
                    <div className={styles.documentsContainer}>
                      {loadingDocs ? (
                        <div className={styles.loadingDocs}>Carregando documentos...</div>
                      ) : (
                        documents.map((doc) => (
                          <div
                            key={doc.id}
                            className={`${styles.documentItem} ${selectedDocument?.id === doc.id ? styles.selected : ''}`}
                            onClick={() => setSelectedDocument(doc)}
                          >
                            <FileText size={16} />
                            <span className={styles.docId}>{doc.id}</span>
                            <span className={styles.docSize}>{formatBytes(doc.size)}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.documentPanel}>
          {selectedDocument ? (
            <>
              <div className={styles.documentHeader}>
                <h4>Documento: {selectedDocument.id}</h4>
                <span className={styles.documentSize}>{formatBytes(selectedDocument.size)}</span>
              </div>
              
              <div className={styles.documentContent}>
                <div className={styles.fieldsView}>
                  <h5>Campos</h5>
                  <table className={styles.fieldsTable}>
                    <thead>
                      <tr>
                        <th>Campo</th>
                        <th>Tipo</th>
                        <th>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(selectedDocument.data).map(([key, value]) => (
                        <tr key={key}>
                          <td className={styles.fieldName}>{key}</td>
                          <td className={styles.fieldType}>{typeof value}</td>
                          <td className={styles.fieldValue}>{renderValue(value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className={styles.jsonView}>
                  <h5>JSON</h5>
                  <pre className={styles.jsonCode}>
                    {formatJSON(selectedDocument.data)}
                  </pre>
                </div>
              </div>
            </>
          ) : (
            <div className={styles.emptyState}>
              <FileText size={48} />
              <p>Selecione um documento para visualizar</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
