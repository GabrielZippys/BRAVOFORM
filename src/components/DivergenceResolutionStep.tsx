'use client';

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, Edit, FileText } from 'lucide-react';
import type { XMLValidationResult, DivergenceResolution, PurchaseOrder } from '@/types';
import { XMLValidationService } from '@/services/xmlValidationService';
import styles from '../../app/styles/PurchaseWorkflow.module.css';

interface DivergenceResolutionStepProps {
  validationResult: XMLValidationResult;
  order: PurchaseOrder;
  onResolve: (resolution: Omit<DivergenceResolution, 'resolvedBy' | 'resolvedByName' | 'resolvedAt'>) => Promise<void>;
  isLoading?: boolean;
}

/**
 * Componente para resolução de divergências entre XML e Pedido
 * Oferece 3 opções: seguir com justificativa, modificar pedido ou fazer novo pedido
 */
export default function DivergenceResolutionStep({
  validationResult,
  order,
  onResolve,
  isLoading = false
}: DivergenceResolutionStepProps) {
  const [selectedAction, setSelectedAction] = useState<DivergenceResolution['action'] | null>(null);
  const [justification, setJustification] = useState('');
  const [newOrderNumber, setNewOrderNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedAction) {
      alert('Selecione uma ação');
      return;
    }

    if (selectedAction === 'seguir_com_justificativa' && !justification.trim()) {
      alert('Justificativa é obrigatória');
      return;
    }

    if (selectedAction === 'novo_pedido' && !newOrderNumber.trim()) {
      alert('Número do novo pedido é obrigatório');
      return;
    }

    setIsSubmitting(true);
    try {
      const resolution: Omit<DivergenceResolution, 'resolvedBy' | 'resolvedByName' | 'resolvedAt'> = {
        action: selectedAction
      };

      if (selectedAction === 'seguir_com_justificativa') {
        resolution.justification = justification.trim();
      } else if (selectedAction === 'novo_pedido') {
        resolution.newOrderNumber = newOrderNumber.trim();
      }

      await onResolve(resolution);
    } catch (error) {
      console.error('Erro ao resolver divergência:', error);
      alert('Erro ao processar. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const criticalCount = validationResult.summary?.criticalDivergences || 0;
  const warningCount = validationResult.summary?.warningDivergences || 0;

  return (
    <div className={styles.divergenceContainer}>
      <div className={styles.header}>
        <AlertTriangle size={32} color="#f59e0b" />
        <h2>Divergências Encontradas</h2>
      </div>

      {/* Resumo */}
      <div className={styles.divergenceSummary}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryIcon} style={{ background: '#fee2e2' }}>
            <AlertTriangle size={24} color="#dc2626" />
          </div>
          <div>
            <div className={styles.summaryNumber}>{criticalCount}</div>
            <div className={styles.summaryLabel}>Críticas</div>
          </div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryIcon} style={{ background: '#fef3c7' }}>
            <AlertTriangle size={24} color="#f59e0b" />
          </div>
          <div>
            <div className={styles.summaryNumber}>{warningCount}</div>
            <div className={styles.summaryLabel}>Avisos</div>
          </div>
        </div>
      </div>

      {/* Tabela de Divergências */}
      <div className={styles.divergenceTable}>
        <h3>Detalhes das Divergências</h3>
        <div className={styles.tableWrapper}>
          <table className={styles.comparisonTable}>
            <thead>
              <tr>
                <th>Campo</th>
                <th>Valor no XML</th>
                <th>Valor no Pedido</th>
                <th>Severidade</th>
              </tr>
            </thead>
            <tbody>
              {validationResult.divergences.map((div, index) => (
                <tr key={index} className={div.severity === 'critico' ? styles.criticalRow : styles.warningRow}>
                  <td>
                    <strong>{div.field}</strong>
                    {div.description && (
                      <div className={styles.description}>{div.description}</div>
                    )}
                  </td>
                  <td>{div.xmlValue}</td>
                  <td>{div.orderValue}</td>
                  <td>
                    <span className={`${styles.badge} ${div.severity === 'critico' ? styles.criticalBadge : styles.warningBadge}`}>
                      {div.severity === 'critico' ? '❌ Crítico' : '⚠️ Aviso'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Opções de Resolução */}
      <div className={styles.resolutionOptions}>
        <h3>Como deseja proceder?</h3>
        <p className={styles.optionsSubtext}>
          Escolha uma das opções abaixo para resolver as divergências encontradas.
        </p>

        <div className={styles.optionCards}>
          {/* Opção A: Seguir com Justificativa */}
          <div
            className={`${styles.optionCard} ${selectedAction === 'seguir_com_justificativa' ? styles.selectedOption : ''}`}
            onClick={() => setSelectedAction('seguir_com_justificativa')}
          >
            <div className={styles.optionHeader}>
              <CheckCircle size={24} />
              <h4>Seguir mesmo assim</h4>
            </div>
            <p>Prosseguir com o pedido apesar das divergências, fornecendo uma justificativa.</p>
            {selectedAction === 'seguir_com_justificativa' && (
              <div className={styles.optionForm}>
                <label>Justificativa (obrigatório):</label>
                <textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Explique o motivo de prosseguir com as divergências..."
                  rows={4}
                  className={styles.textarea}
                  required
                />
              </div>
            )}
          </div>

          {/* Opção B: Modificar Pedido */}
          <div
            className={`${styles.optionCard} ${selectedAction === 'modificar_pedido' ? styles.selectedOption : ''}`}
            onClick={() => setSelectedAction('modificar_pedido')}
          >
            <div className={styles.optionHeader}>
              <Edit size={24} />
              <h4>Modificar pedido atual</h4>
            </div>
            <p>Corrigir os dados do pedido para corresponder ao XML da nota fiscal.</p>
            {selectedAction === 'modificar_pedido' && (
              <div className={styles.optionInfo}>
                <p>O pedido será atualizado e a validação será refeita automaticamente.</p>
              </div>
            )}
          </div>

          {/* Opção C: Novo Pedido */}
          <div
            className={`${styles.optionCard} ${selectedAction === 'novo_pedido' ? styles.selectedOption : ''}`}
            onClick={() => setSelectedAction('novo_pedido')}
          >
            <div className={styles.optionHeader}>
              <FileText size={24} />
              <h4>Fazer novo pedido</h4>
            </div>
            <p>Criar um novo pedido correto e excluir o atual do fluxo.</p>
            {selectedAction === 'novo_pedido' && (
              <div className={styles.optionForm}>
                <label>Número do novo pedido (obrigatório):</label>
                <input
                  type="text"
                  value={newOrderNumber}
                  onChange={(e) => setNewOrderNumber(e.target.value)}
                  placeholder="Ex: PED-2024-001234"
                  className={styles.input}
                  required
                />
                <div className={styles.warningNote}>
                  ⚠️ O novo pedido será automaticamente excluído da detecção automática.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Botões de Ação */}
      {selectedAction && (
        <div className={styles.submitSection}>
          <button
            className={styles.cancelButton}
            onClick={() => {
              setSelectedAction(null);
              setJustification('');
              setNewOrderNumber('');
            }}
            disabled={isSubmitting || isLoading}
          >
            Cancelar
          </button>
          <button
            className={styles.confirmButton}
            onClick={handleSubmit}
            disabled={
              isSubmitting ||
              isLoading ||
              (selectedAction === 'seguir_com_justificativa' && !justification.trim()) ||
              (selectedAction === 'novo_pedido' && !newOrderNumber.trim())
            }
          >
            {isSubmitting ? 'Processando...' : 'Confirmar Resolução'}
          </button>
        </div>
      )}

      {/* Relatório Textual */}
      <details className={styles.reportDetails}>
        <summary>Ver relatório completo</summary>
        <pre className={styles.reportText}>
          {XMLValidationService.generateDivergenceReport(validationResult)}
        </pre>
      </details>
    </div>
  );
}
