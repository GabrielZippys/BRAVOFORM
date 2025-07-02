'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { collection, onSnapshot, query, where, getDocs, collectionGroup } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '@/hooks/useAuth';
import { Company, Department, Form, FormResponse } from '@/types';
import styles from '../styles/Dashboard.module.css';

// --- COMPONENTES AUXILIARES ---
const StatCard = ({ title, value, icon, isLoading }: { title: string; value: string | number; icon: React.ReactNode; isLoading: boolean }) => (
    <div className={styles.statCard}>
        <div className={styles.statCardIcon}>{icon}</div>
        <div>
            <h3 className={styles.statCardTitle}>{title}</h3>
            <p className={styles.statCardValue}>{isLoading ? '...' : value}</p>
        </div>
    </div>
);

// --- COMPONENTE PRINCIPAL DO DASHBOARD ---
export default function DashboardPage() {
    const { user } = useAuth();
    
    // Estados para os filtros e dados
    const [companies, setCompanies] = useState<Company[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [selectedCompanyId, setSelectedCompanyId] = useState<string>('all');
    const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>('all');
    const [timeFilter, setTimeFilter] = useState<'day' | 'week' | 'month' | 'year'>('month');
    
    const [allResponses, setAllResponses] = useState<FormResponse[]>([]);
    const [allForms, setAllForms] = useState<Form[]>([]);
    const [loading, setLoading] = useState({ 
        companies: true, 
        departments: true, 
        responses: true,
        forms: true 
    });
    const [error, setError] = useState('');

    // Busca empresas (sem alterações)
    useEffect(() => {
        const fetchCompanies = async () => {
            try {
                const q = query(collection(db, "companies"));
                const querySnapshot = await getDocs(q);
                const companiesData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Company));
                setCompanies(companiesData);
                setLoading(prev => ({...prev, companies: false}));
            } catch (err) {
                console.error("Erro ao buscar empresas:", err);
                setError("Não foi possível carregar as empresas.");
            }
        };
        fetchCompanies();
    }, []);

    // Busca departamentos quando uma empresa é selecionada (sem alterações)
    useEffect(() => {
        const fetchDepartments = async () => {
            if (selectedCompanyId === 'all' || !selectedCompanyId) {
                setDepartments([]);
                setLoading(prev => ({...prev, departments: false}));
                return;
            }
            try {
                setLoading(prev => ({...prev, departments: true}));
                const q = query(collection(db, `companies/${selectedCompanyId}/departments`));
                const querySnapshot = await getDocs(q);
                const departmentsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department));
                setDepartments(departmentsData);
                setLoading(prev => ({...prev, departments: false}));
            } catch (err) {
                console.error("Erro ao buscar departamentos:", err);
                setError("Não foi possível carregar os departamentos.");
            }
        };
        fetchDepartments();
    }, [selectedCompanyId]);

    // Busca formulários criados (sem alterações)
    useEffect(() => {
        if (!user) return;
        const fetchForms = async () => {
            try {
                setLoading(prev => ({...prev, forms: true}));
                const q = query(collection(db, "forms"));
                const querySnapshot = await getDocs(q);
                const formsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Form));
                setAllForms(formsData);
                setLoading(prev => ({...prev, forms: false}));
            } catch (err) {
                console.error("Erro ao buscar formulários:", err);
                setError("Não foi possível carregar os formulários.");
            }
        };
        fetchForms();
    }, [user]);

    // Busca respostas de formulários usando uma query de grupo de coleção (sem alterações)
    useEffect(() => {
        const fetchResponses = async () => {
            if (!user) return;
            try {
                setLoading(prev => ({...prev, responses: true}));
                const q = query(collectionGroup(db, "responses"));
                const querySnapshot = await getDocs(q);
                const responsesData = querySnapshot.docs.map(doc => ({ 
                    id: doc.id, 
                    ...doc.data() 
                } as FormResponse));
                setAllResponses(responsesData);
                setLoading(prev => ({...prev, responses: false}));
            } catch (err) {
                console.error("Erro ao buscar respostas:", err);
                setError("Não foi possível carregar as respostas.");
                setLoading(prev => ({...prev, responses: false}));
            }
        };
        fetchResponses();
    }, [user]);

    // --- PROCESSAMENTO DE DADOS ---
    const filteredResponses = useMemo(() => {
        return allResponses.filter(response => {
            const companyMatch = selectedCompanyId === 'all' || response.companyId === selectedCompanyId;
            const departmentMatch = selectedDepartmentId === 'all' || response.departmentId === selectedDepartmentId;
            return companyMatch && departmentMatch;
        });
    }, [allResponses, selectedCompanyId, selectedDepartmentId]);

    const filteredForms = useMemo(() => {
        return allForms.filter(form => {
            const companyMatch = selectedCompanyId === 'all' || form.companyId === selectedCompanyId;
            const departmentMatch = selectedDepartmentId === 'all' || form.departmentId === selectedDepartmentId;
            return companyMatch && departmentMatch;
        });
    }, [allForms, selectedCompanyId, selectedDepartmentId]);

    const kpiData = useMemo(() => {
        const now = new Date();
        const filteredByTime = filteredResponses.filter(r => {
            // CORREÇÃO: Verifica ambos os campos 'createdAt' e 'submittedAt' para a data.
            const responseDate = (r as any).createdAt?.toDate() || r.submittedAt?.toDate();
            if (!responseDate) return false;
            
            switch (timeFilter) {
                case 'day': return responseDate.getDate() === now.getDate() && responseDate.getMonth() === now.getMonth() && responseDate.getFullYear() === now.getFullYear();
                case 'week': const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); return responseDate >= weekStart;
                case 'month': return responseDate.getMonth() === now.getMonth() && responseDate.getFullYear() === now.getFullYear();
                case 'year': return responseDate.getFullYear() === now.getFullYear();
                default: return true;
            }
        });
        return {
            totalResponses: filteredResponses.length,
            totalForms: filteredForms.length,
            responsesInPeriod: filteredByTime.length,
            activeUsers: new Set(filteredResponses.map(r => r.collaboratorId)).size,
            completionRate: filteredForms.length > 0 ? (filteredResponses.length / filteredForms.length) : 0
        };
    }, [filteredResponses, filteredForms, timeFilter]);

    const submissionsByDay = useMemo(() => {
        const dayMap: Record<string, number> = {};
        filteredResponses.forEach(r => {
            // CORREÇÃO: Verifica ambos os campos 'createdAt' e 'submittedAt' para a data.
            const date = (r as any).createdAt?.toDate() || r.submittedAt?.toDate();
            if (date) {
                const dateStr = date.toLocaleDateString('pt-BR');
                dayMap[dateStr] = (dayMap[dateStr] || 0) + 1;
            }
        });
        return Object.entries(dayMap).map(([date, count]) => ({ date, count })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(-7);
    }, [filteredResponses]);

    const formsByStatus = useMemo(() => {
        const activeCount = filteredForms.filter(f => f.status === 'active').length;
        const draftCount = filteredForms.filter(f => f.status === 'draft').length;
        const archivedCount = filteredForms.filter(f => f.status === 'archived').length;
        const unknownCount = filteredForms.filter(f => !f.status).length;
        return [
            { name: 'Ativos', value: activeCount },
            { name: 'Rascunhos', value: draftCount },
            { name: 'Arquivados', value: archivedCount },
            { name: 'Sem Status', value: unknownCount }
        ];
    }, [filteredForms]);

    const COLORS = ['#C5A05C', '#B18F42', '#07485B', '#E8EAD6', '#8884d8'];
    const icons = {
        responses: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2z"/></svg>,
        forms: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>,
        users: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>,
        rate: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm4.24 16L12 15.45 7.77 18l1.12-4.81-3.73-3.23 4.92-.42L12 5l1.92 4.53 4.92.42-3.73 3.23L16.23 18z"/></svg>
    };

    return (
        <div className={styles.dashboardContainer}>
            <div className={styles.header}>
                <h1 className={styles.title}>Dashboard de Formulários</h1>
                <div className={styles.timeFilters}>
                    <button className={`${styles.timeFilter} ${timeFilter === 'day' ? styles.active : ''}`} onClick={() => setTimeFilter('day')}>Hoje</button>
                    <button className={`${styles.timeFilter} ${timeFilter === 'week' ? styles.active : ''}`} onClick={() => setTimeFilter('week')}>Semana</button>
                    <button className={`${styles.timeFilter} ${timeFilter === 'month' ? styles.active : ''}`} onClick={() => setTimeFilter('month')}>Mês</button>
                    <button className={`${styles.timeFilter} ${timeFilter === 'year' ? styles.active : ''}`} onClick={() => setTimeFilter('year')}>Ano</button>
                </div>
            </div>

            <div className={styles.statsGrid}>
                <StatCard title="Formulários Respondidos" value={kpiData.responsesInPeriod} icon={icons.responses} isLoading={loading.responses || loading.forms} />
                <StatCard title="Formulários Criados" value={kpiData.totalForms} icon={icons.forms} isLoading={loading.forms} />
                <StatCard title="Usuários Ativos" value={kpiData.activeUsers} icon={icons.users} isLoading={loading.responses} />
                <StatCard title="Taxa de Resposta" value={`${(kpiData.completionRate * 100).toFixed(1)}%`} icon={icons.rate} isLoading={loading.responses || loading.forms} />
            </div>

            <div className={styles.filtersContainer}>
                <div className={styles.filterGroup}>
                    <label htmlFor="empresa" className={styles.filterLabel}>Empresa</label>
                    <select id="empresa" value={selectedCompanyId} onChange={e => setSelectedCompanyId(e.target.value)} className={styles.filterSelect} disabled={loading.companies}>
                        <option value="all">Todas as Empresas</option>
                        {companies.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
                    </select>
                </div>
                <div className={styles.filterGroup}>
                    <label htmlFor="departamento" className={styles.filterLabel}>Departamento</label>
                    <select id="departamento" value={selectedDepartmentId} onChange={e => setSelectedDepartmentId(e.target.value)} className={styles.filterSelect} disabled={!selectedCompanyId || selectedCompanyId === 'all' || loading.departments}>
                        <option value="all">Todos os Departamentos</option>
                        {departments.map(d => (<option key={d.id} value={d.id}>{d.name}</option>))}
                    </select>
                </div>
            </div>

            <div className={styles.chartsSection}>
                <div className={styles.chartContainer}>
                    <h3 className={styles.chartTitle}>Respostas por Dia</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={submissionsByDay}><CartesianGrid strokeDasharray="3 3" stroke="rgba(177, 143, 66, 0.2)" /><XAxis dataKey="date" stroke="var(--text-ivory)" /><YAxis stroke="var(--text-ivory)" /><Tooltip contentStyle={{ backgroundColor: 'var(--secondary-bg)', border: '1px solid var(--accent-brass)', color: 'var(--text-ivory)' }} /><Bar dataKey="count" fill="var(--accent-gold)" /></BarChart>
                    </ResponsiveContainer>
                </div>
                <div className={styles.chartContainer}>
                    <h3 className={styles.chartTitle}>Status dos Formulários</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart><Pie data={formsByStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}>{formsByStatus.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}</Pie><Tooltip contentStyle={{ backgroundColor: 'var(--secondary-bg)', border: '1px solid var(--accent-brass)', color: 'var(--text-ivory)' }} /></PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className={styles.listsSection}>
                <div className={styles.listContainer}>
                    <h3 className={styles.listTitle}>Formulários Recentes</h3>
                    <div className={styles.formList}>
                        {filteredForms.slice(0, 5).map(form => (
                            <div key={form.id} className={styles.formItem}>
                                <div className={styles.formInfo}>
                                    <h4 className={styles.formName}>{form.title}</h4>
                                    <p className={styles.formMeta}>{(form.createdAt as any)?.toDate().toLocaleDateString('pt-BR')} • {form.status === 'active' ? ' Ativo' : form.status === 'draft' ? ' Rascunho' : form.status === 'archived' ? ' Arquivado' : ' Status Desconhecido'}</p>
                                </div>
                                <div className={styles.formStats}><span className={styles.responseCount}>{allResponses.filter(r => r.formId === form.id).length} respostas</span></div>
                            </div>
                        ))}
                        {filteredForms.length === 0 && !loading.forms && (<p className={styles.emptyMessage}>Nenhum formulário encontrado</p>)}
                        {loading.forms && (<p className={styles.loadingMessage}>Carregando formulários...</p>)}
                    </div>
                </div>
                <div className={styles.listContainer}>
                    <h3 className={styles.listTitle}>Respostas Recentes</h3>
                    <div className={styles.responseList}>
                        {filteredResponses.slice(0, 5).map(response => (
                            <div key={response.id} className={styles.responseItem}>
                                <div className={styles.responseInfo}>
                                    <h4 className={styles.responseForm}>{allForms.find(f => f.id === response.formId)?.title || 'Formulário Desconhecido'}</h4>
                                    <p className={styles.responseMeta}>
                                        {/* CORREÇÃO: Verifica ambos os campos de data */}
                                        {((response as any).createdAt || response.submittedAt)?.toDate().toLocaleString('pt-BR')} • 
                                        {/* CORREÇÃO: Verifica ambos os campos de nome */}
                                        {response.collaboratorName || (response as any).collaboratorUsername || 'Usuário Desconhecido'}
                                    </p>
                                </div>
                                <div className={styles.responseStatus}>{response.completed ? 'Completo' : 'Parcial'}{response.status && ` • ${response.status}`}</div>
                            </div>
                        ))}
                        {filteredResponses.length === 0 && !loading.responses && (<p className={styles.emptyMessage}>Nenhuma resposta encontrada</p>)}
                        {loading.responses && (<p className={styles.loadingMessage}>Carregando respostas...</p>)}
                    </div>
                </div>
            </div>
            
            {error && <div className={styles.errorAlert}>{error}</div>}
        </div>
    );
}
