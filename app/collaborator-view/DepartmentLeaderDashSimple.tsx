'use client';

import { useEffect, useState, useCallback } from 'react';
import { db } from '../../firebase/config';
import { collection, query, where, onSnapshot, collectionGroup, Timestamp } from 'firebase/firestore';
import { Users, CheckCircle, XCircle, Clock } from 'lucide-react';

interface CollaboratorDoc {
  id: string;
  username: string;
  email?: string;
  department?: string;
  permissions?: {
    canViewHistory?: boolean;
    canEditHistory?: boolean;
    canManageUsers?: boolean;
  };
}

interface FormDoc {
  id: string;
  title: string;
  authorizedUsers: string[];
}

interface ResponseDoc {
  id: string;
  formId: string;
  collaboratorId: string;
  submittedAt?: Timestamp;
  createdAt?: Timestamp;
}

export default function DepartmentLeaderDash({ 
  collaboratorId, 
  department 
}: { 
  collaboratorId: string; 
  department: string;
}) {
  const [collaborators, setCollaborators] = useState<CollaboratorDoc[]>([]);
  const [forms, setForms] = useState<FormDoc[]>([]);
  const [responses, setResponses] = useState<ResponseDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [responsesLoaded, setResponsesLoaded] = useState(false);

  // Carregar colaboradores do departamento
  useEffect(() => {
    if (!department) {
      setCollaborators([]);
      return;
    }

    const q = query(
      collection(db, 'collaborators'),
      where('department', '==', department)
    );

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map((d) => ({
          id: d.id,
          ...d.data()
        } as CollaboratorDoc))
        .filter((c) => !c.permissions?.canManageUsers); // Excluir líderes
      setCollaborators(list);
    });

    return () => unsub();
  }, [department]);

  // Carregar formulários autorizados para os colaboradores do departamento
  useEffect(() => {
    if (collaborators.length === 0) {
      setForms([]);
      return;
    }

    const collabIds = collaborators.map(c => c.id);
    
    const unsub = onSnapshot(
      collection(db, 'forms'),
      (snap) => {
        const formsList = snap.docs
          .map((d) => {
            const data = d.data();
            const safeId = typeof data?.id === 'string' && data.id.trim() 
              ? data.id.trim() 
              : d.id;
            
            return {
              id: safeId,
              title: data.title || 'Sem título',
              authorizedUsers: data.authorizedUsers || []
            };
          })
          .filter((f) => 
            f.authorizedUsers.some((userId: string) => collabIds.includes(userId))
          ) as FormDoc[];
        
        setForms(formsList);
      }
    );

    return () => unsub();
  }, [collaborators]);

  // Carregar respostas de hoje
  useEffect(() => {
    if (collaborators.length === 0) {
      setResponses([]);
      setResponsesLoaded(false);
      setLoading(false);
      return;
    }

    setResponsesLoaded(false);
    const collabIds = collaborators.map(c => c.id);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const unsub = onSnapshot(
      collectionGroup(db, 'responses'),
      (snap) => {
        const allResponses = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            formId: data.formId,
            collaboratorId: data.collaboratorId,
            submittedAt: data.submittedAt,
            createdAt: data.createdAt
          };
        });
        
        const responsesList = allResponses
          .filter((r) => {
            const inCollabList = collabIds.includes(r.collaboratorId);
            
            const ts = r.submittedAt || r.createdAt;
            const isValidTimestamp = ts && (ts instanceof Timestamp);
            
            let isToday = false;
            if (isValidTimestamp) {
              const date = ts.toDate();
              isToday = date >= today;
            }
            
            return inCollabList && isValidTimestamp && isToday;
          }) as ResponseDoc[];
        
        setResponses(responsesList);
        setResponsesLoaded(true);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [collaborators]);

  // Função para verificar se um colaborador respondeu um formulário hoje
  const hasResponded = useCallback((collaboratorId: string, formId: string): boolean => {
    return responses.some(
      (r) => r.collaboratorId === collaboratorId && r.formId === formId
    );
  }, [responses]);


  // Calcular estatísticas
  const totalCollaborators = collaborators.length;
  const totalForms = forms.length;
  const totalExpectedResponses = totalCollaborators * totalForms;
  const totalActualResponses = responses.length;
  const completionRate = totalExpectedResponses > 0 
    ? Math.round((totalActualResponses / totalExpectedResponses) * 100) 
    : 0;

  if (loading || !responsesLoaded) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>Carregando dados...</div>;
  }

  return (
    <div style={{ padding: '1rem', maxWidth: '100%', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        marginBottom: '0.75rem',
        paddingBottom: '0.75rem',
        borderBottom: '2px solid #e0e0e0'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Users size={22} color="#64b5f6" />
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#e3f2fd' }}>
            Painel de Respostas - {department}
          </h2>
        </div>
        <div style={{ 
          display: 'flex', 
          gap: '1.5rem',
          fontSize: '0.75rem',
          color: '#666'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1976d2' }}>
              {totalActualResponses}/{totalExpectedResponses}
            </div>
            <div style={{ fontSize: '0.7rem' }}>Respostas</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: completionRate >= 80 ? '#10b981' : completionRate >= 50 ? '#f59e0b' : '#ef4444' }}>
              {completionRate}%
            </div>
            <div style={{ fontSize: '0.7rem' }}>Conclusão</div>
          </div>
        </div>
      </div>

      {/* Tabela de Status */}
      {collaborators.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#999', padding: '3rem' }}>
          Nenhum colaborador encontrado neste departamento.
        </p>
      ) : forms.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#999', padding: '3rem' }}>
          Nenhum formulário disponível para este departamento.
        </p>
      ) : (
        <div style={{ 
          overflowX: 'auto',
          background: 'white',
          borderRadius: '8px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.1)'
        }}>
          <table style={{ 
            width: '100%', 
            borderCollapse: 'collapse',
            fontSize: '0.75rem'
          }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ 
                  padding: '0.5rem 0.75rem', 
                  textAlign: 'left',
                  fontWeight: 600,
                  color: '#1f2937',
                  position: 'sticky',
                  left: 0,
                  background: '#f8fafc',
                  zIndex: 10,
                  minWidth: '80px',
                  fontSize: '0.75rem'
                }}>
                  Loja
                </th>
                {forms.map((form) => {
                  const shortTitle = form.title.length > 15 ? form.title.substring(0, 15) + '...' : form.title;
                  return (
                    <th key={form.id} style={{ 
                      padding: '0.5rem 0.4rem', 
                      textAlign: 'center',
                      fontWeight: 600,
                      color: '#1f2937',
                      minWidth: '70px',
                      maxWidth: '100px',
                      fontSize: '0.7rem',
                      lineHeight: '1.2'
                    }} title={form.title}>
                      {shortTitle}
                    </th>
                  );
                })}
                <th style={{ 
                  padding: '0.5rem 0.75rem', 
                  textAlign: 'center',
                  fontWeight: 600,
                  color: '#1f2937',
                  minWidth: '60px',
                  fontSize: '0.75rem'
                }}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {collaborators.map((collab, index) => {
                const authorizedForms = forms.filter(f => f.authorizedUsers.includes(collab.id));
                const collabResponses = authorizedForms.filter(f => hasResponded(collab.id, f.id)).length;
                const collabTotal = authorizedForms.length;
                const collabRate = collabTotal > 0 ? Math.round((collabResponses / collabTotal) * 100) : 0;
                
                return (
                  <tr key={collab.id} style={{ 
                    background: index % 2 === 0 ? '#ffffff' : '#f9fafb',
                    borderBottom: '1px solid #e5e7eb',
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={(e) => e.currentTarget.style.background = index % 2 === 0 ? '#ffffff' : '#f9fafb'}
                  >
                    <td style={{ 
                      padding: '0.5rem 0.75rem',
                      fontWeight: 600,
                      color: '#1f2937',
                      position: 'sticky',
                      left: 0,
                      background: 'inherit',
                      zIndex: 5,
                      fontSize: '0.8rem'
                    }}>
                      {collab.username}
                    </td>
                    {forms.map((form) => {
                      const isAuthorized = form.authorizedUsers.includes(collab.id);
                      if (!isAuthorized) {
                        return (
                          <td key={form.id} style={{ 
                            padding: '0.4rem', 
                            textAlign: 'center'
                          }}>
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '28px',
                              height: '28px',
                              borderRadius: '6px',
                              background: '#f3f4f6',
                              border: '1.5px solid #d1d5db'
                            }}>
                              <span style={{ fontSize: '12px', color: '#9ca3af' }}>—</span>
                            </div>
                          </td>
                        );
                      }
                      
                      const responded = hasResponded(collab.id, form.id);
                      return (
                        <td key={form.id} style={{ 
                          padding: '0.4rem', 
                          textAlign: 'center'
                        }}>
                          <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            background: responded ? '#d1fae5' : '#fee2e2',
                            border: `1.5px solid ${responded ? '#10b981' : '#ef4444'}`
                          }}>
                            {responded ? (
                              <CheckCircle size={16} color="#10b981" strokeWidth={2.5} />
                            ) : (
                              <XCircle size={16} color="#ef4444" strokeWidth={2.5} />
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td style={{ 
                      padding: '0.5rem 0.75rem', 
                      textAlign: 'center',
                      fontWeight: 700
                    }}>
                      <div style={{
                        display: 'inline-block',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '8px',
                        background: collabRate === 100 ? '#d1fae5' : collabRate >= 50 ? '#fef3c7' : '#fee2e2',
                        color: collabRate === 100 ? '#10b981' : collabRate >= 50 ? '#f59e0b' : '#ef4444',
                        fontSize: '0.7rem'
                      }}>
                        {collabResponses}/{collabTotal}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Legenda */}
      <div style={{ 
        marginTop: '0.75rem',
        padding: '0.6rem',
        background: '#f8fafc',
        borderRadius: '6px',
        display: 'flex',
        gap: '1.5rem',
        justifyContent: 'center',
        fontSize: '0.7rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <CheckCircle size={14} color="#10b981" />
          <span>Respondido</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <XCircle size={14} color="#ef4444" />
          <span>Pendente</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '14px',
            height: '14px',
            borderRadius: '3px',
            background: '#f3f4f6',
            border: '1px solid #d1d5db'
          }}>
            <span style={{ fontSize: '10px', color: '#9ca3af' }}>—</span>
          </div>
          <span>Não autorizado</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <Clock size={14} color="#6b7280" />
          <span>Hoje</span>
        </div>
      </div>
    </div>
  );
}
