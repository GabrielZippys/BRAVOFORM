// components/TrashModal.tsx
'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import TrashPanel, { type TrashResp } from './TrashPanel';
import CollaboratorHistoryModal from './CollaboratorHistoryModal';
import { db } from '../../firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import styles from './TrashModal.module.css';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export default function TrashModal({ isOpen, onClose }: Props) {
  const [selectedResponse, setSelectedResponse] = useState<any>(null);
  const [selectedForm, setSelectedForm] = useState<any>(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  const handleOpenResponse = async (response: TrashResp) => {
    if (!response.formId) return;

    try {
      const formDoc = await getDoc(doc(db, 'forms', response.formId));
      if (formDoc.exists()) {
        setSelectedForm({
          id: formDoc.id,
          ...formDoc.data()
        });
        setSelectedResponse(response);
        setHistoryModalOpen(true);
      }
    } catch (error) {
      console.error('Erro ao carregar formulário:', error);
      alert('Erro ao carregar formulário.');
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className={styles.overlay}>
        <div className={styles.modal}>
          <div className={styles.header}>
            <div>
              <h2 className={styles.title}>🗑️ Lixeira</h2>
              <p className={styles.subtitle}>
                Respostas excluídas por todos os colaboradores. Após 30 dias, serão permanentemente removidas.
              </p>
            </div>
            <button className={styles.closeButton} onClick={onClose} title="Fechar">
              <X size={24} />
            </button>
          </div>

          <div className={styles.content}>
            <TrashPanel
              isAdmin={true}
              onOpen={handleOpenResponse}
            />
          </div>
        </div>
      </div>

      {/* Modal para visualizar resposta */}
      {historyModalOpen && selectedForm && selectedResponse && (
        <CollaboratorHistoryModal
          isOpen={historyModalOpen}
          onClose={() => {
            setHistoryModalOpen(false);
            setSelectedForm(null);
            setSelectedResponse(null);
          }}
          form={selectedForm}
          response={selectedResponse}
          canEdit={false}
        />
      )}
    </>
  );
}
