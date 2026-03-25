/**
 * Serviço para salvar dados diretamente no PostgreSQL via Firebase Data Connect
 * Substitui o salvamento no Firestore
 */

import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig } from './dataConnectService';

// Tipos
interface FormResponseInput {
  id: string;
  form_id: string;
  form_title: string;
  company_id: string;
  department_id: string;
  department_name?: string;
  collaborator_id: string;
  collaborator_username: string;
  status: string;
  submitted_at: string; // ISO 8601
}

interface AnswerInput {
  response_id: string;
  field_id: string;
  field_label: string;
  field_type: string;
  answer_text?: string;
  answer_number?: number;
  answer_date?: string;
  answer_boolean?: boolean;
}

interface AttachmentInput {
  response_id: string;
  field_id: string;
  file_url: string;
  file_name: string;
  file_type: string;
  file_size?: number;
}

interface WorkflowHistoryInput {
  response_id: string;
  stage_id: string;
  stage_name: string;
  action: string;
  performed_by: string;
  performed_by_username: string;
  comment?: string;
}

interface TableItemInput {
  response_id: string;
  field_id: string;
  row_index: number;
  column_id: string;
  column_label: string;
  value: string;
}

// Mutations
const CREATE_FORM_RESPONSE = `
  mutation CreateFormResponse(
    $id: String!
    $form_id: String!
    $form_title: String!
    $company_id: String!
    $department_id: String!
    $department_name: String
    $collaborator_id: String!
    $collaborator_username: String!
    $status: String!
    $submitted_at: Timestamp!
  ) {
    createFormResponse(
      id: $id
      form_id: $form_id
      form_title: $form_title
      company_id: $company_id
      department_id: $department_id
      department_name: $department_name
      collaborator_id: $collaborator_id
      collaborator_username: $collaborator_username
      status: $status
      submitted_at: $submitted_at
    ) {
      id
      created_at
    }
  }
`;

const ADD_ANSWER = `
  mutation AddAnswer(
    $response_id: String!
    $field_id: String!
    $field_label: String!
    $field_type: String!
    $answer_text: String
    $answer_number: Float
    $answer_date: Date
    $answer_boolean: Boolean
  ) {
    addAnswer(
      response_id: $response_id
      field_id: $field_id
      field_label: $field_label
      field_type: $field_type
      answer_text: $answer_text
      answer_number: $answer_number
      answer_date: $answer_date
      answer_boolean: $answer_boolean
    ) {
      id
    }
  }
`;

const ADD_ATTACHMENT = `
  mutation AddAttachment(
    $response_id: String!
    $field_id: String!
    $file_url: String!
    $file_name: String!
    $file_type: String!
    $file_size: Int
  ) {
    addAttachment(
      response_id: $response_id
      field_id: $field_id
      file_url: $file_url
      file_name: $file_name
      file_type: $file_type
      file_size: $file_size
    ) {
      id
    }
  }
`;

const ADD_WORKFLOW_HISTORY = `
  mutation AddWorkflowHistory(
    $response_id: String!
    $stage_id: String!
    $stage_name: String!
    $action: String!
    $performed_by: String!
    $performed_by_username: String!
    $comment: String
  ) {
    addWorkflowHistory(
      response_id: $response_id
      stage_id: $stage_id
      stage_name: $stage_name
      action: $action
      performed_by: $performed_by
      performed_by_username: $performed_by_username
      comment: $comment
    ) {
      id
    }
  }
`;

const ADD_TABLE_ITEM = `
  mutation AddTableItem(
    $response_id: String!
    $field_id: String!
    $row_index: Int!
    $column_id: String!
    $column_label: String!
    $value: String!
  ) {
    addTableItem(
      response_id: $response_id
      field_id: $field_id
      row_index: $row_index
      column_id: $column_id
      column_label: $column_label
      value: $value
    ) {
      id
    }
  }
`;

const UPDATE_RESPONSE_STATUS = `
  mutation UpdateResponseStatus(
    $id: String!
    $status: String!
    $current_stage_id: String
    $assigned_to: String
  ) {
    updateResponseStatus(
      id: $id
      status: $status
      current_stage_id: $current_stage_id
      assigned_to: $assigned_to
    ) {
      id
      status
    }
  }
`;

const DELETE_RESPONSE = `
  mutation DeleteResponse(
    $id: String!
    $deleted_by: String!
    $deleted_by_username: String!
  ) {
    deleteResponse(
      id: $id
      deleted_by: $deleted_by
      deleted_by_username: $deleted_by_username
    ) {
      id
      deleted_at
    }
  }
`;

/**
 * Classe para gerenciar salvamento via Data Connect
 */
export class DataConnectMutations {
  private static dataConnect = getDataConnect(connectorConfig);

  /**
   * Cria uma nova resposta de formulário
   */
  static async createFormResponse(data: FormResponseInput): Promise<void> {
    try {
      await executeMutation(this.dataConnect, {
        query: CREATE_FORM_RESPONSE,
        variables: data
      });
      console.log('[DataConnect] FormResponse criada:', data.id);
    } catch (error) {
      console.error('[DataConnect] Erro ao criar FormResponse:', error);
      throw error;
    }
  }

  /**
   * Adiciona uma resposta individual
   */
  static async addAnswer(data: AnswerInput): Promise<void> {
    try {
      await executeMutation(this.dataConnect, {
        query: ADD_ANSWER,
        variables: data
      });
      console.log('[DataConnect] Answer adicionada:', data.field_id);
    } catch (error) {
      console.error('[DataConnect] Erro ao adicionar Answer:', error);
      throw error;
    }
  }

  /**
   * Adiciona múltiplas respostas em lote
   */
  static async addAnswersBatch(answers: AnswerInput[]): Promise<void> {
    const promises = answers.map(answer => this.addAnswer(answer));
    await Promise.all(promises);
    console.log(`[DataConnect] ${answers.length} answers adicionadas`);
  }

  /**
   * Adiciona um anexo
   */
  static async addAttachment(data: AttachmentInput): Promise<void> {
    try {
      await executeMutation(this.dataConnect, {
        query: ADD_ATTACHMENT,
        variables: data
      });
      console.log('[DataConnect] Attachment adicionado:', data.file_name);
    } catch (error) {
      console.error('[DataConnect] Erro ao adicionar Attachment:', error);
      throw error;
    }
  }

  /**
   * Adiciona entrada no histórico de workflow
   */
  static async addWorkflowHistory(data: WorkflowHistoryInput): Promise<void> {
    try {
      await executeMutation(this.dataConnect, {
        query: ADD_WORKFLOW_HISTORY,
        variables: data
      });
      console.log('[DataConnect] WorkflowHistory adicionado');
    } catch (error) {
      console.error('[DataConnect] Erro ao adicionar WorkflowHistory:', error);
      throw error;
    }
  }

  /**
   * Adiciona item de tabela/grade
   */
  static async addTableItem(data: TableItemInput): Promise<void> {
    try {
      await executeMutation(this.dataConnect, {
        query: ADD_TABLE_ITEM,
        variables: data
      });
      console.log('[DataConnect] TableItem adicionado');
    } catch (error) {
      console.error('[DataConnect] Erro ao adicionar TableItem:', error);
      throw error;
    }
  }

  /**
   * Atualiza status da resposta
   */
  static async updateResponseStatus(
    id: string,
    status: string,
    current_stage_id?: string,
    assigned_to?: string
  ): Promise<void> {
    try {
      await executeMutation(this.dataConnect, {
        query: UPDATE_RESPONSE_STATUS,
        variables: { id, status, current_stage_id, assigned_to }
      });
      console.log('[DataConnect] Status atualizado:', id, status);
    } catch (error) {
      console.error('[DataConnect] Erro ao atualizar status:', error);
      throw error;
    }
  }

  /**
   * Marca resposta como deletada
   */
  static async deleteResponse(
    id: string,
    deleted_by: string,
    deleted_by_username: string
  ): Promise<void> {
    try {
      await executeMutation(this.dataConnect, {
        query: DELETE_RESPONSE,
        variables: { id, deleted_by, deleted_by_username }
      });
      console.log('[DataConnect] Resposta marcada como deletada:', id);
    } catch (error) {
      console.error('[DataConnect] Erro ao deletar resposta:', error);
      throw error;
    }
  }

  /**
   * Salva resposta completa (FormResponse + Answers + Attachments)
   * Método principal para substituir salvamento no Firestore
   */
  static async saveCompleteResponse(
    response: FormResponseInput,
    answers: AnswerInput[],
    attachments: AttachmentInput[] = [],
    tableItems: TableItemInput[] = []
  ): Promise<void> {
    try {
      // 1. Criar FormResponse
      await this.createFormResponse(response);

      // 2. Adicionar Answers
      if (answers.length > 0) {
        await this.addAnswersBatch(answers);
      }

      // 3. Adicionar Attachments
      for (const attachment of attachments) {
        await this.addAttachment(attachment);
      }

      // 4. Adicionar TableItems
      for (const item of tableItems) {
        await this.addTableItem(item);
      }

      console.log('[DataConnect] Resposta completa salva com sucesso:', response.id);
    } catch (error) {
      console.error('[DataConnect] Erro ao salvar resposta completa:', error);
      throw error;
    }
  }
}
