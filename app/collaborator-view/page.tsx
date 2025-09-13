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
import { FileText, LogOut, History, User2, Edit, Eye, CheckCircle2, Clock } from 'lucide-react';
import CollaboratorHistoryModal from '@/components/CollaboratorView'; // Modal de histórico
import FormResponse from '@/components/FormResponse';                // Modal para responder formulário
import DepartmentLeaderDash from './DepartmentLeaderDash';           // Dash do líder

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
  const [submittedResponses, setSubmittedResponses] = useState<FormResponseType[]>([]);
  const [view, setView] = useState<'forms' | 'history' | 'leaderDash'>('forms');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [formSelecionado, setFormSelecionado] = useState<Form | null>(null);
  const [respostaSelecionada, setRespostaSelecionada] = useState<FormResponseType | null>(null);
  const [formToAnswer, setFormToAnswer] = useState<Form | null>(null);

  // ——— NOVOS ESTADOS (respostas de hoje)
  
  const [hasRespondedToday, setHasRespondedToday] = useState<Set<string>>(new Set());

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

        // id seguro: prioriza docSnap.id se o campo data.id for vazio/falsy
        const safeId =
          typeof data?.id === 'string' && data.id.trim()
            ? data.id.trim()
            : docSnap.id;

        return {
          ...data,                     // << pode ficar antes
          id: safeId,                  // << mas *garante* um id não-vazio
          fields: Array.isArray(data.fields) ? data.fields : [],
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt : undefined,
          companyId: data.companyId ?? '',
          departmentId: data.departmentId ?? '',
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

// Histórico (preenche submittedResponses quando a aba está ativa)
useEffect(() => {
  if (view !== 'history' || !collaborator?.id) return;

  setLoading(true);

  const q = query(
    collectionGroup(db, 'responses'),
    where('collaboratorId', '==', collaborator.id)
  );

  const unsub = onSnapshot(
    q,
    (snapshot) => {
      const items: FormResponseType[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data() as any;
        const createdAt =
          d?.submittedAt instanceof Timestamp
            ? d.submittedAt
            : d?.createdAt instanceof Timestamp
            ? d.createdAt
            : undefined;

        return {
          id: docSnap.id,
          formId: d.formId ?? '',
          formTitle: d.formTitle ?? '',
          answers: d.answers,
          createdAt,
          submittedAt: d.submittedAt,
        };
      });

      // ordena por data desc (opcional)
      items.sort(
        (a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0)
      );

      setSubmittedResponses(items);
      setLoading(false);
    },
    (err) => {
      console.error('history onSnapshot error:', err);
      setError('Falha ao carregar o histórico.');
      setLoading(false);
    }
  );

  return () => unsub();
}, [view, collaborator?.id]);


  // ——— OUVE TODAS AS RESPOSTAS E MARCA AS DE HOJE
  useEffect(() => {
    if (!collaborator?.id) return;

    const unsub = onSnapshot(
      query(collectionGroup(db, 'responses'), where('collaboratorId', '==', collaborator.id)),
      (snap) => {
        const start = new Date(); start.setHours(0, 0, 0, 0);
        const end   = new Date(); end.setHours(23, 59, 59, 999);

        const byForm: Record<string, Timestamp> = {};
        snap.forEach((docSnap) => {
          const d = docSnap.data() as any;
          const ts: Timestamp | undefined =
            d?.submittedAt instanceof Timestamp ? d.submittedAt :
            d?.createdAt   instanceof Timestamp ? d.createdAt   : undefined;
          if (!ts) return;
          const dt = ts.toDate();
          if (dt >= start && dt <= end) {
            const fid = d.formId as string;
            const prev = byForm[fid];
            if (!prev || prev.toMillis() < ts.toMillis()) byForm[fid] = ts;
          }
        });

        
        setHasRespondedToday(new Set(Object.keys(byForm)));
      }
    );

    return () => unsub();
  }, [collaborator?.id]);

  const handleLogout = () => {
    sessionStorage.removeItem('collaborator_data');
    router.push('/');
  };

  // MODAL HISTÓRICO
  const handleHistoryOpen = async (response: FormResponseType) => {
  try {
    if (!response?.formId || response.formId.trim() === '') {
      setError('Item de histórico sem referência de formulário.');
      return;
    }
    const ref = doc(db, 'forms', response.formId);
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
    setRespostaSelecionada(response);
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

  // ——— RESUMO (topo da grade)
  const totalForms = formsToFill.length;
  const doneToday  = formsToFill.filter(f => hasRespondedToday.has(f.id)).length;
  const pendingToday = totalForms - doneToday;

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
                  const answered = hasRespondedToday.has(form.id);
                  return (
                    <div key={form.id} className={styles.card}>
                      {/* badge no canto */}
                      <div
                        className={`${styles.statusBadge} ${answered ? styles.statusDone : styles.statusPending}`}
                        title={answered ? 'Respondido hoje' : 'Pendente hoje'}
                      >
                        {answered ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                        <span style={{ marginLeft: 6 }}>{answered ? 'Hoje' : 'Pendente'}</span>
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
  onClick={() => handleResponder(form.id)}   // << só o ID
  disabled={answered}
  title={answered ? 'Você já respondeu hoje' : 'Responder'}
>
  {answered ? 'Respondido' : 'Responder'}
</button>

                    </div>
                  );
                })}
              </div>
            </>
          )
        )}
        

        {/* HISTÓRICO */}
        {!loading && view === 'history' && (
          submittedResponses.length === 0 ? (
            <div className={styles.emptyState}>
              <History size={48} />
              <p>Nenhum histórico encontrado.</p>
            </div>
          ) : (
  <div className={styles.grid}>
              {submittedResponses.map((response) => (
                <div key={response.id} className={styles.card}>
                  <div className={styles.cardIcon}>
                    <History size={32} />
                  </div>
                  <div className={styles.cardBody}>
                    <h2 className={styles.cardTitle}>{response.formTitle}</h2>
                    {response.createdAt && (
                      <p className={styles.cardSubtitle}>
                        Respondido em{' '}
                        {response.createdAt.seconds
                          ? new Date(response.createdAt.seconds * 1000).toLocaleDateString('pt-BR')
                          : 'Sem data'}
                      </p>
                    )}
                  </div>
                  <button className={styles.cardButton} onClick={() => handleHistoryOpen(response)}>
                    {collaborator?.canEditHistory ? (
                      <>
                        <Edit size={16} style={{ marginRight: 5, verticalAlign: 'middle' }} /> Editar
                      </>
                    ) : (
                      <>
                        <Eye size={16} style={{ marginRight: 5, verticalAlign: 'middle' }} /> Visualizar
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )
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
