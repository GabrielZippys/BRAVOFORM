'use client';

import React, { useState } from 'react';
import { ClipboardCheck, Camera, CheckCircle, AlertCircle } from 'lucide-react';
import type { XMLNFeData, ReceivingFormData } from '@/types';
import { Timestamp } from 'firebase/firestore';
import styles from '../../app/styles/PurchaseWorkflow.module.css';

interface ReceivingFormStepProps {
  nfeData: XMLNFeData;
  onSubmit: (formData: Omit<ReceivingFormData, 'completedBy' | 'completedByName' | 'completedAt'>) => Promise<void>;
  isLoading?: boolean;
}

/**
 * Componente para formulário de recebimento de materiais
 * Permite conferir itens recebidos vs NF-e e registrar condições
 */
export default function ReceivingFormStep({
  nfeData,
  onSubmit,
  isLoading = false
}: ReceivingFormStepProps) {
  const [receivingDate, setReceivingDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [inspectedItems, setInspectedItems] = useState(
    nfeData.items.map(item => ({
      description: item.description,
      nfeQuantity: item.quantity,
      receivedQuantity: item.quantity,
      condition: 'conforme' as const,
      notes: ''
    }))
  );
  const [generalNotes, setGeneralNotes] = useState('');
  const [inspectorSignature, setInspectorSignature] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleItemChange = (
    index: number,
    field: keyof typeof inspectedItems[0],
    value: any
  ) => {
    const updated = [...inspectedItems];
    updated[index] = { ...updated[index], [field]: value };
    setInspectedItems(updated);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setPhotos(prev => [...prev, event.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inspectorSignature.trim()) {
      alert('Assinatura do conferente é obrigatória');
      return;
    }

    // Verificar se todos os itens foram conferidos
    const allItemsChecked = inspectedItems.every(item => item.receivedQuantity >= 0);
    if (!allItemsChecked) {
      alert('Por favor, confira todos os itens');
      return;
    }

    setIsSubmitting(true);
    try {
      const formData: Omit<ReceivingFormData, 'completedBy' | 'completedByName' | 'completedAt'> = {
        receivingDate: Timestamp.fromDate(new Date(receivingDate)),
        nfeNumber: nfeData.numeroNFe,
        supplier: nfeData.nomeEmitente,
        inspectedItems,
        generalNotes: generalNotes.trim() || undefined,
        photos: photos.length > 0 ? photos : undefined,
        inspectorSignature: inspectorSignature.trim(),
        inspectorId: '', // Será preenchido pelo serviço
        discrepancies: {
          hasDiscrepancies: inspectedItems.some(
            item => item.condition !== 'conforme' || item.receivedQuantity !== item.nfeQuantity
          ),
          totalDiscrepancies: inspectedItems.filter(
            item => item.condition !== 'conforme' || item.receivedQuantity !== item.nfeQuantity
          ).length,
          details: inspectedItems
            .filter(item => item.condition !== 'conforme' || item.receivedQuantity !== item.nfeQuantity)
            .map(item => `${item.description}: ${item.condition}`)
            .join('; ')
        }
      };

      await onSubmit(formData);
    } catch (error) {
      console.error('Erro ao enviar formulário:', error);
      alert('Erro ao processar. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalDiscrepancies = inspectedItems.filter(
    item => item.condition !== 'conforme' || item.receivedQuantity !== item.nfeQuantity
  ).length;

  return (
    <div className={styles.receivingContainer}>
      <div className={styles.header}>
        <ClipboardCheck size={32} />
        <h2>Formulário de Recebimento</h2>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Informações da NF-e */}
        <div className={styles.nfeInfoSection}>
          <h3>Informações da Nota Fiscal</h3>
          <div className={styles.nfeInfoGrid}>
            <div className={styles.infoItem}>
              <span className={styles.label}>NF-e:</span>
              <span className={styles.value}>{nfeData.numeroNFe}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.label}>Fornecedor:</span>
              <span className={styles.value}>{nfeData.nomeEmitente}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.label}>Data de Emissão:</span>
              <span className={styles.value}>
                {new Date(nfeData.dataEmissao).toLocaleDateString('pt-BR')}
              </span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.label}>Data de Recebimento:</span>
              <input
                type="date"
                value={receivingDate}
                onChange={(e) => setReceivingDate(e.target.value)}
                className={styles.input}
                required
              />
            </div>
          </div>
        </div>

        {/* Status de Discrepâncias */}
        {totalDiscrepancies > 0 && (
          <div className={styles.discrepancyAlert}>
            <AlertCircle size={20} />
            <span>{totalDiscrepancies} item(ns) com discrepância detectada(s)</span>
          </div>
        )}

        {/* Conferência de Itens */}
        <div className={styles.itemsInspectionSection}>
          <h3>Conferência de Itens</h3>
          <div className={styles.tableWrapper}>
            <table className={styles.inspectionTable}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Descrição</th>
                  <th>Qtd. NF-e</th>
                  <th>Qtd. Recebida</th>
                  <th>Condição</th>
                  <th>Observações</th>
                </tr>
              </thead>
              <tbody>
                {inspectedItems.map((item, index) => (
                  <tr
                    key={index}
                    className={
                      item.condition !== 'conforme' || item.receivedQuantity !== item.nfeQuantity
                        ? styles.discrepancyRow
                        : ''
                    }
                  >
                    <td>{index + 1}</td>
                    <td>{item.description}</td>
                    <td className={styles.numberCell}>{item.nfeQuantity}</td>
                    <td>
                      <input
                        type="number"
                        value={item.receivedQuantity}
                        onChange={(e) =>
                          handleItemChange(index, 'receivedQuantity', parseFloat(e.target.value) || 0)
                        }
                        className={styles.quantityInput}
                        min="0"
                        step="0.01"
                        required
                      />
                    </td>
                    <td>
                      <select
                        value={item.condition}
                        onChange={(e) =>
                          handleItemChange(index, 'condition', e.target.value as any)
                        }
                        className={styles.conditionSelect}
                        required
                      >
                        <option value="conforme">✅ Conforme</option>
                        <option value="avariado">⚠️ Avariado</option>
                        <option value="faltante">❌ Faltante</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={item.notes}
                        onChange={(e) => handleItemChange(index, 'notes', e.target.value)}
                        className={styles.notesInput}
                        placeholder="Observações..."
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Observações Gerais */}
        <div className={styles.formGroup}>
          <label htmlFor="generalNotes">Observações Gerais</label>
          <textarea
            id="generalNotes"
            value={generalNotes}
            onChange={(e) => setGeneralNotes(e.target.value)}
            placeholder="Adicione observações sobre o recebimento..."
            rows={4}
            className={styles.textarea}
          />
        </div>

        {/* Upload de Fotos */}
        <div className={styles.formGroup}>
          <label>
            <Camera size={18} />
            Fotos do Recebimento (opcional)
          </label>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handlePhotoUpload}
            className={styles.fileInput}
            id="photoInput"
          />
          <label htmlFor="photoInput" className={styles.photoUploadButton}>
            Adicionar Fotos
          </label>

          {photos.length > 0 && (
            <div className={styles.photoGrid}>
              {photos.map((photo, index) => (
                <div key={index} className={styles.photoPreview}>
                  <img src={photo} alt={`Foto ${index + 1}`} />
                  <button
                    type="button"
                    onClick={() => removePhoto(index)}
                    className={styles.removePhotoButton}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Assinatura do Conferente */}
        <div className={styles.formGroup}>
          <label htmlFor="signature">Assinatura do Conferente *</label>
          <input
            id="signature"
            type="text"
            value={inspectorSignature}
            onChange={(e) => setInspectorSignature(e.target.value)}
            placeholder="Nome completo do conferente"
            className={styles.input}
            required
          />
        </div>

        {/* Botões de Ação */}
        <div className={styles.submitSection}>
          <button
            type="submit"
            className={styles.confirmButton}
            disabled={isSubmitting || isLoading || !inspectorSignature.trim()}
          >
            {isSubmitting ? 'Processando...' : (
              <>
                <CheckCircle size={20} />
                Concluir Recebimento
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
