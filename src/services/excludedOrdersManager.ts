import { db } from '../../firebase/config';
import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  Timestamp,
  updateDoc
} from 'firebase/firestore';
import type { ExcludedOrder, PurchaseOrder } from '../types';

/**
 * Gerenciador de pedidos excluídos da detecção automática
 * Evita que pedidos refeitos abram novos fluxos de workflow duplicados
 */
export class ExcludedOrdersManager {
  private static readonly COLLECTION = 'excluded_orders';

  /**
   * Adiciona um pedido à lista de exclusão
   * @param orderNumber Número do pedido a ser excluído
   * @param reason Motivo da exclusão
   * @param excludedBy ID do usuário que excluiu
   * @param excludedByName Nome do usuário que excluiu
   * @param workflowInstanceId ID da instância de workflow relacionada
   * @param parentOrderId ID do pedido original (opcional)
   */
  static async addExclusion(
    orderNumber: string,
    reason: 'refazer_fornecedor' | 'refazer_divergencia' | 'manual',
    excludedBy: string,
    excludedByName: string,
    workflowInstanceId: string,
    parentOrderId?: string
  ): Promise<string> {
    try {
      const exclusion: Omit<ExcludedOrder, 'id'> = {
        orderNumber,
        parentOrderId,
        reason,
        excludedBy,
        excludedByName,
        excludedAt: Timestamp.now(),
        workflowInstanceId
      };

      const docRef = await addDoc(collection(db, this.COLLECTION), exclusion);
      
      // Atualizar o pedido correspondente se existir
      await this.markOrderAsExcluded(orderNumber);

      console.log(`Pedido ${orderNumber} adicionado à lista de exclusão`);
      return docRef.id;
    } catch (error) {
      console.error('Erro ao adicionar exclusão:', error);
      throw error;
    }
  }

  /**
   * Marca um pedido como excluído da detecção
   * @param orderNumber Número do pedido
   */
  private static async markOrderAsExcluded(orderNumber: string): Promise<void> {
    try {
      const ordersQuery = query(
        collection(db, 'purchase_orders'),
        where('orderNumber', '==', orderNumber)
      );

      const snapshot = await getDocs(ordersQuery);
      
      if (!snapshot.empty) {
        const orderDoc = snapshot.docs[0];
        await updateDoc(orderDoc.ref, {
          isExcludedFromDetection: true,
          updatedAt: Timestamp.now()
        });
        console.log(`Pedido ${orderNumber} marcado como excluído`);
      }
    } catch (error) {
      console.error('Erro ao marcar pedido como excluído:', error);
      // Não lançar erro aqui para não interromper o fluxo principal
    }
  }

  /**
   * Remove um pedido da lista de exclusão
   * @param exclusionId ID da exclusão
   */
  static async removeExclusion(exclusionId: string): Promise<void> {
    try {
      // Buscar dados da exclusão antes de deletar
      const exclusionRef = doc(db, this.COLLECTION, exclusionId);
      const exclusionDoc = await getDoc(exclusionRef);

      if (exclusionDoc.exists()) {
        const exclusion = exclusionDoc.data() as ExcludedOrder;
        
        // Remover flag do pedido
        await this.unmarkOrderAsExcluded(exclusion.orderNumber);
        
        // Deletar exclusão
        await deleteDoc(exclusionRef);
        console.log(`Exclusão ${exclusionId} removida`);
      }
    } catch (error) {
      console.error('Erro ao remover exclusão:', error);
      throw error;
    }
  }

  /**
   * Remove a flag de exclusão de um pedido
   * @param orderNumber Número do pedido
   */
  private static async unmarkOrderAsExcluded(orderNumber: string): Promise<void> {
    try {
      const ordersQuery = query(
        collection(db, 'purchase_orders'),
        where('orderNumber', '==', orderNumber)
      );

      const snapshot = await getDocs(ordersQuery);
      
      if (!snapshot.empty) {
        const orderDoc = snapshot.docs[0];
        await updateDoc(orderDoc.ref, {
          isExcludedFromDetection: false,
          updatedAt: Timestamp.now()
        });
        console.log(`Flag de exclusão removida do pedido ${orderNumber}`);
      }
    } catch (error) {
      console.error('Erro ao remover flag de exclusão:', error);
    }
  }

  /**
   * Verifica se um pedido está na lista de exclusão
   * @param orderNumber Número do pedido
   * @returns true se o pedido está excluído
   */
  static async isExcluded(orderNumber: string): Promise<boolean> {
    try {
      const exclusionsQuery = query(
        collection(db, this.COLLECTION),
        where('orderNumber', '==', orderNumber)
      );

      const snapshot = await getDocs(exclusionsQuery);
      return !snapshot.empty;
    } catch (error) {
      console.error('Erro ao verificar exclusão:', error);
      return false;
    }
  }

  /**
   * Lista todas as exclusões
   * @param workflowInstanceId Filtrar por instância de workflow (opcional)
   * @returns Array de exclusões
   */
  static async listExclusions(workflowInstanceId?: string): Promise<ExcludedOrder[]> {
    try {
      let exclusionsQuery;

      if (workflowInstanceId) {
        exclusionsQuery = query(
          collection(db, this.COLLECTION),
          where('workflowInstanceId', '==', workflowInstanceId)
        );
      } else {
        exclusionsQuery = collection(db, this.COLLECTION);
      }

      const snapshot = await getDocs(exclusionsQuery);
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ExcludedOrder));
    } catch (error) {
      console.error('Erro ao listar exclusões:', error);
      throw error;
    }
  }

  /**
   * Busca exclusões por pedido pai (pedido original)
   * @param parentOrderId ID do pedido pai
   * @returns Array de exclusões relacionadas
   */
  static async getExclusionsByParent(parentOrderId: string): Promise<ExcludedOrder[]> {
    try {
      const exclusionsQuery = query(
        collection(db, this.COLLECTION),
        where('parentOrderId', '==', parentOrderId)
      );

      const snapshot = await getDocs(exclusionsQuery);
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ExcludedOrder));
    } catch (error) {
      console.error('Erro ao buscar exclusões por pedido pai:', error);
      throw error;
    }
  }

  /**
   * Limpa exclusões antigas (opcional - para manutenção)
   * @param daysOld Número de dias para considerar como antiga
   * @returns Número de exclusões removidas
   */
  static async cleanupOldExclusions(daysOld: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);
      const cutoffTimestamp = Timestamp.fromDate(cutoffDate);

      const snapshot = await getDocs(collection(db, this.COLLECTION));
      let removedCount = 0;

      for (const doc of snapshot.docs) {
        const exclusion = doc.data() as ExcludedOrder;
        
        if (exclusion.excludedAt.toMillis() < cutoffTimestamp.toMillis()) {
          await deleteDoc(doc.ref);
          removedCount++;
        }
      }

      console.log(`${removedCount} exclusões antigas removidas`);
      return removedCount;
    } catch (error) {
      console.error('Erro ao limpar exclusões antigas:', error);
      throw error;
    }
  }

  /**
   * Obtém estatísticas das exclusões
   * @returns Objeto com estatísticas
   */
  static async getStatistics(): Promise<{
    total: number;
    byReason: Record<string, number>;
    recentExclusions: number;
  }> {
    try {
      const snapshot = await getDocs(collection(db, this.COLLECTION));
      const exclusions = snapshot.docs.map(doc => doc.data() as ExcludedOrder);

      const byReason: Record<string, number> = {
        refazer_fornecedor: 0,
        refazer_divergencia: 0,
        manual: 0
      };

      const last7Days = new Date();
      last7Days.setDate(last7Days.getDate() - 7);
      const last7DaysTimestamp = Timestamp.fromDate(last7Days);

      let recentExclusions = 0;

      exclusions.forEach(exclusion => {
        byReason[exclusion.reason]++;
        
        if (exclusion.excludedAt.toMillis() >= last7DaysTimestamp.toMillis()) {
          recentExclusions++;
        }
      });

      return {
        total: exclusions.length,
        byReason,
        recentExclusions
      };
    } catch (error) {
      console.error('Erro ao obter estatísticas:', error);
      throw error;
    }
  }
}
