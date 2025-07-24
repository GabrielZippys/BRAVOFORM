import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, collectionGroup, query, orderBy, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Company, Department, Form, FormResponse } from '@/types';

// Utility function for date compatibility
function toDateCompat(val: any): Date | null {
    if (!val) return null;
    if (typeof val.toDate === 'function') return val.toDate();
    if (typeof val === 'string') return new Date(val);
    if (typeof val === 'object' && '_seconds' in val) return new Date(val._seconds * 1000);
    return null;
}

export interface DashboardMetrics {
    totalResponses: number;
    totalForms: number;
    activeUsers: number;
    completionRate: string;
    avgResponseTime: number;
    engagementScore: number;
    responseTrend: number | null;
    topPerformingForms: Array<{
        id: string;
        title: string;
        responses: number;
        avgTime: number;
    }>;
    departmentDistribution: Array<{
        name: string;
        value: number;
        percentage: number;
    }>;
    dailyActivity: Array<{
        date: string;
        responses: number;
        users: number;
    }>;
    userEngagement: Array<{
        userId: string;
        username: string;
        responses: number;
        avgTime: number;
        lastActivity: Date | null;
    }>;
}

export interface DashboardFilters {
    companyId: string;
    departmentId: string;
    timeFilter: 'day' | 'week' | 'month' | 'year';
    dateRange?: {
        start: Date;
        end: Date;
    };
}

export function useDashboardData(userId: string | null) {
    const [companies, setCompanies] = useState<Company[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [allResponses, setAllResponses] = useState<FormResponse[]>([]);
    const [allForms, setAllForms] = useState<Form[]>([]);
    const [loading, setLoading] = useState({
        companies: true,
        departments: true,
        responses: true,
        forms: true
    });
    const [error, setError] = useState<string>('');

    // Load companies
    useEffect(() => {
        if (!userId) return;
        
        const loadCompanies = async () => {
            try {
                const snapshot = await getDocs(collection(db, 'companies'));
                const companiesData = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                } as Company));
                setCompanies(companiesData);
            } catch (err) {
                setError('Erro ao carregar empresas');
                console.error('Error loading companies:', err);
            } finally {
                setLoading(prev => ({ ...prev, companies: false }));
            }
        };

        loadCompanies();
    }, [userId]);

    // Load forms
    useEffect(() => {
        if (!userId) return;

        const loadForms = async () => {
            try {
                const snapshot = await getDocs(collection(db, 'forms'));
                const formsData = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                } as Form));
                setAllForms(formsData);
            } catch (err) {
                setError('Erro ao carregar formulários');
                console.error('Error loading forms:', err);
            } finally {
                setLoading(prev => ({ ...prev, forms: false }));
            }
        };

        loadForms();
    }, [userId]);

    // Load responses
    useEffect(() => {
        if (!userId) return;

        const loadResponses = async () => {
            try {
                const snapshot = await getDocs(collectionGroup(db, 'responses'));
                const responsesData = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                } as FormResponse));
                setAllResponses(responsesData);
            } catch (err) {
                setError('Erro ao carregar respostas');
                console.error('Error loading responses:', err);
            } finally {
                setLoading(prev => ({ ...prev, responses: false }));
            }
        };

        loadResponses();
    }, [userId]);

    // Load departments based on selected company
    const loadDepartments = async (companyId: string) => {
        if (companyId === 'all') {
            setDepartments([]);
            setLoading(prev => ({ ...prev, departments: false }));
            return;
        }

        setLoading(prev => ({ ...prev, departments: true }));
        try {
            const snapshot = await getDocs(collection(db, `companies/${companyId}/departments`));
            const departmentsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Department));
            setDepartments(departmentsData);
        } catch (err) {
            setError('Erro ao carregar departamentos');
            console.error('Error loading departments:', err);
        } finally {
            setLoading(prev => ({ ...prev, departments: false }));
        }
    };

    // Calculate metrics based on filters
    const calculateMetrics = (filters: DashboardFilters): DashboardMetrics => {
        // Filter data based on company and department
        const filteredResponses = allResponses.filter(r => (
            (filters.companyId === 'all' || r.companyId === filters.companyId) &&
            (filters.departmentId === 'all' || r.departmentId === filters.departmentId)
        ));

        const filteredForms = allForms.filter(f => (
            (filters.companyId === 'all' || f.companyId === filters.companyId) &&
            (filters.departmentId === 'all' || f.departmentId === filters.departmentId)
        ));

        // Apply time filter
        const now = new Date();
        const filteredByTime = filteredResponses.filter(r => {
            const d = toDateCompat((r as any).createdAt) || toDateCompat((r as any).submittedAt);
            if (!d) return false;

            if (filters.dateRange) {
                return d >= filters.dateRange.start && d <= filters.dateRange.end;
            }

            switch (filters.timeFilter) {
                case 'day':
                    return d.getDate() === now.getDate() && 
                           d.getMonth() === now.getMonth() && 
                           d.getFullYear() === now.getFullYear();
                case 'week':
                    const weekStart = new Date(now);
                    weekStart.setDate(now.getDate() - now.getDay());
                    return d >= weekStart;
                case 'month':
                    return d.getMonth() === now.getMonth() && 
                           d.getFullYear() === now.getFullYear();
                case 'year':
                    return d.getFullYear() === now.getFullYear();
                default:
                    return true;
            }
        });

        // Calculate basic metrics
        const uniqueUsers = [...new Set(filteredResponses.map(r => r.collaboratorId))];
        const totalResponses = filteredByTime.length;
        const totalForms = filteredForms.length;
        const activeUsers = uniqueUsers.length;

        // Calculate completion rate
        const maxExpected = totalForms * activeUsers || 1;
        const completionRate = Math.min((totalResponses / maxExpected) * 100, 100).toFixed(1) + '%';

        // Calculate average response time
        const responseTimes = filteredByTime
            .map(r => {
                const created = toDateCompat(r.createdAt);
                const submitted = toDateCompat(r.submittedAt);
                if (created && submitted) {
                    return (submitted.getTime() - created.getTime()) / (1000 * 60); // in minutes
                }
                return null;
            })
            .filter(t => t !== null) as number[];

        const avgResponseTime = responseTimes.length > 0 
            ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
            : 0;

        // Calculate engagement score
        const engagementScore = Math.round((totalResponses / Math.max(activeUsers, 1)) * 10) / 10;

        // Calculate trend (comparison with previous period)
        const previousPeriodResponses = calculatePreviousPeriodResponses(filteredResponses, filters.timeFilter, now);
        const responseTrend = previousPeriodResponses > 0 
            ? Math.round(((totalResponses - previousPeriodResponses) / previousPeriodResponses) * 100)
            : null;

        // Calculate top performing forms
        const topPerformingForms = filteredForms
            .map(form => {
                const formResponses = filteredResponses.filter(r => r.formId === form.id);
                const avgTime = formResponses.length > 0
                    ? formResponses.reduce((acc, r) => {
                        const created = toDateCompat(r.createdAt);
                        const submitted = toDateCompat(r.submittedAt);
                        if (created && submitted) {
                            return acc + (submitted.getTime() - created.getTime()) / (1000 * 60);
                        }
                        return acc;
                    }, 0) / formResponses.length
                    : 0;

                return {
                    id: form.id,
                    title: form.title,
                    responses: formResponses.length,
                    avgTime: Math.round(avgTime)
                };
            })
            .sort((a, b) => b.responses - a.responses)
            .slice(0, 5);

        // Calculate department distribution
        const deptMap: Record<string, number> = {};
        filteredResponses.forEach(r => {
            const dept = departments.find(d => d.id === r.departmentId)?.name || 'Outros';
            deptMap[dept] = (deptMap[dept] || 0) + 1;
        });

        const totalDeptResponses = Object.values(deptMap).reduce((a, b) => a + b, 0);
        const departmentDistribution = Object.entries(deptMap).map(([name, value]) => ({
            name,
            value,
            percentage: totalDeptResponses > 0 ? Math.round((value / totalDeptResponses) * 100) : 0
        }));

        // Calculate daily activity for last 7 days
        const dailyActivity = Array.from({ length: 7 }, (_, i) => {
            const date = new Date();
            date.setDate(date.getDate() - (6 - i));
            const dateStr = date.toLocaleDateString('pt-BR');
            
            const dayResponses = filteredResponses.filter(r => {
                const respDate = toDateCompat((r as any).createdAt) || toDateCompat((r as any).submittedAt);
                return respDate && respDate.toLocaleDateString('pt-BR') === dateStr;
            });

            const dayUsers = [...new Set(dayResponses.map(r => r.collaboratorId))];

            return {
                date: dateStr,
                responses: dayResponses.length,
                users: dayUsers.length
            };
        });

        // Calculate user engagement details
        const userEngagement = uniqueUsers.map(userId => {
            const userResponses = filteredResponses.filter(r => r.collaboratorId === userId);
            const firstResp = userResponses[0];
            const username = firstResp?.collaboratorUsername || userId;

            const userTimes = userResponses
                .map(r => {
                    const created = toDateCompat(r.createdAt);
                    const submitted = toDateCompat(r.submittedAt);
                    if (created && submitted) {
                        return (submitted.getTime() - created.getTime()) / (1000 * 60);
                    }
                    return null;
                })
                .filter(t => t !== null) as number[];

            const avgTime = userTimes.length > 0
                ? Math.round(userTimes.reduce((a, b) => a + b, 0) / userTimes.length)
                : 0;

            const lastActivity = userResponses.reduce((latest, curr) => {
                const dt = toDateCompat(curr.createdAt) || toDateCompat(curr.submittedAt);
                if (!latest) return dt;
                return dt && dt > latest ? dt : latest;
            }, null as Date | null);

            return {
                userId,
                username,
                responses: userResponses.length,
                avgTime,
                lastActivity
            };
        }).sort((a, b) => b.responses - a.responses);

        return {
            totalResponses,
            totalForms,
            activeUsers,
            completionRate,
            avgResponseTime,
            engagementScore,
            responseTrend,
            topPerformingForms,
            departmentDistribution,
            dailyActivity,
            userEngagement
        };
    };

    // Helper function to calculate previous period responses
    const calculatePreviousPeriodResponses = (responses: FormResponse[], timeFilter: string, now: Date): number => {
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

        return responses.filter(r => {
            const d = toDateCompat((r as any).createdAt) || toDateCompat((r as any).submittedAt);
            return d && d >= previousStart && d <= previousEnd;
        }).length;
    };

    // Export data to CSV
    const exportToCSV = (data: any[], filename: string) => {
        if (data.length === 0) return;

        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => 
                headers.map(header => {
                    const value = row[header];
                    if (value instanceof Date) {
                        return `"${value.toLocaleString('pt-BR')}"`;
                    }
                    return `"${String(value).replace(/"/g, '""')}"`;
                }).join(',')
            )
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    return {
        companies,
        departments,
        allResponses,
        allForms,
        loading,
        error,
        loadDepartments,
        calculateMetrics,
        exportToCSV,
        setError
    };
}

