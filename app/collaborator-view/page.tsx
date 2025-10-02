// BRAVOFORM\app\collaborator-view\page.tsx

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '../../firebase/config';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  onSnapshot,
  collectionGroup,
  Timestamp,
} from 'firebase/firestore';
import styles from '../styles/CollaboratorView.module.css';
import { FileText, LogOut, User2, CheckCircle2, Clock } from 'lucide-react';
import CollaboratorHistoryModal from '@/components/CollaboratorHistoryModal'; // Modal de histórico
import FormResponse from '@/components/FormResponse';                // Modal para responder formulário
import DepartmentLeaderDash from './DepartmentLeaderDash';           // Dash do líder
import HistoryPanel, { type HistoryResp } from '@/components/HistoryPanel';

// TIPOS
interface Collaborator {
  id: string;
  username: string;
  email?: string;
  companyId: string;
  departmentId: string;
  canViewHistory?: boolean;
  canEditHistory?: boolean;
  isLeader?: boolean;
}

interface Form {
  id: string;
  title: string;
  description?: string;
  createdAt?: Timestamp;
  fields: any[];
  companyId: string;
  departmentId: string;
  automation?: any;
  ownerId?: string;
  collaborators?: string[];
  authorizedUsers?: string[];
  settings?: {
    dailyLimitEnabled?: boolean;
    dailyLimitCount?: number; // quantidade por dia
  };
}


interface FormResponseType {
  id: string;
  formId: string;
  formTitle: string;
  answers?: any;
  createdAt?: Timestamp;   // sempre Timestamp
  submittedAt?: Timestamp; // compatibilidade
}

export default function CollaboratorView() {
  const [collaborator, setCollaborator] = useState<Collaborator | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [departmentName, setDepartmentName] = useState('');
  const [formsToFill, setFormsToFill] = useState<Form[]>([]);
  const [view, setView] = useState<'forms' | 'history' | 'leaderDash'>('forms');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [formSelecionado, setFormSelecionado] = useState<Form | null>(null);
  const [respostaSelecionada, setRespostaSelecionada] = useState<FormResponseType | null>(null);
  const [formToAnswer, setFormToAnswer] = useState<Form | null>(null);


const [todayCountByForm, setTodayCountByForm] = useState<Record<string, number>>({});

  const router = useRouter();

  // Carrega colaborador
  useEffect(() => {
    const loadCollaborator = async () => {
      try {
        const storedData = sessionStorage.getItem('collaborator_data');
        if (!storedData) {
          router.push('/');
          return;
        }
        const parsed = JSON.parse(storedData) as Collaborator;
        const collRef = doc(db, 'departments', parsed.departmentId, 'collaborators', parsed.id);
        const snap = await getDoc(collRef);
        if (snap.exists()) setCollaborator({ ...parsed, ...(snap.data() as any) });
        else setCollaborator(parsed);
      } catch {
        router.push('/');
      }
    };
    loadCollaborator();
  }, [router]);

  // Nomes de empresa/departamento
useEffect(() => {
  if (!collaborator) return;
  const { companyId, departmentId } = collaborator;

  (async () => {
    try {
      // Empresa
      let cName = '';
      if (companyId) {
        const csnap = await getDoc(doc(db, 'companies', companyId));
        if (csnap.exists()) cName = (csnap.data() as any).name ?? '';
      }

      // Departamento: tenta subcoleção dentro da empresa e, se não existir, top-level
      let dName = '';
      if (companyId && departmentId) {
        let dsnap = await getDoc(doc(db, 'companies', companyId, 'departments', departmentId));
        if (!dsnap.exists()) {
          dsnap = await getDoc(doc(db, 'departments', departmentId));
        }
        if (dsnap.exists()) dName = (dsnap.data() as any).name ?? '';
      }

      setCompanyName(cName);
      setDepartmentName(dName);
    } catch (e) {
      console.error('Erro ao buscar nomes:', e);
      setCompanyName('');
      setDepartmentName('');
    }
  })();
}, [collaborator?.companyId, collaborator?.departmentId]);


  // Formulários autorizados
useEffect(() => {
  if (!collaborator?.id) return;
  setLoading(true);

  const qForms = query(
    collection(db, 'forms'),
    where('authorizedUsers', 'array-contains', collaborator.id)
  );

  const unsub = onSnapshot(
    qForms,
    (snapshot) => {
      const mapped = snapshot.docs.map((docSnap) => {
  const data = docSnap.data() as any;
  const safeId =
    typeof data?.id === 'string' && data.id.trim()
      ? data.id.trim()
      : docSnap.id;

  return {
    ...data,
    id: safeId,
    fields: Array.isArray(data.fields) ? data.fields : [],
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : undefined,
    companyId: data.companyId ?? '',
    departmentId: data.departmentId ?? '',
    settings: data.settings || {},               // 👈 ADICIONE ESTA LINHA
  } as Form;
});

      // opcional: filtra qualquer doc sem id (defensivo)
      setFormsToFill(mapped.filter(f => typeof f.id === 'string' && f.id.trim().length > 0));
      setLoading(false);
      
      
    },
    () => setLoading(false)
  );

  

  return () => unsub();
}, [collaborator?.id]);

  // ——— OUVE TODAS AS RESPOSTAS E MARCA AS DE HOJE
  useEffect(() => {
  if (!collaborator?.id) return;

  const unsub = onSnapshot(
    query(collectionGroup(db, 'responses'), where('collaboratorId', '==', collaborator.id)),
    (snap) => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end   = new Date(); end.setHours(23, 59, 59, 999);

      const counts: Record<string, number> = {};

      snap.forEach((docSnap) => {
        const d = docSnap.data() as any;
        const ts: Timestamp | undefined =
          d?.submittedAt instanceof Timestamp ? d.submittedAt :
          d?.createdAt   instanceof Timestamp ? d.createdAt   : undefined;
        if (!ts) return;

        const dt = ts.toDate();
        if (dt >= start && dt <= end) {
          const fid = String(d.formId || '');
          if (!fid) return;
          counts[fid] = (counts[fid] || 0) + 1;
        }
      });

      setTodayCountByForm(counts);
    }
  );

  return () => unsub();
}, [collaborator?.id]);


  const handleLogout = () => {
    sessionStorage.removeItem('collaborator_data');
    router.push('/');
  };

  // MODAL HISTÓRICO
  const handleHistoryOpen = async (resp: HistoryResp) => {
  try {
    if (!resp?.formId || !resp.formId.trim()) {
      setError('Item de histórico sem referência de formulário.');
      return;
    }
    const ref = doc(db, 'forms', resp.formId);
    const formSnap = await getDoc(ref);
    if (!formSnap.exists()) {
      setError('Formulário do histórico não encontrado.');
      return;
    }
    const data = formSnap.data() as any;

    setFormSelecionado({
      id: formSnap.id,
      ...data,
      fields: Array.isArray(data.fields) ? data.fields : [],
      companyId: data.companyId ?? '',
      departmentId: data.departmentId ?? '',
    });

    setRespostaSelecionada({
      id: resp.id,
      formId: resp.formId,
      formTitle: resp.formTitle ?? data?.title ?? '',
      answers: resp.answers,                 // pode vir undefined, e tudo bem
      createdAt: resp.createdAt,
      submittedAt: resp.submittedAt,
    });

    setModalOpen(true);
  } catch (e) {
    console.error(e);
    setError('Falha ao carregar o histórico.');
  }
};

  // MODAL DE RESPOSTA
// MODAL DE RESPOSTA
const handleResponder = async (formId: string) => {
  try {
    if (!formId || typeof formId !== 'string' || !formId.trim()) {
      console.error('handleResponder: formId inválido', formId);
      setError('Formulário inválido (sem ID).');
      return;
    }

    const ref = doc(db, 'forms', formId);
    // impede abrir se já estourou o limite
// impede abrir se já estourou o limite (somente quando o limite está ligado)
const meta = formsToFill.find(f => f.id === formId);
if (meta?.settings?.dailyLimitEnabled) {
  const used = todayCountByForm[formId] ?? 0;
  const limit = Math.max(1, Number(meta.settings.dailyLimitCount || 1));
  if (used >= limit) {
    setError('Você já atingiu o limite diário de respostas para este formulário.');
    return;
  }
}

    const snap = await getDoc(ref);
    if (!snap.exists()) {
      setError('Formulário não encontrado.');
      return;
    }

    const firestoreForm = snap.data() as any;
    setFormToAnswer({
      ...firestoreForm,
      id: snap.id,
      fields: Array.isArray(firestoreForm.fields) ? firestoreForm.fields : [],
      companyId: firestoreForm.companyId ?? '',
      departmentId: firestoreForm.departmentId ?? '',
    });
  } catch (e) {
    console.error(e);
    setError('Não foi possível abrir o formulário para resposta.');
  }
};


  const closeFormResponse = () => setFormToAnswer(null);

  const totalForms = formsToFill.length;
const pendingToday = formsToFill.filter((f) => {
  const on = !!f.settings?.dailyLimitEnabled;
  const limit = Math.max(1, Number(f.settings?.dailyLimitCount ?? 1));
  const used = todayCountByForm[f.id] ?? 0;
  // se não tem limite → pendente quando ainda não respondeu hoje
  return on ? used < limit : used === 0;
}).length;
const doneToday = totalForms - pendingToday;


  return (
    <main className={styles.main}>
      {/* HEADER */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.userInfoBox}>
            <span className={styles.userAvatar}><User2 size={28} /></span>
            <div>
              <div className={styles.userNameRow}>{collaborator?.username || <span>...</span>}</div>
              <div className={styles.userInfoLine}>
                <span className={styles.userInfoLabel}>Departamento:</span>{' '}
                <span>{departmentName || <span>...</span>}</span>
              </div>
              <div className={styles.userInfoLine}>
                <span className={styles.userInfoLabel}>Empresa:</span>{' '}
                <span>{companyName || <span>...</span>}</span>
              </div>
            </div>
            <button onClick={handleLogout} className={styles.logoutButton} title="Sair">
              <LogOut size={20} />
            </button>
          </div>
          <h1 className={styles.title}>Portal do Colaborador</h1>
        </div>
      </header>

      {/* CONTEÚDO */}
      <div className={styles.content}>
        <div className={styles.viewToggle}>
          <button
            className={`${styles.toggleButton} ${view === 'forms' ? styles.active : ''}`}
            onClick={() => setView('forms')}
          >
            Formulários
          </button>

          {collaborator?.canViewHistory && (
            <button
              className={`${styles.toggleButton} ${view === 'history' ? styles.active : ''}`}
              onClick={() => setView('history')}
            >
              Histórico
            </button>
          )}

          {collaborator?.isLeader && (
            <button
              className={`${styles.toggleButton} ${view === 'leaderDash' ? styles.active : ''}`}
              onClick={() => setView('leaderDash')}
            >
              Dash do Líder
            </button>
          )}
        </div>

        {loading && <p className={styles.loadingText}>Carregando dados...</p>}
        {error && <p className={styles.errorText}>{error}</p>}

        {/* FORMULÁRIOS */}
        {!loading && view === 'forms' && (
          formsToFill.length === 0 ? (
            <div className={styles.emptyState}>
              <FileText size={48} />
              <p>Nenhuma diretiva encontrada para você.</p>
            </div>
          ) : (
            <>
              {/* Resumo do dia */}
              <div className={styles.todaySummary}>
                <span className={styles.badgeDone}>
                  <CheckCircle2 size={16} style={{ marginRight: 6 }} />
                  {doneToday} respondido{doneToday !== 1 ? 's' : ''} hoje
                </span>
                <span className={styles.badgePending}>
                  <Clock size={16} style={{ marginRight: 6 }} />
                  {pendingToday} pendente{pendingToday !== 1 ? 's' : ''}
                </span>
              </div>

              <div className={styles.grid}>
                {formsToFill.map((form) => {
                  const used = todayCountByForm[form.id] ?? 0;
const limitOn = !!form.settings?.dailyLimitEnabled;
const limit = Math.max(1, Number(form.settings?.dailyLimitCount ?? 1));

// Agora: só "reached" quando LIMITE está ligado e já bateu o limite
const reached = limitOn ? used >= limit : false;
// Para o selo "Hoje"
const respondedToday = used > 0;
                  
                  return (
                    <div key={form.id} className={styles.card}>
                      {/* badge no canto */}
                      <div className={`${styles.statusBadge} ${respondedToday ? styles.statusDone : styles.statusPending}`}
  title={
    limitOn
      ? (reached
          ? `Limite diário atingido (${used}/${limit})`
          : `Respostas hoje: ${used}/${limit}`)
      : (respondedToday ? 'Respondido hoje' : 'Pendente hoje')
  }
>
  {respondedToday ? <CheckCircle2 size={14} /> : <Clock size={14} />}
  <span style={{ marginLeft: 6 }}>
    {limitOn ? `${used}/${limit}` : (respondedToday ? 'Hoje' : 'Pendente')}
  </span>
</div>
                      <div className={styles.cardIcon}>
                        <FileText size={32} />
                      </div>
                      <div className={styles.cardBody}>
                        <h2 className={styles.cardTitle}>{form.title}</h2>
                        {form.description && <p className={styles.cardSubtitle}>{form.description}</p>}
                        {form.createdAt && (
                          <p className={styles.cardSubtitle}>
                            Criado em{' '}
                            {form.createdAt.seconds
                              ? new Date(form.createdAt.seconds * 1000).toLocaleDateString()
                              : ''}
                          </p>
                        )}
                      </div>
                      <button
  className={styles.cardButton}
  onClick={() => handleResponder(form.id)}
  disabled={reached}  // só desabilita quando limite ligado e atingido
  title={
    reached
      ? 'Limite diário atingido'
      : 'Responder'
  }
>
  {reached ? 'Limite atingido' : 'Responder'}
</button>
                    </div>
                  );
                })}
              </div>
            </>
          )
        )}
        
{view === 'history' && collaborator?.canViewHistory && (
  <HistoryPanel
    collaboratorId={collaborator.id}
    canEdit={!!collaborator?.canEditHistory}
    onOpen={handleHistoryOpen} // abre o modal que você já tem
  />
)}
        
        
        {/* DASH DO LÍDER */}
        {!loading && view === 'leaderDash' && collaborator?.isLeader && collaborator?.companyId && collaborator?.departmentId && (
          <DepartmentLeaderDash
            companyId={collaborator.companyId}
            departmentId={collaborator.departmentId}
          />
        )}
      </div>

      {/* MODAL DE HISTÓRICO */}
      {modalOpen && formSelecionado && respostaSelecionada && (
        <CollaboratorHistoryModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          form={formSelecionado}
          response={respostaSelecionada}
          canEdit={!!collaborator?.canEditHistory}
        />
      )}

      {/* MODAL DE FORMULÁRIO DE RESPOSTA */}
      {formToAnswer && (
        <FormResponse
          form={formToAnswer}
          collaborator={collaborator!}
          onClose={closeFormResponse}
          canEdit={true}
        />
      )}
    </main>
  );
}
