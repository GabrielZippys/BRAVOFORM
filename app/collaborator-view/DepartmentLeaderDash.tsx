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

import styles from '../../app/styles/Users.module.css';          // já existia
import stores from '../../app/styles/Dashboard-lider.module.css';

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
  authorizedUsers?: string[];   // 👈 ADD
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


interface CollaboratorDoc {
  id: string;
  username: string; 
  isLeader?: boolean;
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


export default function DepartmentLeaderDash({ companyId, departmentId }: { companyId: string; departmentId: string; }) {
  const [forms, setForms] = useState<FormDoc[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [recent, setRecent] = useState<RespDoc[]>([]);
  const [allDeptResponses, setAllDeptResponses] = useState<RespDoc[]>([]);
  const [collaborators, setCollaborators] = useState<CollaboratorDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('30d');
  const [error, setError] = useState<string>('');

// limites de hoje
const todayStart = useMemo(() => {
  const d = new Date(); d.setHours(0,0,0,0); return d;
}, []);
const todayEnd = useMemo(() => {
  const d = new Date(); d.setHours(23,59,59,999); return d;
}, []);


const responsesToday = useMemo(() => {
  return allDeptResponses.filter(r => {
    const dt =
      (r.submittedAt instanceof Timestamp ? r.submittedAt.toDate() : null) ||
      (r.createdAt   instanceof Timestamp ? r.createdAt.toDate()   : null);
    return !!dt && dt >= todayStart && dt <= todayEnd;
  });
}, [allDeptResponses, todayStart, todayEnd]);

useEffect(() => {
  if (!departmentId) { setCollaborators([]); return; }

  const unsub = onSnapshot(
    collection(db, 'departments', departmentId, 'collaborators'),
    (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          username: data.username ?? data.name ?? '(sem nome)',
          isLeader: !!data.isLeader,
        } as CollaboratorDoc;
      });

      setCollaborators(list.filter((c) => !c.isLeader)); // só não-líderes
    }
  );

  return () => unsub();
}, [departmentId]);
  
 // 🔧 Carrega formulários do setor
  useEffect(() => {
    if (!companyId || !departmentId) {
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
        try {
          // ✅ mapeia AQUI (onde 'snap' existe)
          const list: FormDoc[] = snap.docs.map((d) => {
            const data = d.data() as any;
            const safeId =
              typeof data?.id === 'string' && data.id.trim() ? data.id.trim() : d.id;

            return {
              id: safeId,
              title: data.title ?? '',
              departmentId: data.departmentId ?? '',
              companyId: data.companyId ?? '',
              createdAt: data.createdAt instanceof Timestamp ? data.createdAt : undefined,
              authorizedUsers: Array.isArray(data.authorizedUsers) ? data.authorizedUsers : [], // 👈 necessário para storeStats
            };
          });

          setForms(list);

       // contagem de respostas por form
          const results: Record<string, number> = {};
          await Promise.all(
            list.map(async (f) => {
              if (!f.id?.trim()) {
                results[f.id || '(sem-id)'] = 0;
                return;
              }
              const respCol = collection(db, 'forms', f.id, 'responses');
              const countSnap = await getCountFromServer(respCol);
              results[f.id] = countSnap.data().count;
            })
          );
 setCounts(results);
        } catch (err) {
          console.error(err);
          setError('Erro ao carregar formulários.');
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        console.error(err);
        setError('Erro ao carregar formulários.');
        setLoading(false);
      }
    );

   return () => unsub();
  }, [companyId, departmentId]);

const storeStats = useMemo(() => {
  const respByCollab = new Map<string, number>();
  responsesToday.forEach((r) => {
    const id = r.collaboratorId || '';
    if (!id) return;
    respByCollab.set(id, (respByCollab.get(id) || 0) + 1);
  });

  return collaborators
    .map((c) => {
      const assigned  = forms.filter((f) => f.authorizedUsers?.includes(c.id)).length;
      const responded = respByCollab.get(c.id) || 0; // só HOJE
      const pending   = Math.max(assigned - responded, 0);
      const pct       = assigned > 0 ? Math.min((responded / assigned) * 100, 100) : 0;
      return { ...c, assigned, responded, pending, pct };
    })
    .sort((a, b) => (b.pending - a.pending) || a.username.localeCompare(b.username));
}, [collaborators, forms, responsesToday]);


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

      {/* LISTAS: Formulários + Últimas respostas */}
      <div
  style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
    gap: 16,
    width: '100%',
  }}
>
{/* Lojas do setor — Atribuídos x Respondidos (FULL WIDTH + GRID) */}
<div className={stores.panel}>
 <div className={stores.panel}>
  <div className={stores.header}>
    <MessageSquare size={18} />
    <h4 className={stores.title}>
      Lojas do Setor — Atribuídos x Respondidos
      <span className={stores.metaPeriod}>(hoje)</span>
    </h4>
  </div>
  {/* ...cards... */}
</div>


  {storeStats.length === 0 ? (
    <p className={stores.empty}>Nenhuma loja encontrada.</p>
  ) : (
    <div className={stores.grid}>
      {storeStats.map((s) => (
        <div key={s.id} className={stores.card}>
          <div className={stores.cardTop}>
            <h5 className={stores.storeName}>{s.username}</h5>
            <span className={stores.badge}>{Math.round(s.pct)}%</span>
          </div>

          <div className={stores.cardMeta}>
            <strong>{s.responded}</strong> de <strong>{s.assigned}</strong> respondidos
            {s.pending > 0 && <> • <strong>{s.pending}</strong> pendente(s)</>}
          </div>

          <div className={stores.bar} aria-label={`Progresso de ${s.username}`}>
            <div className={stores.fill} style={{ width: `${s.pct}%` }} />
          </div>
        </div>
      ))}
    </div>
  )}
</div>



      </div>

      {error && (
        <div className={styles.frame} style={{ marginTop: 16 }}>
          <p className={styles.itemInfo}>{error}</p>
        </div>
      )}

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

      
    </div>
  );
}
