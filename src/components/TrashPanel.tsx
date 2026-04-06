// components/TrashPanel.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../../firebase/config';
import {
  collectionGroup,
  doc as fsDoc,
  getDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  Timestamp,
  updateDoc,
  deleteDoc
} from 'firebase/firestore';

import styles from '../../app/styles/CollaboratorView.module.css';
import ConfirmModal from './ConfirmModal';

type FireTs = Timestamp | undefined;

export interface TrashResp {
  id: string;
  path?: string;
  formId: string;
  formTitle?: string;
  collaboratorId?: string;
  collaboratorUsername?: string;
  answers?: Record<string, any>;
  createdAt?: FireTs;
  submittedAt?: FireTs;
  deletedAt?: FireTs;
  deletedBy?: string;
  deletedByUsername?: string;
}

type FormSchema = {
  id: string;
  title: string;
  fields: any[];
};

function toJSDate(ts?: FireTs): Date | undefined {
  if (!ts) return undefined;
  try {
    // @ts-ignore
    if (typeof ts.toDate === 'function') return ts.toDate();
  } catch {}
  // @ts-ignore
  if (typeof ts?.seconds === 'number') return new Date(ts.seconds * 1000);
  return undefined;
}

function formatPTDate(d?: Date): string {
  if (!d) return '-';
  try { return d.toLocaleDateString('pt-BR'); } catch { return '-'; }
}

function formatPTTime(d?: Date): string {
  if (!d) return '';
  try { return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}

function getDaysRemaining(deletedAt?: Date): number {
  if (!deletedAt) return 0;
  
  // Normalizar datas para meia-noite (00:00:00) para cálculo preciso
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  const deleteDate = new Date(deletedAt);
  deleteDate.setHours(0, 0, 0, 0);
  deleteDate.setDate(deleteDate.getDate() + 30); // 30 dias após exclusão
  
  const diffTime = deleteDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

type Props = {
  collaboratorId?: string;
  onOpen?: (resp: TrashResp) => void;
  isAdmin?: boolean;
};

export default function TrashPanel({ collaboratorId, onOpen = () => {}, isAdmin = false }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [responses, setResponses] = useState<TrashResp[]>([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  
  // Modal de confirmação
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [responseToRestore, setResponseToRestore] = useState<TrashResp | null>(null);

  const [schemas, setSchemas] = useState<Record<string, FormSchema>>({});
  const fetchingForms = useRef<Set<string>>(new Set());

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterFormId, setFilterFormId] = useState('');
  const [filterUserId, setFilterUserId] = useState('');

  // Abre modal de confirmação de restauração
  const openRestoreConfirmation = (response: TrashResp) => {
    if (!response.path) {
      alert('Erro: caminho da resposta não encontrado.');
      return;
    }
    setResponseToRestore(response);
    setConfirmModalOpen(true);
  };

  // Função para restaurar resposta
  const handleRestoreResponse = async () => {
    if (!responseToRestore) return;

    setConfirmModalOpen(false);
    setRestoringId(responseToRestore.id);

    try {
      // Firestore (hybrid)
      const responseRef = fsDoc(db, responseToRestore.path!);
      await updateDoc(responseRef, {
        deletedAt: null,
        deletedBy: null,
        deletedByUsername: null,
      });

      // SQL
      await fetch('/api/dataconnect/responses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: responseToRestore.id, restore: true }),
      });

      console.log('✅ Resposta restaurada:', responseToRestore.id);
    } catch (error) {
      console.error('❌ Erro ao restaurar resposta:', error);
      alert('Erro ao restaurar resposta. Tente novamente.');
    } finally {
      setRestoringId(null);
      setResponseToRestore(null);
    }
  };

  // Carrega respostas deletadas
  useEffect(() => {
    if (!collaboratorId && !isAdmin) {
      setResponses([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    
    const qRef = isAdmin
      ? collectionGroup(db, 'responses')
      : query(
          collectionGroup(db, 'responses'),
          where('collaboratorId', '==', collaboratorId)
        );

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const items: TrashResp[] = snap.docs
          .filter(d => d.data().deletedAt != null) // Filtrar apenas deletados
          .map((d) => {
          const x = d.data() as any;
          const createdAt: FireTs =
            x?.submittedAt instanceof Timestamp ? x.submittedAt :
            x?.createdAt instanceof Timestamp ? x.createdAt : undefined;

          return {
            id: d.id,
            path: d.ref.path,
            formId: x?.formId ?? '',
            formTitle: x?.formTitle ?? '',
            collaboratorId: x?.collaboratorId ?? '',
            collaboratorUsername: x?.collaboratorUsername ?? '',
            answers: x?.answers,
            createdAt,
            submittedAt: x?.submittedAt,
            deletedAt: x?.deletedAt,
            deletedBy: x?.deletedBy,
            deletedByUsername: x?.deletedByUsername
          };
        });

        items.sort((a, b) => (b.deletedAt?.toMillis() ?? 0) - (a.deletedAt?.toMillis() ?? 0));
        setResponses(items);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setError('Falha ao carregar a lixeira.');
        setResponses([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [collaboratorId, isAdmin]);

  // Busca schema dos forms
  useEffect(() => {
    const uniqueFormIds = Array.from(new Set(responses.map(r => r.formId).filter(Boolean)));
    uniqueFormIds.forEach(async (fid) => {
      if (!fid || schemas[fid] || fetchingForms.current.has(fid)) return;
      fetchingForms.current.add(fid);
      try {
        const snap = await getDoc(fsDoc(db, 'forms', fid));
        if (snap.exists()) {
          const data = snap.data() as any;
          setSchemas(prev => ({
            ...prev,
            [fid]: {
              id: snap.id,
              title: data?.title ?? '',
              fields: Array.isArray(data?.fields) ? data.fields : []
            }
          }));
        }
      } finally {
        fetchingForms.current.delete(fid);
      }
    });
  }, [responses, schemas]);

  // Lista única de formulários
  const uniqueForms = useMemo(() => {
    const formsMap = new Map<string, string>();
    responses.forEach(r => {
      if (!formsMap.has(r.formId)) {
        const schema = schemas[r.formId];
        const title = r.formTitle || schema?.title || r.formId;
        formsMap.set(r.formId, title);
      }
    });
    return Array.from(formsMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [responses, schemas]);

  // Lista única de usuários que excluíram
  const uniqueUsers = useMemo(() => {
    const usersMap = new Map<string, string>();
    responses.forEach(r => {
      if (r.deletedByUsername && !usersMap.has(r.deletedByUsername)) {
        usersMap.set(r.deletedByUsername, r.deletedByUsername);
      }
    });
    return Array.from(usersMap.keys()).sort((a, b) => a.localeCompare(b));
  }, [responses]);

  const filtered = useMemo(() => {
    return responses.filter((r) => {
      // Filtro por data de exclusão
      const deletedDate = toJSDate(r.deletedAt);
      if (startDate && deletedDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        if (deletedDate < start) return false;
      }
      if (endDate && deletedDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (deletedDate > end) return false;
      }

      // Filtro por formulário (ID exato)
      if (filterFormId && r.formId !== filterFormId) {
        return false;
      }

      // Filtro por usuário que excluiu
      if (filterUserId && isAdmin) {
        if (r.deletedByUsername !== filterUserId) return false;
      }

      return true;
    });
  }, [responses, startDate, endDate, filterFormId, filterUserId, isAdmin]);

  if (loading) return <p className={styles.emptyState}>Carregando lixeira…</p>;
  if (error) return <p className={styles.errorText}>{error}</p>;

  return (
    <div className={styles.historyContainer}>
      <div className={styles.historyFiltersBar}>
        <div className={styles.historyFilterGroup}>
          <label htmlFor="startDate">Data inicial</label>
          <input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div className={styles.historyFilterGroup}>
          <label htmlFor="endDate">Data final</label>
          <input
            id="endDate"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <div className={styles.historyFilterGroup}>
          <label htmlFor="filterForm">Formulário</label>
          <select
            id="filterForm"
            value={filterFormId}
            onChange={(e) => setFilterFormId(e.target.value)}
            style={{
              padding: '0.5rem',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              fontSize: '0.9rem',
              cursor: 'pointer',
              background: '#fff',
              color: '#1e293b',
              width: '100%'
            }}
          >
            <option value="">Todos os formulários</option>
            {uniqueForms.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
        </div>

        {isAdmin && (
          <div className={styles.historyFilterGroup}>
            <label htmlFor="filterUser">Excluído por</label>
            <select
              id="filterUser"
              value={filterUserId}
              onChange={(e) => setFilterUserId(e.target.value)}
              style={{
                padding: '0.5rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.9rem',
                cursor: 'pointer',
                background: '#fff',
                color: '#1e293b',
                width: '100%'
              }}
            >
              <option value="">Todos os usuários</option>
              {uniqueUsers.map((username) => (
                <option key={username} value={username}>
                  {username}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className={styles.historySummary}>
        Itens na lixeira: <strong>{filtered.length}</strong>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <p>🗑️ Lixeira vazia</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {filtered.map((r) => {
            const deletedDate = toJSDate(r.deletedAt);
            const createdDate = toJSDate(r.createdAt);
            const schema = schemas[r.formId];
            const daysRemaining = getDaysRemaining(deletedDate);

            return (
              <div key={r.id} className={styles.card} style={{ 
                borderLeft: '3px solid #ef4444',
                background: '#fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                transition: 'all 0.2s ease',
                padding: '1rem'
              }}>
                <div className={styles.cardBody} style={{ marginBottom: '0.75rem' }}>
                  <h2 className={styles.cardTitle} style={{
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    color: '#1e293b',
                    marginBottom: '0.5rem'
                  }}>
                    {r.formTitle || schema?.title || r.formId}
                  </h2>
                  
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.8rem', color: '#64748b' }}>
                    <span>📅 {formatPTDate(createdDate)}</span>
                    <span style={{ color: '#ef4444', fontWeight: 500 }}>🗑️ {formatPTDate(deletedDate)}</span>
                    {isAdmin && r.deletedByUsername && (
                      <span>👤 {r.deletedByUsername}</span>
                    )}
                  </div>

                  <div style={{ 
                    marginTop: '0.5rem',
                    padding: '0.4rem 0.6rem',
                    background: daysRemaining <= 7 ? '#fef2f2' : '#fef3c7',
                    borderRadius: '6px',
                    border: `1px solid ${daysRemaining <= 7 ? '#fecaca' : '#fde68a'}`,
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: daysRemaining <= 7 ? '#dc2626' : '#d97706'
                  }}>
                    ⏱️ {daysRemaining === 0 
                      ? 'Exclusão hoje' 
                      : `${daysRemaining} dia${daysRemaining > 1 ? 's' : ''}`
                    }
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    className={styles.cardButton} 
                    onClick={() => onOpen(r)} 
                    style={{ 
                      flex: 1, 
                      background: '#3b82f6',
                      color: '#fff',
                      fontWeight: 500,
                      padding: '0.5rem 0.75rem',
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      fontSize: '0.85rem'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#2563eb'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#3b82f6'}
                  >
                    👁️ Ver
                  </button>
                  <button 
                    className={styles.cardButton} 
                    onClick={() => openRestoreConfirmation(r)}
                    disabled={restoringId === r.id}
                    style={{ 
                      background: restoringId === r.id ? '#9ca3af' : '#22c55e',
                      color: '#fff',
                      fontWeight: 500,
                      padding: '0.5rem 0.75rem',
                      borderRadius: '6px',
                      border: 'none',
                      cursor: restoringId === r.id ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s ease',
                      fontSize: '0.85rem',
                      whiteSpace: 'nowrap'
                    }}
                    title="Restaurar resposta"
                    onMouseEnter={(e) => !restoringId && (e.currentTarget.style.background = '#16a34a')}
                    onMouseLeave={(e) => !restoringId && (e.currentTarget.style.background = '#22c55e')}
                  >
                    {restoringId === r.id ? '⏳...' : '↩️ Restaurar'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Confirmação de Restauração */}
      <ConfirmModal
        isOpen={confirmModalOpen}
        onCancel={() => {
          setConfirmModalOpen(false);
          setResponseToRestore(null);
        }}
        onConfirm={handleRestoreResponse}
        title="Tem certeza que deseja restaurar esta resposta?"
        message={
          responseToRestore
            ? `Formulário: ${responseToRestore.formTitle || 'Sem título'}\n` +
              `Excluída em: ${formatPTDate(toJSDate(responseToRestore.deletedAt))}\n\n` +
              `A resposta retornará para o histórico normal.`
            : ''
        }
        confirmText="Restaurar"
        cancelText="Cancelar"
      />
    </div>
  );
}
