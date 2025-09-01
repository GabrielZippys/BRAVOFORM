'use client';

import { useEffect, useMemo, useState } from 'react';
import { db } from '../../firebase/config';
import {
  collection,
  query,
  where,
  onSnapshot,
  getCountFromServer,
  doc,
  collectionGroup,
  orderBy,
  limit,
  getDocs,
  Timestamp,
  QueryConstraint,
} from 'firebase/firestore';

import styles from '../../app/styles/Users.module.css';
import {
  FileText,
  BarChart2,
  MessageSquare,
  Activity,
  Users,
  Target,
  Clock,
} from 'lucide-react';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

type FireTs = Timestamp | undefined;

interface FormDoc {
  id: string;
  title: string;
  departmentId: string;
  companyId: string;
  createdAt?: FireTs;
}

interface RespDoc {
  id: string;
  formId: string;
  formTitle?: string;
  departmentId?: string;
  companyId?: string;
  collaboratorId?: string;
  collaboratorUsername?: string;
  createdAt?: FireTs;
  submittedAt?: FireTs;
}

function toDate(val?: any): Date | null {
  if (!val) return null;
  if (val instanceof Timestamp) return val.toDate();
  if (typeof val?.toDate === 'function') return val.toDate();
  if (typeof val === 'string') return new Date(val);
  if (typeof val === 'object' && (val.seconds || val._seconds)) {
    const s = val.seconds ?? val._seconds;
    return new Date(s * 1000);
  }
  return null;
}

type TimeWindow = '7d' | '30d' | '90d';
type FilterMode = 'presets' | 'range' | 'day';


export default function DepartmentLeaderDash({
  companyId,
  departmentId,
}: {
  companyId: string;
  departmentId: string;
}) {
  const [forms, setForms] = useState<FormDoc[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [recent, setRecent] = useState<RespDoc[]>([]);
  const [allDeptResponses, setAllDeptResponses] = useState<RespDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('30d');
  const [error, setError] = useState<string>('');

  // ---- Carrega formulários do setor (tempo real) + contagem agregada por form
  useEffect(() => {
  if (!companyId || !departmentId) {  // ⬅️ evita where(undefined)
    setForms([]);
    setCounts({});
    setLoading(false);
    return;
  }

  setLoading(true);
  const qForms = query(
    collection(db, 'forms'),
    where('companyId', '==', companyId),
    where('departmentId', '==', departmentId)
  );
  const unsub = onSnapshot(

      qForms,
      async (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as FormDoc[];
        setForms(list);

        // Aggregate count para cada form
        const results: Record<string, number> = {};
        await Promise.all(
          list.map(async (f) => {
            const c = await getCountFromServer(collection(db, `forms/${f.id}/responses`));
            results[f.id] = c.data().count;
          })
        );
        setCounts(results);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setError('Erro ao carregar formulários.');
        setLoading(false);
      }
    );
    return () => unsub();
  }, [companyId, departmentId]);

  // ---- Últimas respostas do setor (lista curta)
// ---- Últimas respostas do setor (lista curta)
useEffect(() => {
  (async () => {
    try {
      const qRecent = query(
        collectionGroup(db, 'responses'),
        where('departmentId', '==', departmentId)
        // sem orderBy aqui para não exigir índice
      );
      const snap = await getDocs(qRecent);
      const rows = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as RespDoc[];

      // ordena no cliente por submittedAt/createdAt (desc)
      rows.sort((a, b) => {
        const ta = (a.submittedAt?.seconds ?? a.createdAt?.seconds ?? 0);
        const tb = (b.submittedAt?.seconds ?? b.createdAt?.seconds ?? 0);
        return tb - ta; // mais novo primeiro
      });

      setRecent(rows.slice(0, 20));
    } catch (err) {
      console.error(err);
      setError('Erro ao buscar últimas respostas.');
    }
  })();
}, [departmentId]);


  // ---- Respostas do setor para o período (para gráficos)
// ---- Respostas do setor para o período (para gráficos)
useEffect(() => {
  (async () => {
    try {
      const now = new Date();
      const start = new Date();
      if (timeWindow === '7d') start.setDate(now.getDate() - 6);
      if (timeWindow === '30d') start.setDate(now.getDate() - 29);
      if (timeWindow === '90d') start.setDate(now.getDate() - 89);

      // Busca só por departamento e filtra por data no cliente,
      // aceitando submittedAt OU createdAt.
      const qResp = query(
        collectionGroup(db, 'responses'),
        where('departmentId', '==', departmentId)
      );
      const snap = await getDocs(qResp);

      const rowsAll = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as RespDoc[];

      const rows = rowsAll
        .filter(r => {
          const dt =
            (r.submittedAt instanceof Timestamp ? r.submittedAt.toDate() : null) ||
            (r.createdAt   instanceof Timestamp ? r.createdAt.toDate()   : null);
          return dt && dt >= start && dt <= now;
        })
        .sort((a, b) => {
          const da =
            (a.submittedAt instanceof Timestamp ? a.submittedAt.toDate() : null) ||
            (a.createdAt   instanceof Timestamp ? a.createdAt.toDate()   : null) ||
            new Date(0);
          const dbb =
            (b.submittedAt instanceof Timestamp ? b.submittedAt.toDate() : null) ||
            (b.createdAt   instanceof Timestamp ? b.createdAt.toDate()   : null) ||
            new Date(0);
          return da.getTime() - dbb.getTime(); // ascendente
        });

      setAllDeptResponses(rows);
    } catch (err: any) {
      console.error(err);
      setError('Erro ao carregar dados para gráficos.');
    }
  })();
}, [departmentId, timeWindow]);

const [mode, setMode] = useState<FilterMode>('presets'); // 'presets' | 'range' | 'day'
const [startDateStr, setStartDateStr] = useState<string>(''); // AAAA-MM-DD
const [endDateStr, setEndDateStr] = useState<string>('');     // AAAA-MM-DD
const [singleDateStr, setSingleDateStr] = useState<string>(''); // AAAA-MM-DD


  // ---- DERIVADOS / MÉTRICAS
  const metrics = useMemo(() => {
    const totalForms = forms.length;
    const totalResponses = allDeptResponses.length;

    const uniqueUsers = new Set(
      allDeptResponses.map((r) => r.collaboratorId).filter(Boolean) as string[]
    ).size;

    // tempo médio entre createdAt e submittedAt (minutos)
    const times: number[] = [];
    allDeptResponses.forEach((r) => {
      const c = toDate(r.createdAt);
      const s = toDate(r.submittedAt);
      if (c && s) times.push((s.getTime() - c.getTime()) / (1000 * 60));
    });
    const avgTime = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;

    // taxa simples: respostas por form (média no período)
    const completion =
      totalForms > 0 ? Math.min((totalResponses / totalForms) * 100, 100).toFixed(1) + '%' : '0%';

    return { totalForms, totalResponses, uniqueUsers, avgTime, completion };
  }, [forms, allDeptResponses]);

  // Respostas por dia
  const byDay = useMemo(() => {
    if (!allDeptResponses.length) return [];
    const map: Record<string, number> = {};
    allDeptResponses.forEach((r) => {
      const dt = toDate(r.submittedAt) || toDate(r.createdAt);
      if (!dt) return;
      const key = dt.toLocaleDateString('pt-BR');
      map[key] = (map[key] || 0) + 1;
    });
    // Ordena por data (pt-BR)
    const sorted = Object.entries(map).sort(
      (a, b) =>
        new Date(a[0].split('/').reverse().join('-')).getTime() -
        new Date(b[0].split('/').reverse().join('-')).getTime()
    );
    return sorted.map(([date, count]) => ({ date, count }));
  }, [allDeptResponses]);

  // Respostas por formulário (TOP 6)
  const byForm = useMemo(() => {
    const map: Record<string, number> = {};
    allDeptResponses.forEach((r) => {
      const key = r.formTitle || r.formId || 'Formulário';
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, value]) => ({
        name: name.length > 28 ? name.slice(0, 28) + '…' : name,
        value,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [allDeptResponses]);

  // Distribuição por usuário (TOP 5) para pizza
  const byUser = useMemo(() => {
    const map: Record<string, number> = {};
    allDeptResponses.forEach((r) => {
      const key = r.collaboratorUsername || r.collaboratorId || 'Usuário';
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name: name.length > 18 ? name.slice(0, 18) + '…' : name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [allDeptResponses]);

  const pieColors = ['#B18F42', '#C5A05C', '#07485B', '#8B7355', '#E8EAD6'];

  return (
    <div>
      {/* FILTROS / MÉTRICAS */}
      <div className={styles.frame}>
        <div className={styles.frameHeader}>
          <h3 className={styles.frameTitle}>Dash do Líder — {metrics.totalForms} formulários</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['7d', '30d', '90d'] as TimeWindow[]).map((tw) => (
              <button
                key={tw}
                onClick={() => setTimeWindow(tw)}
                className={styles.button}
                style={{
                  opacity: timeWindow === tw ? 1 : 0.6,
                }}
              >
                {tw === '7d' ? '7 dias' : tw === '30d' ? '30 dias' : '90 dias'}
              </button>
            ))}
          </div>
        </div>

        {/* cards rápidos */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          <div className={styles.itemCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Activity size={20} />
              <div>
                <div className={styles.itemName}>Respostas (período)</div>
                <div className={styles.itemInfo}>{metrics.totalResponses}</div>
              </div>
            </div>
          </div>

          <div className={styles.itemCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Users size={20} />
              <div>
                <div className={styles.itemName}>Colaboradores ativos</div>
                <div className={styles.itemInfo}>{metrics.uniqueUsers}</div>
              </div>
            </div>
          </div>

          <div className={styles.itemCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Target size={20} />
              <div>
                <div className={styles.itemName}>Taxa média</div>
                <div className={styles.itemInfo}>{metrics.completion}</div>
              </div>
            </div>
          </div>

          <div className={styles.itemCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Clock size={20} />
              <div>
                <div className={styles.itemName}>Tempo médio</div>
                <div className={styles.itemInfo}>{metrics.avgTime} min</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* GRÁFICOS */}
      <div className={styles.frame}>
        <div className={styles.frameHeader}>
          <h3 className={styles.frameTitle}>Tendência — Respostas por dia</h3>
        </div>
        {byDay.length === 0 ? (
          <p className={styles.emptyState}>Sem dados no período.</p>
        ) : (
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={byDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#B18F42" strokeWidth={3} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className={styles.frame} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <div className={styles.frameHeader}>
            <h3 className={styles.frameTitle}>Top Formulários (por respostas)</h3>
          </div>
          {byForm.length === 0 ? (
            <p className={styles.emptyState}>Sem dados no período.</p>
          ) : (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={byForm}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#C5A05C" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div>
          <div className={styles.frameHeader}>
            <h3 className={styles.frameTitle}>Distribuição por Colaborador</h3>
          </div>
          {byUser.length === 0 ? (
            <p className={styles.emptyState}>Sem dados no período.</p>
          ) : (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={byUser}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent = 0 }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {byUser.map((_, i) => (
                      <Cell key={i} fill={pieColors[i % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* LISTAS: Formulários + Últimas respostas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Formulários do setor */}
        <div className={styles.frame}>
          <div className={styles.frameHeader}>
            <BarChart2 size={18} />
            <h4 className={styles.frameTitle} style={{ marginLeft: 8 }}>
              Formulários do Setor
            </h4>
          </div>

          {loading ? (
            <p className={styles.emptyState}>Carregando…</p>
          ) : forms.length === 0 ? (
            <p className={styles.emptyState}>Nenhum formulário neste setor.</p>
          ) : (
            <div className={styles.list}>
              {forms.map((f) => (
                <div key={f.id} className={styles.itemCard}>
                  <div>
                    <h5 className={styles.itemName}>{f.title}</h5>
                    <p className={styles.itemInfo}>
                      {counts[f.id] ?? 0} resposta(s)
                      {f.createdAt?.seconds && (
                        <>
                          {' '}
                          • criado em{' '}
                          {new Date(f.createdAt.seconds * 1000).toLocaleDateString('pt-BR')}
                        </>
                      )}
                    </p>
                  </div>
                  <span className={styles.permissionTag}>ID: {f.id.slice(0, 6)}…</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Últimas respostas */}
        <div className={styles.frame}>
          <div className={styles.frameHeader}>
            <MessageSquare size={18} />
            <h4 className={styles.frameTitle} style={{ marginLeft: 8 }}>
              Últimas Respostas
            </h4>
          </div>

          {recent.length === 0 ? (
            <p className={styles.emptyState}>Nada por aqui ainda.</p>
          ) : (
            <div className={styles.list}>
              {recent.map((r) => {
                const when =
                  r.submittedAt?.seconds ?? r.createdAt?.seconds
                    ? new Date(
                        (r.submittedAt?.seconds ?? r.createdAt!.seconds) * 1000
                      ).toLocaleString('pt-BR')
                    : 'Sem data';
                return (
                  <div key={r.id} className={styles.itemCard}>
                    <div style={{ marginRight: 10 }}>
                      <FileText size={20} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <h5 className={styles.itemName}>{r.formTitle || r.formId}</h5>
                      <p className={styles.itemInfo}>
                        {r.collaboratorUsername ? `${r.collaboratorUsername} • ` : ''}
                        Respondido em {when}
                      </p>
                    </div>
                    <span className={styles.permissionTag}>resp: {r.id.slice(0, 6)}…</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className={styles.frame} style={{ marginTop: 16 }}>
          <p className={styles.itemInfo}>{error}</p>
        </div>
      )}
    </div>
  );
}
