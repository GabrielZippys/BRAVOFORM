'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { FileText, Users, Target, Clock, TrendingUp } from 'lucide-react'; 
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { collection, getDocs, collectionGroup, query, limit } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '@/hooks/useAuth';
import { Company, Department, Form, FormResponse } from '@/types';
import styles from '../styles/Dashboard.module.css';

// --- Utils ---
function toDateCompat(val: any): Date | null {
    if (!val) return null;
    if (typeof val.toDate === 'function') return val.toDate();
    if (typeof val === 'string') return new Date(val);
    if (typeof val === 'object' && (val._seconds || val.seconds)) return new Date((val._seconds || val.seconds) * 1000);
    return null;
}

const EnhancedStatCard = ({ title, value, icon, highlight = false, isLoading = false, trend = null, subtitle = null }: any) => (
    <div className={`${styles.statCard} ${highlight ? styles.statCardHighlight : ''}`}>
        <div className={styles.statCardIcon}>{icon}</div>
        <div>
            <h3 className={styles.statCardTitle}>{title}</h3>
            <p className={`${styles.statCardValue} ${isLoading ? styles.loadingPulse : ''}`}>
                {isLoading ? '...' : value}
            </p>
            {subtitle && <p className={styles.statCardSubtitle}>{subtitle}</p>}
            {trend && (
                <div className={`${styles.trendIndicator} ${trend > 0 ? styles.trendUp : styles.trendDown}`}>
                    <span>{trend > 0 ? '▲' : '▼'} {Math.abs(trend)}%</span>
                </div>
            )}
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
    const [showDetails, setShowDetails] = useState(false);

    // Modal detalhado:
    type ModalColabType = {
        username: string;
        empresa: string;
        depto: string;
        responses: FormResponse[];
    } | null;
    const [modalOpen, setModalOpen] = useState<ModalColabType>(null);


    // Carregar dados
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
        getDocs(query(collectionGroup(db, "responses"), limit(1000))).then(qs => {
            const responses = qs.docs
                .filter(doc => !doc.data().deletedAt) // Filtrar apenas não deletados
                .map(doc => ({ id: doc.id, ...doc.data() } as FormResponse));
            
            // Ordenar por data mais recente primeiro
            responses.sort((a, b) => {
                const dateA = (a as any).submittedAt?.toMillis?.() || (a as any).createdAt?.toMillis?.() || 0;
                const dateB = (b as any).submittedAt?.toMillis?.() || (b as any).createdAt?.toMillis?.() || 0;
                return dateB - dateA;
            });
            
            setAllResponses(responses);
            setLoading(l => ({ ...l, responses: false }));
        });
    }, [user]);


    // Filtros
    const filteredResponses = useMemo(() => allResponses.filter(r => (
        (selectedCompanyId === 'all' || r.companyId === selectedCompanyId) &&
        (selectedDepartmentId === 'all' || r.departmentId === selectedDepartmentId)
    )), [allResponses, selectedCompanyId, selectedDepartmentId]);
    const filteredForms = useMemo(() => allForms.filter(f => (
        (selectedCompanyId === 'all' || f.companyId === selectedCompanyId) &&
        (selectedDepartmentId === 'all' || f.departmentId === selectedDepartmentId)
    )), [allForms, selectedCompanyId, selectedDepartmentId]);

    // Métricas
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
    const completionRate = useMemo(() => {
        const totalFormularios = filteredForms.length;
        const totalColaboradores = uniqueUsers.length;
        const maxEsperado = totalFormularios * totalColaboradores || 1;
        const taxa = Math.min((filteredByTime.length / maxEsperado) * 100, 100);
        return taxa.toFixed(1) + '%';
    }, [filteredByTime.length, filteredForms.length, uniqueUsers.length]);
    const previousPeriodResponses = useMemo(() => {
        const previousStart = new Date(now);
        const previousEnd = new Date(now);
        switch (timeFilter) {
            case 'day':
                previousStart.setDate(now.getDate() - 1);
                previousEnd.setDate(now.getDate() - 1);
                break;
            case 'week':
                previousStart.setDate(now.getDate() - 14);
                previousEnd.setDate(now.getDate() - 7);
                break;
            case 'month':
                previousStart.setMonth(now.getMonth() - 1);
                previousEnd.setMonth(now.getMonth() - 1);
                break;
            case 'year':
                previousStart.setFullYear(now.getFullYear() - 1);
                previousEnd.setFullYear(now.getFullYear() - 1);
                break;
        }
        return filteredResponses.filter(r => {
            const d = toDateCompat((r as any).createdAt) || toDateCompat((r as any).submittedAt);
            return d && d >= previousStart && d <= previousEnd;
        }).length;
    }, [filteredResponses, timeFilter, now]);
    const responseTrend = useMemo(() => {
        if (previousPeriodResponses === 0) return null;
        return Math.round(((filteredByTime.length - previousPeriodResponses) / previousPeriodResponses) * 100);
    }, [filteredByTime.length, previousPeriodResponses]);

    // SVG Ícones
    const icons = {
        responses: <FileText size={26} color="#B18F42" />,
        forms: <FileText size={26} color="#07485B" />,
        users: <Users size={26} color="#B18F42" />,
        rate: <Target size={26} color="#B18F42" />,
        time: <Clock size={26} color="#C5A05C" />,
        trend: <TrendingUp size={26} color="#B18F42" />
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
                <h1 className={styles.title}>Dashboard Administrativo</h1>
                <div className={styles.headerActions}>
                    <div className={styles.timeFilters}>
                    {['day','week','month','year'].map(key => (
                        <button
                            key={key}
                            className={`${styles.timeFilter} ${timeFilter === key ? styles.active : ''}`}
                            onClick={() => setTimeFilter(key as any)}
                        >
                            {key === 'day' ? 'Hoje' : key === 'week' ? 'Semana' : key === 'month' ? 'Mês' : 'Ano'}
                        </button>
                    ))}
                    </div>
                </div>
            </div>

            <div className={styles.statsGrid}>
                <EnhancedStatCard 
                    title="Respostas no Período" 
                    value={filteredByTime.length} 
                    icon={icons.responses} 
                    isLoading={loading.responses}
                    trend={responseTrend}
                />
                <EnhancedStatCard 
                    title="Formulários Ativos" 
                    value={filteredForms.length} 
                    icon={icons.forms} 
                    isLoading={loading.forms}
                />
                <EnhancedStatCard 
                    title="Usuários Ativos" 
                    value={uniqueUsers.length} 
                    icon={icons.users} 
                    isLoading={loading.responses}
                />
                <EnhancedStatCard 
                    title="Taxa de Conclusão" 
                    value={completionRate} 
                    icon={icons.rate} 
                    highlight 
                    isLoading={loading.forms || loading.responses}
                />
                <EnhancedStatCard 
                    title="Engajamento" 
                    value={`${Math.round((filteredByTime.length / Math.max(uniqueUsers.length, 1)) * 10) / 10}`} 
                    icon={icons.trend} 
                    isLoading={loading.responses}
                    subtitle="Respostas por usuário"
                />
            </div>

            <div className={styles.filtersContainer}>
                <div className={styles.filterGroup}>
                    <label htmlFor="empresa" className={styles.filterLabel}>Empresa</label>
                    <select 
                        id="empresa" 
                        value={selectedCompanyId} 
                        onChange={e => { setSelectedCompanyId(e.target.value); setSelectedDepartmentId('all'); }} 
                        className={styles.filterSelect} 
                        disabled={loading.companies}
                    >
                        <option value="all">Todas as Empresas</option>
                        {companies.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                </div>
                <div className={styles.filterGroup}>
                    <label htmlFor="departamento" className={styles.filterLabel}>Departamento</label>
                    <select 
                        id="departamento" 
                        value={selectedDepartmentId} 
                        onChange={e => setSelectedDepartmentId(e.target.value)} 
                        className={styles.filterSelect} 
                        disabled={departments.length === 0 || loading.departments}
                    >
                        <option value="all">Todos os Departamentos</option>
                        {departments.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className={styles.chartsSection}>
                <div className={styles.chartContainer}>
                    <h3 className={styles.chartTitle}>Respostas por Dia (últimos 7 dias)</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={(() => {
                            const dayMap: Record<string, number> = {};
                            const last7Days = Array.from({length: 7}, (_, i) => {
                                const date = new Date();
                                date.setDate(date.getDate() - (6 - i));
                                return date.toLocaleDateString('pt-BR');
                            });
                            last7Days.forEach(day => dayMap[day] = 0);
                            filteredResponses.forEach(r => {
                                const date = toDateCompat((r as any).createdAt) || toDateCompat((r as any).submittedAt);
                                if (date) {
                                    const ds = date.toLocaleDateString('pt-BR');
                                    if (dayMap.hasOwnProperty(ds)) {
                                        dayMap[ds] = (dayMap[ds] || 0) + 1;
                                    }
                                }
                            });
                            return last7Days.map(date => ({ date, count: dayMap[date] }));
                        })()}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E8EAD6" />
                            <XAxis dataKey="date" stroke="#B18F42" />
                            <YAxis stroke="#B18F42" />
                            <Tooltip />
                            <Line 
                                type="monotone" 
                                dataKey="count" 
                                stroke="#B18F42" 
                                strokeWidth={3}
                                dot={{ fill: '#B18F42', strokeWidth: 2, r: 4 }}
                            />
                        </LineChart>
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
                        {filteredForms
                            .filter(f => f.id && f.id.trim() !== '') // Filtrar formulários sem ID
                            .slice(0, 5)
                            .map((form, index) => (
                            <div key={form.id || `form-${index}`} className={styles.formItem}>
                                <div>
                                    <h4 className={styles.formName}>{form.title}</h4>
                                    <p className={styles.formMeta}>
                                        {toDateCompat(form.createdAt)?.toLocaleDateString('pt-BR')}
                                    </p>
                                </div>
                                <div className={styles.formStats}>
                                    <span className={styles.responseCount}>
                                        {allResponses.filter(r => r.formId === form.id).length} respostas
                                    </span>
                                </div>
                            </div>
                        ))}
                        {filteredForms.length === 0 && !loading.forms && (
                            <p className={styles.emptyMessage}>Nenhum formulário encontrado</p>
                        )}
                        {loading.forms && (
                            <p className={styles.loadingMessage}>Carregando formulários...</p>
                        )}
                    </div>
                </div>
               <div className={styles.listContainer}>
  <h3 className={styles.listTitle}>Respostas Recentes</h3>
  <div className={styles.responseList}>
    {[...filteredResponses]
      .sort((a, b) => {
        const da = toDateCompat(a.createdAt) || toDateCompat(a.submittedAt);
        const db = toDateCompat(b.createdAt) || toDateCompat(b.submittedAt);
        if (!db && !da) return 0;
        if (!db) return -1;
        if (!da) return 1;
        // Mais novo primeiro (decrescente)
        return db.getTime() - da.getTime();
      })
      .slice(0, 5)
      .map((response, index) => (
        <div key={response.id || `response-${index}`} className={styles.responseItem}>
          <div>
            <h4 className={styles.responseForm}>
              {response.formTitle || allForms.find(f => f.id === response.formId)?.title || 'Formulário Desconhecido'}
            </h4>
            <p className={styles.responseMeta}>
              {(() => {
                const dt = toDateCompat(response.createdAt) || toDateCompat(response.submittedAt);
                return dt ? dt.toLocaleString('pt-BR') : '';
              })()} • {response.collaboratorUsername || 'Usuário Desconhecido'}
            </p>
          </div>
          <div className={styles.responseStatus}>
            <span className={styles.statusDot} />
            Recebida
          </div>
        </div>
      ))
    }
    {filteredResponses.length === 0 && !loading.responses && (
      <p className={styles.emptyMessage}>Nenhuma resposta encontrada</p>
    )}
    {loading.responses && (
      <p className={styles.loadingMessage}>Carregando respostas...</p>
    )}
  </div>
</div>

            </div>


            {error && <div className={styles.errorAlert}>{error}</div>}
        </div>
    );
}
