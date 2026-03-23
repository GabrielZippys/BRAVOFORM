'use client';

import React, { useState } from 'react';
import { CheckCircle, XCircle, Building2, AlertTriangle } from 'lucide-react';
import type { PurchaseOrder, SupplierValidation } from '@/types';
import styles from '../../app/styles/PurchaseWorkflow.module.css';

interface SupplierValidationStepProps {
  order: PurchaseOrder;
  onValidate: (validation: Omit<SupplierValidation, 'validatedBy' | 'validatedByName' | 'validatedAt'>) => Promise<void>;
  isLoading?: boolean;
}

/**
 * Componente para validação de fornecedor pelo setor de faturamento
 * Permite confirmar ou indicar fornecedor diferente
 */
export default function SupplierValidationStep({
  order,
  onValidate,
  isLoading = false
}: SupplierValidationStepProps) {
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [newSupplierCNPJ, setNewSupplierCNPJ] = useState('');
  const [newSupplierName, setNewSupplierName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (isCorrect === null) {
      alert('Por favor, indique se o fornecedor está correto');
      return;
    }

    if (!isCorrect && (!newSupplierCNPJ.trim() || !newSupplierName.trim())) {
      alert('Por favor, informe o fornecedor correto');
      return;
    }

    setIsSubmitting(true);
    try {
      const validation: Omit<SupplierValidation, 'validatedBy' | 'validatedByName' | 'validatedAt'> = {
        fornecedorOriginal: {
          cnpj: order.supplier.cnpj,
          name: order.supplier.name
        },
        fornecedorCorreto: isCorrect,
        requiresReorder: !isCorrect
      };

      if (!isCorrect) {
        validation.novoFornecedor = {
          cnpj: newSupplierCNPJ.trim(),
          name: newSupplierName.trim()
        };
      }

      await onValidate(validation);
    } catch (error) {
      console.error('Erro ao validar fornecedor:', error);
      alert('Erro ao processar validação. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCNPJ = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length <= 14) {
      return cleaned.replace(
        /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
        '$1.$2.$3/$4-$5'
      );
    }
    return value;
  };

  const handleCNPJChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCNPJ(e.target.value);
    setNewSupplierCNPJ(formatted);
  };

  return (
    <div className={styles.supplierValidationContainer}>
      <div className={styles.header}>
        <Building2 size={32} />
        <h2>Validação de Fornecedor</h2>
      </div>

      {/* Informações do Fornecedor Atual */}
      <div className={styles.currentSupplierSection}>
        <h3>Fornecedor do Pedido</h3>
        <div className={styles.supplierCard}>
          <div className={styles.supplierInfo}>
            <div className={styles.infoRow}>
              <span className={styles.label}>Razão Social:</span>
              <span className={styles.value}>{order.supplier.name}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.label}>CNPJ:</span>
              <span className={styles.value}>{order.supplier.cnpj}</span>
            </div>
            {order.supplier.address && (
              <div className={styles.infoRow}>
                <span className={styles.label}>Endereço:</span>
                <span className={styles.value}>{order.supplier.address}</span>
              </div>
            )}
            {order.supplier.contact && (
              <div className={styles.infoRow}>
                <span className={styles.label}>Contato:</span>
                <span className={styles.value}>{order.supplier.contact}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pergunta de Validação */}
      <div className={styles.validationQuestion}>
        <h3>O fornecedor está correto?</h3>
        <p className={styles.questionSubtext}>
          Verifique se o fornecedor informado no pedido corresponde ao fornecedor real da compra.
        </p>

        <div className={styles.validationButtons}>
          <button
            className={`${styles.validationButton} ${isCorrect === false ? styles.selected : ''}`}
            onClick={() => setIsCorrect(false)}
            disabled={isLoading || isSubmitting}
          >
            <XCircle size={24} />
            <span>Não, fornecedor diferente</span>
          </button>
          <button
            className={`${styles.validationButton} ${isCorrect === true ? styles.selected : ''}`}
            onClick={() => setIsCorrect(true)}
            disabled={isLoading || isSubmitting}
          >
            <CheckCircle size={24} />
            <span>Sim, fornecedor correto</span>
          </button>
        </div>
      </div>

      {/* Formulário de Novo Fornecedor */}
      {isCorrect === false && (
        <div className={styles.newSupplierSection}>
          <div className={styles.alertBox}>
            <AlertTriangle size={20} />
            <p>
              Informe o fornecedor correto. O setor de compras será notificado para refazer o pedido.
            </p>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="newSupplierCNPJ">CNPJ do Fornecedor Correto *</label>
            <input
              id="newSupplierCNPJ"
              type="text"
              value={newSupplierCNPJ}
              onChange={handleCNPJChange}
              placeholder="00.000.000/0000-00"
              maxLength={18}
              required
              className={styles.input}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="newSupplierName">Razão Social do Fornecedor Correto *</label>
            <input
              id="newSupplierName"
              type="text"
              value={newSupplierName}
              onChange={(e) => setNewSupplierName(e.target.value)}
              placeholder="Nome completo do fornecedor"
              required
              className={styles.input}
            />
          </div>
        </div>
      )}

      {/* Botão de Confirmação */}
      {isCorrect !== null && (
        <div className={styles.submitSection}>
          <button
            className={styles.cancelButton}
            onClick={() => {
              setIsCorrect(null);
              setNewSupplierCNPJ('');
              setNewSupplierName('');
            }}
            disabled={isSubmitting}
          >
            Cancelar
          </button>
          <button
            className={styles.confirmButton}
            onClick={handleSubmit}
            disabled={isSubmitting || (isCorrect === false && (!newSupplierCNPJ || !newSupplierName))}
          >
            {isSubmitting ? 'Processando...' : 'Confirmar Validação'}
          </button>
        </div>
      )}
    </div>
  );
}
