/**
 * Serviço SQL para instâncias de workflow.
 * Substitui workflowInstanceService.ts (Firestore) — usa apenas PostgreSQL.
 */
import type { WorkflowInstance } from '../types';

const BASE = '/api/dataconnect/workflow-instances';

export class WorkflowInstanceServicePg {
  /** Carrega uma instância pelo ID */
  static async getInstance(instanceId: string): Promise<WorkflowInstance | null> {
    const res = await fetch(`${BASE}?id=${encodeURIComponent(instanceId)}`);
    const result = await res.json();
    return result.success ? (result.data as WorkflowInstance) : null;
  }

  /** Lista instâncias com filtros opcionais */
  static async listInstances(filters: {
    workflowId?: string;
    status?: string;
    assignedTo?: string;
    companyId?: string;
    departmentId?: string;
  } = {}): Promise<WorkflowInstance[]> {
    const params = new URLSearchParams();
    if (filters.workflowId)   params.set('workflowId',   filters.workflowId);
    if (filters.status)       params.set('status',       filters.status);
    if (filters.assignedTo)   params.set('assignedTo',   filters.assignedTo);
    if (filters.companyId)    params.set('companyId',    filters.companyId);
    if (filters.departmentId) params.set('departmentId', filters.departmentId);

    const res = await fetch(`${BASE}?${params.toString()}`);
    const result = await res.json();
    return result.success ? (result.data as WorkflowInstance[]) : [];
  }

  /** Cria uma nova instância */
  static async createInstance(data: {
    workflowId: string;
    workflowName: string;
    assignedTo: string;
    assignedToName: string;
    companyId: string;
    departmentId: string;
    currentStageId?: string;
    currentStageIndex?: number;
    stageHistory?: any[];
  }): Promise<string> {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, status: 'in_progress' }),
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.error || 'Erro ao criar instância');
    return result.data.id as string;
  }

  /**
   * Avança / rejeita / cancela uma etapa.
   * Recebe o workflow completo para calcular próxima etapa (já carregado via SQL).
   */
  static async advanceStage(
    instanceId: string,
    userId: string,
    userName: string,
    action: 'validated' | 'rejected' | 'cancelled',
    workflow: { stages: any[] },
    instance: WorkflowInstance,
    fieldData: Record<string, any>,
    comment?: string,
    attachments?: string[]
  ): Promise<void> {
    const now = new Date().toISOString();

    // Copiar histórico e fechar entrada atual
    const updatedHistory = [...(instance.stageHistory || [])];
    if (updatedHistory.length > 0) {
      updatedHistory[updatedHistory.length - 1] = {
        ...updatedHistory[updatedHistory.length - 1],
        completedAt: now,
        completedBy: userId,
        completedByName: userName,
        action,
        comment,
        attachments,
      };
    }

    const mergedFieldData = { ...(instance.fieldData || {}), ...fieldData };
    let patch: Record<string, any> = { instanceId, fieldData: mergedFieldData, stageHistory: updatedHistory };

    if (action === 'cancelled') {
      patch = { ...patch, status: 'cancelled', completedAt: now };
    } else if (action === 'rejected') {
      if (instance.currentStageIndex === 0) {
        patch = { ...patch, status: 'rejected', completedAt: now };
      } else {
        const prevIdx = instance.currentStageIndex - 1;
        const prevStage = workflow.stages[prevIdx];
        updatedHistory.push({ stageId: prevStage.id, stageName: prevStage.name, enteredAt: now, action: 'validated' });
        patch = { ...patch, currentStageId: prevStage.id, currentStageIndex: prevIdx, stageHistory: updatedHistory };
      }
    } else {
      // validated — avançar
      const nextIdx = instance.currentStageIndex + 1;
      if (nextIdx >= workflow.stages.length) {
        patch = { ...patch, status: 'completed', completedAt: now };
      } else {
        const nextStage = workflow.stages[nextIdx];
        const nextAssignedTo = nextStage.assignedUsers?.[0] || instance.assignedTo;
        updatedHistory.push({ stageId: nextStage.id, stageName: nextStage.name, enteredAt: now, action: 'validated' });
        patch = {
          ...patch,
          currentStageId: nextStage.id,
          currentStageIndex: nextIdx,
          assignedTo: nextAssignedTo,
          stageHistory: updatedHistory,
        };
      }
    }

    const res = await fetch(BASE, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.error || 'Erro ao atualizar instância');
  }

  /** Deleta uma instância */
  static async deleteInstance(instanceId: string): Promise<void> {
    await fetch(`${BASE}?id=${encodeURIComponent(instanceId)}`, { method: 'DELETE' });
  }
}
