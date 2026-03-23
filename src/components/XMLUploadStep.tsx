'use client';

import React, { useState } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, Eye } from 'lucide-react';
import { XMLParserService } from '@/services/xmlParserService';
import type { XMLNFeData } from '@/types';
import styles from '../../app/styles/PurchaseWorkflow.module.css';

interface XMLUploadStepProps {
  onUpload: (xmlData: XMLNFeData, xmlFile: File) => Promise<void>;
  isLoading?: boolean;
}

/**
 * Componente para upload e validação de XML NF-e
 * Faz preview dos dados extraídos antes de confirmar
 */
export default function XMLUploadStep({
  onUpload,
  isLoading = false
}: XMLUploadStepProps) {
  const [file, setFile] = useState<File | null>(null);
  const [xmlData, setXmlData] = useState<XMLNFeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validar extensão
    if (!selectedFile.name.toLowerCase().endsWith('.xml')) {
      setError('Por favor, selecione um arquivo XML válido');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setXmlData(null);
    setShowPreview(false);

    // Processar XML
    await processXML(selectedFile);
  };

  const processXML = async (xmlFile: File) => {
    setIsProcessing(true);
    setError(null);

    try {
      // Ler conteúdo do arquivo
      const content = await readFileAsText(xmlFile);

      // Validar se é NF-e
      const isValid = XMLParserService.validateNFeXML(content);
      if (!isValid) {
        throw new Error('O arquivo XML não é uma NF-e válida');
      }

      // Fazer parse do XML
      const parsedData = await XMLParserService.parseNFe(
        content,
        '', // URL será definida após upload no Storage
        xmlFile.name
      );

      setXmlData(parsedData);
      setShowPreview(true);
    } catch (err) {
      console.error('Erro ao processar XML:', err);
      setError(err instanceof Error ? err.message : 'Erro ao processar XML');
      setFile(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = (e) => reject(new Error('Erro ao ler arquivo'));
      reader.readAsText(file);
    });
  };

  const handleConfirm = async () => {
    if (!xmlData || !file) return;

    try {
      await onUpload(xmlData, file);
    } catch (err) {
      console.error('Erro ao fazer upload:', err);
      setError('Erro ao processar upload. Tente novamente.');
    }
  };

  const handleReset = () => {
    setFile(null);
    setXmlData(null);
    setError(null);
    setShowPreview(false);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  return (
    <div className={styles.xmlUploadContainer}>
      <div className={styles.header}>
        <FileText size={32} />
        <h2>Upload de XML da NF-e</h2>
      </div>

      {/* Área de Upload */}
      {!xmlData && (
        <div className={styles.uploadSection}>
          <div className={styles.uploadArea}>
            <Upload size={48} className={styles.uploadIcon} />
            <h3>Selecione o arquivo XML da Nota Fiscal</h3>
            <p>Arraste e solte ou clique para selecionar</p>
            <input
              type="file"
              accept=".xml"
              onChange={handleFileChange}
              className={styles.fileInput}
              id="xmlFileInput"
              disabled={isProcessing || isLoading}
            />
            <label htmlFor="xmlFileInput" className={styles.uploadButton}>
              {isProcessing ? 'Processando...' : 'Selecionar Arquivo XML'}
            </label>
          </div>

          {error && (
            <div className={styles.errorBox}>
              <AlertCircle size={20} />
              <p>{error}</p>
            </div>
          )}
        </div>
      )}

      {/* Preview dos Dados */}
      {xmlData && showPreview && (
        <div className={styles.previewSection}>
          <div className={styles.successBox}>
            <CheckCircle size={20} />
            <p>XML processado com sucesso!</p>
          </div>

          <div className={styles.previewHeader}>
            <Eye size={20} />
            <h3>Dados Extraídos do XML</h3>
          </div>

          <div className={styles.previewGrid}>
            <div className={styles.previewCard}>
              <h4>Informações da Nota</h4>
              <div className={styles.previewInfo}>
                <div className={styles.infoRow}>
                  <span className={styles.label}>Número NF-e:</span>
                  <span className={styles.value}>{xmlData.numeroNFe}</span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.label}>Série:</span>
                  <span className={styles.value}>{xmlData.serieNFe}</span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.label}>Data de Emissão:</span>
                  <span className={styles.value}>
                    {new Date(xmlData.dataEmissao).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                {xmlData.chaveAcesso && (
                  <div className={styles.infoRow}>
                    <span className={styles.label}>Chave de Acesso:</span>
                    <span className={styles.value} style={{ fontSize: '12px' }}>
                      {xmlData.chaveAcesso}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className={styles.previewCard}>
              <h4>Emitente</h4>
              <div className={styles.previewInfo}>
                <div className={styles.infoRow}>
                  <span className={styles.label}>Razão Social:</span>
                  <span className={styles.value}>{xmlData.nomeEmitente}</span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.label}>CNPJ:</span>
                  <span className={styles.value}>
                    {XMLParserService.formatCNPJ(xmlData.cnpjEmitente)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.itemsPreview}>
            <h4>Itens da Nota ({xmlData.items.length})</h4>
            <div className={styles.tableWrapper}>
              <table className={styles.itemsTable}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Descrição</th>
                    <th>Quantidade</th>
                    <th>Valor Unit.</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {xmlData.items.map((item, index) => (
                    <tr key={index}>
                      <td>{index + 1}</td>
                      <td>{item.description}</td>
                      <td className={styles.numberCell}>
                        {item.quantity} {item.unit || 'UN'}
                      </td>
                      <td className={styles.numberCell}>
                        {formatCurrency(item.unitPrice)}
                      </td>
                      <td className={styles.numberCell}>
                        {formatCurrency(item.totalPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} className={styles.totalLabel}>Total da Nota:</td>
                    <td className={`${styles.numberCell} ${styles.totalValue}`}>
                      {formatCurrency(xmlData.totalValue)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {xmlData.paymentConditions && (
            <div className={styles.paymentInfo}>
              <strong>Condições de Pagamento:</strong> {xmlData.paymentConditions}
            </div>
          )}

          <div className={styles.previewActions}>
            <button
              className={styles.cancelButton}
              onClick={handleReset}
              disabled={isLoading}
            >
              Cancelar
            </button>
            <button
              className={styles.confirmButton}
              onClick={handleConfirm}
              disabled={isLoading}
            >
              {isLoading ? 'Processando...' : 'Confirmar e Validar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
