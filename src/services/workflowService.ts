import { db } from '../../firebase/config';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  serverTimestamp 
} from 'firebase/firestore';
import type { 
  Form, 
  FormResponse, 
  WorkflowStage, 
  WorkflowHistoryEntry,
  Collaborator 
} from '../types';

/**
 * Serviço para gerenciamento de Workflow
 * Responsável por movimentações de respostas entre etapas e validações de permissões
 */
export class WorkflowService {
  /**
   * Move uma resposta para uma nova etapa do workflow
   * @param responseId - ID da resposta a ser movida
   * @param targetStageId - ID da etapa de destino
   * @param userId - ID do usuário que está fazendo a movimentação
   * @param username - Nome do usuário para registro no histórico
   * @param comment - Comentário opcional sobre a movimentação
   * @param attachments - URLs de anexos opcionais
   */
  static async moveResponse(
    responseId: string,
    targetStageId: string,
    userId: string,
    username: string,
    comment?: string,
    attachments?: string[]
  ): Promise<void> {
    const responseRef = doc(db, 'responses', responseId);
    const responseDoc = await getDoc(responseRef);
    
    if (!responseDoc.exists()) {
      throw new Error('Resposta não encontrada');
    }

    const response = responseDoc.data() as FormResponse;
    const previousStageId = response.currentStageId;

    // Validar permissões do usuário para fazer a transição
    await this.validateStageTransition(response, targetStageId, userId);

    // Criar entrada no histórico
    const historyEntry: WorkflowHistoryEntry = {
      id: crypto.randomUUID(),
      stageId: targetStageId,
      previousStageId,
      changedBy: userId,
      changedByUsername: username,
      changedAt: serverTimestamp() as any,
      comment,
      attachments: attachments || [],
      actionType: this.getTransitionType(previousStageId, targetStageId)
    };

    // Calcular duração na etapa anterior
    const duration = previousStageId && response.stageMetadata?.[previousStageId]?.enteredAt
      ? Date.now() - (response.stageMetadata[previousStageId].enteredAt as any).toMillis()
      : undefined;

    // Atualizar metadados da etapa anterior
    const stageMetadataUpdate: any = {
      ...response.stageMetadata
    };

    if (previousStageId && stageMetadataUpdate[previousStageId]) {
      stageMetadataUpdate[previousStageId].duration = duration;
    }

    // Adicionar metadados da nova etapa
    stageMetadataUpdate[targetStageId] = {
      enteredAt: serverTimestamp(),
      enteredBy: username,
      attachments: attachments || []
    };

    // Atualizar resposta no Firestore
    await updateDoc(responseRef, {
      currentStageId: targetStageId,
      previousStageId,
      workflowHistory: [...(response.workflowHistory || []), historyEntry],
      stageMetadata: stageMetadataUpdate
    });
  }

  /**
   * Valida se o usuário pode fazer a transição para a etapa especificada
   * @param response - Resposta que está sendo movida
   * @param targetStageId - ID da etapa de destino
   * @param userId - ID do usuário
   */
  private static async validateStageTransition(
    response: FormResponse,
    targetStageId: string,
    userId: string
  ): Promise<void> {
    // Buscar formulário para obter configurações do workflow
    const formRef = doc(db, 'forms', response.formId);
    const formDoc = await getDoc(formRef);
    
    if (!formDoc.exists()) {
      throw new Error('Formulário não encontrado');
    }

    const form = formDoc.data() as Form;

    if (!form.isWorkflowEnabled) {
      throw new Error('Workflow não está ativo para este formulário');
    }

    const targetStage = form.workflowStages?.find(s => s.id === targetStageId);
    if (!targetStage) {
      throw new Error('Etapa de destino não encontrada');
    }

    // Verificar permissões do usuário
    const hasPermission = await this.checkUserStagePermission(
      userId, 
      targetStage, 
      response.companyId, 
      response.departmentId
    );

    if (!hasPermission) {
      throw new Error('Usuário não tem permissão para mover para esta etapa');
    }

    // Validar campos obrigatórios da etapa
    if (targetStage.requireComment && !response.workflowHistory?.length) {
      throw new Error('Comentário obrigatório para esta etapa');
    }
  }

  /**
   * Verifica se o usuário tem permissão para acessar uma etapa específica
   * @param userId - ID do usuário
   * @param stage - Etapa a ser verificada
   * @param companyId - ID da empresa
   * @param departmentId - ID do departamento
   */
  private static async checkUserStagePermission(
    userId: string,
    stage: WorkflowStage,
    companyId: string,
    departmentId: string
  ): Promise<boolean> {
    // Verificar se é admin
    const adminQuery = query(
      collection(db, 'admins'),
      where('uid', '==', userId)
    );
    const adminDocs = await getDocs(adminQuery);
    
    if (!adminDocs.empty) {
      return true; // Admins têm acesso total
    }

    // Verificar colaborador
    const collaboratorQuery = query(
      collection(db, 'collaborators'),
      where('id', '==', userId)
    );
    const collaboratorDocs = await getDocs(collaboratorQuery);
    
    if (collaboratorDocs.empty) {
      return false;
    }

    const collaborator = collaboratorDocs.docs[0].data() as Collaborator;

    // Verificar se o departamento do colaborador está na lista de permitidos
    if (stage.allowedRoles.includes(departmentId)) {
      return true;
    }

    // Verificar se o usuário específico está na lista de permitidos
    if (stage.allowedUsers.includes(userId)) {
      return true;
    }

    return false;
  }

  /**
   * Determina o tipo de transição baseado nas etapas
   * @param previousStageId - ID da etapa anterior
   * @param targetStageId - ID da etapa de destino
   */
  private static getTransitionType(
    previousStageId?: string,
    targetStageId?: string
  ): 'forward' | 'backward' | 'reassigned' {
    if (!previousStageId) return 'forward';
    
    // Lógica simplificada - pode ser expandida para detectar movimentos para trás
    // baseado na ordem das etapas
    return 'forward';
  }

  /**
   * Obtém o histórico completo de uma resposta
   * @param responseId - ID da resposta
   */
  static async getWorkflowHistory(responseId: string): Promise<WorkflowHistoryEntry[]> {
    const responseRef = doc(db, 'responses', responseId);
    const responseDoc = await getDoc(responseRef);
    
    if (!responseDoc.exists()) {
      throw new Error('Resposta não encontrada');
    }

    const response = responseDoc.data() as FormResponse;
    return response.workflowHistory || [];
  }

  /**
   * Obtém todas as respostas em uma etapa específica
   * @param formId - ID do formulário
   * @param stageId - ID da etapa
   */
  static async getResponsesByStage(
    formId: string,
    stageId: string
  ): Promise<FormResponse[]> {
    const responsesQuery = query(
      collection(db, 'responses'),
      where('formId', '==', formId),
      where('currentStageId', '==', stageId)
    );

    const responsesSnapshot = await getDocs(responsesQuery);
    return responsesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as FormResponse));
  }

  /**
   * Verifica se um usuário pode visualizar uma etapa específica
   * @param userId - ID do usuário
   * @param stageId - ID da etapa
   * @param formId - ID do formulário
   */
  static async canUserViewStage(
    userId: string,
    stageId: string,
    formId: string
  ): Promise<boolean> {
    const formRef = doc(db, 'forms', formId);
    const formDoc = await getDoc(formRef);
    
    if (!formDoc.exists()) {
      return false;
    }

    const form = formDoc.data() as Form;
    const stage = form.workflowStages?.find(s => s.id === stageId);
    
    if (!stage) {
      return false;
    }

    // Admins podem ver tudo
    const adminQuery = query(
      collection(db, 'admins'),
      where('uid', '==', userId)
    );
    const adminDocs = await getDocs(adminQuery);
    
    if (!adminDocs.empty) {
      return true;
    }

    // Verificar se o usuário está na lista de permitidos
    return stage.allowedUsers.includes(userId);
  }
}
