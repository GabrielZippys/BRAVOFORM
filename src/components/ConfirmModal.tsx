import React from 'react';
import styles from './ConfirmModal.module.css';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDanger?: boolean;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'OK',
  cancelText = 'Cancelar',
  onConfirm,
  onCancel,
  isDanger = false,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const isAlertMode = !cancelText;

  return (
    <div className={styles.overlay} onClick={isAlertMode ? onConfirm : onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>
          {!isAlertMode && (
            <button
              onClick={onCancel}
              className={styles.cancelButton}
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`${styles.confirmButton} ${isDanger ? styles.dangerButton : ''}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
