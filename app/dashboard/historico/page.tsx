'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, Timestamp, collectionGroup, doc, getDoc, limit } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { Search, Filter, Download, Eye, Calendar, User, CheckCircle, XCircle, Clock, Trash2, FileText } from 'lucide-react';
import type { WorkflowInstance, WorkflowDocument, FormResponse, Form, Company, Department } from '@/types';
import ComprehensiveHistoryModal from '@/components/ComprehensiveHistoryModal';
import ResponseDetailsModal from '@/components/ResponseDetailsModal';
import WorkflowInstanceDetailModal from '@/components/WorkflowInstanceDetailModal';
import styles from './historico.module.css';


type TabType = 'forms' | 'workflows' | 'trash';

export default function HistoricoPage() {
  const [activeTab, setActiveTab] = useState<TabType>('forms');
  const [instances, setInstances] = useState<WorkflowInstance[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowDocument[]>([]);
  const [formResponses, setFormResponses] = useState<FormResponse[]>([]);
  const [forms, setForms] = useState<Form[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedInstance, setSelectedInstance] = useState<WorkflowInstance | null>(null);
  const [selectedResponse, setSelectedResponse] = useState<FormResponse | null>(null);
  const [selectedResponseForm, setSelectedResponseForm] = useState<Form | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  
  // Filtros para formulários
  const [formFilter, setFormFilter] = useState<string>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<string>('all');
  const [searchFormTerm, setSearchFormTerm] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  
  // Estado para lixeira
  const [deletedItems, setDeletedItems] = useState<FormResponse[]>([]);
  
  // Estado para modal de confirmação de exclusão
  const [deleteModal, setDeleteModal] = useState<{ show: boolean; instanceId: string; workflowName: string }>({ show: false, instanceId: '', workflowName: '' });
  
  // Estado para modal de exclusão permanente
  const [permanentDeleteModal, setPermanentDeleteModal] = useState<{ show: boolean; response: FormResponse | null }>({ show: false, response: null });

  useEffect(() => {
    loadData();
  }, []);

  // Carregar formulário quando selecionar uma resposta
  useEffect(() => {
    const loadFormForResponse = async () => {
      if (!selectedResponse) {
        setSelectedResponseForm(null);
        return;
      }

      // Primeiro tentar encontrar na lista já carregada
      const existingForm = forms.find(f => f.id === selectedResponse.formId);
      if (existingForm) {
        setSelectedResponseForm(existingForm);
        return;
      }

      // Se não encontrou, buscar diretamente do Firestore
      try {
        console.log('Buscando formulário do Firestore:', selectedResponse.formId);
        const formDoc = await getDoc(doc(db, 'forms', selectedResponse.formId));
        if (formDoc.exists()) {
          const formData = {
            id: formDoc.id,
            ...formDoc.data()
          } as Form;
          console.log('Formulário encontrado:', formData);
          setSelectedResponseForm(formData);
        } else {
          console.log('Formulário não existe no Firestore');
          setSelectedResponseForm(null);
        }
      } catch (error) {
        console.error('Erro ao carregar formulário:', error);
        setSelectedResponseForm(null);
      }
    };

    loadFormForResponse();
  }, [selectedResponse, forms]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Carregar dados básicos primeiro (rápido)
      const [
        workflowsSnapshot,
        instancesSnapshot,
        formsSnapshot,
        companiesSnapshot,
        departmentsSnapshot
      ] = await Promise.all([
        getDocs(collection(db, 'workflows')),
        getDocs(collection(db, 'workflow_instances')).catch(() => ({ docs: [] })),
        getDocs(collection(db, 'forms')),
        getDocs(collection(db, 'companies')),
        getDocs(collection(db, 'departments'))
      ]);

      // Processar workflows
      const workflowsData = workflowsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as WorkflowDocument));
      setWorkflows(workflowsData);

      // Processar instâncias de workflows
      const instancesData = instancesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as WorkflowInstance));
      instancesData.sort((a, b) => {
        const dateA = a.startedAt?.toMillis?.() || 0;
        const dateB = b.startedAt?.toMillis?.() || 0;
        return dateB - dateA;
      });
      setInstances(instancesData);

      // Processar formulários
      const formsData = formsSnapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      } as Form));
      setForms(formsData);

      // Processar empresas
      const companiesData = companiesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Company));
      setCompanies(companiesData);

      // Processar departamentos
      const departmentsData = departmentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Department));
      setDepartments(departmentsData);

      // Carregar respostas - tentar com orderBy, se falhar carregar todas
      let responsesSnapshot;
      try {
        responsesSnapshot = await getDocs(
          query(
            collectionGroup(db, 'responses'),
            orderBy('submittedAt', 'desc'),
            limit(1000) // Limitar a 1000 respostas mais recentes
          )
        );
      } catch (error: any) {
        console.warn('Erro ao ordenar por submittedAt, carregando sem ordenação:', error.message);
        // Se falhar (falta de índice), carregar todas sem limite
        responsesSnapshot = await getDocs(
          collectionGroup(db, 'responses')
        );
      }
      
      const allDocs = responsesSnapshot.docs;
      
      const allResponses = allDocs
        .filter(doc => !doc.data().deletedAt)
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        } as FormResponse));
      
      // Remover duplicatas baseado no ID
      const uniqueResponses = Array.from(
        new Map(allResponses.map(r => [r.id, r])).values()
      );
      
      uniqueResponses.sort((a, b) => {
        const dateA = a.submittedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
        const dateB = b.submittedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
        return dateB - dateA;
      });
      
      console.log('Total de respostas carregadas:', allDocs.length);
      console.log('Respostas após remover duplicatas:', uniqueResponses.length);
      
      // Debug: verificar se IDs específicos estão presentes
      const targetIds = ['9bX61SD1JuhikO4HwDMA', 'itvvpkjQjPsGPEO699E4'];
      targetIds.forEach(id => {
        const found = uniqueResponses.find(r => r.id === id);
        if (found) {
          console.log(`✅ Resposta ${id} encontrada:`, found);
        } else {
          console.log(`❌ Resposta ${id} NÃO encontrada`);
          const inAllDocs = allDocs.find(d => d.id === id);
          if (inAllDocs) {
            console.log(`  Mas existe em allDocs:`, inAllDocs.data());
          }
        }
      });
      
      setFormResponses(uniqueResponses);

      // Processar lixeira
      const trashData = allDocs
        .filter(doc => doc.data().deletedAt != null)
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            path: doc.ref.path,
            formId: data.formId || '',
            formTitle: data.formTitle || '',
            collaboratorId: data.collaboratorId || '',
            collaboratorUsername: data.collaboratorUsername || '',
            companyId: data.companyId || '',
            departmentId: data.departmentId || '',
            status: data.status || 'deleted',
            answers: data.answers,
            createdAt: data.createdAt,
            submittedAt: data.submittedAt,
            deletedAt: data.deletedAt,
            deletedBy: data.deletedBy,
            deletedByUsername: data.deletedByUsername
          } as FormResponse;
        });
      
      trashData.sort((a, b) => {
        const aTime = a.deletedAt?.toMillis ? a.deletedAt.toMillis() : 0;
        const bTime = b.deletedAt?.toMillis ? b.deletedAt.toMillis() : 0;
        return bTime - aTime;
      });
      setDeletedItems(trashData);

    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredInstances = instances.filter(instance => {
    const matchesSearch = 
      instance.workflowName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      instance.assignedToName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesWorkflow = selectedWorkflow === 'all' || instance.workflowId === selectedWorkflow;
    const matchesStatus = selectedStatus === 'all' || instance.status === selectedStatus;

    return matchesSearch && matchesWorkflow && matchesStatus;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={18} className={styles.iconCompleted} />;
      case 'in_progress':
        return <Clock size={18} className={styles.iconInProgress} />;
      case 'cancelled':
      case 'rejected':
        return <XCircle size={18} className={styles.iconRejected} />;
      default:
        return <Clock size={18} />;
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      in_progress: 'Em Andamento',
      completed: 'Concluído',
      cancelled: 'Cancelado',
      rejected: 'Rejeitado'
    };
    return labels[status] || status;
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('pt-BR');
  };

  const formatDateTime = (timestamp: any) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('pt-BR') + ' às ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const getDaysRemaining = (deletedAt: any): number => {
    if (!deletedAt) return 0;
    
    const deletedDate = deletedAt.toDate ? deletedAt.toDate() : new Date(deletedAt);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    const deleteDate = new Date(deletedDate);
    deleteDate.setHours(0, 0, 0, 0);
    deleteDate.setDate(deleteDate.getDate() + 30);
    
    const diffTime = deleteDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  };

  const handleDeleteInstance = (instanceId: string, workflowName: string) => {
    setDeleteModal({ show: true, instanceId, workflowName });
  };

  const confirmDeleteInstance = async () => {
    try {
      const { deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'workflow_instances', deleteModal.instanceId));
      setInstances(instances.filter(i => i.id !== deleteModal.instanceId));
      setDeleteModal({ show: false, instanceId: '', workflowName: '' });
    } catch (error) {
      console.error('Erro ao excluir instância:', error);
    }
  };

  const handleDeleteResponse = async (response: FormResponse) => {
    if (!confirm(`Deseja realmente excluir a resposta de "${response.collaboratorUsername}"?\n\nEsta ação moverá a resposta para a lixeira.`)) {
      return;
    }

    try {
      const { updateDoc, serverTimestamp } = await import('firebase/firestore');
      
      // Buscar o documento da resposta usando o path completo
      const responsePath = `forms/${response.formId}/responses/${response.id}`;
      const responseRef = doc(db, responsePath);
      
      // Marcar como deletado em vez de excluir permanentemente
      await updateDoc(responseRef, {
        deletedAt: serverTimestamp(),
        deletedBy: 'admin',
        deletedByUsername: 'Administrador'
      });

      // Atualizar a lista local
      setFormResponses(formResponses.filter(r => r.id !== response.id));
      
      // Adicionar à lixeira
      setDeletedItems([{
        ...response,
        deletedAt: Timestamp.now(),
        deletedBy: 'admin',
        deletedByUsername: 'Administrador'
      }, ...deletedItems]);

      alert('Resposta movida para a lixeira com sucesso!');
    } catch (error) {
      console.error('Erro ao excluir resposta:', error);
      alert('Erro ao excluir resposta. Verifique o console para mais detalhes.');
    }
  };

  const handlePermanentDelete = async () => {
    if (!permanentDeleteModal.response) return;

    try {
      const { deleteDoc } = await import('firebase/firestore');
      
      const responsePath = `forms/${permanentDeleteModal.response.formId}/responses/${permanentDeleteModal.response.id}`;
      const responseRef = doc(db, responsePath);
      
      // Excluir permanentemente do Firestore
      await deleteDoc(responseRef);

      // Remover da lista local
      setDeletedItems(deletedItems.filter(r => r.id !== permanentDeleteModal.response!.id));
      
      setPermanentDeleteModal({ show: false, response: null });
      alert('Resposta excluída permanentemente com sucesso!');
    } catch (error) {
      console.error('Erro ao excluir permanentemente:', error);
      alert('Erro ao excluir permanentemente. Verifique o console para mais detalhes.');
    }
  };

  const handleRestoreResponse = async (response: FormResponse) => {
    try {
      const { updateDoc, deleteField } = await import('firebase/firestore');
      
      const responsePath = `forms/${response.formId}/responses/${response.id}`;
      const responseRef = doc(db, responsePath);
      
      // Remover campos de exclusão
      await updateDoc(responseRef, {
        deletedAt: deleteField(),
        deletedBy: deleteField(),
        deletedByUsername: deleteField()
      });

      // Remover da lixeira
      setDeletedItems(deletedItems.filter(r => r.id !== response.id));
      
      // Adicionar de volta às respostas
      const restoredResponse = { ...response };
      delete (restoredResponse as any).deletedAt;
      delete (restoredResponse as any).deletedBy;
      delete (restoredResponse as any).deletedByUsername;
      
      setFormResponses([restoredResponse, ...formResponses]);

      alert('Resposta restaurada com sucesso!');
    } catch (error) {
      console.error('Erro ao restaurar resposta:', error);
      alert('Erro ao restaurar resposta. Verifique o console para mais detalhes.');
    }
  };

  // Departamentos disponíveis baseados na empresa
  const availableDepartments = React.useMemo(() => {
    if (companyFilter === 'all') return departments;
    return departments.filter(d => d.companyId === companyFilter);
  }, [departments, companyFilter]);

  // Respostas filtradas por empresa
  const companyFilteredResponses = React.useMemo(() => {
    if (companyFilter === 'all') return formResponses;
    return formResponses.filter(r => r.companyId === companyFilter);
  }, [formResponses, companyFilter]);

  // Respostas filtradas por empresa E departamento
  const departmentFilteredResponses = React.useMemo(() => {
    let filtered = companyFilteredResponses;
    if (departmentFilter !== 'all') {
      filtered = filtered.filter(r => r.departmentId === departmentFilter);
    }
    return filtered;
  }, [companyFilteredResponses, departmentFilter]);

  // Formulários disponíveis baseados na empresa e departamento
  const availableForms = React.useMemo(() => {
    const formIds = [...new Set(departmentFilteredResponses.map(r => r.formId))];
    return forms.filter(f => formIds.includes(f.id));
  }, [departmentFilteredResponses, forms]);

  // Usuários disponíveis baseados na empresa e departamento
  const availableUsers = React.useMemo(() => {
    return [...new Set(departmentFilteredResponses.map(r => r.collaboratorUsername).filter(Boolean))];
  }, [departmentFilteredResponses]);

  // Filtros para respostas de formulários
  const filteredFormResponses = React.useMemo(() => {
    let filtered = [...formResponses];

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
        const date = r.submittedAt?.toDate ? r.submittedAt.toDate() : (r.createdAt?.toDate ? r.createdAt.toDate() : null);
        if (!date) return false;

        const now = new Date();
        switch (dateRangeFilter) {
          case 'today':
            return date.getDate() === now.getDate() && 
                   date.getMonth() === now.getMonth() && 
                   date.getFullYear() === now.getFullYear();
          case 'week':
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            return date >= weekAgo;
          case 'month':
            return date.getMonth() === now.getMonth() && 
                   date.getFullYear() === now.getFullYear();
          case 'year':
            return date.getFullYear() === now.getFullYear();
          default:
            return true;
        }
      });
    }

    // Filtro por busca
    if (searchFormTerm) {
      const searchLower = searchFormTerm.toLowerCase();
      filtered = filtered.filter(r => 
        r.formTitle?.toLowerCase().includes(searchLower) ||
        r.collaboratorUsername?.toLowerCase().includes(searchLower)
      );
    }

    return filtered;
  }, [formResponses, formFilter, companyFilter, departmentFilter, statusFilter, userFilter, dateRangeFilter, searchFormTerm]);

  const calculateDuration = (instance: WorkflowInstance) => {
    if (!instance.startedAt) return '-';
    
    const start = instance.startedAt.toDate ? instance.startedAt.toDate() : new Date(instance.startedAt as any);
    const end = instance.completedAt 
      ? (instance.completedAt.toDate ? instance.completedAt.toDate() : new Date(instance.completedAt as any))
      : new Date();
    
    const diffMs = end.getTime() - start.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffHours > 24) {
      const days = Math.floor(diffHours / 24);
      return `${days}d ${diffHours % 24}h`;
    }
    return `${diffHours}h ${diffMinutes}m`;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <h1>Histórico</h1>
          <p>Visualize e acompanhe formulários e workflows</p>
        </div>
      </div>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'forms' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('forms')}
        >
          <FileText size={20} />
          Histórico Completo
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'workflows' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('workflows')}
        >
          <Calendar size={20} />
          Workflows
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'trash' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('trash')}
        >
          <Trash2 size={20} />
          Lixeira
        </button>
      </div>

      <div className={styles.content}>
        {activeTab === 'trash' ? (
          <>
            {loading ? (
              <div className={styles.loading}>
                <div className={styles.spinner}></div>
                <p>Carregando lixeira...</p>
              </div>
            ) : deletedItems.length === 0 ? (
              <div className={styles.emptyForms}>
                <Trash2 size={48} />
                <h3>Lixeira</h3>
                <p>Nenhum item excluído</p>
              </div>
            ) : (
              <div className={styles.responsesSection}>
                <div className={styles.responsesInfo}>
                  <h3>Itens Excluídos</h3>
                  <span className={styles.badge}>{deletedItems.length} itens</span>
                </div>
                
                <div className={styles.responsesTable}>
                  <div className={styles.tableHeader}>
                    <span>Formulário</span>
                    <span>Usuário</span>
                    <span>Empresa</span>
                    <span>Data de Exclusão</span>
                    <span>Ações</span>
                  </div>
                  
                  {deletedItems.slice(0, 20).map(item => {
                    const form = forms.find(f => f.id === item.formId);
                    const company = companies.find(c => c.id === item.companyId);
                    const daysRemaining = getDaysRemaining(item.deletedAt);
                    
                    return (
                      <div 
                        key={item.id} 
                        className={styles.tableRow}
                        onClick={() => setSelectedResponse(item)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className={styles.formInfo}>
                          <FileText size={16} />
                          {item.formTitle || form?.title || 'Formulário'}
                        </div>
                        <div className={styles.userInfo}>
                          <User size={16} />
                          {item.collaboratorUsername || 'Usuário'}
                        </div>
                        <div className={styles.companyInfo}>
                          {company?.name || 'Empresa'}
                        </div>
                        <div className={styles.dateInfo}>
                          <div>{formatDate(item.deletedAt || item.submittedAt || item.createdAt)}</div>
                          <div className={styles.daysRemaining}>
                            ⏱️ {daysRemaining} dias
                          </div>
                        </div>
                        <div className={styles.actionsCell} style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button
                            className={styles.btnRestore}
                            title="Restaurar"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRestoreResponse(item);
                            }}
                            style={{
                              background: '#10b981',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '6px 12px',
                              cursor: 'pointer',
                              fontSize: '13px',
                              fontWeight: 500
                            }}
                          >
                            Restaurar
                          </button>
                          <button
                            className={styles.btnDelete}
                            title="Excluir permanentemente"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPermanentDeleteModal({ show: true, response: item });
                            }}
                            style={{
                              background: '#ef4444',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '6px 12px',
                              cursor: 'pointer',
                              fontSize: '13px',
                              fontWeight: 500
                            }}
                          >
                            Excluir Permanentemente
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  
                  {deletedItems.length > 20 && (
                    <div className={styles.moreResults}>
                      E mais {deletedItems.length - 20} itens...
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : activeTab === 'workflows' ? (
          <>
            {/* Filtros para Workflows */}
            <div className={styles.filters}>
              <div className={styles.searchBox}>
                <Search size={20} />
                <input
                  type="text"
                  placeholder="Buscar por workflow ou colaborador..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={styles.searchInput}
                />
              </div>

              <div className={styles.filterGroup}>
                <select
                  value={selectedWorkflow}
                  onChange={(e) => setSelectedWorkflow(e.target.value)}
                  className={styles.select}
                >
                  <option value="all">Todos os Workflows</option>
                  {workflows.map(workflow => (
                    <option key={workflow.id} value={workflow.id}>
                      {workflow.name}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className={styles.select}
                >
                  <option value="all">Todos os Status</option>
                  <option value="in_progress">Em Andamento</option>
                  <option value="completed">Concluído</option>
                  <option value="cancelled">Cancelado</option>
                  <option value="rejected">Rejeitado</option>
                </select>
              </div>
            </div>

            {/* Estatísticas de Workflows */}
            <div className={styles.stats}>
          <div className={styles.statCard}>
            <div className={styles.statIcon} style={{ background: '#EFF6FF', color: '#3B82F6' }}>
              <Clock size={24} />
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statValue}>
                {instances.filter(i => i.status === 'in_progress').length}
              </span>
              <span className={styles.statLabel}>Em Andamento</span>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIcon} style={{ background: '#F0FDF4', color: '#10B981' }}>
              <CheckCircle size={24} />
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statValue}>
                {instances.filter(i => i.status === 'completed').length}
              </span>
              <span className={styles.statLabel}>Concluídos</span>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIcon} style={{ background: '#FEF3C7', color: '#F59E0B' }}>
              <User size={24} />
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statValue}>
                {new Set(instances.map(i => i.assignedTo)).size}
              </span>
              <span className={styles.statLabel}>Colaboradores</span>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIcon} style={{ background: '#FEE2E2', color: '#EF4444' }}>
              <XCircle size={24} />
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statValue}>
                {instances.filter(i => i.status === 'cancelled' || i.status === 'rejected').length}
              </span>
              <span className={styles.statLabel}>Cancelados/Rejeitados</span>
            </div>
          </div>
        </div>

        {/* Tabela */}
        <div className={styles.tableContainer}>
          {loading ? (
            <div className={styles.loading}>
              <div className={styles.spinner}></div>
              <p>Carregando respostas...</p>
              <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.5rem' }}>
                Buscando até 1000 respostas mais recentes
              </p>
            </div>
          ) : filteredInstances.length === 0 ? (
            <div className={styles.empty}>
              <Calendar size={48} />
              <h3>Nenhuma execução encontrada</h3>
              <p>
                {instances.length === 0
                  ? 'Ainda não há workflows executados'
                  : 'Nenhum resultado corresponde aos filtros aplicados'}
              </p>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Workflow</th>
                  <th>Colaborador</th>
                  <th>Etapa Atual</th>
                  <th>Status</th>
                  <th>Iniciado em</th>
                  <th>Duração</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredInstances.map(instance => (
                  <tr key={instance.id}>
                    <td className={styles.idCell}>#{instance.id.substring(0, 8)}</td>
                    <td className={styles.workflowCell}>{instance.workflowName}</td>
                    <td className={styles.userCell}>
                      <User size={16} />
                      {instance.assignedToName}
                    </td>
                    <td className={styles.stageCell}>
                      Etapa {instance.currentStageIndex + 1}
                    </td>
                    <td className={styles.statusCell}>
                      <span className={`${styles.statusBadge} ${styles[instance.status]}`}>
                        {getStatusIcon(instance.status)}
                        {getStatusLabel(instance.status)}
                      </span>
                    </td>
                    <td className={styles.dateCell}>{formatDate(instance.startedAt)}</td>
                    <td className={styles.durationCell}>{calculateDuration(instance)}</td>
                    <td className={styles.actionsCell}>
                      <button
                        onClick={() => setSelectedInstance(instance)}
                        className={styles.btnView}
                        title="Ver Detalhes"
                      >
                        <Eye size={18} />
                      </button>
                      <button
                        onClick={() => handleDeleteInstance(instance.id, instance.workflowName)}
                        className={styles.btnDelete}
                        title="Excluir"
                        style={{ marginLeft: '8px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer' }}
                      >
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
        ) : (
          <>
            {/* Aba de Histórico Completo (Formulários) */}
            {loading ? (
              <div className={styles.loading}>
                <div className={styles.spinner}></div>
                <p>Carregando respostas...</p>
              </div>
            ) : formResponses.length === 0 ? (
              <div className={styles.emptyForms}>
                <Calendar size={48} />
                <h3>Histórico de Formulários</h3>
                <p>Nenhuma resposta de formulário encontrada</p>
              </div>
            ) : (
              <div className={styles.responsesSection}>
                {/* Filtros */}
                <div className={styles.filtersSection}>
                  <div className={styles.filtersHeader}>
                    <div className={styles.searchContainer}>
                      <Search size={20} className={styles.searchIcon} />
                      <input
                        type="text"
                        placeholder="Buscar por formulário, usuário ou resposta..."
                        value={searchFormTerm}
                        onChange={(e) => setSearchFormTerm(e.target.value)}
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
                          <label>EMPRESA</label>
                          <select value={companyFilter} onChange={e => { 
                            setCompanyFilter(e.target.value); 
                            setDepartmentFilter('all');
                            setFormFilter('all');
                            setUserFilter('all');
                          }}>
                            <option value="all">Todas as empresas</option>
                            {companies.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>

                        <div className={styles.filterGroup}>
                          <label>DEPARTAMENTO</label>
                          <select 
                            value={departmentFilter} 
                            onChange={e => { 
                              setDepartmentFilter(e.target.value);
                              setFormFilter('all');
                              setUserFilter('all');
                            }}
                            disabled={availableDepartments.length === 0}
                          >
                            <option value="all">Todos os departamentos</option>
                            {availableDepartments.map(d => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                          </select>
                        </div>

                        <div className={styles.filterGroup}>
                          <label>FORMULÁRIO</label>
                          <select value={formFilter} onChange={e => setFormFilter(e.target.value)}>
                            <option value="all">Todos os formulários</option>
                            {availableForms.map(f => (
                              <option key={f.id} value={f.id}>{f.title}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className={styles.filterRow}>
                        <div className={styles.filterGroup}>
                          <label>USUÁRIO</label>
                          <select value={userFilter} onChange={e => setUserFilter(e.target.value)}>
                            <option value="all">Todos os usuários</option>
                            {availableUsers.map(username => (
                              <option key={username} value={username}>{username}</option>
                            ))}
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
                
                <div className={styles.responsesTable}>
                  <div className={styles.tableHeader}>
                    <span>Formulário</span>
                    <span>Usuário</span>
                    <span>Empresa</span>
                    <span>Data</span>
                    <span>Status</span>
                    <span>Ações</span>
                  </div>
                  
                  {filteredFormResponses.slice(0, 20).map(response => {
                    const form = forms.find(f => f.id === response.formId);
                    const company = companies.find(c => c.id === response.companyId);
                    const department = departments.find(d => d.id === response.departmentId);
                    
                    return (
                      <div 
                        key={response.id} 
                        className={styles.tableRow}
                        onClick={() => setSelectedResponse(response)}
                      >
                        <div className={styles.formInfo}>
                          <FileText size={16} />
                          {response.formTitle || form?.title || 'Formulário'}
                        </div>
                        <div className={styles.userInfo}>
                          <User size={16} />
                          {response.collaboratorUsername || 'Usuário'}
                        </div>
                        <div className={styles.companyInfo}>
                          {company?.name || 'Empresa'}
                        </div>
                        <div className={styles.dateInfo}>
                          {formatDateTime(response.submittedAt || response.createdAt)}
                        </div>
                        <div className={styles.statusInfo}>
                          {response.status === 'approved' && <CheckCircle size={16} className={styles.approved} />}
                          {response.status === 'rejected' && <XCircle size={16} className={styles.rejected} />}
                          {response.status === 'submitted' && <Clock size={16} className={styles.submitted} />}
                          {response.status === 'pending' && <Clock size={16} className={styles.pending} />}
                          <span>{response.status || 'Enviado'}</span>
                        </div>
                        <div className={styles.actionsCell}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteResponse(response);
                            }}
                            className={styles.btnDelete}
                            title="Excluir resposta"
                            style={{
                              background: '#ef4444',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '6px 10px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  
                  {filteredFormResponses.length > 20 && (
                    <div className={styles.moreResults}>
                      E mais {filteredFormResponses.length - 20} respostas...
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal de Detalhes de Workflow */}
      {selectedInstance && (
        <WorkflowInstanceDetailModal
          instance={selectedInstance}
          onClose={() => setSelectedInstance(null)}
        />
      )}

      {/* Modal de Detalhes de Resposta */}
      <ResponseDetailsModal
        open={!!selectedResponse}
        onClose={() => {
          setSelectedResponse(null);
          setSelectedResponseForm(null);
        }}
        response={selectedResponse}
        form={selectedResponseForm}
        company={selectedResponse ? companies.find(c => c.id === selectedResponse.companyId) || null : null}
        department={selectedResponse ? departments.find(d => d.id === selectedResponse.departmentId) || null : null}
      />

      {/* Modal de Confirmação de Exclusão */}
      {deleteModal.show && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: '#1e293b',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '400px',
            width: '90%',
            border: '2px solid #ef4444'
          }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#fff', fontSize: '18px' }}>
              Confirmar Exclusão
            </h3>
            <p style={{ margin: '0 0 24px 0', color: '#94a3b8', fontSize: '14px' }}>
              Deseja realmente excluir a instância do workflow <strong style={{ color: '#fff' }}>"{deleteModal.workflowName}"</strong>?
              <br /><br />
              <span style={{ color: '#ef4444' }}>Esta ação não pode ser desfeita.</span>
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteModal({ show: false, instanceId: '', workflowName: '' })}
                style={{
                  padding: '10px 20px',
                  background: '#475569',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmDeleteInstance}
                style={{
                  padding: '10px 20px',
                  background: '#ef4444',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Exclusão Permanente */}
      {permanentDeleteModal.show && permanentDeleteModal.response && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            background: '#1e293b',
            borderRadius: '12px',
            padding: '28px',
            maxWidth: '480px',
            width: '90%',
            border: '3px solid #dc2626',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                background: '#dc2626',
                borderRadius: '50%',
                padding: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Trash2 size={24} color="#fff" />
              </div>
              <h3 style={{ margin: 0, color: '#fff', fontSize: '20px', fontWeight: 700 }}>
                ⚠️ Exclusão Permanente
              </h3>
            </div>
            
            <p style={{ margin: '0 0 12px 0', color: '#e2e8f0', fontSize: '15px', lineHeight: '1.6' }}>
              Você está prestes a excluir <strong style={{ color: '#fff' }}>permanentemente</strong> a resposta de:
            </p>
            
            <div style={{
              background: '#0f172a',
              padding: '12px',
              borderRadius: '8px',
              margin: '12px 0 16px 0',
              border: '1px solid #334155'
            }}>
              <p style={{ margin: '0 0 6px 0', color: '#94a3b8', fontSize: '13px' }}>
                <strong style={{ color: '#fff' }}>Usuário:</strong> {permanentDeleteModal.response.collaboratorUsername}
              </p>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px' }}>
                <strong style={{ color: '#fff' }}>Formulário:</strong> {permanentDeleteModal.response.formTitle}
              </p>
            </div>

            <div style={{
              background: '#7f1d1d',
              border: '2px solid #dc2626',
              borderRadius: '8px',
              padding: '14px',
              marginBottom: '24px'
            }}>
              <p style={{ margin: 0, color: '#fecaca', fontSize: '14px', fontWeight: 600, lineHeight: '1.5' }}>
                ⚠️ <strong style={{ color: '#fff' }}>ATENÇÃO:</strong> Esta ação é <strong style={{ color: '#fff' }}>IRREVERSÍVEL</strong>!
              </p>
              <p style={{ margin: '8px 0 0 0', color: '#fca5a5', fontSize: '13px', lineHeight: '1.5' }}>
                • Os dados serão excluídos permanentemente do banco de dados<br />
                • Não será possível recuperar esta resposta<br />
                • Esta ação não pode ser desfeita
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setPermanentDeleteModal({ show: false, response: null })}
                style={{
                  padding: '12px 24px',
                  background: '#475569',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = '#64748b'}
                onMouseOut={(e) => e.currentTarget.style.background = '#475569'}
              >
                Cancelar
              </button>
              <button
                onClick={handlePermanentDelete}
                style={{
                  padding: '12px 24px',
                  background: '#dc2626',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 700,
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = '#b91c1c'}
                onMouseOut={(e) => e.currentTarget.style.background = '#dc2626'}
              >
                🗑️ Excluir Permanentemente
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
