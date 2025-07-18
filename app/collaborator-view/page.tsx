'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '../../firebase/config';
import { doc, getDoc, collection, query, where, onSnapshot, collectionGroup, Timestamp, serverTimestamp } from 'firebase/firestore';
import styles from '../styles/CollaboratorView.module.css';
import { FileText, LogOut, History, User2, Edit, Eye } from 'lucide-react';
import CollaboratorHistoryModal from '@/components/CollaboratorView'; // Modal de histórico
import FormResponse from '@/components/FormResponse'; // Modal para responder formulário

// TIPOS principais
interface Collaborator {
  id: string;
  username: string;
  email?: string;
  companyId: string;
  departmentId: string;
  canViewHistory?: boolean;
  canEditHistory?: boolean;
}
interface Form {
  id: string;
  title: string;
  description?: string;
  createdAt?: Timestamp;
  fields: any[]; // Para exibir as perguntas
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
  createdAt?: Timestamp; // Correto! Timestamp
  submittedAt?: Timestamp; // para garantir compatibilidade
}

export default function CollaboratorView() {
  const [collaborator, setCollaborator] = useState<Collaborator | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [departmentName, setDepartmentName] = useState('');
  const [formsToFill, setFormsToFill] = useState<Form[]>([]);
  const [submittedResponses, setSubmittedResponses] = useState<FormResponseType[]>([]);
  const [view, setView] = useState<'forms' | 'history'>('forms');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [formSelecionado, setFormSelecionado] = useState<Form | null>(null);
  const [respostaSelecionada, setRespostaSelecionada] = useState<FormResponseType | null>(null);
  const [formToAnswer, setFormToAnswer] = useState<Form | null>(null);

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
        const collRef = doc(db, `departments/${parsed.departmentId}/collaborators`, parsed.id);
        const snap = await getDoc(collRef);
        if (snap.exists()) setCollaborator({ ...parsed, ...snap.data() });
        else setCollaborator(parsed);
      } catch {
        router.push('/');
      }
    };
    loadCollaborator();
  }, [router]);

  // Nomes empresa/depto
  useEffect(() => {
    if (collaborator?.companyId) {
      getDoc(doc(db, 'companies', collaborator.companyId)).then(snap => {
        setCompanyName(snap.exists() ? snap.data().name : '');
      });
    }
    if (collaborator?.companyId && collaborator?.departmentId) {
      getDoc(doc(db, `companies/${collaborator.companyId}/departments`, collaborator.departmentId)).then(snap => {
        setDepartmentName(snap.exists() ? snap.data().name : '');
      });
    }
  }, [collaborator?.companyId, collaborator?.departmentId]);

  // Formulários
  useEffect(() => {
    if (!collaborator?.id) return;
    setLoading(true);
    const q = query(
      collection(db, "forms"),
      where("authorizedUsers", "array-contains", collaborator.id)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      setFormsToFill(
        snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            fields: Array.isArray(data.fields) ? data.fields : [],
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt : undefined,
            companyId: data.companyId ?? "",
            departmentId: data.departmentId ?? "",
          } as Form;
        })
      );
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [collaborator?.id]);

  // Histórico
  useEffect(() => {
    if (view === 'history' && collaborator?.id) {
      setLoading(true);
      const q = query(collectionGroup(db, "responses"), where("collaboratorId", "==", collaborator.id));
      const unsub = onSnapshot(q, (snapshot) => {
        setSubmittedResponses(
          snapshot.docs.map(doc => {
            const d = doc.data();
            return {
              id: doc.id,
              ...d,
              // usa o campo submittedAt ou createdAt, sempre como Timestamp!
              createdAt: (d.submittedAt instanceof Timestamp) ? d.submittedAt
                : (d.createdAt instanceof Timestamp) ? d.createdAt
                : undefined,
            } as FormResponseType;
          })
        );
        setLoading(false);
      }, () => setLoading(false));
      return () => unsub();
    }
  }, [view, collaborator?.id]);

  const handleLogout = () => {
    sessionStorage.removeItem('collaborator_data');
    router.push('/');
  };

  // MODAL HISTÓRICO
  const handleHistoryOpen = async (response: FormResponseType) => {
    const formSnap = await getDoc(doc(db, 'forms', response.formId));
    const form = formSnap.exists()
      ? {
        id: formSnap.id,
        ...(formSnap.data() as any),
        fields: Array.isArray((formSnap.data() as any).fields) ? (formSnap.data() as any).fields : [],
        companyId: (formSnap.data() as any).companyId ?? "",
        departmentId: (formSnap.data() as any).departmentId ?? "",
      }
      : null;
    setFormSelecionado(form);
    setRespostaSelecionada(response);
    setModalOpen(true);
  };

  // MODAL DE RESPOSTA
  const handleResponder = async (form: Form) => {
    const snap = await getDoc(doc(db, 'forms', form.id));
    if (snap.exists()) {
      const firestoreForm = snap.data() as any;
      setFormToAnswer({
        ...firestoreForm,
        id: form.id,
        fields: Array.isArray(firestoreForm.fields) ? firestoreForm.fields : [],
        companyId: firestoreForm.companyId ?? "",
        departmentId: firestoreForm.departmentId ?? "",
      });
    }
  };
  const closeFormResponse = () => setFormToAnswer(null);

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
          <button className={`${styles.toggleButton} ${view === 'forms' ? styles.active : ''}`} onClick={() => setView('forms')}>
            Formulários
          </button>
          {collaborator?.canViewHistory && (
            <button className={`${styles.toggleButton} ${view === 'history' ? styles.active : ''}`} onClick={() => setView('history')}>
              Histórico
            </button>
          )}
        </div>
        {loading && <p className={styles.loadingText}>Carregando dados...</p>}
        {error && <p className={styles.errorText}>{error}</p>}

        {/* FORMULÁRIOS */}
        {!loading && view === 'forms' && (
          formsToFill.length === 0 ?
            <div className={styles.emptyState}><FileText size={48} /><p>Nenhuma diretiva encontrada para você.</p></div>
            :
            <div className={styles.grid}>
              {formsToFill.map(form => (
                <div key={form.id} className={styles.card}>
                  <div className={styles.cardIcon}><FileText size={32} /></div>
                  <div className={styles.cardBody}>
                    <h2 className={styles.cardTitle}>{form.title}</h2>
                    {form.description && <p className={styles.cardSubtitle}>{form.description}</p>}
                    {form.createdAt &&
                      <p className={styles.cardSubtitle}>
                        Criado em {form.createdAt.seconds ? new Date(form.createdAt.seconds * 1000).toLocaleDateString() : ''}
                      </p>
                    }
                  </div>
                  <button className={styles.cardButton} onClick={() => handleResponder(form)}>
                    Responder
                  </button>
                </div>
              ))}
            </div>
        )}

        {/* HISTÓRICO */}
        {!loading && view === 'history' && (
          submittedResponses.length === 0 ?
            <div className={styles.emptyState}><History size={48} /><p>Nenhum histórico encontrado.</p></div>
            :
            <div className={styles.grid}>
              {submittedResponses.map(response => (
                <div key={response.id} className={styles.card}>
                  <div className={styles.cardIcon}><History size={32} /></div>
                  <div className={styles.cardBody}>
                    <h2 className={styles.cardTitle}>{response.formTitle}</h2>
                    {response.createdAt &&
                      <p className={styles.cardSubtitle}>
                        Respondido em {response.createdAt.seconds ? new Date(response.createdAt.seconds * 1000).toLocaleDateString('pt-BR') : 'Sem data'}
                      </p>
                    }
                  </div>
                  <button className={styles.cardButton} onClick={() => handleHistoryOpen(response)}>
                    {collaborator?.canEditHistory
                      ? <><Edit size={16} style={{ marginRight: 5, verticalAlign: 'middle' }} /> Editar</>
                      : <><Eye size={16} style={{ marginRight: 5, verticalAlign: 'middle' }} /> Visualizar</>
                    }
                  </button>
                </div>
              ))}
            </div>
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
