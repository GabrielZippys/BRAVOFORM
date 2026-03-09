'use client';

import { useEffect, useState } from 'react';
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
          .map((d) => ({
            id: d.id,
            title: d.data().title || 'Sem título',
            authorizedUsers: d.data().authorizedUsers || []
          }))
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
      setLoading(false);
      return;
    }

    const collabIds = collaborators.map(c => c.id);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const unsub = onSnapshot(
      collectionGroup(db, 'responses'),
      (snap) => {
        const responsesList = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              formId: data.formId,
              collaboratorId: data.collaboratorId,
              submittedAt: data.submittedAt,
              createdAt: data.createdAt
            };
          })
          .filter((r) => {
            if (!collabIds.includes(r.collaboratorId)) return false;
            
            const ts = r.submittedAt || r.createdAt;
            if (!ts || !(ts instanceof Timestamp)) return false;
            
            const date = ts.toDate();
            return date >= today;
          }) as ResponseDoc[];
        
        setResponses(responsesList);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [collaborators]);

  // Função para verificar se um colaborador respondeu um formulário hoje
  const hasResponded = (collaboratorId: string, formId: string): boolean => {
    return responses.some(
      (r) => r.collaboratorId === collaboratorId && r.formId === formId
    );
  };


  // Calcular estatísticas
  const totalCollaborators = collaborators.length;
  const totalForms = forms.length;
  const totalExpectedResponses = totalCollaborators * totalForms;
  const totalActualResponses = responses.length;
  const completionRate = totalExpectedResponses > 0 
    ? Math.round((totalActualResponses / totalExpectedResponses) * 100) 
    : 0;

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>Carregando dados...</div>;
  }

  return (
    <div style={{ 
      padding: 'clamp(0.5rem, 2vw, 1rem)', 
      maxWidth: '100%', 
      margin: '0 auto',
      overflowX: 'hidden'
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        flexDirection: window.innerWidth < 640 ? 'column' : 'row',
        alignItems: window.innerWidth < 640 ? 'flex-start' : 'center',
        justifyContent: 'space-between',
        marginBottom: 'clamp(0.5rem, 2vw, 0.75rem)',
        paddingBottom: 'clamp(0.5rem, 2vw, 0.75rem)',
        borderBottom: '2px solid #e0e0e0',
        gap: '0.75rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Users size={window.innerWidth < 640 ? 18 : 22} color="#64b5f6" />
          <h2 style={{ 
            margin: 0, 
            fontSize: window.innerWidth < 640 ? '1rem' : '1.25rem', 
            fontWeight: 600, 
            color: '#e3f2fd',
            lineHeight: 1.2
          }}>
            Painel de Respostas - {department}
          </h2>
        </div>
        <div style={{ 
          display: 'flex', 
          gap: window.innerWidth < 640 ? '1rem' : '1.5rem',
          fontSize: window.innerWidth < 640 ? '0.65rem' : '0.75rem',
          color: '#666',
          width: window.innerWidth < 640 ? '100%' : 'auto',
          justifyContent: window.innerWidth < 640 ? 'space-around' : 'flex-end'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ 
              fontSize: window.innerWidth < 640 ? '0.9rem' : '1.1rem', 
              fontWeight: 700, 
              color: '#1976d2' 
            }}>
              {totalActualResponses}/{totalExpectedResponses}
            </div>
            <div style={{ fontSize: window.innerWidth < 640 ? '0.6rem' : '0.7rem' }}>Respostas</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ 
              fontSize: window.innerWidth < 640 ? '0.9rem' : '1.1rem', 
              fontWeight: 700, 
              color: completionRate >= 80 ? '#10b981' : completionRate >= 50 ? '#f59e0b' : '#ef4444' 
            }}>
              {completionRate}%
            </div>
            <div style={{ fontSize: window.innerWidth < 640 ? '0.6rem' : '0.7rem' }}>Conclusão</div>
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
          borderRadius: window.innerWidth < 640 ? '6px' : '8px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
          WebkitOverflowScrolling: 'touch',
          maxWidth: '100vw'
        }}>
          <table style={{ 
            width: '100%', 
            borderCollapse: 'collapse',
            fontSize: window.innerWidth < 640 ? '0.65rem' : '0.75rem',
            minWidth: window.innerWidth < 640 ? '600px' : 'auto'
          }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ 
                  padding: window.innerWidth < 640 ? '0.4rem 0.5rem' : '0.5rem 0.75rem', 
                  textAlign: 'left',
                  fontWeight: 600,
                  color: '#1f2937',
                  position: 'sticky',
                  left: 0,
                  background: '#f8fafc',
                  zIndex: 10,
                  minWidth: window.innerWidth < 640 ? '60px' : '80px',
                  fontSize: window.innerWidth < 640 ? '0.65rem' : '0.75rem'
                }}>
                  Loja
                </th>
                {forms.map((form) => {
                  return (
                    <th key={form.id} style={{ 
                      padding: 0,
                      textAlign: 'center',
                      fontWeight: 600,
                      color: '#1f2937',
                      width: window.innerWidth < 640 ? '40px' : '50px',
                      minWidth: window.innerWidth < 640 ? '40px' : '50px',
                      maxWidth: window.innerWidth < 640 ? '40px' : '50px',
                      height: window.innerWidth < 640 ? '120px' : '140px',
                      verticalAlign: 'bottom',
                      position: 'relative',
                      overflow: 'visible'
                    }}>
                      <div style={{
                        transform: 'rotate(-60deg)',
                        transformOrigin: 'left bottom',
                        whiteSpace: 'nowrap',
                        fontSize: window.innerWidth < 640 ? '0.6rem' : '0.7rem',
                        lineHeight: '1.2',
                        position: 'absolute',
                        bottom: window.innerWidth < 640 ? '10px' : '12px',
                        left: window.innerWidth < 640 ? '18px' : '22px',
                        width: window.innerWidth < 640 ? '100px' : '120px',
                        textAlign: 'left',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: window.innerWidth < 640 ? '100px' : '120px'
                      }} title={form.title}>
                        {form.title}
                      </div>
                    </th>
                  );
                })}
                <th style={{ 
                  padding: window.innerWidth < 640 ? '0.4rem 0.5rem' : '0.5rem 0.75rem', 
                  textAlign: 'center',
                  fontWeight: 600,
                  color: '#1f2937',
                  minWidth: window.innerWidth < 640 ? '50px' : '60px',
                  fontSize: window.innerWidth < 640 ? '0.65rem' : '0.75rem'
                }}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {collaborators.map((collab, index) => {
                const collabResponses = forms.filter(f => hasResponded(collab.id, f.id)).length;
                const collabTotal = forms.length;
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
                      padding: window.innerWidth < 640 ? '0.4rem 0.5rem' : '0.5rem 0.75rem',
                      fontWeight: 600,
                      color: '#1f2937',
                      position: 'sticky',
                      left: 0,
                      background: 'inherit',
                      zIndex: 5,
                      fontSize: window.innerWidth < 640 ? '0.7rem' : '0.8rem'
                    }}>
                      {collab.username}
                    </td>
                    {forms.map((form) => {
                      const responded = hasResponded(collab.id, form.id);
                      return (
                        <td key={form.id} style={{ 
                          padding: window.innerWidth < 640 ? '0.3rem' : '0.4rem', 
                          textAlign: 'center'
                        }}>
                          <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: window.innerWidth < 640 ? '24px' : '28px',
                            height: window.innerWidth < 640 ? '24px' : '28px',
                            borderRadius: window.innerWidth < 640 ? '4px' : '6px',
                            background: responded ? '#d1fae5' : '#fee2e2',
                            border: `1.5px solid ${responded ? '#10b981' : '#ef4444'}`
                          }}>
                            {responded ? (
                              <CheckCircle size={window.innerWidth < 640 ? 14 : 16} color="#10b981" strokeWidth={2.5} />
                            ) : (
                              <XCircle size={window.innerWidth < 640 ? 14 : 16} color="#ef4444" strokeWidth={2.5} />
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td style={{ 
                      padding: window.innerWidth < 640 ? '0.4rem 0.5rem' : '0.5rem 0.75rem', 
                      textAlign: 'center',
                      fontWeight: 700
                    }}>
                      <div style={{
                        display: 'inline-block',
                        padding: window.innerWidth < 640 ? '0.2rem 0.4rem' : '0.25rem 0.5rem',
                        borderRadius: window.innerWidth < 640 ? '6px' : '8px',
                        background: collabRate === 100 ? '#d1fae5' : collabRate >= 50 ? '#fef3c7' : '#fee2e2',
                        color: collabRate === 100 ? '#10b981' : collabRate >= 50 ? '#f59e0b' : '#ef4444',
                        fontSize: window.innerWidth < 640 ? '0.6rem' : '0.7rem'
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
        marginTop: window.innerWidth < 640 ? '0.5rem' : '0.75rem',
        padding: window.innerWidth < 640 ? '0.5rem' : '0.6rem',
        background: '#f8fafc',
        borderRadius: '6px',
        display: 'flex',
        gap: window.innerWidth < 640 ? '1rem' : '1.5rem',
        justifyContent: 'center',
        fontSize: window.innerWidth < 640 ? '0.6rem' : '0.7rem',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <CheckCircle size={window.innerWidth < 640 ? 12 : 14} color="#10b981" />
          <span>Respondido</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <XCircle size={window.innerWidth < 640 ? 12 : 14} color="#ef4444" />
          <span>Pendente</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <Clock size={window.innerWidth < 640 ? 12 : 14} color="#6b7280" />
          <span>Hoje</span>
        </div>
      </div>
    </div>
  );
}
