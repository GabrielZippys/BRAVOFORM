import { FormResponse } from '@/types';
import { Timestamp } from 'firebase/firestore';

/**
 * Serviço para salvar respostas de formulários no PostgreSQL (Data Connect)
 * Isso facilita a análise no Power BI, convertendo dados JSON em tabelas relacionais
 */

interface PostgreSQLResponse {
  id: string;
  form_id: string;
  form_title: string;
  company_id: string;
  department_id: string;
  department_name?: string;
  collaborator_id: string;
  collaborator_username: string;
  status: string;
  current_stage_id?: string;
  assigned_to?: string;
  submitted_at: string;
  deleted_at?: string;
  deleted_by?: string;
  deleted_by_username?: string;
}

interface PostgreSQLAnswer {
  response_id: string;
  field_id: string;
  field_label: string;
  field_type: string;
  answer_text?: string;
  answer_number?: number;
  answer_date?: string;
  answer_boolean?: boolean;
}

export class ResponseStorageService {
  /**
   * Salva uma resposta de formulário no PostgreSQL
   */
  static async saveToPostgreSQL(response: FormResponse): Promise<boolean> {
    try {
      // Converter Timestamp para ISO string
      const submittedAt = response.submittedAt instanceof Timestamp 
        ? response.submittedAt.toDate().toISOString()
        : new Date(response.submittedAt).toISOString();

      // Preparar dados da resposta principal
      const pgResponse: PostgreSQLResponse = {
        id: response.id,
        form_id: response.formId,
        form_title: response.formTitle,
        company_id: response.companyId,
        department_id: response.departmentId,
        department_name: response.department,
        collaborator_id: response.collaboratorId,
        collaborator_username: response.collaboratorUsername,
        status: response.status,
        current_stage_id: response.currentStageId,
        assigned_to: response.assignedTo,
        submitted_at: submittedAt,
        deleted_at: response.deletedAt instanceof Timestamp 
          ? response.deletedAt.toDate().toISOString()
          : undefined,
        deleted_by: response.deletedBy,
        deleted_by_username: response.deletedByUsername
      };

      // Preparar respostas individuais (normalizar o objeto answers)
      const pgAnswers: PostgreSQLAnswer[] = [];
      
      if (response.answers) {
        Object.entries(response.answers).forEach(([fieldId, value]) => {
          // Determinar tipo de resposta e campo apropriado
          let answer: PostgreSQLAnswer = {
            response_id: response.id,
            field_id: fieldId,
            field_label: fieldId, // Será atualizado com o label real
            field_type: typeof value
          };

          // Classificar valor por tipo
          if (typeof value === 'number') {
            answer.answer_number = value;
            answer.field_type = 'number';
          } else if (typeof value === 'boolean') {
            answer.answer_boolean = value;
            answer.field_type = 'boolean';
          } else if (value instanceof Date || (typeof value === 'string' && !isNaN(Date.parse(value)))) {
            answer.answer_date = new Date(value).toISOString();
            answer.field_type = 'date';
          } else if (Array.isArray(value)) {
            // Arrays são convertidos para JSON string
            answer.answer_text = JSON.stringify(value);
            answer.field_type = 'array';
          } else if (typeof value === 'object' && value !== null) {
            // Objetos (tabelas, grades) são tratados separadamente
            answer.answer_text = JSON.stringify(value);
            answer.field_type = 'object';
          } else {
            answer.answer_text = String(value);
            answer.field_type = 'text';
          }

          pgAnswers.push(answer);
        });
      }

      // Enviar para API que salvará no PostgreSQL
      const saveResponse = await fetch('/api/dataconnect/save-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response: pgResponse,
          answers: pgAnswers,
          workflowHistory: response.workflowHistory || []
        })
      });

      if (!saveResponse.ok) {
        const error = await saveResponse.json();
        console.error('Erro ao salvar no PostgreSQL:', error);
        return false;
      }

      console.log('✅ Resposta salva no PostgreSQL:', response.id);
      return true;

    } catch (error) {
      console.error('Erro ao processar salvamento no PostgreSQL:', error);
      return false;
    }
  }

  /**
   * Salva múltiplas respostas em lote (útil para migração)
   */
  static async saveBatch(responses: FormResponse[]): Promise<{
    success: number;
    failed: number;
    errors: string[];
  }> {
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const response of responses) {
      try {
        const saved = await this.saveToPostgreSQL(response);
        if (saved) {
          success++;
        } else {
          failed++;
          errors.push(`Falha ao salvar resposta ${response.id}`);
        }
      } catch (error: any) {
        failed++;
        errors.push(`Erro na resposta ${response.id}: ${error.message}`);
      }
    }

    return { success, failed, errors };
  }

  /**
   * Atualiza status de uma resposta no PostgreSQL
   */
  static async updateStatus(
    responseId: string,
    status: string,
    currentStageId?: string,
    assignedTo?: string
  ): Promise<boolean> {
    try {
      const updateResponse = await fetch('/api/dataconnect/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: responseId,
          status,
          current_stage_id: currentStageId,
          assigned_to: assignedTo
        })
      });

      return updateResponse.ok;
    } catch (error) {
      console.error('Erro ao atualizar status no PostgreSQL:', error);
      return false;
    }
  }

  /**
   * Marca resposta como deletada no PostgreSQL
   */
  static async markAsDeleted(
    responseId: string,
    deletedBy: string,
    deletedByUsername: string
  ): Promise<boolean> {
    try {
      const deleteResponse = await fetch('/api/dataconnect/delete-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: responseId,
          deleted_by: deletedBy,
          deleted_by_username: deletedByUsername
        })
      });

      return deleteResponse.ok;
    } catch (error) {
      console.error('Erro ao marcar como deletada no PostgreSQL:', error);
      return false;
    }
  }
}
