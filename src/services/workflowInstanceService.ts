import { db } from '../../firebase/config';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  serverTimestamp,
  addDoc,
  deleteDoc,
  Timestamp,
  orderBy,
  limit
} from 'firebase/firestore';
import type { 
  WorkflowInstance,
  StageHistoryEntry,
  WorkflowDocument,
  WorkflowStage
} from '../types';
import { NotificationService } from './notificationService';

/**
 * Serviço para gerenciamento de Instâncias de Workflow
 * Responsável pela execução real de workflows pelos colaboradores
 */
export class WorkflowInstanceService {
  /**
   * Cria uma nova instância de workflow
   * @param workflowId - ID do workflow template
   * @param assignedTo - ID do colaborador inicial
   * @param assignedToName - Nome do colaborador
   * @param companyId - ID da empresa
   * @param departmentId - ID do departamento
   */
  static async createInstance(
    workflowId: string,
    assignedTo: string,
    assignedToName: string,
    companyId: string,
    departmentId: string
  ): Promise<string> {
    // Carregar workflow template
    const workflowRef = doc(db, 'workflows', workflowId);
    const workflowDoc = await getDoc(workflowRef);
    
    if (!workflowDoc.exists()) {
      throw new Error('Workflow não encontrado');
    }

    const workflow = workflowDoc.data() as WorkflowDocument;

    if (!workflow.isActive) {
      throw new Error('Workflow está inativo');
    }

    if (workflow.stages.length === 0) {
      throw new Error('Workflow não possui etapas');
    }

    // Primeira etapa
    const firstStage = workflow.stages[0];

    // Usar assignedUsers da primeira etapa se disponível, senão usar o parâmetro
    let finalAssignedTo = assignedTo;
    let finalAssignedToName = assignedToName;
    
    if (firstStage.assignedUsers && firstStage.assignedUsers.length > 0) {
      finalAssignedTo = firstStage.assignedUsers[0];
      
      // Buscar nome do colaborador
      const collaboratorsSnapshot = await getDocs(collection(db, 'collaborators'));
      const collaborator = collaboratorsSnapshot.docs.find(d => d.id === finalAssignedTo);
      finalAssignedToName = collaborator?.data().username || 'Colaborador';
    }

    const instance: Omit<WorkflowInstance, 'id'> = {
      workflowId,
      workflowName: workflow.name,
      currentStageId: firstStage.id,
      currentStageIndex: 0,
      assignedTo: finalAssignedTo,
      assignedToName: finalAssignedToName,
      status: 'in_progress',
      startedAt: serverTimestamp() as Timestamp,
      stageHistory: [{
        stageId: firstStage.id,
        stageName: firstStage.name,
        enteredAt: Timestamp.now(), // Usar Timestamp.now() ao invés de serverTimestamp() em arrays
        action: 'validated'
      }],
      fieldData: {},
      companyId,
      departmentId
    };

    const docRef = await addDoc(collection(db, 'workflow_instances'), instance);
    
    // Notificar colaborador atribuído (TODO: obter phone e email do colaborador)
    // await NotificationService.notifyWorkflowAssigned(
    //   collaboratorPhone,
    //   collaboratorEmail,
    //   workflow.name,
    //   workflow.createdBy
    // );
    
    return docRef.id;
  }

  /**
   * Avança instância para próxima etapa
   * @param instanceId - ID da instância
   * @param userId - ID do usuário que está avançando
   * @param userName - Nome do usuário
   * @param action - Ação tomada (validated, rejected, cancelled)
   * @param fieldData - Dados preenchidos na etapa
   * @param comment - Comentário opcional
   * @param attachments - Anexos opcionais
   */
  static async advanceStage(
    instanceId: string,
    userId: string,
    userName: string,
    action: 'validated' | 'rejected' | 'cancelled',
    fieldData: Record<string, any>,
    comment?: string,
    attachments?: string[]
  ): Promise<void> {
    const instanceRef = doc(db, 'workflow_instances', instanceId);
    const instanceDoc = await getDoc(instanceRef);
    
    if (!instanceDoc.exists()) {
      throw new Error('Instância não encontrada');
    }

    const instance = instanceDoc.data() as WorkflowInstance;

    // Carregar workflow template
    const workflowRef = doc(db, 'workflows', instance.workflowId);
    const workflowDoc = await getDoc(workflowRef);
    
    if (!workflowDoc.exists()) {
      throw new Error('Workflow não encontrado');
    }

    const workflow = workflowDoc.data() as WorkflowDocument;
    const currentStage = workflow.stages[instance.currentStageIndex];

    // Calcular duração na etapa atual
    const lastHistoryEntry = instance.stageHistory[instance.stageHistory.length - 1];
    const duration = lastHistoryEntry?.enteredAt
      ? Date.now() - (lastHistoryEntry.enteredAt as any).toMillis()
      : 0;

    // Atualizar última entrada do histórico com conclusão
    const updatedHistory = [...instance.stageHistory];
    updatedHistory[updatedHistory.length - 1] = {
      ...lastHistoryEntry,
      completedAt: Timestamp.now(),
      completedBy: userId,
      completedByName: userName,
      action,
      comment,
      attachments,
      duration
    };

    // Mesclar dados preenchidos
    const updatedFieldData = {
      ...instance.fieldData,
      ...fieldData
    };

    if (action === 'rejected') {
      // Rejeitar: voltar para etapa anterior ou cancelar se for a primeira
      if (instance.currentStageIndex === 0) {
        await updateDoc(instanceRef, {
          status: 'rejected',
          completedAt: serverTimestamp(),
          stageHistory: updatedHistory,
          fieldData: updatedFieldData
        });
      } else {
        const previousStageIndex = instance.currentStageIndex - 1;
        const previousStage = workflow.stages[previousStageIndex];

        updatedHistory.push({
          stageId: previousStage.id,
          stageName: previousStage.name,
          enteredAt: Timestamp.now(),
          action: 'validated'
        });

        await updateDoc(instanceRef, {
          currentStageId: previousStage.id,
          currentStageIndex: previousStageIndex,
          stageHistory: updatedHistory,
          fieldData: updatedFieldData
        });
      }
    } else if (action === 'cancelled') {
      // Cancelar workflow
      await updateDoc(instanceRef, {
        status: 'cancelled',
        completedAt: serverTimestamp(),
        stageHistory: updatedHistory,
        fieldData: updatedFieldData
      });
    } else {
      // Validar e avançar
      const nextStageIndex = instance.currentStageIndex + 1;

      if (nextStageIndex >= workflow.stages.length) {
        // Última etapa - concluir workflow
        await updateDoc(instanceRef, {
          status: 'completed',
          completedAt: serverTimestamp(),
          stageHistory: updatedHistory,
          fieldData: updatedFieldData
        });

        // Notificar conclusão (TODO: obter phone e email)
        // await NotificationService.notifyWorkflowCompleted(
        //   collaboratorPhone,
        //   collaboratorEmail,
        //   instance.workflowName,
        //   workflow.createdBy
        // );
      } else {
        // Avançar para próxima etapa
        const nextStage = workflow.stages[nextStageIndex];

        updatedHistory.push({
          stageId: nextStage.id,
          stageName: nextStage.name,
          enteredAt: Timestamp.now(),
          action: 'validated'
        });

        // Atribuir ao primeiro usuário da próxima etapa
        let nextAssignedTo = instance.assignedTo;
        let nextAssignedToName = instance.assignedToName;
        
        if (nextStage.assignedUsers && nextStage.assignedUsers.length > 0) {
          nextAssignedTo = nextStage.assignedUsers[0];
          
          // Buscar nome do colaborador
          const { getDocs, collection } = await import('firebase/firestore');
          const { db } = await import('../../firebase/config');
          const collaboratorsSnapshot = await getDocs(collection(db, 'collaborators'));
          const collaborator = collaboratorsSnapshot.docs.find(d => d.id === nextAssignedTo);
          nextAssignedToName = collaborator?.data().username || 'Colaborador';
        }

        await updateDoc(instanceRef, {
          currentStageId: nextStage.id,
          currentStageIndex: nextStageIndex,
          assignedTo: nextAssignedTo,
          assignedToName: nextAssignedToName,
          stageHistory: updatedHistory,
          fieldData: updatedFieldData
        });
      }
    }
  }

  /**
   * Lista todas as instâncias com filtros
   * @param filters - Filtros opcionais
   */
  static async listInstances(filters?: {
    workflowId?: string;
    status?: 'in_progress' | 'completed' | 'cancelled' | 'rejected';
    assignedTo?: string;
    companyId?: string;
    departmentId?: string;
  }): Promise<WorkflowInstance[]> {
    let q = collection(db, 'workflow_instances');
    const constraints = [];

    if (filters?.workflowId) {
      constraints.push(where('workflowId', '==', filters.workflowId));
    }

    if (filters?.status) {
      constraints.push(where('status', '==', filters.status));
    }

    if (filters?.assignedTo) {
      constraints.push(where('assignedTo', '==', filters.assignedTo));
    }

    if (filters?.companyId) {
      constraints.push(where('companyId', '==', filters.companyId));
    }

    if (filters?.departmentId) {
      constraints.push(where('departmentId', '==', filters.departmentId));
    }

    // Ordenar por data de início (mais recente primeiro)
    constraints.push(orderBy('startedAt', 'desc'));

    const instancesQuery = constraints.length > 0 
      ? query(q as any, ...constraints)
      : query(q as any, orderBy('startedAt', 'desc'));

    const instancesSnapshot = await getDocs(instancesQuery);
    return instancesSnapshot.docs.map(doc => 
      Object.assign({ id: doc.id }, doc.data()) as WorkflowInstance
    );
  }

  /**
   * Carrega uma instância específica
   * @param instanceId - ID da instância
   */
  static async getInstance(instanceId: string): Promise<WorkflowInstance | null> {
    const instanceRef = doc(db, 'workflow_instances', instanceId);
    const instanceDoc = await getDoc(instanceRef);
    
    if (!instanceDoc.exists()) {
      return null;
    }

    return Object.assign(
      { id: instanceDoc.id }, 
      instanceDoc.data()
    ) as WorkflowInstance;
  }

  /**
   * Deleta uma instância
   * @param instanceId - ID da instância
   */
  static async deleteInstance(instanceId: string): Promise<void> {
    const instanceRef = doc(db, 'workflow_instances', instanceId);
    await deleteDoc(instanceRef);
  }

  /**
   * Atualiza dados de campo de uma instância
   * @param instanceId - ID da instância
   * @param fieldData - Dados a serem atualizados
   */
  static async updateFieldData(
    instanceId: string,
    fieldData: Record<string, any>
  ): Promise<void> {
    const instanceRef = doc(db, 'workflow_instances', instanceId);
    const instanceDoc = await getDoc(instanceRef);
    
    if (!instanceDoc.exists()) {
      throw new Error('Instância não encontrada');
    }

    const instance = instanceDoc.data() as WorkflowInstance;

    await updateDoc(instanceRef, {
      fieldData: {
        ...instance.fieldData,
        ...fieldData
      }
    });
  }

  /**
   * Obtém estatísticas de instâncias
   */
  static async getStatistics(): Promise<{
    total: number;
    inProgress: number;
    completed: number;
    cancelled: number;
    rejected: number;
  }> {
    const allInstances = await this.listInstances();

    return {
      total: allInstances.length,
      inProgress: allInstances.filter(i => i.status === 'in_progress').length,
      completed: allInstances.filter(i => i.status === 'completed').length,
      cancelled: allInstances.filter(i => i.status === 'cancelled').length,
      rejected: allInstances.filter(i => i.status === 'rejected').length
    };
  }
}
