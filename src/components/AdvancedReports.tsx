import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Area, AreaChart } from 'recharts';
import { Calendar, Download, Filter, TrendingUp, Users, FileText, Clock, Target, BarChart3 } from 'lucide-react';
import { Company, Department, Form, FormResponse } from '@/types';
import { DashboardMetrics } from '@/hooks/useDashboardData';

// --- Util datas Firestore/JS ---
function toDateCompat(val: Timestamp | string | object | undefined | null): Date | null {
    if (!val) return null;
    if (typeof val.toDate === 'function') return val.toDate();
    if (typeof val === 'string') return new Date(val);
    if (typeof val === 'object' && '_seconds' in val) return new Date(val._seconds * 1000);
    return null;
}

interface AdvancedReportsProps {
    metrics: DashboardMetrics;
    companies: Company[];
    departments: Department[];
    forms: Form[];
    responses: FormResponse[];
    onExport: (data: any[], filename: string) => void;
}

type ReportType = 'overview' | 'performance' | 'engagement' | 'trends' | 'detailed';

const AdvancedReports: React.FC<AdvancedReportsProps> = ({
    metrics,
    companies,
    departments,
    forms,
    responses,
    onExport
}) => {
    const [activeReport, setActiveReport] = useState<ReportType>('overview');
    const [dateRange, setDateRange] = useState({
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    });

    // Color palette for charts
    const colors = ['#B18F42', '#C5A05C', '#E8EAD6', '#07485B', '#8B7355', '#D4AF37', '#CD853F'];

    // Calculate advanced metrics
    const advancedMetrics = useMemo(() => {
        // Response rate by form
        const formResponseRates = forms.map(form => {
            const formResponses = responses.filter(r => r.formId === form.id);
            const uniqueUsers = [...new Set(responses.map(r => r.collaboratorId))].length;
            const responseRate = uniqueUsers > 0 ? (formResponses.length / uniqueUsers) * 100 : 0;
            
            return {
                formTitle: form.title.length > 20 ? form.title.substring(0, 20) + '...' : form.title,
                responses: formResponses.length,
                responseRate: Math.round(responseRate),
                avgTime: formResponses.length > 0 ? 
                    Math.round(formResponses.reduce((acc, r) => {
                        const created = toDateCompat(r.createdAt);
                        const submitted = toDateCompat(r.submittedAt);
                        if (created && submitted) {
                            return acc + (submitted.getTime() - created.getTime()) / (1000 * 60);
                        }
                        return acc;
                    }, 0) / formResponses.length) : 0
            };
        }).sort((a, b) => b.responses - a.responses);

        // Monthly trends
        const monthlyTrends = Array.from({ length: 12 }, (_, i) => {
            const date = new Date();
            date.setMonth(date.getMonth() - (11 - i));
            const monthStr = date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
            
            const monthResponses = responses.filter(r => {
                const respDate = toDateCompat(r.createdAt);
                return respDate && 
                       respDate.getMonth() === date.getMonth() && 
                       respDate.getFullYear() === date.getFullYear();
            });

            const monthUsers = [...new Set(monthResponses.map(r => r.collaboratorId))];

            return {
                month: monthStr,
                responses: monthResponses.length,
                users: monthUsers.length,
                avgTime: monthResponses.length > 0 ?
                    Math.round(monthResponses.reduce((acc, r) => {
                        const created = toDateCompat(r.createdAt);
                        const submitted = toDateCompat(r.submittedAt);
                        if (created && submitted) {
                            return acc + (submitted.getTime() - created.getTime()) / (1000 * 60);
                        }
                        return acc;
                    }, 0) / monthResponses.length) : 0
            };
        });

        // User activity patterns
        const hourlyActivity = Array.from({ length: 24 }, (_, hour) => {
            const hourResponses = responses.filter(r => {
                const respDate = toDateCompat(r.createdAt);
                return respDate && respDate.getHours() === hour;
            });

            return {
                hour: `${hour}:00`,
                responses: hourResponses.length
            };
        });

        // Department performance
        const departmentPerformance = departments.map(dept => {
            const deptResponses = responses.filter(r => r.departmentId === dept.id);
            const deptForms = forms.filter(f => f.departmentId === dept.id);
            const deptUsers = [...new Set(deptResponses.map(r => r.collaboratorId))];
            
            const completionRate = deptForms.length > 0 && deptUsers.length > 0 ?
                (deptResponses.length / (deptForms.length * deptUsers.length)) * 100 : 0;

            return {
                name: dept.name,
                responses: deptResponses.length,
                forms: deptForms.length,
                users: deptUsers.length,
                completionRate: Math.round(completionRate),
                avgTime: deptResponses.length > 0 ?
                    Math.round(deptResponses.reduce((acc, r) => {
                        const created = toDateCompat(r.createdAt);
                        const submitted = toDateCompat(r.submittedAt);
                        if (created && submitted) {
                            return acc + (submitted.getTime() - created.getTime()) / (1000 * 60);
                        }
                        return acc;
                    }, 0) / deptResponses.length) : 0
            };
        }).sort((a, b) => b.responses - a.responses);

        return {
            formResponseRates,
            monthlyTrends,
            hourlyActivity,
            departmentPerformance
        };
    }, [forms, responses, departments]);

    const renderOverviewReport = () => (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-600">Total de Respostas</p>
                            <p className="text-2xl font-bold text-gray-900">{metrics.totalResponses}</p>
                        </div>
                        <FileText className="h-8 w-8 text-blue-600" />
                    </div>
                </div>
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-600">Usuários Ativos</p>
                            <p className="text-2xl font-bold text-gray-900">{metrics.activeUsers}</p>
                        </div>
                        <Users className="h-8 w-8 text-green-600" />
                    </div>
                </div>
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-600">Taxa de Conclusão</p>
                            <p className="text-2xl font-bold text-gray-900">{metrics.completionRate}</p>
                        </div>
                        <Target className="h-8 w-8 text-purple-600" />
                    </div>
                </div>
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-600">Tempo Médio</p>
                            <p className="text-2xl font-bold text-gray-900">{metrics.avgResponseTime}min</p>
                        </div>
                        <Clock className="h-8 w-8 text-orange-600" />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <h3 className="text-lg font-semibold mb-4">Atividade Diária</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={metrics.dailyActivity}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip />
                            <Area type="monotone" dataKey="responses" stroke="#B18F42" fill="#B18F42" fillOpacity={0.3} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <h3 className="text-lg font-semibold mb-4">Distribuição por Departamento</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={metrics.departmentDistribution}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, percentage }) => `${name} ${percentage}%`}
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="value"
                            >
                                {metrics.departmentDistribution.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );

    const renderPerformanceReport = () => (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">Performance dos Formulários</h3>
                    <button
                        onClick={() => onExport(advancedMetrics.formResponseRates, 'performance_formularios')}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        <Download size={16} />
                        Exportar
                    </button>
                </div>
                <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={advancedMetrics.formResponseRates}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="formTitle" />
                        <YAxis yAxisId="left" />
                        <YAxis yAxisId="right" orientation="right" />
                        <Tooltip />
                        <Bar yAxisId="left" dataKey="responses" fill="#B18F42" name="Respostas" />
                        <Bar yAxisId="right" dataKey="responseRate" fill="#C5A05C" name="Taxa %" />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">Performance por Departamento</h3>
                    <button
                        onClick={() => onExport(advancedMetrics.departmentPerformance, 'performance_departamentos')}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        <Download size={16} />
                        Exportar
                    </button>
                </div>
                <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={advancedMetrics.departmentPerformance}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="responses" fill="#B18F42" name="Respostas" />
                        <Bar dataKey="completionRate" fill="#C5A05C" name="Taxa de Conclusão %" />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );

    const renderEngagementReport = () => (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">Padrão de Atividade por Hora</h3>
                    <button
                        onClick={() => onExport(advancedMetrics.hourlyActivity, 'atividade_horaria')}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        <Download size={16} />
                        Exportar
                    </button>
                </div>
                <ResponsiveContainer width="100%" height={400}>
                    <AreaChart data={advancedMetrics.hourlyActivity}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="hour" />
                        <YAxis />
                        <Tooltip />
                        <Area type="monotone" dataKey="responses" stroke="#B18F42" fill="#B18F42" fillOpacity={0.3} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">Top Usuários Engajados</h3>
                    <button
                        onClick={() => onExport(metrics.userEngagement.slice(0, 10), 'top_usuarios')}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        <Download size={16} />
                        Exportar
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Usuário
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Respostas
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Tempo Médio
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Última Atividade
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {metrics.userEngagement.slice(0, 10).map((user, index) => (
                                <tr key={user.userId}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {user.username}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {user.responses}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {user.avgTime} min
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {user.lastActivity?.toLocaleString('pt-BR') || '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

    const renderTrendsReport = () => (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">Tendências Mensais</h3>
                    <button
                        onClick={() => onExport(advancedMetrics.monthlyTrends, 'tendencias_mensais')}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        <Download size={16} />
                        Exportar
                    </button>
                </div>
                <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={advancedMetrics.monthlyTrends}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis yAxisId="left" />
                        <YAxis yAxisId="right" orientation="right" />
                        <Tooltip />
                        <Line yAxisId="left" type="monotone" dataKey="responses" stroke="#B18F42" strokeWidth={3} name="Respostas" />
                        <Line yAxisId="left" type="monotone" dataKey="users" stroke="#C5A05C" strokeWidth={3} name="Usuários" />
                        <Line yAxisId="right" type="monotone" dataKey="avgTime" stroke="#07485B" strokeWidth={3} name="Tempo Médio (min)" />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-600">Crescimento de Respostas</p>
                            <p className="text-2xl font-bold text-gray-900">
                                {metrics.responseTrend !== null ? `${metrics.responseTrend > 0 ? '+' : ''}${metrics.responseTrend}%` : 'N/A'}
                            </p>
                        </div>
                        <TrendingUp className={`h-8 w-8 ${metrics.responseTrend && metrics.responseTrend > 0 ? 'text-green-600' : 'text-red-600'}`} />
                    </div>
                </div>
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-600">Score de Engajamento</p>
                            <p className="text-2xl font-bold text-gray-900">{metrics.engagementScore}</p>
                        </div>
                        <BarChart3 className="h-8 w-8 text-purple-600" />
                    </div>
                </div>
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-600">Formulários Ativos</p>
                            <p className="text-2xl font-bold text-gray-900">{metrics.totalForms}</p>
                        </div>
                        <FileText className="h-8 w-8 text-blue-600" />
                    </div>
                </div>
            </div>
        </div>
    );

    const reportTabs = [
        { id: 'overview', label: 'Visão Geral', icon: BarChart3 },
        { id: 'performance', label: 'Performance', icon: Target },
        { id: 'engagement', label: 'Engajamento', icon: Users },
        { id: 'trends', label: 'Tendências', icon: TrendingUp }
    ];

    return (
        <div className="bg-gray-50 min-h-screen p-6">
            <div className="max-w-7xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-4">Relatórios Avançados</h1>
                    
                    <div className="flex flex-wrap gap-4 items-center">
                        <div className="flex bg-white rounded-lg shadow-sm border">
                            {reportTabs.map((tab) => {
                                const Icon = tab.icon;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveReport(tab.id as ReportType)}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                                            activeReport === tab.id
                                                ? 'bg-blue-600 text-white'
                                                : 'text-gray-600 hover:bg-gray-100'
                                        }`}
                                    >
                                        <Icon size={16} />
                                        {tab.label}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg shadow-sm border">
                            <Calendar size={16} className="text-gray-500" />
                            <input
                                type="date"
                                value={dateRange.start}
                                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                className="border-none outline-none text-sm"
                            />
                            <span className="text-gray-500">até</span>
                            <input
                                type="date"
                                value={dateRange.end}
                                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                className="border-none outline-none text-sm"
                            />
                        </div>
                    </div>
                </div>

                <div className="mb-8">
                    {activeReport === 'overview' && renderOverviewReport()}
                    {activeReport === 'performance' && renderPerformanceReport()}
                    {activeReport === 'engagement' && renderEngagementReport()}
                    {activeReport === 'trends' && renderTrendsReport()}
                </div>
            </div>
        </div>
    );
};

export default AdvancedReports;

