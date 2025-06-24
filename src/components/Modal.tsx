'use client';

import React from 'react';
import { X } from 'lucide-react';
import styles from '../../app/styles/Modal.module.css';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    // CORREÇÃO: Removido o evento onClick do overlay para que ele não feche ao clicar fora.
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>{title}</h3>
          {/* O único jeito de fechar agora é clicando no "X" ou nos botões de ação */}
          <button onClick={onClose} className={styles.closeButton}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
