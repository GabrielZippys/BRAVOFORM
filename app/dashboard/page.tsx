'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { collection, getDocs, collectionGroup, query } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '@/hooks/useAuth';
import { Company, Department, Form, FormResponse } from '@/types';
import styles from '../styles/Dashboard.module.css';
import AdminHistoryModal from '@/components/AdminHistoryModal'; // Caminho do componente do modal

// Util para datas Firestore ou string
function toDateCompat(val: any): Date | null {
    if (!val) return null;
    if (typeof val.toDate === 'function') return val.toDate();
    if (typeof val === 'string') return new Date(val);
    if (typeof val === 'object' && (val._seconds || val.seconds)) return new Date((val._seconds || val.seconds) * 1000);
    return null;
}

const StatCard = ({ title, value, icon, highlight = false, isLoading = false }: any) => (
    <div className={`${styles.statCard} ${highlight ? styles.statCardHighlight : ''}`}>
        <div className={styles.statCardIcon}>{icon}</div>
        <div>
            <h3 className={styles.statCardTitle}>{title}</h3>
            <p className={`${styles.statCardValue} ${isLoading ? styles.loadingPulse : ''}`}>
                {isLoading ? '...' : value}
            </p>
        </div>
    </div>
);

function TopUsers({ responses }: { responses: FormResponse[] }) {
    const ranking = useMemo(() => {
        const map: Record<string, number> = {};
        responses.forEach(r => {
            if (r.collaboratorUsername) map[r.collaboratorUsername] = (map[r.collaboratorUsername] || 0) + 1;
        });
        return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
    }, [responses]);
    return (
        <div className={styles.topUsersCard}>
            <h4 className={styles.topUsersTitle}>Top Colaboradores</h4>
            <ul className={styles.topUserList}>
                {ranking.length === 0 && <li>Nenhum colaborador</li>}
                {ranking.map(([username, count], i) => (
                    <li key={username}>
                        <span className={styles.rank}>{i + 1}º</span>
                        <span className={styles.userName}>{username}</span>
                        <span className={styles.userResp}>{count} resp.</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default function DashboardPage() {
    const { user } = useAuth();
    const [companies, setCompanies] = useState<Company[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [selectedCompanyId, setSelectedCompanyId] = useState<string>('all');
    const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>('all');
    const [timeFilter, setTimeFilter] = useState<'day' | 'week' | 'month' | 'year'>('month');
    const [allResponses, setAllResponses] = useState<FormResponse[]>([]);
    const [allForms, setAllForms] = useState<Form[]>([]);
    const [loading, setLoading] = useState({ companies: true, departments: true, responses: true, forms: true });
    const [error, setError] = useState('');
    // Modal detalhado:
   
 type ModalColabType = { 
  username: string; 
  empresa: string; 
  depto: string; 
  responses: FormResponse[]; 
} | null;
const [modalOpen, setModalOpen] = useState<ModalColabType>(null);
    const [selectedCollab, setSelectedCollab] = useState<any>(null);

    // --- Dados do banco
    useEffect(() => {
        getDocs(query(collection(db, "companies"))).then(qs => {
            setCompanies(qs.docs.map(doc => ({ id: doc.id, ...doc.data() } as Company)));
            setLoading(l => ({ ...l, companies: false }));
        });
    }, []);
    useEffect(() => {
        if (selectedCompanyId === 'all' || !selectedCompanyId) {
            setDepartments([]); setLoading(l => ({ ...l, departments: false })); return;
        }
        setLoading(l => ({ ...l, departments: true }));
        getDocs(query(collection(db, `companies/${selectedCompanyId}/departments`))).then(qs => {
            setDepartments(qs.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department)));
            setLoading(l => ({ ...l, departments: false }));
        });
    }, [selectedCompanyId]);
    useEffect(() => {
        if (!user) return;
        setLoading(l => ({ ...l, forms: true }));
        getDocs(query(collection(db, "forms"))).then(qs => {
            setAllForms(qs.docs.map(doc => ({ id: doc.id, ...doc.data() } as Form)));
            setLoading(l => ({ ...l, forms: false }));
        });
    }, [user]);
    useEffect(() => {
        if (!user) return;
        setLoading(l => ({ ...l, responses: true }));
        getDocs(query(collectionGroup(db, "responses"))).then(qs => {
            setAllResponses(qs.docs.map(doc => ({ id: doc.id, ...doc.data() } as FormResponse)));
            setLoading(l => ({ ...l, responses: false }));
        });
    }, [user]);

    // --- Filtros
    const filteredResponses = useMemo(() => allResponses.filter(r => (
        (selectedCompanyId === 'all' || r.companyId === selectedCompanyId) &&
        (selectedDepartmentId === 'all' || r.departmentId === selectedDepartmentId)
    )), [allResponses, selectedCompanyId, selectedDepartmentId]);
    const filteredForms = useMemo(() => allForms.filter(f => (
        (selectedCompanyId === 'all' || f.companyId === selectedCompanyId) &&
        (selectedDepartmentId === 'all' || f.departmentId === selectedDepartmentId)
    )), [allForms, selectedCompanyId, selectedDepartmentId]);

    // KPIs
    const now = new Date();
    const filteredByTime = filteredResponses.filter(r => {
        const d = toDateCompat((r as any).createdAt) || toDateCompat((r as any).submittedAt);
        if (!d) return false;
        switch (timeFilter) {
            case 'day': return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            case 'week': { const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); return d >= weekStart; }
            case 'month': return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            case 'year': return d.getFullYear() === now.getFullYear();
            default: return true;
        }
    });

    const uniqueUsers = useMemo(() => [...new Set(filteredResponses.map(r => r.collaboratorId))], [filteredResponses]);
    // Nova lógica de taxa (máximo esperado: cada colaborador preencher cada formulário)
    const taxaResposta = useMemo(() => {
        const totalFormularios = filteredForms.length;
        const totalColaboradores = uniqueUsers.length;
        const maxEsperado = totalFormularios * totalColaboradores || 1;
        const taxa = Math.min((filteredByTime.length / maxEsperado) * 100, 100);
        return taxa.toFixed(1) + '%';
    }, [filteredByTime.length, filteredForms.length, uniqueUsers.length]);

    // --- SVG Ícones (fixos)
    const icons = {
        responses: (<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" fill="#B18F42" /><rect x="7" y="11" width="10" height="2" rx="1" fill="#fff" /></svg>),
        forms: (<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" fill="#07485B" /><rect x="8" y="6" width="8" height="2" rx="1" fill="#C5A05C" /></svg>),
        users: (<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><circle cx="8" cy="8" r="4" fill="#B18F42" /><circle cx="16" cy="8" r="4" fill="#C5A05C" /><rect x="2" y="16" width="20" height="6" rx="3" fill="#E8EAD6" /></svg>),
        rate: (<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#B18F42" /><path d="M8 12l2 2l4 -4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>),
    };

    // --- Agrupamento por colaborador (para tabela administrativa detalhada)
    const colaboradorRows = useMemo(() => {
        const userMap: Record<string, { id: string, username: string, companyId: string, departmentId: string, responses: FormResponse[] }> = {};
        filteredResponses.forEach(r => {
            if (!r.collaboratorId) return;
            if (!userMap[r.collaboratorId]) {
                userMap[r.collaboratorId] = {
                    id: r.collaboratorId,
                    username: r.collaboratorUsername || r.collaboratorId,
                    companyId: r.companyId,
                    departmentId: r.departmentId,
                    responses: []
                };
            }
            userMap[r.collaboratorId].responses.push(r);
        });
        return Object.values(userMap);
    }, [filteredResponses]);

    return (
        <div className={styles.dashboardContainer}>
            <div className={styles.header}>
                <h1 className={styles.title}>Dashboard</h1>
                <div className={styles.timeFilters}>
                    {['day','week','month','year'].map(key => (
                        <button
                            key={key}
                            className={`${styles.timeFilter} ${timeFilter === key ? styles.active : ''}`}
                            onClick={() => setTimeFilter(key as any)}
                        >{key === 'day' ? 'Hoje' : key === 'week' ? 'Semana' : key === 'month' ? 'Mês' : 'Ano'}</button>
                    ))}
                </div>
            </div>

            <div className={styles.statsGrid}>
                <StatCard title="Respostas no Período" value={filteredByTime.length} icon={icons.responses} isLoading={loading.responses}/>
                <StatCard title="Formulários Criados" value={filteredForms.length} icon={icons.forms} isLoading={loading.forms}/>
                <StatCard title="Usuários Ativos" value={uniqueUsers.length} icon={icons.users} isLoading={loading.responses}/>
                <StatCard title="Taxa de Resposta" value={taxaResposta} icon={icons.rate} highlight isLoading={loading.forms || loading.responses}/>
            </div>

            <div className={styles.filtersContainer}>
                <div className={styles.filterGroup}>
                    <label htmlFor="empresa" className={styles.filterLabel}>Empresa</label>
                    <select id="empresa" value={selectedCompanyId} onChange={e => { setSelectedCompanyId(e.target.value); setSelectedDepartmentId('all'); }} className={styles.filterSelect} disabled={loading.companies}>
                        <option value="all">Todas as Empresas</option>
                        {companies.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
                    </select>
                </div>
                <div className={styles.filterGroup}>
                    <label htmlFor="departamento" className={styles.filterLabel}>Departamento</label>
                    <select id="departamento" value={selectedDepartmentId} onChange={e => setSelectedDepartmentId(e.target.value)} className={styles.filterSelect} disabled={departments.length === 0 || loading.departments}>
                        <option value="all">Todos os Departamentos</option>
                        {departments.map(d => (<option key={d.id} value={d.id}>{d.name}</option>))}
                    </select>
                </div>
            </div>

            <div className={styles.chartsSection}>
                <div className={styles.chartContainer}>
                    <h3 className={styles.chartTitle}>Respostas por Dia (últimos 7 dias)</h3>
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={(() => {
                            const dayMap: Record<string, number> = {};
                            filteredResponses.forEach(r => {
                                const date = toDateCompat((r as any).createdAt) || toDateCompat((r as any).submittedAt);
                                if (date) {
                                    const ds = date.toLocaleDateString('pt-BR');
                                    dayMap[ds] = (dayMap[ds] || 0) + 1;
                                }
                            });
                            return Object.entries(dayMap).map(([date, count]) => ({ date, count })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(-7);
                        })()}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E8EAD6" />
                            <XAxis dataKey="date" stroke="#B18F42" />
                            <YAxis stroke="#B18F42" />
                            <Tooltip />
                            <Bar dataKey="count" fill="#B18F42" radius={[8,8,0,0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className={styles.chartContainer}>
                    <TopUsers responses={filteredResponses} />
                </div>
            </div>

            <div className={styles.listsSection}>
                <div className={styles.listContainer}>
                    <h3 className={styles.listTitle}>Formulários Recentes</h3>
                    <div className={styles.formList}>
                        {filteredForms.slice(0, 5).map(form => (
                            <div key={form.id} className={styles.formItem}>
                                <div>
                                    <h4 className={styles.formName}>{form.title}</h4>
                                    <p className={styles.formMeta}>
                                        {toDateCompat(form.createdAt)?.toLocaleDateString('pt-BR')}
                                    </p>
                                </div>
                                <div className={styles.formStats}>
                                    <span className={styles.responseCount}>{allResponses.filter(r => r.formId === form.id).length} respostas</span>
                                </div>
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
                                <div>
                                    <h4 className={styles.responseForm}>{allForms.find(f => f.id === response.formId)?.title || 'Formulário Desconhecido'}</h4>
                                    <p className={styles.responseMeta}>
                                        {(() => {
                                            const dt = toDateCompat((response as any).createdAt) || toDateCompat((response as any).submittedAt);
                                            return dt ? dt.toLocaleString('pt-BR') : '';
                                        })()} • {response.collaboratorUsername || 'Usuário Desconhecido'}
                                    </p>
                                </div>
                                <div className={styles.responseStatus}>
                                    <span className={styles.statusDot} />
                                    Recebida
                                </div>
                            </div>
                        ))}
                        {filteredResponses.length === 0 && !loading.responses && (<p className={styles.emptyMessage}>Nenhuma resposta encontrada</p>)}
                        {loading.responses && (<p className={styles.loadingMessage}>Carregando respostas...</p>)}
                    </div>
                </div>
            </div>

            {/* ADMIN VISÃO DETALHADA */}
            <div className={styles.adminSection}>
                <h3 className={styles.adminTitle}>Resumo Detalhado por Colaborador / Depto / Empresa</h3>
                <div className={styles.adminTableWrapper}>
                    <table className={styles.adminTable}>
                        <thead>
                            <tr>
                                <th>Empresa</th>
                                <th>Departamento</th>
                                <th>Colaborador</th>
                                <th>Respostas</th>
                                <th>Última Resposta</th>
                                <th>Histórico</th>
                            </tr>
                        </thead>
                        <tbody>
                            {colaboradorRows.map((row, i) => {
                                const empresa = companies.find(c => c.id === row.companyId)?.name || '';
                                const depto = departments.find(d => d.id === row.departmentId)?.name || '';
                                const ultima = row.responses.reduce((acc, curr) => {
                                    const dt = toDateCompat(curr.createdAt) || toDateCompat(curr.submittedAt);
                                    if (!acc) return dt;
                                    return dt && dt > acc ? dt : acc;
                                }, null as Date | null);

                                return (
                                    <tr key={row.id}>
                                        <td>{empresa}</td>
                                        <td>{depto}</td>
                                        <td>{row.username}</td>
                                        <td>{row.responses.length}</td>
                                        <td>{ultima ? ultima.toLocaleString('pt-BR') : '-'}</td>
                                        <td>
                                            <button
                                                className={styles.viewButton}
onClick={() => setModalOpen({ 
  username: row.username, 
  empresa, 
  depto, 
  responses: row.responses 
})}
                                            >Histórico</button>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* MODAL HISTÓRICO ADMIN */}
           {modalOpen && (
  <AdminHistoryModal
    open={!!modalOpen}
    onClose={() => setModalOpen(null)}
    collaboratorName={modalOpen.username}
    companyName={modalOpen.empresa}
    responses={modalOpen.responses}
    forms={allForms}
  />
)}



            {error && <div className={styles.errorAlert}>{error}</div>}
        </div>
    );
}