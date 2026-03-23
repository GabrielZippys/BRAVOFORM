import { db } from '../../firebase/config';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  Timestamp,
  Unsubscribe,
  getDocs
} from 'firebase/firestore';
import type { PurchaseOrder, PedidoDetectionConfig } from '../types';
import { WorkflowInstanceService } from './workflowInstanceService';

/**
 * Serviço de detecção automática de novos pedidos de compra
 * Monitora a collection 'purchase_orders' e cria instâncias de workflow automaticamente
 */
export class PedidoDetectionService {
  private static unsubscribe: Unsubscribe | null = null;
  private static isRunning = false;

  /**
   * Inicia o monitoramento de novos pedidos
   * @param config Configuração de detecção
   */
  static startDetection(config: PedidoDetectionConfig): void {
    if (this.isRunning) {
      console.warn('PedidoDetectionService já está em execução');
      return;
    }

    if (!config.enabled) {
      console.log('PedidoDetectionService desabilitado na configuração');
      return;
    }

    console.log('Iniciando PedidoDetectionService...', config);

    // Query para pedidos novos que não estão excluídos
    const ordersQuery = query(
      collection(db, 'purchase_orders'),
      where('status', '==', 'novo'),
      where('isExcludedFromDetection', '==', false)
    );

    // Listener em tempo real
    this.unsubscribe = onSnapshot(
      ordersQuery,
      async (snapshot) => {
        // Processar apenas novos documentos (não modificações)
        const newOrders = snapshot.docChanges()
          .filter(change => change.type === 'added')
          .map(change => ({
            id: change.doc.id,
            ...change.doc.data()
          } as PurchaseOrder));

        if (newOrders.length > 0) {
          console.log(`Detectados ${newOrders.length} novos pedidos`);
          
          for (const order of newOrders) {
            await this.processNewOrder(order, config.workflowId);
          }
        }
      },
      (error) => {
        console.error('Erro no listener de pedidos:', error);
        this.isRunning = false;
      }
    );

    this.isRunning = true;
    console.log('PedidoDetectionService iniciado com sucesso');
  }

  /**
   * Para o monitoramento de pedidos
   */
  static stopDetection(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
      this.isRunning = false;
      console.log('PedidoDetectionService parado');
    }
  }

  /**
   * Processa um novo pedido criando uma instância de workflow
   * @param order Pedido de compra
   * @param workflowId ID do workflow a ser usado
   */
  private static async processNewOrder(
    order: PurchaseOrder,
    workflowId: string
  ): Promise<void> {
    try {
      console.log(`Processando pedido ${order.orderNumber}...`);

      // Verificar se já existe uma instância para este pedido
      if (order.workflowInstanceId) {
        console.log(`Pedido ${order.orderNumber} já possui instância de workflow`);
        return;
      }

      // Criar instância de workflow
      const instanceId = await WorkflowInstanceService.createInstance(
        workflowId,
        order.createdBy,
        order.createdByName || 'Desconhecido',
        order.companyId,
        order.departmentId
      );

      console.log(`Instância de workflow criada: ${instanceId}`);

      // Atualizar pedido com ID da instância e status
      const orderRef = doc(db, 'purchase_orders', order.id);
      await updateDoc(orderRef, {
        workflowInstanceId: instanceId,
        status: 'em_processo',
        updatedAt: Timestamp.now()
      });

      console.log(`Pedido ${order.orderNumber} vinculado à instância ${instanceId}`);
    } catch (error) {
      console.error(`Erro ao processar pedido ${order.orderNumber}:`, error);
      throw error;
    }
  }

  /**
   * Verifica manualmente por novos pedidos (alternativa ao listener)
   * Útil para ambientes onde listeners não são ideais
   */
  static async checkForNewOrders(
    workflowId: string,
    companyId?: string
  ): Promise<number> {
    try {
      const constraints = [
        where('status', '==', 'novo'),
        where('isExcludedFromDetection', '==', false)
      ];

      if (companyId) {
        constraints.push(where('companyId', '==', companyId));
      }

      const ordersQuery = query(
        collection(db, 'purchase_orders'),
        ...constraints
      );

      const snapshot = await getDocs(ordersQuery);
      const newOrders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as PurchaseOrder));

      console.log(`Encontrados ${newOrders.length} pedidos novos`);

      for (const order of newOrders) {
        if (!order.workflowInstanceId) {
          await this.processNewOrder(order, workflowId);
        }
      }

      return newOrders.length;
    } catch (error) {
      console.error('Erro ao verificar novos pedidos:', error);
      throw error;
    }
  }

  /**
   * Retorna o status do serviço
   */
  static getStatus(): { isRunning: boolean } {
    return { isRunning: this.isRunning };
  }
}
