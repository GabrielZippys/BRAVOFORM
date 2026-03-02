'use client';

import { useEffect, useState } from 'react';
import { db } from '../../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Users } from 'lucide-react';

interface CollaboratorDoc {
  id: string;
  username: string;
  email?: string;
  permissions?: {
    canViewHistory?: boolean;
    canEditHistory?: boolean;
    canManageUsers?: boolean;
  };
}

export default function DepartmentLeaderDash({ 
  collaboratorId, 
  department 
}: { 
  collaboratorId: string; 
  department: string;
}) {
  const [collaborators, setCollaborators] = useState<CollaboratorDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!department) {
      setCollaborators([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'collaborators'),
      where('department', '==', department)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({
            id: d.id,
            ...d.data()
          }))
          .filter((c) => c.id !== collaboratorId) as CollaboratorDoc[]; // Remove o próprio colaborador logado
        setCollaborators(list);
        setLoading(false);
      },
      (err) => {
        console.error('Erro ao carregar colaboradores:', err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [department]);

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>;
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '0.5rem',
        marginBottom: '1.5rem',
        paddingBottom: '1rem',
        borderBottom: '1px solid #e0e0e0'
      }}>
        <Users size={24} />
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>
          Colaboradores do Departamento {department}
        </h2>
      </div>

      {collaborators.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>
          Nenhum colaborador encontrado neste departamento.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {collaborators.map((collab) => (
            <div
              key={collab.id}
              style={{
                background: '#f8f9fa',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                padding: '1rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 500 }}>
                    {collab.username}
                    {collab.permissions?.canManageUsers && (
                      <span style={{
                        marginLeft: '0.5rem',
                        padding: '0.2rem 0.5rem',
                        background: 'rgba(255, 193, 7, 0.15)',
                        color: '#ffc107',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        border: '1px solid rgba(255, 193, 7, 0.35)'
                      }}>
                        Líder
                      </span>
                    )}
                  </h3>
                  {collab.email && (
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#666' }}>
                      {collab.email}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.8rem' }}>
                  {collab.permissions?.canViewHistory && (
                    <span style={{
                      padding: '0.25rem 0.5rem',
                      background: 'rgba(0, 123, 255, 0.1)',
                      color: '#007bff',
                      borderRadius: '12px'
                    }}>
                      Ver Histórico
                    </span>
                  )}
                  {collab.permissions?.canEditHistory && (
                    <span style={{
                      padding: '0.25rem 0.5rem',
                      background: 'rgba(40, 167, 69, 0.1)',
                      color: '#28a745',
                      borderRadius: '12px'
                    }}>
                      Editar Histórico
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
