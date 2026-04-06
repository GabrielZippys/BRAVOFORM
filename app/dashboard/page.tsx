'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { FileText, Users, Target, TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '@/hooks/useAuth';
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

function TopUsers({ responses }: { responses: any[] }) {
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
    const [companies, setCompanies]   = useState<any[]>([]);
    const [departments, setDepartments] = useState<any[]>([]);
    const [selectedCompanyId, setSelectedCompanyId]     = useState<string>('all');
    const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>('all');
    const [timeFilter, setTimeFilter] = useState<'day' | 'week' | 'month' | 'year'>('month');
    const [allResponses, setAllResponses] = useState<any[]>([]);
    const [allForms, setAllForms]     = useState<any[]>([]);
    const [loading, setLoading]       = useState({ companies: true, departments: false, responses: true, forms: true });
    const [error, setError]           = useState('');

    // Carga inicial única: companies + forms + responses em paralelo no servidor
    useEffect(() => {
        if (!user) return;
        fetch('/api/dataconnect/dashboard?type=all')
            .then(r => r.json())
            .then(res => {
                if (res.success) {
                    setCompanies(res.companies || []);
                    setAllForms(res.forms || []);
                    const sorted = [...(res.responses || [])].sort((a: any, b: any) => {
                        const da = new Date(a.submittedAt || a.createdAt || 0).getTime();
                        const db = new Date(b.submittedAt || b.createdAt || 0).getTime();
                        return db - da;
                    });
                    setAllResponses(sorted);
                }
            })
            .catch(e => setError(e.message))
            .finally(() => setLoading({ companies: false, departments: false, responses: false, forms: false }));
    }, [user]);

    // Carregar departamentos do SQL quando empresa muda
    useEffect(() => {
        if (selectedCompanyId === 'all') {
            setDepartments([]);
            return;
        }
        setLoading(l => ({ ...l, departments: true }));
        fetch(`/api/dataconnect/dashboard?type=departments&companyId=${encodeURIComponent(selectedCompanyId)}`)
            .then(r => r.json())
            .then(res => { if (res.success) setDepartments(res.data); })
            .catch(e => setError(e.message))
            .finally(() => setLoading(l => ({ ...l, departments: false })));
    }, [selectedCompanyId]);


    // Filtros por empresa / departamento
    const filteredResponses = useMemo(() => allResponses.filter(r => (
        (selectedCompanyId === 'all' || r.companyId === selectedCompanyId) &&
        (selectedDepartmentId === 'all' || r.departmentId === selectedDepartmentId)
    )), [allResponses, selectedCompanyId, selectedDepartmentId]);

    const filteredForms = useMemo(() => allForms.filter(f => (
        (selectedCompanyId === 'all' || f.companyId === selectedCompanyId) &&
        (selectedDepartmentId === 'all' || f.departmentId === selectedDepartmentId)
    )), [allForms, selectedCompanyId, selectedDepartmentId]);

    // Filtrar por período
    const now = new Date();
    const filteredByTime = useMemo(() => filteredResponses.filter(r => {
        const d = new Date(r.submittedAt || r.createdAt || 0);
        if (!d || isNaN(d.getTime())) return false;
        switch (timeFilter) {
            case 'day':
                return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            case 'week': {
                const weekStart = new Date(now);
                weekStart.setDate(now.getDate() - now.getDay());
                weekStart.setHours(0, 0, 0, 0);
                return d >= weekStart;
            }
            case 'month':
                return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            case 'year':
                return d.getFullYear() === now.getFullYear();
            default: return true;
        }
    }), [filteredResponses, timeFilter]);

    const uniqueUsers = useMemo(() => [...new Set(filteredResponses.map(r => r.collaboratorId).filter(Boolean))], [filteredResponses]);

    const completionRate = useMemo(() => {
        const maxEsperado = filteredForms.length * Math.max(uniqueUsers.length, 1);
        return Math.min((filteredByTime.length / maxEsperado) * 100, 100).toFixed(1) + '%';
    }, [filteredByTime.length, filteredForms.length, uniqueUsers.length]);

    const previousPeriodResponses = useMemo(() => {
        const previousStart = new Date(now);
        const previousEnd   = new Date(now);
        switch (timeFilter) {
            case 'day':   previousStart.setDate(now.getDate() - 1); previousEnd.setDate(now.getDate() - 1); break;
            case 'week':  previousStart.setDate(now.getDate() - 14); previousEnd.setDate(now.getDate() - 7); break;
            case 'month': previousStart.setMonth(now.getMonth() - 1); previousEnd.setMonth(now.getMonth() - 1); break;
            case 'year':  previousStart.setFullYear(now.getFullYear() - 1); previousEnd.setFullYear(now.getFullYear() - 1); break;
        }
        return filteredResponses.filter(r => {
            const d = new Date(r.submittedAt || r.createdAt || 0);
            return d >= previousStart && d <= previousEnd;
        }).length;
    }, [filteredResponses, timeFilter]);

    const responseTrend = previousPeriodResponses === 0 ? null
        : Math.round(((filteredByTime.length - previousPeriodResponses) / previousPeriodResponses) * 100);

    // Dados do gráfico: últimos 7 dias
    const dailyChartData = useMemo(() => {
        const dayMap: Record<string, number> = {};
        const last7 = Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (6 - i));
            return d.toLocaleDateString('pt-BR');
        });
        last7.forEach(day => { dayMap[day] = 0; });
        filteredResponses.forEach(r => {
            const d = new Date(r.submittedAt || r.createdAt || 0);
            if (!isNaN(d.getTime())) {
                const ds = d.toLocaleDateString('pt-BR');
                if (ds in dayMap) dayMap[ds]++;
            }
        });
        return last7.map(date => ({ date, count: dayMap[date] }));
    }, [filteredResponses]);

    const icons = {
        responses: <FileText size={26} color="#B18F42" />,
        forms:     <FileText size={26} color="#07485B" />,
        users:     <Users    size={26} color="#B18F42" />,
        rate:      <Target   size={26} color="#B18F42" />,
        trend:     <TrendingUp size={26} color="#B18F42" />,
    };

    return (
        <div className={styles.dashboardContainer}>
            <div className={styles.header}>
                <h1 className={styles.title}>Dashboard Administrativo</h1>
                <div className={styles.headerActions}>
                    <div className={styles.timeFilters}>
                        {(['day','week','month','year'] as const).map(key => (
                            <button
                                key={key}
                                className={`${styles.timeFilter} ${timeFilter === key ? styles.active : ''}`}
                                onClick={() => setTimeFilter(key)}
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
                        <LineChart data={dailyChartData}>
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
                        {filteredForms.slice(0, 5).map((form, index) => (
                            <div key={form.id || `form-${index}`} className={styles.formItem}>
                                <div>
                                    <h4 className={styles.formName}>{form.title}</h4>
                                    <p className={styles.formMeta}>
                                        {form.createdAt ? new Date(form.createdAt).toLocaleDateString('pt-BR') : ''}
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
                        {filteredResponses.slice(0, 5).map((response, index) => (
                            <div key={response.id || `response-${index}`} className={styles.responseItem}>
                                <div>
                                    <h4 className={styles.responseForm}>
                                        {response.formTitle || 'Formulário Desconhecido'}
                                    </h4>
                                    <p className={styles.responseMeta}>
                                        {response.submittedAt || response.createdAt
                                            ? new Date(response.submittedAt || response.createdAt).toLocaleString('pt-BR')
                                            : ''
                                        } • {response.collaboratorUsername || 'Usuário Desconhecido'}
                                    </p>
                                </div>
                                <div className={styles.responseStatus}>
                                    <span className={styles.statusDot} />
                                    Recebida
                                </div>
                            </div>
                        ))}
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
