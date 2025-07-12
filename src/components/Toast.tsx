// Em: src/components/Toast.tsx

import React, { useEffect } from 'react';
import { CheckCircle, AlertTriangle, X } from 'lucide-react';
import styles from '../../app/styles/Toast.module.css'; // Criaremos este CSS

type ToastProps = {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
};

export default function Toast({ message, type, onClose }: ToastProps) {
  // Faz a notificação desaparecer após 5 segundos
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000);

    return () => clearTimeout(timer);
  }, [onClose]);

  const isSuccess = type === 'success';
  const icon = isSuccess ? <CheckCircle size={24} /> : <AlertTriangle size={24} />;

  return (
    <div className={`${styles.toast} ${isSuccess ? styles.success : styles.error}`}>
      <div className={styles.iconWrapper}>
        {icon}
      </div>
      <p className={styles.message}>{message}</p>
      <button onClick={onClose} className={styles.closeButton}>
        <X size={18} />
      </button>
    </div>
  );
}