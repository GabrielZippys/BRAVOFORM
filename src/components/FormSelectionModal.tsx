'use client';

import React from 'react';
import { X, FileText } from 'lucide-react';
import styles from '../../app/styles/FormSelectionModal.module.css';

interface Form {
  id: string;
  name?: string;
  title?: string;
}

interface FormSelectionModalProps {
  isOpen: boolean;
  forms: Form[];
  selectedFormIds: string[];
  onToggleForm: (formId: string) => void;
  onClose: () => void;
}

export default function FormSelectionModal({
  isOpen,
  forms,
  selectedFormIds,
  onToggleForm,
  onClose
}: FormSelectionModalProps) {
  if (!isOpen) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h3>Selecionar Formulários Obrigatórios</h3>
          <button onClick={onClose} className={styles.closeButton}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.content}>
          <p className={styles.hint}>
            Selecione os formulários que devem ser respondidos para completar esta etapa
          </p>

          {forms.length === 0 ? (
            <p className={styles.emptyText}>
              Nenhum formulário cadastrado nos departamentos deste workflow
            </p>
          ) : (
            <div className={styles.formList}>
              {forms
                .filter(form => form.id && form.id.trim() !== '') // Filtrar formulários sem ID
                .map((form, index) => (
                  <label key={form.id || `form-${index}`} className={styles.formItem}>
                    <input
                      type="checkbox"
                      checked={selectedFormIds.includes(form.id)}
                      onChange={() => onToggleForm(form.id)}
                    />
                    <FileText size={18} />
                    <span>{form.title || form.name || 'Formulário sem nome'}</span>
                  </label>
                ))}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button onClick={onClose} className={styles.doneButton}>
            Concluído ({selectedFormIds.length} selecionado{selectedFormIds.length !== 1 ? 's' : ''})
          </button>
        </div>
      </div>
    </div>
  );
}
