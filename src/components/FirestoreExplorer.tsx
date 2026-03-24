'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import {
  Database, RefreshCw, Search, Filter, Trash2, Save, X,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Eye,
  Table, Download, Folder, Check, AlertCircle
} from 'lucide-react';
import { db } from '../../firebase/config';
import styles from '../../app/styles/FirestoreExplorer.module.css';

interface CollectionInfo {
  name: string;
  documentCount: number;
  estimatedSize: number;
}

interface DocumentData {
  id: string;
  data: Record<string, any>;
}

export default function FirestoreExplorer() {
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [loadingCollections, setLoadingCollections] = useState(true);

  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  const [allFields, setAllFields] = useState<string[]>([]);
  const [visibleFields, setVisibleFields] = useState<string[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterField, setFilterField] = useState('');
  const [filterValue, setFilterValue] = useState('');

  const [sortField, setSortField] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  const [viewMode, setViewMode] = useState<'table' | 'detail'>('table');
  const [selectedDocument, setSelectedDocument] = useState<DocumentData | null>(null);

  const [editingCell, setEditingCell] = useState<{ docId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Collections conhecidas — só aparecem as que têm documentos
  const knownCollections = [
    'admins', 'collaborators', 'companies', 'departments', 'forms',
    'form_responses', 'password_resets', 'product_catalogs', 'products',
    'sql_profiles', 'users', 'workflows', 'workflow_instances', 'purchase_orders'
  ];

  useEffect(() => {
    loadCollections();
  }, []);

  const estimateSize = (data: any): number => {
    try { return new Blob([JSON.stringify(data)]).size; } catch { return 0; }
  };

  const loadCollections = async () => {
    setLoadingCollections(true);
    try {
      const stats: CollectionInfo[] = [];
      for (const name of knownCollections) {
        try {
          const snap = await getDocs(collection(db, name));
          if (snap.size > 0) {
            let size = 0;
            snap.forEach(d => { size += estimateSize(d.data()); });
            stats.push({ name, documentCount: snap.size, estimatedSize: size });
          }
        } catch { /* skip */ }
      }
      setCollections(stats.sort((a, b) => b.documentCount - a.documentCount));
    } catch (error) {
      console.error('Erro ao carregar collections:', error);
    } finally {
      setLoadingCollections(false);
    }
  };

  const loadDocuments = async (collectionName: string) => {
    setLoadingDocs(true);
    setSelectedCollection(collectionName);
    setSelectedDocument(null);
    setCurrentPage(1);
    setSearchQuery('');
    setFilterField('');
    setFilterValue('');
    setSortField('');
    setEditingCell(null);
    setViewMode('table');
    try {
      const snap = await getDocs(collection(db, collectionName));
      const docs: DocumentData[] = [];
      const fieldsSet = new Set<string>();
      snap.forEach(d => {
        const data = d.data();
        docs.push({ id: d.id, data });
        Object.keys(data).forEach(k => fieldsSet.add(k));
      });
      const fields = Array.from(fieldsSet).sort();
      setDocuments(docs);
      setAllFields(fields);
      setVisibleFields(fields.slice(0, 8));
    } catch (error) {
      console.error('Erro ao carregar documentos:', error);
    } finally {
      setLoadingDocs(false);
    }
  };

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return value.toLocaleString('pt-BR');
    if (typeof value === 'string') return value;
    if (value.toDate && typeof value.toDate === 'function') {
      return value.toDate().toLocaleString('pt-BR');
    }
    if (Array.isArray(value)) return `[${value.length} itens]`;
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const getTypeLabel = (value: any): string => {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'string') return 'string';
    if (value.toDate && typeof value.toDate === 'function') return 'timestamp';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'map';
    return typeof value;
  };

  const filteredDocuments = useMemo(() => {
    let result = [...documents];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(d =>
        d.id.toLowerCase().includes(q) ||
        Object.values(d.data).some(v => formatValue(v).toLowerCase().includes(q))
      );
    }
    if (filterField && filterValue) {
      const fv = filterValue.toLowerCase();
      result = result.filter(d => formatValue(d.data[filterField]).toLowerCase().includes(fv));
    }
    if (sortField) {
      result.sort((a, b) => {
        const aVal = sortField === '_id' ? a.id : formatValue(a.data[sortField]);
        const bVal = sortField === '_id' ? b.id : formatValue(b.data[sortField]);
        const cmp = aVal.localeCompare(bVal, 'pt-BR', { numeric: true });
        return sortDirection === 'asc' ? cmp : -cmp;
      });
    }
    return result;
  }, [documents, searchQuery, filterField, filterValue, sortField, sortDirection]);

  const paginatedDocs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredDocuments.slice(start, start + pageSize);
  }, [filteredDocuments, currentPage]);

  const totalPages = Math.ceil(filteredDocuments.length / pageSize);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const startEdit = (docId: string, field: string, currentValue: any) => {
    const type = getTypeLabel(currentValue);
    if (['array', 'map', 'timestamp'].includes(type)) return;
    setEditingCell({ docId, field });
    setEditValue(formatValue(currentValue));
  };

  const saveEdit = async () => {
    if (!editingCell || !selectedCollection) return;
    setSaving(true);
    try {
      let parsedValue: any = editValue;
      if (!isNaN(Number(editValue)) && editValue.trim() !== '') parsedValue = Number(editValue);
      if (editValue === 'true') parsedValue = true;
      if (editValue === 'false') parsedValue = false;

      await updateDoc(doc(db, selectedCollection, editingCell.docId), {
        [editingCell.field]: parsedValue
      });
      setDocuments(docs => docs.map(d =>
        d.id === editingCell.docId
          ? { ...d, data: { ...d.data, [editingCell.field]: parsedValue } }
          : d
      ));
      showFeedback('success', 'Campo atualizado com sucesso!');
      setEditingCell(null);
    } catch (error) {
      console.error('Erro ao salvar:', error);
      showFeedback('error', 'Erro ao salvar alteração');
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => { setEditingCell(null); setEditValue(''); };

  const handleDeleteDoc = async (docId: string) => {
    if (!selectedCollection) return;
    if (!confirm(`Tem certeza que deseja excluir o documento "${docId}"?`)) return;
    try {
      await deleteDoc(doc(db, selectedCollection, docId));
      setDocuments(docs => docs.filter(d => d.id !== docId));
      if (selectedDocument?.id === docId) setSelectedDocument(null);
      setCollections(cols => cols.map(c =>
        c.name === selectedCollection ? { ...c, documentCount: c.documentCount - 1 } : c
      ));
      showFeedback('success', 'Documento excluído com sucesso!');
    } catch (error) {
      console.error('Erro ao excluir:', error);
      showFeedback('error', 'Erro ao excluir documento');
    }
  };

  const exportCollection = () => {
    if (!documents.length || !selectedCollection) return;
    const exportData = documents.map(d => ({ _id: d.id, ...d.data }));
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedCollection}_export.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3000);
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
  };

  const toggleField = (field: string) => {
    setVisibleFields(prev =>
      prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]
    );
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Database size={24} />
          <div>
            <h3>Explorador do Firestore</h3>
            <p>Visualize, filtre e edite collections e documentos</p>
          </div>
        </div>
        <button onClick={loadCollections} className={styles.refreshButton} disabled={loadingCollections}>
          <RefreshCw size={18} className={loadingCollections ? styles.spinning : ''} />
          Atualizar
        </button>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`${styles.feedback} ${feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError}`}>
          {feedback.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          {feedback.message}
        </div>
      )}

      {/* Layout */}
      <div className={styles.layout}>
        {/* Sidebar */}
        <div className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <h4>Collections ({collections.length})</h4>
          </div>
          {loadingCollections ? (
            <div className={styles.loadingState}>
              <RefreshCw size={20} className={styles.spinning} />
              <span>Carregando...</span>
            </div>
          ) : (
            <div className={styles.collectionsList}>
              {collections.map(col => (
                <div
                  key={col.name}
                  className={`${styles.collectionItem} ${selectedCollection === col.name ? styles.activeCollection : ''}`}
                  onClick={() => loadDocuments(col.name)}
                >
                  <div className={styles.collectionInfo}>
                    <Folder size={16} />
                    <span className={styles.collectionName}>{col.name}</span>
                  </div>
                  <div className={styles.collectionMeta}>
                    <span className={styles.docBadge}>{col.documentCount}</span>
                    <span className={styles.sizeBadge}>{formatBytes(col.estimatedSize)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Main */}
        <div className={styles.mainContent}>
          {!selectedCollection ? (
            <div className={styles.emptyMain}>
              <Database size={48} />
              <h4>Selecione uma collection</h4>
              <p>Escolha uma collection no menu lateral para explorar seus documentos</p>
            </div>
          ) : loadingDocs ? (
            <div className={styles.emptyMain}>
              <RefreshCw size={32} className={styles.spinning} />
              <p>Carregando documentos...</p>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className={styles.toolbar}>
                <div className={styles.toolbarLeft}>
                  <h4>{selectedCollection}</h4>
                  <span className={styles.countBadge}>{filteredDocuments.length} documentos</span>
                </div>
                <div className={styles.toolbarRight}>
                  <button onClick={exportCollection} className={styles.toolBtn} title="Exportar JSON">
                    <Download size={16} />
                  </button>
                  <button
                    onClick={() => { setViewMode('table'); setSelectedDocument(null); }}
                    className={`${styles.toolBtn} ${viewMode === 'table' ? styles.toolBtnActive : ''}`}
                    title="Tabela"
                  >
                    <Table size={16} />
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div className={styles.filterBar}>
                <div className={styles.searchBox}>
                  <Search size={16} />
                  <input
                    type="text"
                    placeholder="Buscar em todos os campos..."
                    value={searchQuery}
                    onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                    className={styles.searchInput}
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className={styles.clearBtn}><X size={14} /></button>
                  )}
                </div>
                <div className={styles.filterGroup}>
                  <Filter size={16} />
                  <select
                    value={filterField}
                    onChange={e => { setFilterField(e.target.value); setCurrentPage(1); }}
                    className={styles.filterSelect}
                  >
                    <option value="">Filtrar por campo...</option>
                    {allFields.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                  {filterField && (
                    <input
                      type="text"
                      placeholder="Valor..."
                      value={filterValue}
                      onChange={e => { setFilterValue(e.target.value); setCurrentPage(1); }}
                      className={styles.filterInput}
                    />
                  )}
                </div>
              </div>

              {/* Column selector */}
              {allFields.length > 8 && (
                <div className={styles.columnSelector}>
                  <span className={styles.columnLabel}>Colunas:</span>
                  <div className={styles.columnTags}>
                    {allFields.map(field => (
                      <button
                        key={field}
                        className={`${styles.columnTag} ${visibleFields.includes(field) ? styles.columnTagActive : ''}`}
                        onClick={() => toggleField(field)}
                      >
                        {field}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Detail View */}
              {selectedDocument && viewMode === 'detail' ? (
                <div className={styles.detailPanel}>
                  <div className={styles.detailHeader}>
                    <h4>Documento: <code>{selectedDocument.id}</code></h4>
                    <button onClick={() => { setSelectedDocument(null); setViewMode('table'); }} className={styles.toolBtn}>
                      <X size={16} />
                    </button>
                  </div>
                  <div className={styles.detailContent}>
                    <table className={styles.detailTable}>
                      <thead>
                        <tr>
                          <th>Campo</th>
                          <th>Tipo</th>
                          <th>Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(selectedDocument.data).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => (
                          <tr key={key}>
                            <td className={styles.fieldNameCell}>{key}</td>
                            <td className={styles.fieldTypeCell}>{getTypeLabel(value)}</td>
                            <td className={styles.fieldValueCell}>
                              {typeof value === 'object' && value !== null && !(value.toDate)
                                ? <pre className={styles.jsonInline}>{JSON.stringify(value, null, 2)}</pre>
                                : formatValue(value)
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className={styles.jsonSection}>
                      <h5>JSON Completo</h5>
                      <pre className={styles.jsonBlock}>{JSON.stringify(selectedDocument.data, null, 2)}</pre>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Table */}
                  <div className={styles.tableContainer}>
                    <table className={styles.dataTable}>
                      <thead>
                        <tr>
                          <th onClick={() => handleSort('_id')}>
                            <span className={`${styles.thContent} ${sortField === '_id' ? styles.thSorted : ''}`}>
                              ID
                              {sortField === '_id' && (sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                            </span>
                          </th>
                          {visibleFields.map(field => (
                            <th key={field} onClick={() => handleSort(field)}>
                              <span className={`${styles.thContent} ${sortField === field ? styles.thSorted : ''}`}>
                                {field}
                                {sortField === field && (sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                              </span>
                            </th>
                          ))}
                          <th className={styles.thActions}>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedDocs.length === 0 ? (
                          <tr>
                            <td colSpan={visibleFields.length + 2} className={styles.noResults}>
                              Nenhum documento encontrado
                            </td>
                          </tr>
                        ) : (
                          paginatedDocs.map(docItem => (
                            <tr key={docItem.id} className={styles.dataRow}>
                              <td className={styles.idCell} title={docItem.id}>
                                {docItem.id.length > 14 ? docItem.id.slice(0, 14) + '…' : docItem.id}
                              </td>
                              {visibleFields.map(field => {
                                const isEditing = editingCell?.docId === docItem.id && editingCell?.field === field;
                                const val = docItem.data[field];
                                const editable = !['array', 'map', 'timestamp'].includes(getTypeLabel(val));
                                return (
                                  <td
                                    key={field}
                                    className={`${styles.dataCell} ${editable ? styles.editableCell : ''}`}
                                    onDoubleClick={() => editable && startEdit(docItem.id, field, val)}
                                    title={editable ? 'Duplo clique para editar' : ''}
                                  >
                                    {isEditing ? (
                                      <div className={styles.editInline}>
                                        <input
                                          type="text"
                                          value={editValue}
                                          onChange={e => setEditValue(e.target.value)}
                                          className={styles.editInput}
                                          autoFocus
                                          onKeyDown={e => {
                                            if (e.key === 'Enter') saveEdit();
                                            if (e.key === 'Escape') cancelEdit();
                                          }}
                                        />
                                        <button onClick={saveEdit} className={styles.editSaveBtn} disabled={saving}><Check size={14} /></button>
                                        <button onClick={cancelEdit} className={styles.editCancelBtn}><X size={14} /></button>
                                      </div>
                                    ) : (
                                      <span className={styles.cellValue}>{formatValue(val)}</span>
                                    )}
                                  </td>
                                );
                              })}
                              <td>
                                <div className={styles.actionsCell}>
                                  <button
                                    onClick={() => { setSelectedDocument(docItem); setViewMode('detail'); }}
                                    className={styles.actionBtn}
                                    title="Ver detalhes"
                                  >
                                    <Eye size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteDoc(docItem.id)}
                                    className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                                    title="Excluir"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className={styles.pagination}>
                      <span className={styles.pageInfo}>
                        {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredDocuments.length)} de {filteredDocuments.length}
                      </span>
                      <div className={styles.pageButtons}>
                        <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className={styles.pageBtn}>«</button>
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className={styles.pageBtn}>
                          <ChevronLeft size={16} />
                        </button>
                        <span className={styles.pageNumber}>{currentPage} / {totalPages}</span>
                        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className={styles.pageBtn}>
                          <ChevronRight size={16} />
                        </button>
                        <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className={styles.pageBtn}>»</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
