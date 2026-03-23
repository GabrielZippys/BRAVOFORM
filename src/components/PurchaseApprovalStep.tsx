'use client';

import React, { useState } from 'react';
import { Check, X, Package, DollarSign, Calendar, User } from 'lucide-react';
import type { PurchaseOrder } from '@/types';
import styles from '../../app/styles/PurchaseWorkflow.module.css';

interface PurchaseApprovalStepProps {
  order: PurchaseOrder;
  onApprove: (comment?: string) => Promise<void>;
  onReject: (comment: string) => Promise<void>;
  isLoading?: boolean;
}

/**
 * Componente para aprovação gerencial de pedidos de compra
 * Exibe dados completos do pedido e permite aprovar ou rejeitar
 */
export default function PurchaseApprovalStep({
  order,
  onApprove,
  onReject,
  isLoading = false
}: PurchaseApprovalStepProps) {
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!action) return;

    if (action === 'reject' && !comment.trim()) {
      alert('Comentário é obrigatório ao rejeitar um pedido');
      return;
    }

    setIsSubmitting(true);
    try {
      if (action === 'approve') {
        await onApprove(comment.trim() || undefined);
      } else {
        await onReject(comment.trim());
      }
    } catch (error) {
      console.error('Erro ao processar aprovação:', error);
      alert('Erro ao processar. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('pt-BR');
  };

  return (
    <div className={styles.approvalContainer}>
      <div className={styles.header}>
        <Package size={32} />
        <h2>Aprovação de Pedido de Compra</h2>
      </div>

      {/* Informações do Pedido */}
      <div className={styles.orderInfo}>
        <div className={styles.infoRow}>
          <span className={styles.label}>Número do Pedido:</span>
          <span className={styles.value}>{order.orderNumber}</span>
        </div>

        <div className={styles.infoRow}>
          <span className={styles.label}>Fornecedor:</span>
          <span className={styles.value}>
            {order.supplier.name} - CNPJ: {order.supplier.cnpj}
          </span>
        </div>

        <div className={styles.infoRow}>
          <span className={styles.label}>
            <DollarSign size={16} />
            Valor Total:
          </span>
          <span className={`${styles.value} ${styles.totalValue}`}>
            {formatCurrency(order.totalValue)}
          </span>
        </div>

        {order.deliveryDate && (
          <div className={styles.infoRow}>
            <span className={styles.label}>
              <Calendar size={16} />
              Data de Entrega:
            </span>
            <span className={styles.value}>{formatDate(order.deliveryDate)}</span>
          </div>
        )}

        {order.paymentConditions && (
          <div className={styles.infoRow}>
            <span className={styles.label}>Condições de Pagamento:</span>
            <span className={styles.value}>{order.paymentConditions}</span>
          </div>
        )}

        <div className={styles.infoRow}>
          <span className={styles.label}>
            <User size={16} />
            Solicitado por:
          </span>
          <span className={styles.value}>{order.createdByName || 'N/A'}</span>
        </div>

        <div className={styles.infoRow}>
          <span className={styles.label}>Data de Criação:</span>
          <span className={styles.value}>{formatDate(order.createdAt)}</span>
        </div>
      </div>

      {/* Tabela de Itens */}
      <div className={styles.itemsSection}>
        <h3>Itens do Pedido</h3>
        <div className={styles.tableWrapper}>
          <table className={styles.itemsTable}>
            <thead>
              <tr>
                <th>#</th>
                <th>Descrição</th>
                <th>Código</th>
                <th>Quantidade</th>
                <th>Unidade</th>
                <th>Valor Unit.</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, index) => (
                <tr key={index}>
                  <td>{index + 1}</td>
                  <td>{item.description}</td>
                  <td>{item.code || '-'}</td>
                  <td className={styles.numberCell}>{item.quantity}</td>
                  <td>{item.unit || 'UN'}</td>
                  <td className={styles.numberCell}>{formatCurrency(item.unitPrice)}</td>
                  <td className={styles.numberCell}>{formatCurrency(item.totalPrice)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6} className={styles.totalLabel}>Total Geral:</td>
                <td className={`${styles.numberCell} ${styles.totalValue}`}>
                  {formatCurrency(order.totalValue)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Ações de Aprovação/Rejeição */}
      {!action && (
        <div className={styles.actionsSection}>
          <h3>Decisão</h3>
          <div className={styles.actionButtons}>
            <button
              className={`${styles.actionButton} ${styles.rejectButton}`}
              onClick={() => setAction('reject')}
              disabled={isLoading || isSubmitting}
            >
              <X size={20} />
              Rejeitar Pedido
            </button>
            <button
              className={`${styles.actionButton} ${styles.approveButton}`}
              onClick={() => setAction('approve')}
              disabled={isLoading || isSubmitting}
            >
              <Check size={20} />
              Aprovar Pedido
            </button>
          </div>
        </div>
      )}

      {/* Formulário de Comentário */}
      {action && (
        <div className={styles.commentSection}>
          <h3>
            {action === 'approve' ? 'Aprovar Pedido' : 'Rejeitar Pedido'}
          </h3>
          <p className={styles.commentLabel}>
            {action === 'reject' 
              ? 'Comentário (obrigatório):' 
              : 'Comentário (opcional):'}
          </p>
          <textarea
            className={styles.commentTextarea}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={
              action === 'reject'
                ? 'Explique o motivo da rejeição...'
                : 'Adicione observações se necessário...'
            }
            rows={4}
            required={action === 'reject'}
          />

          <div className={styles.submitButtons}>
            <button
              className={styles.cancelButton}
              onClick={() => {
                setAction(null);
                setComment('');
              }}
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button
              className={
                action === 'approve'
                  ? styles.confirmApproveButton
                  : styles.confirmRejectButton
              }
              onClick={handleSubmit}
              disabled={isSubmitting || (action === 'reject' && !comment.trim())}
            >
              {isSubmitting ? 'Processando...' : `Confirmar ${action === 'approve' ? 'Aprovação' : 'Rejeição'}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
