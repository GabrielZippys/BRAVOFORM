/**
 * Serviço de Workflow usando PostgreSQL
 * Substitui workflowService.ts eliminando dependência do Firestore
 */

import type { 
  WorkflowStage, 
  WorkflowHistoryEntry
} from '../types';

const API_BASE = '/api/dataconnect';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description?: string;
  stages: WorkflowStage[];
  companies: string[];
  departments: string[];
  isActive: boolean;
  createdAt?: Date;
  createdBy?: string;
  createdByName?: string;
}

export class WorkflowServicePg {
  /**
   * Lista todos os workflows
   */
  static async listWorkflows(filters?: {
    isActive?: boolean;
    companyId?: string;
  }): Promise<WorkflowTemplate[]> {
    try {
      const params = new URLSearchParams();
      if (filters?.isActive !== undefined) {
        params.append('isActive', String(filters.isActive));
      }
      if (filters?.companyId) {
        params.append('companyId', filters.companyId);
      }

      const response = await fetch(`${API_BASE}/workflows?${params.toString()}`);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Erro ao listar workflows');
      }

      return result.data;
    } catch (error: any) {
      console.error('Erro ao listar workflows:', error);
      throw error;
    }
  }

  /**
   * Carrega um workflow específico
   */
  static async loadWorkflow(workflowId: string): Promise<WorkflowTemplate | null> {
    try {
      const response = await fetch(`${API_BASE}/workflows?id=${workflowId}`);
      const result = await response.json();

      if (!result.success) {
        return null;
      }

      return result.data;
    } catch (error: any) {
      console.error('Erro ao carregar workflow:', error);
      return null;
    }
  }

  /**
   * Salva um novo workflow
   */
  static async saveWorkflow(
    workflow: Omit<WorkflowTemplate, 'id'>,
    userId: string,
    userName: string
  ): Promise<string> {
    try {
      const workflowId = `workflow_${Date.now()}`;
      
      const response = await fetch(`${API_BASE}/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId,
          name: workflow.name,
          description: workflow.description || '',
          stages: workflow.stages,
          companies: workflow.companies,
          departments: workflow.departments,
          isActive: workflow.isActive,
          createdBy: userId,
          createdByName: userName
        })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Erro ao salvar workflow');
      }

      return workflowId;
    } catch (error: any) {
      console.error('Erro ao salvar workflow:', error);
      throw error;
    }
  }

  /**
   * Atualiza um workflow existente
   */
  static async updateWorkflow(
    workflowId: string,
    updates: Partial<Omit<WorkflowTemplate, 'id'>>
  ): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId,
          ...updates
        })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Erro ao atualizar workflow');
      }
    } catch (error: any) {
      console.error('Erro ao atualizar workflow:', error);
      throw error;
    }
  }

  /**
   * Deleta um workflow
   */
  static async deleteWorkflow(workflowId: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/workflows?id=${workflowId}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Erro ao deletar workflow');
      }
    } catch (error: any) {
      console.error('Erro ao deletar workflow:', error);
      throw error;
    }
  }

  /**
   * Ativa ou desativa um workflow
   */
  static async toggleWorkflowActive(
    workflowId: string,
    isActive: boolean
  ): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/workflows`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId, isActive })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Erro ao atualizar status');
      }
    } catch (error: any) {
      console.error('Erro ao atualizar status:', error);
      throw error;
    }
  }

  /**
   * Atualiza as configurações de ativação de um workflow
   */
  static async updateActivationSettings(
    workflowId: string,
    settings: Record<string, any>
  ): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/workflows`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId, activationSettings: settings })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Erro ao atualizar configurações de ativação');
      }
    } catch (error: any) {
      console.error('Erro ao atualizar configurações de ativação:', error);
      throw error;
    }
  }

  /**
   * Move uma resposta para uma nova etapa do workflow
   */
  static async moveResponse(
    responseId: string,
    targetStageId: string,
    userId: string,
    username: string,
    comment?: string,
    attachments?: string[]
  ): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/workflow-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responseId,
          targetStageId,
          userId,
          username,
          comment,
          attachments
        })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Erro ao mover resposta');
      }
    } catch (error: any) {
      console.error('Erro ao mover resposta:', error);
      throw error;
    }
  }

  /**
   * Obtém o histórico completo de uma resposta
   */
  static async getWorkflowHistory(responseId: string): Promise<WorkflowHistoryEntry[]> {
    try {
      const response = await fetch(`${API_BASE}/workflow-history?responseId=${responseId}`);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Erro ao buscar histórico');
      }

      return result.data || [];
    } catch (error: any) {
      console.error('Erro ao buscar histórico:', error);
      return [];
    }
  }
}
