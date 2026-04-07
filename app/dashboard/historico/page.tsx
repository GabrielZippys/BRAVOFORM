'use client';

import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { Search, Filter, Eye, Calendar, User, CheckCircle, XCircle, Clock, Trash2, FileText } from 'lucide-react';
import type { WorkflowInstance, WorkflowDocument, FormResponse, Form, Company, Department } from '@/types';
import ResponseDetailsModal from '@/components/ResponseDetailsModal';
import WorkflowInstanceDetailModal from '@/components/WorkflowInstanceDetailModal';
import { WorkflowInstanceServicePg } from '@/services/workflowInstanceServicePg';
import { WorkflowServicePg } from '@/services/workflowServicePg';
import styles from './historico.module.css';

type TabType = 'forms' | 'workflows' | 'trash';

export default function HistoricoPage() {
  const [activeTab, setActiveTab] = useState<TabType>('forms');
  const [instances, setInstances] = useState<WorkflowInstance[]>([]);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [formResponses, setFormResponses] = useState<FormResponse[]>([]);
  const [deletedItems, setDeletedItems] = useState<FormResponse[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros workflows
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // Filtros formulários
  const [formFilter, setFormFilter] = useState<string>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<string>('all');
  const [searchFormTerm, setSearchFormTerm] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [trashPage, setTrashPage] = useState(1);
  const [trashItemsPerPage, setTrashItemsPerPage] = useState(20);

  // Modais
  const [selectedInstance, setSelectedInstance] = useState<WorkflowInstance | null>(null);
  const [selectedResponse, setSelectedResponse] = useState<FormResponse | null>(null);
  const [selectedResponseForm, setSelectedResponseForm] = useState<Form | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ show: boolean; instanceId: string; workflowName: string }>({ show: false, instanceId: '', workflowName: '' });
  const [permanentDeleteModal, setPermanentDeleteModal] = useState<{ show: boolean; response: FormResponse | null }>({ show: false, response: null });

  useEffect(() => { loadData(); }, []);

  // Ao selecionar uma resposta: carregar answers do SQL + estrutura do form do Firestore
  useEffect(() => {
    if (!selectedResponse?.id) return;

    // Sempre buscar respostas completas (com answers) do SQL
    fetch(`/api/dataconnect/responses?id=${encodeURIComponent(selectedResponse.id)}`)
      .then(r => r.json())
      .then(result => {
        if (result.success && result.data) {
          setSelectedResponse(prev => prev?.id === result.data.id ? { ...prev, ...result.data } : prev);
        }
      })
      .catch(() => {});

    // Carregar estrutura do formulário do Firestore (somente se tiver formId)
    const fid = selectedResponse.formId;
    if (fid) {
      getDoc(doc(db, 'forms', fid))
        .then(d => setSelectedResponseForm(d.exists() ? ({ id: d.id, ...d.data() } as Form) : null))
        .catch(() => setSelectedResponseForm(null));
    } else {
      setSelectedResponseForm(null);
    }
  }, [selectedResponse?.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [responsesResult, trashResult, instancesData, workflowsData] = await Promise.all([
        fetch('/api/dataconnect/responses').then(r => r.json()),
        fetch('/api/dataconnect/responses?trash=true').then(r => r.json()),
        WorkflowInstanceServicePg.listInstances(),
        WorkflowServicePg.listWorkflows(),
      ]);

      setFormResponses(responsesResult.success ? responsesResult.data : []);
      setDeletedItems(trashResult.success ? trashResult.data : []);
      setInstances(instancesData);
      setWorkflows(workflowsData);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  // ── Ações ──────────────────────────────────────────────────────────────────

  const handleDeleteInstance = (instanceId: string, workflowName: string) => {
    setDeleteModal({ show: true, instanceId, workflowName });
  };

  const confirmDeleteInstance = async () => {
    try {
      await WorkflowInstanceServicePg.deleteInstance(deleteModal.instanceId);
      setInstances(instances.filter(i => i.id !== deleteModal.instanceId));
      setDeleteModal({ show: false, instanceId: '', workflowName: '' });
    } catch (error) {
      console.error('Erro ao excluir instância:', error);
      alert('Erro ao excluir instância.');
    }
  };

  const handleDeleteResponse = async (response: FormResponse) => {
    if (!confirm(`Deseja realmente excluir a resposta de "${response.collaboratorUsername}"?\n\nEsta ação moverá a resposta para a lixeira.`)) return;
    try {
      const res = await fetch('/api/dataconnect/responses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: response.id, deletedBy: 'admin', deletedByUsername: 'Administrador' }),
      });
      if (!(await res.json()).success) throw new Error('Falha');
      setFormResponses(formResponses.filter(r => r.id !== response.id));
      setDeletedItems([{ ...response, deletedAt: new Date() as any } as any, ...deletedItems]);
      alert('Resposta movida para a lixeira com sucesso!');
    } catch {
      alert('Erro ao excluir resposta.');
    }
  };

  const handlePermanentDelete = async () => {
    if (!permanentDeleteModal.response) return;
    try {
      const res = await fetch(`/api/dataconnect/responses?id=${encodeURIComponent(permanentDeleteModal.response.id)}`, { method: 'DELETE' });
      if (!(await res.json()).success) throw new Error('Falha');
      setDeletedItems(deletedItems.filter(r => r.id !== permanentDeleteModal.response!.id));
      setPermanentDeleteModal({ show: false, response: null });
      alert('Resposta excluída permanentemente!');
    } catch {
      alert('Erro ao excluir permanentemente.');
    }
  };

  const handleRestoreResponse = async (response: FormResponse) => {
    try {
      const res = await fetch('/api/dataconnect/responses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: response.id, restore: true }),
      });
      if (!(await res.json()).success) throw new Error('Falha');
      setDeletedItems(deletedItems.filter(r => r.id !== response.id));
      const restored = { ...response } as any;
      delete restored.deletedAt; delete restored.deletedBy; delete restored.deletedByUsername;
      setFormResponses([restored, ...formResponses]);
      alert('Resposta restaurada com sucesso!');
    } catch {
      alert('Erro ao restaurar resposta.');
    }
  };

  // ── Derivar listas para filtros a partir dos dados carregados ──────────────

  const companies = React.useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    formResponses.forEach(r => { if (r.companyId) map.set(r.companyId, { id: r.companyId, name: (r as any).companyName || r.companyId }); });
    return [...map.values()];
  }, [formResponses]);

  const departments = React.useMemo(() => {
    const map = new Map<string, { id: string; name: string; companyId: string }>();
    formResponses.forEach(r => { if (r.departmentId) map.set(r.departmentId, { id: r.departmentId, name: (r as any).departmentName || r.departmentId, companyId: r.companyId }); });
    return [...map.values()];
  }, [formResponses]);

  const availableDepartments = React.useMemo(() =>
    companyFilter === 'all' ? departments : departments.filter(d => d.companyId === companyFilter),
    [departments, companyFilter]);

  const availableForms = React.useMemo(() => {
    const map = new Map<string, { id: string; title: string }>();
    formResponses
      .filter(r => (companyFilter === 'all' || r.companyId === companyFilter) && (departmentFilter === 'all' || r.departmentId === departmentFilter))
      .forEach(r => { if (r.formId) map.set(r.formId, { id: r.formId, title: r.formTitle || r.formId }); });
    return [...map.values()];
  }, [formResponses, companyFilter, departmentFilter]);

  const availableUsers = React.useMemo(() => {
    return [...new Set(formResponses
      .filter(r => (companyFilter === 'all' || r.companyId === companyFilter) && (departmentFilter === 'all' || r.departmentId === departmentFilter))
      .map(r => r.collaboratorUsername).filter(Boolean))];
  }, [formResponses, companyFilter, departmentFilter]);

  // ── Filtros aplicados ──────────────────────────────────────────────────────

  const filteredInstances = instances.filter(i => {
    const matchSearch = i.workflowName?.toLowerCase().includes(searchTerm.toLowerCase()) || i.assignedToName?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchSearch
      && (selectedWorkflow === 'all' || i.workflowId === selectedWorkflow)
      && (selectedStatus === 'all' || i.status === selectedStatus);
  });

  const filteredFormResponses = React.useMemo(() => {
    let f = [...formResponses];
    if (formFilter !== 'all')       f = f.filter(r => r.formId === formFilter);
    if (companyFilter !== 'all')    f = f.filter(r => r.companyId === companyFilter);
    if (departmentFilter !== 'all') f = f.filter(r => r.departmentId === departmentFilter);
    if (statusFilter !== 'all')     f = f.filter(r => r.status === statusFilter);
    if (userFilter !== 'all')       f = f.filter(r => r.collaboratorUsername === userFilter);
    if (dateRangeFilter !== 'all') {
      f = f.filter(r => {
        const raw = r.submittedAt || r.createdAt;
        const date = raw ? (typeof raw === 'string' ? new Date(raw) : (raw as any).toDate ? (raw as any).toDate() : new Date(raw as any)) : null;
        if (!date) return false;
        const now = new Date();
        if (dateRangeFilter === 'today') return date.toDateString() === now.toDateString();
        if (dateRangeFilter === 'week') { const w = new Date(); w.setDate(w.getDate() - 7); return date >= w; }
        if (dateRangeFilter === 'month') return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        if (dateRangeFilter === 'year') return date.getFullYear() === now.getFullYear();
        return true;
      });
    }
    if (searchFormTerm) {
      const s = searchFormTerm.toLowerCase();
      f = f.filter(r => r.formTitle?.toLowerCase().includes(s) || r.collaboratorUsername?.toLowerCase().includes(s));
    }
    setCurrentPage(1);
    return f;
  }, [formResponses, formFilter, companyFilter, departmentFilter, statusFilter, userFilter, dateRangeFilter, searchFormTerm]);

  const paginatedFormResponses = React.useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredFormResponses.slice(start, end);
  }, [filteredFormResponses, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredFormResponses.length / itemsPerPage);

  const paginatedTrashItems = React.useMemo(() => {
    const start = (trashPage - 1) * trashItemsPerPage;
    const end = start + trashItemsPerPage;
    return deletedItems.slice(start, end);
  }, [deletedItems, trashPage, trashItemsPerPage]);

  const totalTrashPages = Math.ceil(deletedItems.length / trashItemsPerPage);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const formatDate = (ts: any) => {
    if (!ts) return '-';
    const d = typeof ts === 'string' ? new Date(ts) : ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('pt-BR');
  };

  const formatDateTime = (ts: any) => {
    if (!ts) return '-';
    const d = typeof ts === 'string' ? new Date(ts) : ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const getDaysRemaining = (deletedAt: any) => {
    if (!deletedAt) return 0;
    const d = typeof deletedAt === 'string' ? new Date(deletedAt) : deletedAt.toDate ? deletedAt.toDate() : new Date(deletedAt);
    const expiry = new Date(d); expiry.setDate(expiry.getDate() + 30);
    return Math.max(0, Math.ceil((expiry.getTime() - Date.now()) / 86400000));
  };

  const getStatusIcon = (status: string) => {
    if (status === 'completed') return <CheckCircle size={18} className={styles.iconCompleted} />;
    if (status === 'cancelled' || status === 'rejected') return <XCircle size={18} className={styles.iconRejected} />;
    return <Clock size={18} className={styles.iconInProgress} />;
  };

  const getStatusLabel = (status: string) => ({ in_progress: 'Em Andamento', completed: 'Concluído', cancelled: 'Cancelado', rejected: 'Rejeitado' }[status] || status);

  const calculateDuration = (instance: WorkflowInstance) => {
    if (!instance.startedAt) return '-';
    const start = (instance.startedAt as any).toDate ? (instance.startedAt as any).toDate() : new Date(instance.startedAt as any);
    const end = instance.completedAt ? ((instance.completedAt as any).toDate ? (instance.completedAt as any).toDate() : new Date(instance.completedAt as any)) : new Date();
    const h = Math.floor((end.getTime() - start.getTime()) / 3600000);
    const m = Math.floor(((end.getTime() - start.getTime()) % 3600000) / 60000);
    return h > 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}m`;
  };

  const companyForResponse = (r: FormResponse | null) => r ? { id: r.companyId, name: (r as any).companyName || '' } as Company : null;
  const deptForResponse    = (r: FormResponse | null) => r ? { id: r.departmentId, name: (r as any).departmentName || '' } as Department : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <h1>Histórico</h1>
          <p>Visualize e acompanhe formulários e workflows</p>
        </div>
      </div>

      <div className={styles.tabs}>
        <button className={`${styles.tab} ${activeTab === 'forms' ? styles.tabActive : ''}`} onClick={() => setActiveTab('forms')}>
          <FileText size={20} /> Histórico Completo
        </button>
        <button className={`${styles.tab} ${activeTab === 'workflows' ? styles.tabActive : ''}`} onClick={() => setActiveTab('workflows')}>
          <Calendar size={20} /> Workflows
        </button>
        <button className={`${styles.tab} ${activeTab === 'trash' ? styles.tabActive : ''}`} onClick={() => setActiveTab('trash')}>
          <Trash2 size={20} /> Lixeira
        </button>
      </div>

      <div className={styles.content}>

        {/* ── LIXEIRA ─────────────────────────────────────────────────────── */}
        {activeTab === 'trash' && (
          loading ? (
            <div className={styles.loading}><div className={styles.spinner}></div><p>Carregando lixeira...</p></div>
          ) : deletedItems.length === 0 ? (
            <div className={styles.emptyForms}><Trash2 size={48} /><h3>Lixeira</h3><p>Nenhum item excluído</p></div>
          ) : (
            <div className={styles.responsesSection}>
              <div className={styles.responsesInfo}>
                <h3>Itens Excluídos</h3>
                <span className={styles.badge}>{deletedItems.length} itens</span>
              </div>
              <div className={styles.responsesTable}>
                <div className={styles.tableHeader}>
                  <span>Formulário</span><span>Usuário</span><span>Empresa</span><span>Data de Exclusão</span><span>Ações</span>
                </div>
                {paginatedTrashItems.map(item => (
                  <div key={item.id} className={styles.tableRow} onClick={() => setSelectedResponse(item)} style={{ cursor: 'pointer' }}>
                    <div className={styles.formInfo}><FileText size={16} />{item.formTitle || 'Formulário'}</div>
                    <div className={styles.userInfo}><User size={16} />{item.collaboratorUsername || 'Usuário'}</div>
                    <div className={styles.companyInfo}>{(item as any).companyName || item.companyId || 'Empresa'}</div>
                    <div className={styles.dateInfo}>
                      <div>{formatDate((item as any).deletedAt || item.submittedAt || item.createdAt)}</div>
                      <div className={styles.daysRemaining}>⏱️ {getDaysRemaining((item as any).deletedAt)} dias</div>
                    </div>
                    <div className={styles.actionsCell} style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                      <button onClick={(e) => { e.stopPropagation(); handleRestoreResponse(item); }}
                        style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}>
                        Restaurar
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setPermanentDeleteModal({ show: true, response: item }); }}
                        style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}>
                        Excluir Permanentemente
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {totalTrashPages > 1 && (
                <div className={styles.pagination}>
                  <button onClick={() => setTrashPage(p => Math.max(1, p - 1))} disabled={trashPage === 1} className={styles.paginationBtn}>
                    Anterior
                  </button>
                  <div className={styles.paginationInfo}>
                    Página {trashPage} de {totalTrashPages} ({deletedItems.length} itens)
                  </div>
                  <button onClick={() => setTrashPage(p => Math.min(totalTrashPages, p + 1))} disabled={trashPage === totalTrashPages} className={styles.paginationBtn}>
                    Próxima
                  </button>
                </div>
              )}
            </div>
          )
        )}

        {/* ── WORKFLOWS ───────────────────────────────────────────────────── */}
        {activeTab === 'workflows' && (
          <>
            <div className={styles.filters}>
              <div className={styles.searchBox}>
                <Search size={20} />
                <input type="text" placeholder="Buscar por workflow ou colaborador..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className={styles.searchInput} />
              </div>
              <div className={styles.filterGroup}>
                <select value={selectedWorkflow} onChange={e => setSelectedWorkflow(e.target.value)} className={styles.select}>
                  <option value="all">Todos os Workflows</option>
                  {workflows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)} className={styles.select}>
                  <option value="all">Todos os Status</option>
                  <option value="in_progress">Em Andamento</option>
                  <option value="completed">Concluído</option>
                  <option value="cancelled">Cancelado</option>
                  <option value="rejected">Rejeitado</option>
                </select>
              </div>
            </div>

            <div className={styles.stats}>
              {[
                { label: 'Em Andamento', count: instances.filter(i => i.status === 'in_progress').length, bg: '#EFF6FF', color: '#3B82F6', icon: <Clock size={24} /> },
                { label: 'Concluídos', count: instances.filter(i => i.status === 'completed').length, bg: '#F0FDF4', color: '#10B981', icon: <CheckCircle size={24} /> },
                { label: 'Colaboradores', count: new Set(instances.map(i => i.assignedTo)).size, bg: '#FEF3C7', color: '#F59E0B', icon: <User size={24} /> },
                { label: 'Cancelados/Rejeitados', count: instances.filter(i => i.status === 'cancelled' || i.status === 'rejected').length, bg: '#FEE2E2', color: '#EF4444', icon: <XCircle size={24} /> },
              ].map(s => (
                <div key={s.label} className={styles.statCard}>
                  <div className={styles.statIcon} style={{ background: s.bg, color: s.color }}>{s.icon}</div>
                  <div className={styles.statInfo}><span className={styles.statValue}>{s.count}</span><span className={styles.statLabel}>{s.label}</span></div>
                </div>
              ))}
            </div>

            <div className={styles.tableContainer}>
              {loading ? (
                <div className={styles.loading}><div className={styles.spinner}></div><p>Carregando...</p></div>
              ) : filteredInstances.length === 0 ? (
                <div className={styles.empty}><Calendar size={48} /><h3>Nenhuma execução encontrada</h3></div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr><th>ID</th><th>Workflow</th><th>Colaborador</th><th>Etapa Atual</th><th>Status</th><th>Iniciado em</th><th>Duração</th><th>Ações</th></tr>
                  </thead>
                  <tbody>
                    {filteredInstances.map(instance => (
                      <tr key={instance.id}>
                        <td className={styles.idCell}>#{instance.id.substring(0, 8)}</td>
                        <td className={styles.workflowCell}>{instance.workflowName}</td>
                        <td className={styles.userCell}><User size={16} />{instance.assignedToName}</td>
                        <td className={styles.stageCell}>Etapa {instance.currentStageIndex + 1}</td>
                        <td className={styles.statusCell}>
                          <span className={`${styles.statusBadge} ${styles[instance.status]}`}>
                            {getStatusIcon(instance.status)}{getStatusLabel(instance.status)}
                          </span>
                        </td>
                        <td className={styles.dateCell}>{formatDate(instance.startedAt)}</td>
                        <td className={styles.durationCell}>{calculateDuration(instance)}</td>
                        <td className={styles.actionsCell}>
                          <button onClick={() => setSelectedInstance(instance)} className={styles.btnView} title="Ver Detalhes"><Eye size={18} /></button>
                          <button onClick={() => handleDeleteInstance(instance.id, instance.workflowName)}
                            style={{ marginLeft: '8px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer' }}>
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* ── HISTÓRICO COMPLETO (FORMULÁRIOS) ────────────────────────────── */}
        {activeTab === 'forms' && (
          loading ? (
            <div className={styles.loading}><div className={styles.spinner}></div><p>Carregando respostas...</p></div>
          ) : (
            <div className={styles.responsesSection}>
              <div className={styles.filtersSection}>
                <div className={styles.filtersHeader}>
                  <div className={styles.searchContainer}>
                    <Search size={20} className={styles.searchIcon} />
                    <input type="text" placeholder="Buscar por formulário, usuário ou resposta..." value={searchFormTerm} onChange={e => setSearchFormTerm(e.target.value)} className={styles.searchInput} />
                  </div>
                  <button className={styles.advancedFiltersToggle} onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}>
                    <Filter size={20} />{showAdvancedFilters ? 'Ocultar Filtros' : 'Filtros Avançados'}
                  </button>
                </div>

                {showAdvancedFilters && (
                  <div className={styles.advancedFilters}>
                    <div className={styles.filterRow}>
                      <div className={styles.filterGroup}>
                        <label>EMPRESA</label>
                        <select value={companyFilter} onChange={e => { setCompanyFilter(e.target.value); setDepartmentFilter('all'); setFormFilter('all'); setUserFilter('all'); }}>
                          <option value="all">Todas as empresas</option>
                          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div className={styles.filterGroup}>
                        <label>DEPARTAMENTO</label>
                        <select value={departmentFilter} onChange={e => { setDepartmentFilter(e.target.value); setFormFilter('all'); setUserFilter('all'); }} disabled={availableDepartments.length === 0}>
                          <option value="all">Todos os departamentos</option>
                          {availableDepartments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      </div>
                      <div className={styles.filterGroup}>
                        <label>FORMULÁRIO</label>
                        <select value={formFilter} onChange={e => setFormFilter(e.target.value)}>
                          <option value="all">Todos os formulários</option>
                          {availableForms.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className={styles.filterRow}>
                      <div className={styles.filterGroup}>
                        <label>USUÁRIO</label>
                        <select value={userFilter} onChange={e => setUserFilter(e.target.value)}>
                          <option value="all">Todos os usuários</option>
                          {availableUsers.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                      <div className={styles.filterGroup}>
                        <label>STATUS</label>
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                          <option value="all">Todos os status</option>
                          <option value="pending">Pendente</option>
                          <option value="submitted">Enviado</option>
                          <option value="approved">Aprovado</option>
                          <option value="rejected">Rejeitado</option>
                        </select>
                      </div>
                      <div className={styles.filterGroup}>
                        <label>PERÍODO</label>
                        <select value={dateRangeFilter} onChange={e => setDateRangeFilter(e.target.value)}>
                          <option value="all">Todo o período</option>
                          <option value="today">Hoje</option>
                          <option value="week">Últimos 7 dias</option>
                          <option value="month">Este mês</option>
                          <option value="year">Este ano</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className={styles.responsesInfo}>
                <h3>Respostas de Formulários</h3>
                <span className={styles.badge}>{filteredFormResponses.length} respostas</span>
              </div>

              {filteredFormResponses.length === 0 ? (
                <div className={styles.emptyForms}><Calendar size={48} /><h3>Histórico de Formulários</h3><p>Nenhuma resposta encontrada</p></div>
              ) : (
                <div className={styles.responsesTable}>
                  <div className={styles.tableHeader}>
                    <span>Formulário</span><span>Usuário</span><span>Empresa</span><span>Data</span><span>Status</span><span>Ações</span>
                  </div>
                  {paginatedFormResponses.map(response => (
                    <div key={response.id} className={styles.tableRow} onClick={() => setSelectedResponse(response)}>
                      <div className={styles.formInfo}><FileText size={16} />{response.formTitle || 'Formulário'}</div>
                      <div className={styles.userInfo}><User size={16} />{response.collaboratorUsername || 'Usuário'}</div>
                      <div className={styles.companyInfo}>{(response as any).companyName || response.companyId || 'Empresa'}</div>
                      <div className={styles.dateInfo}>{formatDateTime(response.submittedAt || response.createdAt)}</div>
                      <div className={styles.statusInfo}>
                        {response.status === 'approved' && <CheckCircle size={16} className={styles.approved} />}
                        {response.status === 'rejected' && <XCircle size={16} className={styles.rejected} />}
                        {(response.status === 'submitted' || response.status === 'pending') && <Clock size={16} className={styles.pending} />}
                        <span>{response.status || 'pending'}</span>
                      </div>
                      <div className={styles.actionsCell}>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteResponse(response); }}
                          style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {totalPages > 1 && (
                <div className={styles.pagination}>
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className={styles.paginationBtn}>
                    Anterior
                  </button>
                  <div className={styles.paginationInfo}>
                    Página {currentPage} de {totalPages} ({filteredFormResponses.length} respostas)
                  </div>
                  <select value={itemsPerPage} onChange={e => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }} className={styles.itemsPerPageSelect}>
                    <option value="20">20 por página</option>
                    <option value="50">50 por página</option>
                    <option value="100">100 por página</option>
                  </select>
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className={styles.paginationBtn}>
                    Próxima
                  </button>
                </div>
              )}
            </div>
          )
        )}
      </div>

      {/* ── Modais ─────────────────────────────────────────────────────────── */}
      {selectedInstance && <WorkflowInstanceDetailModal instance={selectedInstance} onClose={() => setSelectedInstance(null)} />}

      <ResponseDetailsModal
        open={!!selectedResponse}
        onClose={() => { setSelectedResponse(null); setSelectedResponseForm(null); }}
        response={selectedResponse}
        form={selectedResponseForm}
        company={companyForResponse(selectedResponse)}
        department={deptForResponse(selectedResponse)}
      />

      {deleteModal.show && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#1e293b', borderRadius: '12px', padding: '24px', maxWidth: '400px', width: '90%', border: '2px solid #ef4444' }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#fff' }}>Confirmar Exclusão</h3>
            <p style={{ margin: '0 0 24px 0', color: '#94a3b8', fontSize: '14px' }}>
              Deseja realmente excluir a instância <strong style={{ color: '#fff' }}>"{deleteModal.workflowName}"</strong>?
              <br /><br /><span style={{ color: '#ef4444' }}>Esta ação não pode ser desfeita.</span>
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteModal({ show: false, instanceId: '', workflowName: '' })}
                style={{ padding: '10px 20px', background: '#475569', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={confirmDeleteInstance}
                style={{ padding: '10px 20px', background: '#ef4444', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Excluir</button>
            </div>
          </div>
        </div>
      )}

      {permanentDeleteModal.show && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#1e293b', borderRadius: '12px', padding: '24px', maxWidth: '400px', width: '90%', border: '2px solid #ef4444' }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#fff' }}>Exclusão Permanente</h3>
            <p style={{ margin: '0 0 24px 0', color: '#94a3b8', fontSize: '14px' }}>
              Deseja excluir permanentemente esta resposta? <br /><br />
              <span style={{ color: '#ef4444' }}>Esta ação não pode ser desfeita.</span>
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setPermanentDeleteModal({ show: false, response: null })}
                style={{ padding: '10px 20px', background: '#475569', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handlePermanentDelete}
                style={{ padding: '10px 20px', background: '#ef4444', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Excluir Permanentemente</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
