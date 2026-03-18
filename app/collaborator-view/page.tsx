// BRAVOFORM\app\collaborator-view\page.tsx

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '../../firebase/config';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  onSnapshot,
  collectionGroup,
  Timestamp,
} from 'firebase/firestore';
import styles from '../styles/CollaboratorView.module.css';
import { FileText, LogOut, User2, CheckCircle2, Clock, Trash2 } from 'lucide-react';
import CollaboratorHistoryModal from '@/components/CollaboratorHistoryModal'; // Modal de histórico
import FormResponse from '@/components/FormResponse';                // Modal para responder formulário
import DepartmentLeaderDash from './DepartmentLeaderDashSimple';     // Dash do líder (simplified)
import HistoryPanel, { type HistoryResp } from '@/components/HistoryPanel';
import TrashPanel, { type TrashResp } from '@/components/TrashPanel';
import WorkflowExecutionModal from '@/components/WorkflowExecutionModal';

// TIPOS
interface Collaborator {
  id: string;
  username: string;
  email?: string;
  department?: string; // Nova estrutura: nome do departamento em vez de ID
  role?: string;
  permissions?: {
    canViewHistory?: boolean;
    canEditHistory?: boolean;
    canDeleteForms?: boolean;
    canManageUsers?: boolean;
    canDeleteResponses?: boolean;
  };
  active?: boolean;
  isTemporaryPassword?: boolean;
  lastLogin?: any;
  createdAt?: any;
  updatedAt?: any;
}

interface Form {
  id: string;
  title: string;
  description?: string;
  createdAt: Timestamp | null;
  fields: any[];
  companyId: string;
  departmentId: string;
  automation?: any;
  ownerId?: string;
  theme: {
    bgColor: string;
    bgImage?: string;
    accentColor: string;
    fontColor: string;
    inputBgColor?: string;
    inputFontColor?: string;
    sectionHeaderBg?: string;
    sectionHeaderFont?: string;
    buttonBg?: string;
    buttonFont?: string;
    footerBg?: string;
    footerFont?: string;
    borderRadius: number;
    spacing: 'compact' | 'normal' | 'spacious';
    tableHeaderBg?: string;
    tableHeaderFont?: string;
    tableBorderColor?: string;
    tableOddRowBg?: string;
    tableEvenRowBg?: string;
    tableCellFont?: string;
    titleColor?: string;
    descriptionColor?: string;
  };
  settings: {
    dailyLimitEnabled?: boolean;
    dailyLimitCount?: number; // quantidade por dia
    allowSave: boolean;
    showProgress: boolean;
    confirmBeforeSubmit: boolean;
  };
  collaborators: string[];
  authorizedUsers: string[];
}


interface FormResponseType {
  id: string;
  path?: string; // Caminho completo do documento no Firestore
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
  const [workflowTasks, setWorkflowTasks] = useState<any[]>([]);
  const [selectedWorkflowTask, setSelectedWorkflowTask] = useState<any | null>(null);
  const [view, setView] = useState<'forms' | 'history' | 'leaderDash' | 'trash'>('forms');
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
        
        console.log('👤 Dados do colaborador do sessionStorage:', parsed);
        console.log('Permissões:', parsed.permissions);
        console.log('canViewHistory:', parsed.permissions?.canViewHistory);
        console.log('canEditHistory:', parsed.permissions?.canEditHistory);
        console.log('canManageUsers:', parsed.permissions?.canManageUsers);
        
        // Buscar na nova estrutura: coleção raiz 'collaborators'
        const collRef = doc(db, 'collaborators', parsed.id);
        const snap = await getDoc(collRef);
        
        if (snap.exists()) {
          const firestoreData = snap.data();
          const mergedData = { ...parsed, ...firestoreData };
          setCollaborator(mergedData);
          console.log('✅ Colaborador carregado da coleção raiz:', mergedData);
          console.log('Permissões finais:', mergedData.permissions);
          console.log('FINAL - canViewHistory:', mergedData.permissions?.canViewHistory);
          console.log('FINAL - canEditHistory:', mergedData.permissions?.canEditHistory);
          console.log('FINAL - canManageUsers:', mergedData.permissions?.canManageUsers);
        } else {
          console.log('Colaborador não encontrado na coleção raiz, usando dados do sessionStorage');
          setCollaborator(parsed);
        }
      } catch (error) {
        console.error('Error loading collaborator:', error);
        router.push('/');
      }
    };
    loadCollaborator();
  }, [router]);

  // Nomes de empresa/departamento
  useEffect(() => {
    if (!collaborator) return;
    
    // Na nova estrutura, temos apenas 'department' com o nome do departamento
    const { department } = collaborator;
    
    setCompanyName('BRAVOFORM'); // Nome fixo da empresa
    setDepartmentName(department || ''); // Usar o nome do departamento diretamente
    
    console.log('Collaborator department:', department);
  }, [collaborator?.department]);


  // Formulários autorizados
useEffect(() => {
  if (!collaborator?.id) return;
  setLoading(true);

  console.log('🔍 Buscando formulários para colaborador ID:', collaborator.id);
  console.log('📋 Colaborador completo:', collaborator);

  const qForms = query(
    collection(db, 'forms'),
    where('authorizedUsers', 'array-contains', collaborator.id)
  );

  const unsub = onSnapshot(
    qForms,
    (snapshot) => {
      console.log('📊 Formulários encontrados para este colaborador:', snapshot.docs.length);
      snapshot.docs.forEach((doc) => {
        console.log('  - Formulário:', doc.data().title, '| ID:', doc.id);
      });
      
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
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : null,
    companyId: data.companyId ?? '',
    departmentId: data.departmentId ?? '',
    collaborators: Array.isArray(data.collaborators) ? data.collaborators : [],
    authorizedUsers: Array.isArray(data.authorizedUsers) ? data.authorizedUsers : [],
    theme: data.theme || {
      bgColor: '#ffffff',
      accentColor: '#3b82f6',
      fontColor: '#000000',
      borderRadius: 8,
      spacing: 'normal' as const,
    },
    settings: {
      allowSave: data.settings?.allowSave ?? false,
      showProgress: data.settings?.showProgress ?? false,
      confirmBeforeSubmit: data.settings?.confirmBeforeSubmit ?? false,
      dailyLimitEnabled: data.settings?.dailyLimitEnabled,
      dailyLimitCount: data.settings?.dailyLimitCount,
    },
  } as Form;
});

      // Filtra formulários sem id, pausados e arquivados
      setFormsToFill(mapped.filter(f => {
        const hasValidId = typeof f.id === 'string' && f.id.trim().length > 0;
        const isPaused = (f as any).paused || false;
        const isArchived = (f as any).archived || false;
        return hasValidId && !isPaused && !isArchived; // Não mostra formulários pausados ou arquivados
      }));
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

  // Buscar workflow_instances atribuídas ao colaborador atual
  // Cada colaborador só vê workflows onde ele é o assignedTo da etapa atual
  useEffect(() => {
    if (!collaborator?.id) {
      return;
    }

    // Query: busca workflows onde o colaborador atual é o responsável pela etapa atual
    const qWorkflows = query(
      collection(db, 'workflow_instances'),
      where('assignedTo', '==', collaborator.id),
      where('status', '==', 'in_progress')
    );

    const unsub = onSnapshot(qWorkflows, (snapshot) => {
      const tasks = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setWorkflowTasks(tasks);
    });

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
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt : null,
      companyId: data.companyId ?? '',
      departmentId: data.departmentId ?? '',
      collaborators: Array.isArray(data.collaborators) ? data.collaborators : [],
      authorizedUsers: Array.isArray(data.authorizedUsers) ? data.authorizedUsers : [],
      theme: data.theme || {
        bgColor: '#ffffff',
        accentColor: '#3b82f6',
        fontColor: '#000000',
        borderRadius: 8,
        spacing: 'normal' as const,
      },
      settings: {
        allowSave: data.settings?.allowSave ?? false,
        showProgress: data.settings?.showProgress ?? false,
        confirmBeforeSubmit: data.settings?.confirmBeforeSubmit ?? false,
        dailyLimitEnabled: data.settings?.dailyLimitEnabled,
        dailyLimitCount: data.settings?.dailyLimitCount,
      },
    });

    setRespostaSelecionada({
      id: resp.id,
      path: resp.path, // Passa o caminho completo do documento
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
      createdAt: firestoreForm.createdAt instanceof Timestamp ? firestoreForm.createdAt : null,
      companyId: firestoreForm.companyId ?? '',
      departmentId: firestoreForm.departmentId ?? '',
      collaborators: Array.isArray(firestoreForm.collaborators) ? firestoreForm.collaborators : [],
      authorizedUsers: Array.isArray(firestoreForm.authorizedUsers) ? firestoreForm.authorizedUsers : [],
      theme: firestoreForm.theme || {
        bgColor: '#ffffff',
        accentColor: '#3b82f6',
        fontColor: '#000000',
        borderRadius: 8,
        spacing: 'normal' as const,
      },
      settings: {
        allowSave: firestoreForm.settings?.allowSave ?? false,
        showProgress: firestoreForm.settings?.showProgress ?? false,
        confirmBeforeSubmit: firestoreForm.settings?.confirmBeforeSubmit ?? false,
        dailyLimitEnabled: firestoreForm.settings?.dailyLimitEnabled,
        dailyLimitCount: firestoreForm.settings?.dailyLimitCount,
      },
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

          {collaborator?.permissions?.canViewHistory && (
            <button
              className={`${styles.toggleButton} ${view === 'history' ? styles.active : ''}`}
              onClick={() => setView('history')}
            >
              Histórico
            </button>
          )}

          {collaborator?.permissions?.canManageUsers && (
            <button
              className={`${styles.toggleButton} ${view === 'leaderDash' ? styles.active : ''}`}
              onClick={() => setView('leaderDash')}
            >
              Dash do Líder
            </button>
          )}

          {collaborator?.permissions?.canDeleteResponses && (
            <button
              className={`${styles.toggleButton} ${view === 'trash' ? styles.active : ''}`}
              onClick={() => setView('trash')}
            >
              <Trash2 size={16} style={{ marginRight: 6 }} />
              Lixeira
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
                {/* Cards de Workflow */}
                {workflowTasks.map((task) => {
                  // Buscar nome da etapa no histórico (última entrada)
                  const lastHistory = task.stageHistory?.[task.stageHistory.length - 1];
                  const stageName = lastHistory?.stageName || `Etapa ${(task.currentStageIndex || 0) + 1}`;
                  const workflowName = task.workflowName || 'Workflow';
                  
                  return (
                    <div key={task.id} className={styles.card} style={{ borderLeft: '4px solid #8b5cf6' }}>
                      <div className={`${styles.statusBadge} ${styles.statusPending}`}
                        style={{ background: '#8b5cf6' }}
                        title="Workflow pendente"
                      >
                        <Clock size={14} />
                        <span style={{ marginLeft: 6 }}>Workflow</span>
                      </div>
                      <div className={styles.cardIcon} style={{ color: '#8b5cf6' }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                          <polyline points="7.5 4.21 12 6.81 16.5 4.21"></polyline>
                          <polyline points="7.5 19.79 7.5 14.6 3 12"></polyline>
                          <polyline points="21 12 16.5 14.6 16.5 19.79"></polyline>
                          <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                          <line x1="12" y1="22.08" x2="12" y2="12"></line>
                        </svg>
                      </div>
                      <div className={styles.cardBody}>
                        <h2 className={styles.cardTitle}>{workflowName}</h2>
                        <p className={styles.cardSubtitle}>Etapa: {stageName}</p>
                        <p className={styles.cardSubtitle} style={{ marginTop: 4, fontSize: '12px', opacity: 0.8 }}>
                          Atribuído a: {task.assignedToName || 'Você'}
                        </p>
                      </div>
                      <button
                        className={styles.cardButton}
                        style={{ background: '#8b5cf6' }}
                        onClick={() => {
                          setSelectedWorkflowTask(task);
                        }}
                      >
                        Executar Etapa
                      </button>
                    </div>
                  );
                })}

                {/* Cards de Formulários */}
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
                        disabled={reached}
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
        
{view === 'history' && collaborator?.permissions?.canViewHistory && (
  <HistoryPanel
    collaboratorId={collaborator.id}
    canEdit={!!collaborator?.permissions?.canEditHistory}
    canDelete={!!collaborator?.permissions?.canDeleteResponses}
    onOpen={handleHistoryOpen}
  />
)}

{view === 'trash' && collaborator?.permissions?.canDeleteResponses && (
  <TrashPanel
    collaboratorId={collaborator.id}
    onOpen={(resp: TrashResp) => {
      handleHistoryOpen(resp as any);
    }}
  />
)}
        
        {/* DASH DO LÍDER */}
        {!loading && view === 'leaderDash' && collaborator?.permissions?.canManageUsers && (
          <DepartmentLeaderDash
            collaboratorId={collaborator.id}
            department={collaborator.department || ''}
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
          canEdit={!!collaborator?.permissions?.canEditHistory}
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

      {/* MODAL DE EXECUÇÃO DE WORKFLOW */}
      {selectedWorkflowTask && collaborator && (
        <WorkflowExecutionModal
          instanceId={selectedWorkflowTask.id}
          userId={collaborator.id}
          userName={collaborator.username}
          onClose={() => setSelectedWorkflowTask(null)}
          onComplete={() => {
            setSelectedWorkflowTask(null);
            // Recarregar workflows para atualizar status
            window.location.reload();
          }}
        />
      )}
    </main>
  );
}
