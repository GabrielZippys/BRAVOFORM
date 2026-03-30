'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Database, RefreshCw, Search, Filter, Trash2, Save, X,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Eye,
  Table, Download, Folder, Check, AlertCircle, Columns, SlidersHorizontal
} from 'lucide-react';
import * as XLSX from 'xlsx';
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

interface ColumnMeta {
  name: string;
  label: string;
  type: string;
  hidden: boolean;
}

interface TableMeta {
  pkColumn: string;
  columns: ColumnMeta[];
  tableName: string;
}

const PAGE_SIZE_OPTIONS = [20, 50, 100];

export default function FirestoreExplorer() {
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [loadingCollections, setLoadingCollections] = useState(true);

  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [tableMeta, setTableMeta] = useState<TableMeta | null>(null);

  const [allFields, setAllFields] = useState<string[]>([]);
  const [visibleFields, setVisibleFields] = useState<string[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterField, setFilterField] = useState('');
  const [filterValue, setFilterValue] = useState('');

  const [sortField, setSortField] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [viewMode, setViewMode] = useState<'table' | 'detail'>('table');
  const [selectedDocument, setSelectedDocument] = useState<DocumentData | null>(null);

  const [editingCell, setEditingCell] = useState<{ docId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [duplicateField, setDuplicateField] = useState<string>('');

  const [sidebarSearch, setSidebarSearch] = useState('');
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [density, setDensity] = useState<'compact' | 'normal' | 'comfortable'>('normal');

  useEffect(() => { loadCollections(); }, []);

  const estimateSize = (data: any): number => {
    try { return new Blob([JSON.stringify(data)]).size; } catch { return 0; }
  };

  const loadCollections = async () => {
    setLoadingCollections(true);
    try {
      const response = await fetch('/api/dataconnect/list-tables');
      const result = await response.json();
      if (result.success) {
        setCollections(result.data.sort((a: CollectionInfo, b: CollectionInfo) => b.documentCount - a.documentCount));
      }
    } catch (error) {
      console.error('Erro ao carregar tabelas PostgreSQL:', error);
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
    setSelectedIds(new Set());
    setShowDuplicates(false);
    setDuplicateField('');
    setTableMeta(null);
    try {
      const response = await fetch(`/api/dataconnect/list-tables?table=${collectionName}`);
      const result = await response.json();
      if (result.success) {
        const meta: TableMeta | null = result.meta || null;
        setTableMeta(meta);
        const pkCol = meta?.pkColumn || 'id';
        const docs: DocumentData[] = result.data.map((row: any) => {
          const id = String(row[pkCol] ?? row.id ?? '');
          const data = { ...row };
          delete data[pkCol];
          return { id, data };
        });
        let fields: string[];
        if (meta?.columns) {
          fields = meta.columns.filter(c => c.name !== pkCol).map(c => c.name);
        } else {
          const fieldsSet = new Set<string>();
          docs.forEach(doc => Object.keys(doc.data).forEach(k => fieldsSet.add(k)));
          fields = Array.from(fieldsSet).sort();
        }
        const hiddenCols = new Set(meta?.columns?.filter(c => c.hidden).map(c => c.name) || []);
        const defaultVisible = fields.filter(f => !hiddenCols.has(f)).slice(0, 10);
        setDocuments(docs);
        setAllFields(fields);
        setVisibleFields(defaultVisible);
      }
    } catch (error) {
      console.error('Erro ao carregar documentos PostgreSQL:', error);
    } finally {
      setLoadingDocs(false);
    }
  };

  const getColumnLabel = (fieldName: string): string => {
    if (!tableMeta?.columns) return fieldName;
    const col = tableMeta.columns.find(c => c.name === fieldName);
    return col?.label || fieldName;
  };

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
    if (typeof value === 'number') return value.toLocaleString('pt-BR');
    if (typeof value === 'string') {
      if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
        try {
          const d = new Date(value);
          return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch { return value; }
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        try { const [y, m, d] = value.split('-'); return `${d}/${m}/${y}`; } catch { return value; }
      }
      if (value.length > 120) return value.slice(0, 117) + '…';
      return value;
    }
    if (value instanceof Date || (value?.toDate && typeof value.toDate === 'function')) {
      const d = value instanceof Date ? value : value.toDate();
      return d.toLocaleString('pt-BR');
    }
    if (Array.isArray(value)) return `[${value.length} itens]`;
    if (typeof value === 'object') {
      const s = JSON.stringify(value);
      return s.length > 100 ? s.slice(0, 97) + '…' : s;
    }
    return String(value);
  };

  const formatCellValue = (value: any, fieldName: string): React.ReactNode => {
    if (value === null || value === undefined) return <span className={styles.cellNull}>—</span>;
    if (typeof value === 'boolean') {
      return <span className={value ? styles.badgeGreen : styles.badgeRed}>{value ? 'Sim' : 'Não'}</span>;
    }
    if (typeof value === 'number') {
      if (['price_snap', 'subtotal', 'preco_atual', 'preco'].some(c => fieldName.includes(c))) {
        return <span className={styles.cellMoney}>R$ {value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>;
      }
      return <span className={styles.cellNumber}>{value.toLocaleString('pt-BR')}</span>;
    }
    if (typeof value === 'string') {
      if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
        try {
          const d = new Date(value);
          return <span className={styles.cellDate}>{d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>;
        } catch { /* fall through */ }
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [y, m, d] = value.split('-');
        return <span className={styles.cellDate}>{`${d}/${m}/${y}`}</span>;
      }
      if (fieldName === 'status') {
        const map: Record<string, string> = { pending: styles.badgeYellow, submitted: styles.badgeGreen, approved: styles.badgeGreen, rejected: styles.badgeRed };
        return <span className={`${styles.badge} ${map[value] || styles.badgeGray}`}>{value}</span>;
      }
      if (fieldName === 'is_active' || fieldName === 'active') {
        const bool = value === 'true' || value === '1';
        return <span className={bool ? styles.badgeGreen : styles.badgeGray}>{bool ? 'Ativo' : 'Inativo'}</span>;
      }
      if (value === '[assinatura-base64]') {
        return <span className={styles.cellSignature}>✍ Assinatura</span>;
      }
      if (fieldName.includes('firebase_id') || fieldName.includes('fb_id')) {
        return <span className={styles.cellFirebaseId} title={value}>{value.length > 14 ? value.slice(0, 14) + '…' : value}</span>;
      }
      if ((value.startsWith('{') || value.startsWith('[')) && value.length > 50) {
        return <span className={styles.cellJson} title={value}>{value.slice(0, 50)}…</span>;
      }
      if (value.length > 80) return <span title={value}>{value.slice(0, 77)}…</span>;
      return <span>{value}</span>;
    }
    if (typeof value === 'object' && value !== null) {
      const s = JSON.stringify(value);
      return <span className={styles.cellJson} title={s}>{s.length > 50 ? s.slice(0, 47) + '…' : s}</span>;
    }
    return <span>{String(value)}</span>;
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

  const duplicateDocuments = useMemo(() => {
    if (!showDuplicates || !duplicateField) return [];
    const valueMap = new Map<string, DocumentData[]>();
    documents.forEach(doc => {
      const value = formatValue(doc.data[duplicateField]);
      if (value && value !== '—') {
        if (!valueMap.has(value)) valueMap.set(value, []);
        valueMap.get(value)!.push(doc);
      }
    });
    const duplicates: DocumentData[] = [];
    valueMap.forEach(docs => { if (docs.length > 1) duplicates.push(...docs); });
    return duplicates;
  }, [documents, showDuplicates, duplicateField]);

  const displayDocuments = showDuplicates ? duplicateDocuments : filteredDocuments;

  const paginatedDocs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return displayDocuments.slice(start, start + pageSize);
  }, [displayDocuments, currentPage, pageSize]);

  const totalPages = Math.ceil(displayDocuments.length / pageSize);

  const hasActiveFilter = !!(searchQuery || (filterField && filterValue) || showDuplicates);

  const clearAllFilters = () => {
    setSearchQuery('');
    setFilterField('');
    setFilterValue('');
    setShowDuplicates(false);
    setDuplicateField('');
    setCurrentPage(1);
  };

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
      const response = await fetch('/api/dataconnect/list-tables', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableName: selectedCollection, id: editingCell.docId, field: editingCell.field, value: parsedValue })
      });
      if (response.ok) {
        setDocuments(docs => docs.map(d =>
          d.id === editingCell.docId ? { ...d, data: { ...d.data, [editingCell.field]: parsedValue } } : d
        ));
        showFeedback('success', 'Campo atualizado com sucesso!');
        setEditingCell(null);
      } else {
        showFeedback('error', 'Erro ao salvar alteração');
      }
    } catch {
      showFeedback('error', 'Erro ao salvar alteração');
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => { setEditingCell(null); setEditValue(''); };

  const handleDeleteDoc = async (docId: string) => {
    if (!selectedCollection) return;
    if (!confirm(`Tem certeza que deseja excluir o registro "${docId}"?`)) return;
    try {
      const response = await fetch(`/api/dataconnect/list-tables?table=${selectedCollection}&id=${docId}`, { method: 'DELETE' });
      if (response.ok) {
        setDocuments(docs => docs.filter(d => d.id !== docId));
        if (selectedDocument?.id === docId) setSelectedDocument(null);
        setCollections(cols => cols.map(c => c.name === selectedCollection ? { ...c, documentCount: c.documentCount - 1 } : c));
        showFeedback('success', 'Registro excluído com sucesso!');
      } else {
        showFeedback('error', 'Erro ao excluir registro');
      }
    } catch {
      showFeedback('error', 'Erro ao excluir registro');
    }
  };

  const exportCollection = () => {
    if (!documents.length || !selectedCollection) return;
    const exportData = documents.map(d => {
      const row: Record<string, any> = { ID: d.id };
      Object.keys(d.data).forEach(key => {
        const value = d.data[key];
        if (value?.toDate) row[key] = value.toDate().toLocaleString('pt-BR');
        else if (Array.isArray(value)) row[key] = value.length > 0 ? JSON.stringify(value) : '';
        else if (typeof value === 'object' && value !== null) row[key] = JSON.stringify(value);
        else row[key] = value;
      });
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, selectedCollection.substring(0, 31));
    const colWidths = Object.keys(exportData[0] || {}).map(key => ({
      wch: Math.min(Math.max(key.length, ...exportData.map(row => String(row[key] || '').length)) + 2, 50)
    }));
    ws['!cols'] = colWidths;
    XLSX.writeFile(wb, `${selectedCollection}_export.xlsx`);
    showFeedback('success', `${documents.length} registros exportados para Excel`);
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
    setVisibleFields(prev => prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedDocs.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(paginatedDocs.map(d => d.id)));
  };

  const toggleSelectDoc = (docId: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(docId)) newSet.delete(docId); else newSet.add(docId);
    setSelectedIds(newSet);
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0 || !selectedCollection) return;
    if (!confirm(`Tem certeza que deseja excluir ${selectedIds.size} registro(s)?`)) return;
    try {
      await Promise.all(Array.from(selectedIds).map(id =>
        fetch(`/api/dataconnect/list-tables?table=${selectedCollection}&id=${id}`, { method: 'DELETE' })
      ));
      setDocuments(docs => docs.filter(d => !selectedIds.has(d.id)));
      setCollections(cols => cols.map(c => c.name === selectedCollection ? { ...c, documentCount: c.documentCount - selectedIds.size } : c));
      setSelectedIds(new Set());
      showFeedback('success', `${selectedIds.size} registro(s) excluído(s)`);
    } catch {
      showFeedback('error', 'Erro ao excluir registros selecionados');
    }
  };

  const getTableCategory = (name: string): 'dim' | 'fact' | 'view' | 'other' => {
    if (name.startsWith('dim_')) return 'dim';
    if (name.startsWith('fact_')) return 'fact';
    if (name.startsWith('vw_')) return 'view';
    return 'other';
  };

  const filteredCollections = useMemo(() => {
    if (!sidebarSearch) return collections;
    return collections.filter(c => c.name.toLowerCase().includes(sidebarSearch.toLowerCase()));
  }, [collections, sidebarSearch]);

  const dimCount = collections.filter(c => c.name.startsWith('dim_')).length;
  const factCount = collections.filter(c => c.name.startsWith('fact_')).length;

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Database size={22} />
          <div>
            <h3>Banco de Dados (PostgreSQL)</h3>
            <p>Visualize, filtre e edite tabelas e registros do Data Connect</p>
          </div>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.headerStats}>
            <span className={styles.statPill} style={{ borderColor: '#4299e1', color: '#63b3ed' }}>{dimCount} dim</span>
            <span className={styles.statPill} style={{ borderColor: '#10b981', color: '#10b981' }}>{factCount} fact</span>
            <span className={styles.statPill}>{collections.length} total</span>
          </div>
          <button onClick={loadCollections} className={styles.refreshButton} disabled={loadingCollections}>
            <RefreshCw size={16} className={loadingCollections ? styles.spinning : ''} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`${styles.feedback} ${feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError}`}>
          {feedback.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
          {feedback.message}
        </div>
      )}

      {/* Layout */}
      <div className={styles.layout}>
        {/* Sidebar */}
        <div className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <span className={styles.sidebarTitle}>Tabelas ({collections.length})</span>
          </div>
          <div className={styles.sidebarSearch}>
            <Search size={13} />
            <input
              type="text"
              placeholder="Buscar tabela..."
              value={sidebarSearch}
              onChange={e => setSidebarSearch(e.target.value)}
              className={styles.sidebarSearchInput}
            />
            {sidebarSearch && <button onClick={() => setSidebarSearch('')} className={styles.clearBtn}><X size={11} /></button>}
          </div>
          {loadingCollections ? (
            <div className={styles.loadingState}>
              <RefreshCw size={18} className={styles.spinning} />
              <span>Carregando...</span>
            </div>
          ) : (
            <div className={styles.collectionsList}>
              {filteredCollections.map(col => {
                const cat = getTableCategory(col.name);
                return (
                  <div
                    key={col.name}
                    className={`${styles.collectionItem} ${selectedCollection === col.name ? styles.activeCollection : ''} ${styles[`cat_${cat}`] || ''}`}
                    onClick={() => loadDocuments(col.name)}
                    title={col.name}
                  >
                    <div className={styles.collectionInfo}>
                      <span className={`${styles.catDot} ${styles[`dot_${cat}`]}`} />
                      <span className={styles.collectionName}>{col.name}</span>
                    </div>
                    <div className={styles.collectionMeta}>
                      <span className={styles.docBadge}>{col.documentCount.toLocaleString('pt-BR')}</span>
                      <span className={styles.sizeBadge}>{formatBytes(col.estimatedSize)}</span>
                    </div>
                  </div>
                );
              })}
              {filteredCollections.length === 0 && (
                <div className={styles.sidebarEmpty}>Nenhuma tabela encontrada</div>
              )}
            </div>
          )}
        </div>

        {/* Main */}
        <div className={styles.mainContent}>
          {!selectedCollection ? (
            <div className={styles.emptyMain}>
              <Database size={44} />
              <h4>Selecione uma tabela</h4>
              <p>Escolha uma tabela no painel lateral para explorar seus registros</p>
            </div>
          ) : loadingDocs ? (
            <div className={styles.emptyMain}>
              <RefreshCw size={28} className={styles.spinning} />
              <p>Carregando registros...</p>
            </div>
          ) : (
            <>
              {/* Toolbar principal */}
              <div className={styles.toolbar}>
                {/* Linha 1: título + busca + filtro */}
                <div className={styles.toolbarRow}>
                  <div className={styles.toolbarLeft}>
                    <h4 className={styles.tableTitle}>{selectedCollection}</h4>
                    <span className={styles.countBadge}>
                      {showDuplicates
                        ? `${displayDocuments.length} duplicados`
                        : `${displayDocuments.length.toLocaleString('pt-BR')} de ${documents.length.toLocaleString('pt-BR')}`}
                    </span>
                    {selectedIds.size > 0 && (
                      <span className={styles.selectedBadge}>{selectedIds.size} sel.</span>
                    )}
                  </div>
                  <div className={styles.toolbarRight}>
                    {/* Densidade */}
                    <div className={styles.densityGroup}>
                      {(['compact', 'normal', 'comfortable'] as const).map(d => (
                        <button
                          key={d}
                          className={`${styles.densityBtn} ${density === d ? styles.densityBtnActive : ''}`}
                          onClick={() => setDensity(d)}
                          title={`Densidade: ${d}`}
                        >
                          {d === 'compact' ? '≡' : d === 'normal' ? '☰' : '⊟'}
                        </button>
                      ))}
                    </div>
                    {selectedIds.size > 0 && (
                      <button onClick={handleDeleteSelected} className={`${styles.toolBtn} ${styles.toolBtnDanger}`} title="Excluir selecionados">
                        <Trash2 size={14} />
                        <span>{selectedIds.size}</span>
                      </button>
                    )}
                    <button onClick={exportCollection} className={styles.toolBtn} title="Exportar para Excel">
                      <Download size={14} />
                    </button>
                  </div>
                </div>

                {/* Linha 2: filtros */}
                <div className={styles.toolbarRow}>
                  {/* Busca geral */}
                  <div className={styles.searchBox}>
                    <Search size={13} />
                    <input
                      type="text"
                      placeholder="Buscar em todos os campos..."
                      value={searchQuery}
                      onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); setShowDuplicates(false); }}
                      className={styles.searchInput}
                      disabled={showDuplicates}
                    />
                    {searchQuery && <button onClick={() => setSearchQuery('')} className={styles.clearBtn}><X size={11} /></button>}
                  </div>

                  {/* Filtro por campo */}
                  <div className={styles.filterGroup}>
                    <Filter size={13} style={{ color: filterField ? '#63b3ed' : '#64748b', flexShrink: 0 }} />
                    <select
                      value={filterField}
                      onChange={e => { setFilterField(e.target.value); setFilterValue(''); setCurrentPage(1); setShowDuplicates(false); }}
                      className={`${styles.filterSelect} ${filterField ? styles.filterSelectActive : ''}`}
                    >
                      <option value="">Filtrar por campo...</option>
                      {allFields.map(f => <option key={f} value={f}>{getColumnLabel(f)}</option>)}
                    </select>
                    {filterField && (
                      <input
                        type="text"
                        placeholder={`Valor de "${getColumnLabel(filterField)}"...`}
                        value={filterValue}
                        onChange={e => { setFilterValue(e.target.value); setCurrentPage(1); }}
                        className={styles.filterValue}
                        autoFocus
                      />
                    )}
                  </div>

                  {/* Duplicados */}
                  {filterField && !showDuplicates && (
                    <button
                      onClick={() => { setDuplicateField(filterField); setShowDuplicates(true); setSearchQuery(''); setFilterValue(''); }}
                      className={styles.toolBtnSmall}
                      title="Encontrar duplicados neste campo"
                    >
                      <AlertCircle size={13} />
                      Duplicados
                    </button>
                  )}

                  {/* Limpar filtros */}
                  {hasActiveFilter && (
                    <button onClick={clearAllFilters} className={`${styles.toolBtnSmall} ${styles.toolBtnClear}`}>
                      <X size={13} />
                      Limpar filtros
                    </button>
                  )}

                  <div style={{ marginLeft: 'auto' }}>
                    <button
                      className={`${styles.toolBtnSmall} ${showColumnSelector ? styles.toolBtnActive : ''}`}
                      onClick={() => setShowColumnSelector(v => !v)}
                    >
                      <Columns size={13} />
                      Colunas ({visibleFields.length}/{allFields.length})
                    </button>
                  </div>
                </div>

                {/* Indicador de filtro ativo */}
                {showDuplicates && (
                  <div className={styles.activeFilterBar}>
                    <AlertCircle size={13} />
                    <span>Mostrando duplicados do campo <strong>{getColumnLabel(duplicateField)}</strong></span>
                    <button onClick={() => { setShowDuplicates(false); setDuplicateField(''); }} className={styles.clearBtn}><X size={12} /></button>
                  </div>
                )}
                {filterField && filterValue && !showDuplicates && (
                  <div className={styles.activeFilterBar}>
                    <Filter size={13} />
                    <span>Filtro ativo: <strong>{getColumnLabel(filterField)}</strong> contém <strong>"{filterValue}"</strong> — {displayDocuments.length} resultado(s)</span>
                    <button onClick={() => { setFilterField(''); setFilterValue(''); }} className={styles.clearBtn}><X size={12} /></button>
                  </div>
                )}
              </div>

              {/* Seletor de colunas colapsável */}
              {showColumnSelector && (
                <div className={styles.columnSelector}>
                  <div className={styles.columnSelectorHeader}>
                    <span className={styles.columnLabel}>Selecionar colunas visíveis</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className={styles.colActionBtn} onClick={() => setVisibleFields(allFields)}>Todas</button>
                      <button className={styles.colActionBtn} onClick={() => setVisibleFields([])}>Nenhuma</button>
                    </div>
                  </div>
                  <div className={styles.columnTags}>
                    {allFields.map(field => (
                      <button
                        key={field}
                        className={`${styles.columnTag} ${visibleFields.includes(field) ? styles.columnTagActive : ''}`}
                        onClick={() => toggleField(field)}
                        title={field}
                      >
                        {visibleFields.includes(field) && <Check size={10} style={{ marginRight: 3, flexShrink: 0 }} />}
                        {getColumnLabel(field)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Detail View */}
              {selectedDocument && viewMode === 'detail' ? (
                <div className={styles.detailPanel}>
                  <div className={styles.detailHeader}>
                    <h4>Registro: <code>{selectedDocument.id}</code></h4>
                    <button onClick={() => { setSelectedDocument(null); setViewMode('table'); }} className={styles.toolBtnSmall}>
                      <X size={14} /> Fechar
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
                            <td className={styles.fieldNameCell}>
                              {getColumnLabel(key)}
                              <br /><span className={styles.fieldNameRaw}>{key}</span>
                            </td>
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
                  <div className={styles.tableWrapper}>
                    <table className={`${styles.dataTable} ${styles[`density_${density}`]}`}>
                      <thead>
                        <tr>
                          <th className={styles.thCheckbox}>
                            <input
                              type="checkbox"
                              checked={paginatedDocs.length > 0 && selectedIds.size === paginatedDocs.length}
                              onChange={toggleSelectAll}
                              className={styles.checkbox}
                            />
                          </th>
                          <th onClick={() => handleSort('_id')} className={styles.thSortable}>
                            <span className={`${styles.thContent} ${sortField === '_id' ? styles.thSorted : ''}`}>
                              #
                              {sortField === '_id' && (sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                            </span>
                          </th>
                          {visibleFields.map(field => (
                            <th key={field} onClick={() => handleSort(field)} className={styles.thSortable}>
                              <span className={`${styles.thContent} ${sortField === field ? styles.thSorted : ''}`}>
                                {getColumnLabel(field)}
                                {sortField === field && (sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                              </span>
                            </th>
                          ))}
                          <th className={styles.thActions}>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedDocs.length === 0 ? (
                          <tr>
                            <td colSpan={visibleFields.length + 3} className={styles.noResults}>
                              Nenhum registro encontrado
                              {hasActiveFilter && (
                                <button onClick={clearAllFilters} className={styles.toolBtnSmall} style={{ marginLeft: 12 }}>
                                  <X size={12} /> Limpar filtros
                                </button>
                              )}
                            </td>
                          </tr>
                        ) : (
                          paginatedDocs.map(docItem => (
                            <tr key={docItem.id} className={`${styles.dataRow} ${selectedIds.has(docItem.id) ? styles.dataRowSelected : ''}`}>
                              <td className={styles.checkboxCell}>
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(docItem.id)}
                                  onChange={() => toggleSelectDoc(docItem.id)}
                                  className={styles.checkbox}
                                />
                              </td>
                              <td className={styles.idCell}>{docItem.id}</td>
                              {visibleFields.map(field => {
                                const isEditing = editingCell?.docId === docItem.id && editingCell?.field === field;
                                const val = docItem.data[field];
                                const editable = !['array', 'map', 'timestamp'].includes(getTypeLabel(val));
                                return (
                                  <td
                                    key={field}
                                    className={`${styles.dataCell} ${editable ? styles.editableCell : ''}`}
                                    onDoubleClick={() => editable && startEdit(docItem.id, field, val)}
                                    title={editable ? 'Duplo clique para editar' : undefined}
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
                                        <button onClick={saveEdit} className={styles.editSaveBtn} disabled={saving}><Check size={13} /></button>
                                        <button onClick={cancelEdit} className={styles.editCancelBtn}><X size={13} /></button>
                                      </div>
                                    ) : (
                                      <span className={styles.cellValue}>{formatCellValue(val, field)}</span>
                                    )}
                                  </td>
                                );
                              })}
                              <td className={styles.actionsCell}>
                                <button onClick={() => { setSelectedDocument(docItem); setViewMode('detail'); }} className={styles.actionBtn} title="Ver detalhes">
                                  <Eye size={13} />
                                </button>
                                <button onClick={() => handleDeleteDoc(docItem.id)} className={`${styles.actionBtn} ${styles.actionBtnDanger}`} title="Excluir">
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className={styles.pagination}>
                    <div className={styles.pageSizeGroup}>
                      <span className={styles.pageInfo}>Linhas por página:</span>
                      {PAGE_SIZE_OPTIONS.map(s => (
                        <button
                          key={s}
                          className={`${styles.pageSizeBtn} ${pageSize === s ? styles.pageSizeBtnActive : ''}`}
                          onClick={() => { setPageSize(s); setCurrentPage(1); }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    <span className={styles.pageInfo}>
                      {displayDocuments.length === 0 ? '0 registros' : (
                        `${((currentPage - 1) * pageSize + 1).toLocaleString('pt-BR')}–${Math.min(currentPage * pageSize, displayDocuments.length).toLocaleString('pt-BR')} de ${displayDocuments.length.toLocaleString('pt-BR')}`
                      )}
                    </span>
                    {totalPages > 1 && (
                      <div className={styles.pageButtons}>
                        <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className={styles.pageBtn} title="Primeira">«</button>
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className={styles.pageBtn}>
                          <ChevronLeft size={14} />
                        </button>
                        <span className={styles.pageNumber}>{currentPage} / {totalPages}</span>
                        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className={styles.pageBtn}>
                          <ChevronRight size={14} />
                        </button>
                        <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className={styles.pageBtn} title="Última">»</button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
