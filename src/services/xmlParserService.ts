import { Timestamp } from 'firebase/firestore';
import type { XMLNFeData } from '../types';

/**
 * Serviço para parsing de XML de NF-e (Nota Fiscal Eletrônica)
 * Extrai dados estruturados do XML no padrão SEFAZ
 */
export class XMLParserService {
  /**
   * Faz o parse de um arquivo XML de NF-e
   * @param xmlContent Conteúdo do arquivo XML como string
   * @param xmlFileUrl URL do arquivo no Storage
   * @param xmlFileName Nome do arquivo
   * @returns Dados estruturados da NF-e
   */
  static async parseNFe(
    xmlContent: string,
    xmlFileUrl: string,
    xmlFileName?: string
  ): Promise<XMLNFeData> {
    try {
      // Parse do XML usando DOMParser (nativo do browser)
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

      // Verificar erros de parsing
      const parserError = xmlDoc.querySelector('parsererror');
      if (parserError) {
        throw new Error('Erro ao fazer parse do XML: ' + parserError.textContent);
      }

      // Extrair dados do emitente
      const emit = xmlDoc.querySelector('emit');
      if (!emit) {
        throw new Error('Tag <emit> não encontrada no XML');
      }

      const cnpjEmitente = this.getTextContent(emit, 'CNPJ');
      const nomeEmitente = this.getTextContent(emit, 'xNome');

      // Extrair dados da NF-e
      const ide = xmlDoc.querySelector('ide');
      if (!ide) {
        throw new Error('Tag <ide> não encontrada no XML');
      }

      const numeroNFe = this.getTextContent(ide, 'nNF');
      const serieNFe = this.getTextContent(ide, 'serie');
      const dataEmissao = this.getTextContent(ide, 'dhEmi') || this.getTextContent(ide, 'dEmi');

      // Chave de acesso (opcional)
      const infNFe = xmlDoc.querySelector('infNFe');
      const chaveAcesso = infNFe?.getAttribute('Id')?.replace('NFe', '') || undefined;

      // Extrair itens da nota
      const detElements = xmlDoc.querySelectorAll('det');
      const items = Array.from(detElements).map((det, index) => {
        const prod = det.querySelector('prod');
        if (!prod) {
          throw new Error(`Tag <prod> não encontrada no item ${index + 1}`);
        }

        return {
          description: this.getTextContent(prod, 'xProd'),
          quantity: parseFloat(this.getTextContent(prod, 'qCom')) || 0,
          unitPrice: parseFloat(this.getTextContent(prod, 'vUnCom')) || 0,
          totalPrice: parseFloat(this.getTextContent(prod, 'vProd')) || 0,
          ncm: this.getTextContent(prod, 'NCM') || undefined,
          cfop: this.getTextContent(prod, 'CFOP') || undefined,
          unit: this.getTextContent(prod, 'uCom') || undefined
        };
      });

      // Extrair valor total
      const total = xmlDoc.querySelector('total ICMSTot');
      const totalValue = total ? parseFloat(this.getTextContent(total, 'vNF')) || 0 : 0;

      // Condições de pagamento (opcional)
      const pag = xmlDoc.querySelector('pag');
      let paymentConditions: string | undefined;
      if (pag) {
        const tPag = this.getTextContent(pag, 'tPag');
        const vPag = this.getTextContent(pag, 'vPag');
        paymentConditions = tPag ? `Tipo: ${this.getPaymentType(tPag)}${vPag ? ` - Valor: R$ ${vPag}` : ''}` : undefined;
      }

      const nfeData: XMLNFeData = {
        cnpjEmitente,
        nomeEmitente,
        numeroNFe,
        serieNFe,
        dataEmissao,
        chaveAcesso,
        items,
        totalValue,
        paymentConditions,
        xmlFileUrl,
        xmlFileName,
        parsedAt: Timestamp.now()
      };

      console.log('XML parseado com sucesso:', nfeData);
      return nfeData;
    } catch (error) {
      console.error('Erro ao fazer parse do XML:', error);
      throw new Error(`Falha ao processar XML: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  /**
   * Extrai o conteúdo de texto de uma tag XML
   * @param parent Elemento pai
   * @param tagName Nome da tag
   * @returns Conteúdo de texto ou string vazia
   */
  private static getTextContent(parent: Element, tagName: string): string {
    const element = parent.querySelector(tagName);
    return element?.textContent?.trim() || '';
  }

  /**
   * Converte código de tipo de pagamento em descrição
   * @param tPag Código do tipo de pagamento
   * @returns Descrição do tipo de pagamento
   */
  private static getPaymentType(tPag: string): string {
    const types: Record<string, string> = {
      '01': 'Dinheiro',
      '02': 'Cheque',
      '03': 'Cartão de Crédito',
      '04': 'Cartão de Débito',
      '05': 'Crédito Loja',
      '10': 'Vale Alimentação',
      '11': 'Vale Refeição',
      '12': 'Vale Presente',
      '13': 'Vale Combustível',
      '14': 'Duplicata Mercantil',
      '15': 'Boleto Bancário',
      '90': 'Sem Pagamento',
      '99': 'Outros'
    };
    return types[tPag] || `Código ${tPag}`;
  }

  /**
   * Valida se o XML é uma NF-e válida
   * @param xmlContent Conteúdo do XML
   * @returns true se é uma NF-e válida
   */
  static validateNFeXML(xmlContent: string): boolean {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

      // Verificar erro de parsing
      const parserError = xmlDoc.querySelector('parsererror');
      if (parserError) {
        return false;
      }

      // Verificar tags obrigatórias
      const hasNFe = xmlDoc.querySelector('NFe') !== null || xmlDoc.querySelector('nfeProc') !== null;
      const hasEmit = xmlDoc.querySelector('emit') !== null;
      const hasIde = xmlDoc.querySelector('ide') !== null;
      const hasDet = xmlDoc.querySelector('det') !== null;

      return hasNFe && hasEmit && hasIde && hasDet;
    } catch (error) {
      console.error('Erro ao validar XML:', error);
      return false;
    }
  }

  /**
   * Extrai informações resumidas do XML (para preview)
   * @param xmlContent Conteúdo do XML
   * @returns Objeto com informações resumidas
   */
  static getXMLSummary(xmlContent: string): {
    numeroNFe: string;
    emitente: string;
    valor: string;
    itens: number;
  } | null {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

      const emit = xmlDoc.querySelector('emit');
      const ide = xmlDoc.querySelector('ide');
      const total = xmlDoc.querySelector('total ICMSTot');
      const detElements = xmlDoc.querySelectorAll('det');

      if (!emit || !ide) {
        return null;
      }

      return {
        numeroNFe: this.getTextContent(ide, 'nNF'),
        emitente: this.getTextContent(emit, 'xNome'),
        valor: total ? this.getTextContent(total, 'vNF') : '0.00',
        itens: detElements.length
      };
    } catch (error) {
      console.error('Erro ao extrair resumo do XML:', error);
      return null;
    }
  }

  /**
   * Formata CNPJ para exibição
   * @param cnpj CNPJ sem formatação
   * @returns CNPJ formatado (XX.XXX.XXX/XXXX-XX)
   */
  static formatCNPJ(cnpj: string): string {
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
   * @param value Valor numérico
   * @returns Valor formatado (R$ X.XXX,XX)
   */
  static formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  }
}
