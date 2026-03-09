// app/dashboard/trash/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import TrashPanel, { type TrashResp } from '@/components/TrashPanel';
import CollaboratorHistoryModal from '@/components/CollaboratorHistoryModal';
import { db } from '../../../firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import styles from '../../styles/Dashboard.module.css';

export default function TrashPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [selectedResponse, setSelectedResponse] = useState<any>(null);
  const [selectedForm, setSelectedForm] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  const handleOpenResponse = async (response: TrashResp) => {
    if (!response.formId) return;

    try {
      // Buscar o formulário
      const formDoc = await getDoc(doc(db, 'forms', response.formId));
      if (formDoc.exists()) {
        setSelectedForm({
          id: formDoc.id,
          ...formDoc.data()
        });
        setSelectedResponse(response);
        setModalOpen(true);
      }
    } catch (error) {
      console.error('Erro ao carregar formulário:', error);
      alert('Erro ao carregar formulário.');
    }
  };

  if (authLoading) {
    return (
      <div className={styles.container}>
        <p>Carregando...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header} style={{ 
        background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
        padding: '2rem',
        borderRadius: '12px',
        marginBottom: '2rem',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
      }}>
        <h1 className={styles.title} style={{ 
          color: '#fff',
          fontSize: '1.75rem',
          fontWeight: 600,
          marginBottom: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          🗑️ Lixeira
        </h1>
        <p style={{ 
          color: '#cbd5e1', 
          fontSize: '0.95rem',
          lineHeight: '1.5',
          maxWidth: '800px'
        }}>
          Respostas excluídas por todos os colaboradores. Após 30 dias, serão permanentemente removidas.
        </p>
      </div>

      <div className={styles.content}>
        <TrashPanel
          isAdmin={true}
          onOpen={handleOpenResponse}
        />
      </div>

      {/* Modal para visualizar resposta */}
      {modalOpen && selectedForm && selectedResponse && (
        <CollaboratorHistoryModal
          isOpen={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setSelectedForm(null);
            setSelectedResponse(null);
          }}
          form={selectedForm}
          response={selectedResponse}
          canEdit={false}
        />
      )}
    </div>
  );
}
