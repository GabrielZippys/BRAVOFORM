import { Timestamp } from 'firebase/firestore';
import type { XMLNFeData, PurchaseOrder, XMLValidationResult } from '../types';

/**
 * Serviço para validação de XML NF-e contra pedido de compra
 * Compara dados do XML com dados do pedido e identifica divergências
 */
export class XMLValidationService {
  // Tolerâncias para comparação
  private static readonly VALUE_TOLERANCE_PERCENT = 1; // 1% de tolerância em valores
  private static readonly CRITICAL_VALUE_TOLERANCE_PERCENT = 5; // 5% = crítico

  /**
   * Valida dados do XML contra o pedido de compra
   * @param xmlData Dados extraídos do XML
   * @param order Pedido de compra
   * @param validatedBy ID do usuário que está validando
   * @returns Resultado da validação com lista de divergências
   */
  static validateXMLAgainstOrder(
    xmlData: XMLNFeData,
    order: PurchaseOrder,
    validatedBy?: string
  ): XMLValidationResult {
    const divergences: XMLValidationResult['divergences'] = [];

    // 1. Validar CNPJ do fornecedor
    const cnpjDivergence = this.validateCNPJ(xmlData.cnpjEmitente, order.supplier.cnpj);
    if (cnpjDivergence) {
      divergences.push(cnpjDivergence);
    }

    // 2. Validar nome do fornecedor (comparação fuzzy)
    const nameDivergence = this.validateSupplierName(xmlData.nomeEmitente, order.supplier.name);
    if (nameDivergence) {
      divergences.push(nameDivergence);
    }

    // 3. Validar valor total
    const valueDivergence = this.validateTotalValue(xmlData.totalValue, order.totalValue);
    if (valueDivergence) {
      divergences.push(valueDivergence);
    }

    // 4. Validar itens (quantidade e valores)
    const itemsDivergences = this.validateItems(xmlData.items, order.items);
    divergences.push(...itemsDivergences);

    // 5. Validar condições de pagamento (se disponível)
    if (xmlData.paymentConditions && order.paymentConditions) {
      const paymentDivergence = this.validatePaymentConditions(
        xmlData.paymentConditions,
        order.paymentConditions
      );
      if (paymentDivergence) {
        divergences.push(paymentDivergence);
      }
    }

    // Calcular resumo
    const summary = {
      totalDivergences: divergences.length,
      criticalDivergences: divergences.filter(d => d.severity === 'critico').length,
      warningDivergences: divergences.filter(d => d.severity === 'aviso').length
    };

    // Determinar status
    const status: 'aprovado' | 'divergente' = 
      summary.criticalDivergences > 0 ? 'divergente' : 'aprovado';

    const result: XMLValidationResult = {
      status,
      divergences,
      validatedAt: Timestamp.now(),
      validatedBy,
      summary
    };

    console.log('Validação XML concluída:', result);
    return result;
  }

  /**
   * Valida CNPJ do emitente
   */
  private static validateCNPJ(
    xmlCNPJ: string,
    orderCNPJ: string
  ): XMLValidationResult['divergences'][0] | null {
    const cleanXML = xmlCNPJ.replace(/\D/g, '');
    const cleanOrder = orderCNPJ.replace(/\D/g, '');

    if (cleanXML !== cleanOrder) {
      return {
        field: 'CNPJ do Fornecedor',
        xmlValue: this.formatCNPJ(cleanXML),
        orderValue: this.formatCNPJ(cleanOrder),
        severity: 'critico',
        description: 'CNPJ do emitente no XML não corresponde ao CNPJ do fornecedor no pedido'
      };
    }

    return null;
  }

  /**
   * Valida nome do fornecedor (comparação fuzzy)
   */
  private static validateSupplierName(
    xmlName: string,
    orderName: string
  ): XMLValidationResult['divergences'][0] | null {
    const similarity = this.calculateStringSimilarity(
      xmlName.toLowerCase(),
      orderName.toLowerCase()
    );

    // Se similaridade < 70%, considerar divergência
    if (similarity < 0.7) {
      return {
        field: 'Nome do Fornecedor',
        xmlValue: xmlName,
        orderValue: orderName,
        severity: 'aviso',
        description: `Nomes diferentes (similaridade: ${Math.round(similarity * 100)}%)`
      };
    }

    return null;
  }

  /**
   * Valida valor total da nota
   */
  private static validateTotalValue(
    xmlValue: number,
    orderValue: number
  ): XMLValidationResult['divergences'][0] | null {
    const difference = Math.abs(xmlValue - orderValue);
    const percentDiff = (difference / orderValue) * 100;

    if (percentDiff > this.CRITICAL_VALUE_TOLERANCE_PERCENT) {
      return {
        field: 'Valor Total',
        xmlValue: this.formatCurrency(xmlValue),
        orderValue: this.formatCurrency(orderValue),
        severity: 'critico',
        description: `Diferença de ${percentDiff.toFixed(2)}% (R$ ${difference.toFixed(2)})`
      };
    } else if (percentDiff > this.VALUE_TOLERANCE_PERCENT) {
      return {
        field: 'Valor Total',
        xmlValue: this.formatCurrency(xmlValue),
        orderValue: this.formatCurrency(orderValue),
        severity: 'aviso',
        description: `Pequena diferença de ${percentDiff.toFixed(2)}% (R$ ${difference.toFixed(2)})`
      };
    }

    return null;
  }

  /**
   * Valida itens da nota contra itens do pedido
   */
  private static validateItems(
    xmlItems: XMLNFeData['items'],
    orderItems: PurchaseOrder['items']
  ): XMLValidationResult['divergences'] {
    const divergences: XMLValidationResult['divergences'] = [];

    // Verificar quantidade de itens
    if (xmlItems.length !== orderItems.length) {
      divergences.push({
        field: 'Quantidade de Itens',
        xmlValue: xmlItems.length.toString(),
        orderValue: orderItems.length.toString(),
        severity: 'critico',
        description: 'Número de itens no XML difere do pedido'
      });
    }

    // Validar cada item (tentar match por descrição)
    xmlItems.forEach((xmlItem, index) => {
      // Tentar encontrar item correspondente no pedido
      const matchingOrderItem = this.findMatchingItem(xmlItem, orderItems);

      if (!matchingOrderItem) {
        divergences.push({
          field: `Item ${index + 1} - Descrição`,
          xmlValue: xmlItem.description,
          orderValue: 'Não encontrado no pedido',
          severity: 'critico',
          description: 'Item do XML não encontrado no pedido'
        });
        return;
      }

      // Validar quantidade
      if (xmlItem.quantity !== matchingOrderItem.quantity) {
        divergences.push({
          field: `Item "${xmlItem.description}" - Quantidade`,
          xmlValue: xmlItem.quantity.toString(),
          orderValue: matchingOrderItem.quantity.toString(),
          severity: 'critico',
          description: 'Quantidade divergente'
        });
      }

      // Validar valor unitário
      const priceDiff = Math.abs(xmlItem.unitPrice - matchingOrderItem.unitPrice);
      const priceDiffPercent = (priceDiff / matchingOrderItem.unitPrice) * 100;

      if (priceDiffPercent > this.CRITICAL_VALUE_TOLERANCE_PERCENT) {
        divergences.push({
          field: `Item "${xmlItem.description}" - Valor Unitário`,
          xmlValue: this.formatCurrency(xmlItem.unitPrice),
          orderValue: this.formatCurrency(matchingOrderItem.unitPrice),
          severity: 'critico',
          description: `Diferença de ${priceDiffPercent.toFixed(2)}%`
        });
      } else if (priceDiffPercent > this.VALUE_TOLERANCE_PERCENT) {
        divergences.push({
          field: `Item "${xmlItem.description}" - Valor Unitário`,
          xmlValue: this.formatCurrency(xmlItem.unitPrice),
          orderValue: this.formatCurrency(matchingOrderItem.unitPrice),
          severity: 'aviso',
          description: `Pequena diferença de ${priceDiffPercent.toFixed(2)}%`
        });
      }
    });

    return divergences;
  }

  /**
   * Tenta encontrar item correspondente no pedido
   */
  private static findMatchingItem(
    xmlItem: XMLNFeData['items'][0],
    orderItems: PurchaseOrder['items']
  ): PurchaseOrder['items'][0] | null {
    // Tentar match exato por código
    if (xmlItem.ncm) {
      const byCode = orderItems.find(item => item.code === xmlItem.ncm);
      if (byCode) return byCode;
    }

    // Tentar match por similaridade de descrição
    let bestMatch: PurchaseOrder['items'][0] | null = null;
    let bestSimilarity = 0;

    orderItems.forEach(orderItem => {
      const similarity = this.calculateStringSimilarity(
        xmlItem.description.toLowerCase(),
        orderItem.description.toLowerCase()
      );

      if (similarity > bestSimilarity && similarity > 0.6) {
        bestSimilarity = similarity;
        bestMatch = orderItem;
      }
    });

    return bestMatch;
  }

  /**
   * Valida condições de pagamento
   */
  private static validatePaymentConditions(
    xmlConditions: string,
    orderConditions: string
  ): XMLValidationResult['divergences'][0] | null {
    const similarity = this.calculateStringSimilarity(
      xmlConditions.toLowerCase(),
      orderConditions.toLowerCase()
    );

    if (similarity < 0.5) {
      return {
        field: 'Condições de Pagamento',
        xmlValue: xmlConditions,
        orderValue: orderConditions,
        severity: 'aviso',
        description: 'Condições de pagamento diferentes'
      };
    }

    return null;
  }

  /**
   * Calcula similaridade entre duas strings (algoritmo de Levenshtein simplificado)
   * @returns Valor entre 0 e 1 (1 = idênticas)
   */
  private static calculateStringSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) {
      return 1.0;
    }

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calcula distância de Levenshtein entre duas strings
   */
  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Formata CNPJ para exibição
   */
  private static formatCNPJ(cnpj: string): string {
    const cleaned = cnpj.replace(/\D/g, '');
    if (cleaned.length !== 14) {
      return cnpj;
    }
    return cleaned.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      '$1.$2.$3/$4-$5'
    );
  }

  /**
   * Formata valor monetário
   */
  private static formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  }

  /**
   * Gera relatório textual das divergências
   */
  static generateDivergenceReport(result: XMLValidationResult): string {
    if (result.status === 'aprovado') {
      return '✅ Validação aprovada - Nenhuma divergência crítica encontrada.';
    }

    let report = `⚠️ Validação com divergências:\n\n`;
    report += `Total: ${result.summary?.totalDivergences || 0} divergências\n`;
    report += `Críticas: ${result.summary?.criticalDivergences || 0}\n`;
    report += `Avisos: ${result.summary?.warningDivergences || 0}\n\n`;

    report += `Detalhes:\n`;
    result.divergences.forEach((div, index) => {
      const icon = div.severity === 'critico' ? '❌' : '⚠️';
      report += `${index + 1}. ${icon} ${div.field}\n`;
      report += `   XML: ${div.xmlValue}\n`;
      report += `   Pedido: ${div.orderValue}\n`;
      if (div.description) {
        report += `   ${div.description}\n`;
      }
      report += `\n`;
    });

    return report;
  }
}
