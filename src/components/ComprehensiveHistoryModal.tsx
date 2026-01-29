'use client';
import React, { useState, useMemo } from 'react';
import { Trash2, Search, Filter, X, Calendar, User, Building, Users, FileText, CheckCircle, XCircle, Clock, Send } from 'lucide-react';
import { doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { FormResponse, Form, Company, Department } from '@/types';
import styles from '../../app/styles/ComprehensiveHistoryModal.module.css';
import ResponseDetailsModal from './ResponseDetailsModal';

interface ComprehensiveHistoryModalProps {
  open: boolean;
  onClose: () => void;
  responses: FormResponse[];
  forms: Form[];
  companies: Company[];
  departments: Department[];
  onResponsesUpdate?: () => void;
}

function toDateCompat(val: any): string {
  if (!val) return '-';
  if (typeof val.toDate === 'function') return val.toDate().toLocaleString('pt-BR');
  if (val.seconds) return new Date(val.seconds * 1000).toLocaleString('pt-BR');
  if (val._seconds) return new Date(val._seconds * 1000).toLocaleString('pt-BR');
  if (typeof val === 'string') return new Date(val).toLocaleString('pt-BR');
  return '-';
}

function parseDate(val: any): Date | null {
  if (!val) return null;
  if (typeof val.toDate === 'function') return val.toDate();
  if (val.seconds) return new Date(val.seconds * 1000);
  if (val._seconds) return new Date(val._seconds * 1000);
  if (typeof val === 'string') return new Date(val);
  return null;
}

export default function ComprehensiveHistoryModal({
  open,
  onClose,
  responses,
  forms,
  companies,
  departments,
  onResponsesUpdate
}: ComprehensiveHistoryModalProps) {
  // Filtros
  const [formFilter, setFormFilter] = useState<string>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [search, setSearch] = useState('');
  
  // Estados para UI
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedResponses, setSelectedResponses] = useState<Set<string>>(new Set());
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [selectedResponse, setSelectedResponse] = useState<FormResponse | null>(null);

  // Paginação
  const [page, setPage] = useState(1);
  const perPage = 10;
  
  // Opções para filtros
  const availableForms = useMemo(() => {
    const formIds = [...new Set(responses.map(r => r.formId))];
    return forms.filter(f => formIds.includes(f.id));
  }, [responses, forms]);

  const availableUsers = useMemo(() => {
    return [...new Set(responses.map(r => r.collaboratorUsername).filter(Boolean))];
  }, [responses]);

  // Filtro aplicado
  const filteredResponses = useMemo(() => {
    let filtered = [...responses];

    // Filtro por formulário
    if (formFilter !== 'all') {
      filtered = filtered.filter(r => r.formId === formFilter);
    }

    // Filtro por empresa
    if (companyFilter !== 'all') {
      filtered = filtered.filter(r => r.companyId === companyFilter);
    }

    // Filtro por departamento
    if (departmentFilter !== 'all') {
      filtered = filtered.filter(r => r.departmentId === departmentFilter);
    }

    // Filtro por status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(r => r.status === statusFilter);
    }

    // Filtro por usuário
    if (userFilter !== 'all') {
      filtered = filtered.filter(r => r.collaboratorUsername === userFilter);
    }

    // Filtro por período
    if (dateRangeFilter !== 'all') {
      filtered = filtered.filter(r => {
        const date = parseDate(r.createdAt) || parseDate(r.submittedAt);
        if (!date) return false;

        switch (dateRangeFilter) {
          case 'today':
            const today = new Date();
            return date.getDate() === today.getDate() && 
                   date.getMonth() === today.getMonth() && 
                   date.getFullYear() === today.getFullYear();
          case 'week':
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            return date >= weekAgo;
          case 'month':
            const currentMonth = new Date();
            return date.getMonth() === currentMonth.getMonth() && 
                   date.getFullYear() === currentMonth.getFullYear();
          case 'year':
            return date.getFullYear() === new Date().getFullYear();
          case 'custom':
            if (!startDate || !endDate) return true;
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            return date >= start && date <= end;
          default:
            return true;
        }
      });
    }

    // Filtro por busca
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(r => {
        const form = forms.find(f => f.id === r.formId);
        const formTitle = form?.title || '';
        const userName = r.collaboratorUsername || '';
        const answers = JSON.stringify(r.answers || {});
        
        return formTitle.toLowerCase().includes(searchLower) ||
               userName.toLowerCase().includes(searchLower) ||
               answers.toLowerCase().includes(searchLower);
      });
    }

    return filtered.sort((a, b) => {
      const dateA = parseDate(a.createdAt) || parseDate(a.submittedAt);
      const dateB = parseDate(b.createdAt) || parseDate(b.submittedAt);
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateB.getTime() - dateA.getTime(); // Mais recente primeiro
    });
  }, [responses, formFilter, companyFilter, departmentFilter, statusFilter, userFilter, dateRangeFilter, startDate, endDate, search, forms]);

  // Paginação
  const maxPage = Math.ceil(filteredResponses.length / perPage);
  const paginatedResponses = filteredResponses.slice((page - 1) * perPage, page * perPage);

  // Função para excluir respostas
  const handleDelete = async (responseIds: string[]) => {
    if (!confirm(`Tem certeza que deseja excluir ${responseIds.length} resposta(s)? Esta ação não pode ser desfeita.`)) {
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const deletePromises = responseIds.map(async (responseId) => {
        // Encontrar a resposta para determinar o caminho correto
        const response = responses.find(r => r.id === responseId);
        if (!response) return;

        // Excluir da subcoleção responses do formulário
        const responseRef = doc(db, `forms/${response.formId}/responses/${responseId}`);
        await deleteDoc(responseRef);
      });

      await Promise.all(deletePromises);
      
      setSuccess(`${responseIds.length} resposta(s) excluída(s) com sucesso!`);
      setSelectedResponses(new Set());
      
      // Atualizar a lista de respostas
      if (onResponsesUpdate) {
        onResponsesUpdate();
      }
      
      // Resetar página se necessário
      if (paginatedResponses.length === responseIds.length && page > 1) {
        setPage(page - 1);
      }
    } catch (err) {
      setError('Erro ao excluir resposta(s). Tente novamente.');
      console.error('Delete error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Toggle seleção de resposta
  const toggleResponseSelection = (responseId: string) => {
    const newSelected = new Set(selectedResponses);
    if (newSelected.has(responseId)) {
      newSelected.delete(responseId);
    } else {
      newSelected.add(responseId);
    }
    setSelectedResponses(newSelected);
  };

  // Toggle seleção de todas na página
  const togglePageSelection = () => {
    const pageIds = paginatedResponses.map(r => r.id);
    const allSelected = pageIds.every(id => selectedResponses.has(id));
    
    if (allSelected) {
      // Desselecionar todos da página
      const newSelected = new Set(selectedResponses);
      pageIds.forEach(id => newSelected.delete(id));
      setSelectedResponses(newSelected);
    } else {
      // Selecionar todos da página
      const newSelected = new Set(selectedResponses);
      pageIds.forEach(id => newSelected.add(id));
      setSelectedResponses(newSelected);
    }
  };

  if (!open) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalPanel} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Histórico Completo de Respostas</h2>
          <button className={styles.modalClose} onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        {/* Filtros */}
        <div className={styles.filtersSection}>
          <div className={styles.filtersHeader}>
            <div className={styles.searchContainer}>
              <Search size={20} className={styles.searchIcon} />
              <input
                type="text"
                placeholder="Buscar por formulário, usuário ou resposta..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className={styles.searchInput}
              />
            </div>
            <button
              className={styles.advancedFiltersToggle}
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            >
              <Filter size={20} />
              {showAdvancedFilters ? 'Ocultar Filtros' : 'Filtros Avançados'}
            </button>
          </div>

          {showAdvancedFilters && (
            <div className={styles.advancedFilters}>
              <div className={styles.filterRow}>
                <div className={styles.filterGroup}>
                  <label>Formulário</label>
                  <select value={formFilter} onChange={e => { setFormFilter(e.target.value); setPage(1); }}>
                    <option value="all">Todos os formulários</option>
                    {availableForms.map(f => (
                      <option key={f.id} value={f.id}>{f.title}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.filterGroup}>
                  <label>Empresa</label>
                  <select value={companyFilter} onChange={e => { setCompanyFilter(e.target.value); setDepartmentFilter('all'); setPage(1); }}>
                    <option value="all">Todas as empresas</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.filterGroup}>
                  <label>Departamento</label>
                  <select 
                    value={departmentFilter} 
                    onChange={e => { setDepartmentFilter(e.target.value); setPage(1); }}
                    disabled={companyFilter !== 'all' ? false : departments.length === 0}
                  >
                    <option value="all">Todos os departamentos</option>
                    {departments
                      .filter(d => companyFilter === 'all' || d.companyId === companyFilter)
                      .map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                  </select>
                </div>
              </div>

              <div className={styles.filterRow}>
                <div className={styles.filterGroup}>
                  <label>Usuário</label>
                  <select value={userFilter} onChange={e => { setUserFilter(e.target.value); setPage(1); }}>
                    <option value="all">Todos os usuários</option>
                    {availableUsers.map(username => (
                      <option key={username} value={username}>{username}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.filterGroup}>
                  <label>Status</label>
                  <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
                    <option value="all">Todos os status</option>
                    <option value="pending">Pendente</option>
                    <option value="submitted">Enviado</option>
                    <option value="approved">Aprovado</option>
                    <option value="rejected">Rejeitado</option>
                  </select>
                </div>

                <div className={styles.filterGroup}>
                  <label>Período</label>
                  <select value={dateRangeFilter} onChange={e => { setDateRangeFilter(e.target.value); setPage(1); }}>
                    <option value="all">Todo o período</option>
                    <option value="today">Hoje</option>
                    <option value="week">Últimos 7 dias</option>
                    <option value="month">Este mês</option>
                    <option value="year">Este ano</option>
                    <option value="custom">Personalizado</option>
                  </select>
                </div>
              </div>

              {dateRangeFilter === 'custom' && (
                <div className={styles.filterRow}>
                  <div className={styles.filterGroup}>
                    <label>Data Início</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => { setStartDate(e.target.value); setPage(1); }}
                    />
                  </div>
                  <div className={styles.filterGroup}>
                    <label>Data Fim</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={e => { setEndDate(e.target.value); setPage(1); }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className={styles.filtersInfo}>
            <span>{filteredResponses.length} resposta(s) encontrada(s)</span>
            {selectedResponses.size > 0 && (
              <div className={styles.bulkActions}>
                <span>{selectedResponses.size} selecionada(s)</span>
                <button
                  className={styles.deleteButton}
                  onClick={() => handleDelete(Array.from(selectedResponses))}
                  disabled={loading}
                >
                  <Trash2 size={16} />
                  Excluir Selecionadas
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mensagens de feedback */}
        {error && <div className={styles.errorMessage}>{error}</div>}
        {success && <div className={styles.successMessage}>{success}</div>}

        {/* Lista de respostas */}
        <div className={styles.responsesContainer}>
          {filteredResponses.length === 0 ? (
            <div className={styles.emptyState}>
              <FileText size={48} />
              <p>Nenhuma resposta encontrada com os filtros selecionados.</p>
            </div>
          ) : (
            <>
              <div className={styles.responsesList}>
                <div className={styles.listHeader}>
                  <input
                    type="checkbox"
                    checked={paginatedResponses.length > 0 && paginatedResponses.every(r => selectedResponses.has(r.id))}
                    onChange={togglePageSelection}
                    className={styles.selectAllCheckbox}
                  />
                  <span>Formulário</span>
                  <span>Usuário</span>
                  <span>Data</span>
                  <span>Status</span>
                  <span>Ações</span>
                </div>

                {paginatedResponses.map(response => {
                  const form = forms.find(f => f.id === response.formId);
                  const company = companies.find(c => c.id === response.companyId);
                  const department = departments.find(d => d.id === response.departmentId);
                  
                  return (
                    <div 
                      key={response.id} 
                      className={styles.responseItem}
                      onClick={() => setSelectedResponse(response)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedResponses.has(response.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleResponseSelection(response.id);
                        }}
                        className={styles.responseCheckbox}
                      />
                      <div className={styles.responseInfo}>
                        <div className={styles.responseTitle}>
                          <FileText size={16} />
                          {form?.title || 'Formulário Desconhecido'}
                        </div>
                        <div className={styles.responseMeta}>
                          <Building size={12} />
                          {company?.name || 'Empresa Desconhecida'}
                          <Users size={12} />
                          {department?.name || 'Departamento Desconhecido'}
                        </div>
                      </div>
                      
                      <div className={styles.userInfo}>
                        <User size={16} />
                        {response.collaboratorUsername || 'Usuário Desconhecido'}
                      </div>
                      
                      <div className={styles.dateInfo}>
                        <Calendar size={16} />
                        {toDateCompat(response.createdAt || response.submittedAt)}
                      </div>
                      
                      <div className={styles.statusInfo}>
                        {response.status === 'approved' && <><CheckCircle size={16} className={styles.approved} /> Aprovado</>}
                        {response.status === 'rejected' && <><XCircle size={16} className={styles.rejected} /> Rejeitado</>}
                        {response.status === 'submitted' && <><Send size={16} className={styles.submitted} /> Enviado</>}
                        {response.status === 'pending' && <><Clock size={16} className={styles.pending} /> Pendente</>}
                      </div>
                      
                      <div className={styles.responseActions}>
                        <button
                          className={styles.deleteButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete([response.id]);
                          }}
                          disabled={loading}
                          title="Excluir resposta"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Paginação */}
              {maxPage > 1 && (
                <div className={styles.pagination}>
                  <button
                    onClick={() => setPage(p => Math.max(p - 1, 1))}
                    disabled={page <= 1 || loading}
                    className={styles.paginationButton}
                  >
                    ← Anterior
                  </button>
                  <span className={styles.paginationInfo}>
                    Página {page} de {maxPage}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(p + 1, maxPage))}
                    disabled={page >= maxPage || loading}
                    className={styles.paginationButton}
                  >
                    Próximo →
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal de Detalhes da Resposta */}
        {selectedResponse && (
          <ResponseDetailsModal
            open={!!selectedResponse}
            onClose={() => setSelectedResponse(null)}
            response={selectedResponse}
            form={forms.find(f => f.id === selectedResponse.formId) || null}
            company={companies.find(c => c.id === selectedResponse.companyId) || null}
            department={departments.find(d => d.id === selectedResponse.departmentId) || null}
          />
        )}
      </div>
    </div>
  );
}
