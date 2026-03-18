import { Timestamp, DocumentReference, DocumentData, FieldValue } from "firebase/firestore";
import { ReactNode } from "react";

// --- TIPO PARA UTILIZADORES DO FIREBASE AUTH (ADMINS) ---
export interface AppUser {
  uid: string;
  name: string;
  email: string;
  role: 'Admin';
  companyId?: string;
  departmentId?: string;
  createdAt?: Timestamp;
}

// --- TIPO PARA COLABORADORES (GERENCIADOS NO FIRESTORE) ---
export interface Collaborator {
  id: string;
  username: string;
  password?: string;
  email?: string;
  companyId: string;
  departmentId: string;
  isTemporaryPassword?: boolean;
  canViewHistory?: boolean;
  canEditHistory?: boolean;
  ref?: DocumentReference<DocumentData, DocumentData>;
}

// --- FORM THEME INTERFACE ---
export interface FormTheme {
  bgColor: string;
  bgImage?: string;
  accentColor: string;
  fontColor: string;
  inputBgColor?: string;
  inputFontColor?: string;
  sectionHeaderBg?: string;
  sectionHeaderFont?: string;
  buttonBg?: string;
  buttonFont?: string;
  footerBg?: string;
  footerFont?: string;
  borderRadius: number;
  spacing: 'compact' | 'normal' | 'spacious';
  // Campos extras para tabela:
  tableHeaderBg?: string;
  tableHeaderFont?: string;
  tableBorderColor?: string;
  tableOddRowBg?: string;
  tableEvenRowBg?: string;
  tableCellFont?: string;
  titleColor?: string;
  descriptionColor?: string;
}

// --- CAMPOS DO FORMULÁRIO ---
export interface FormField {
  id: string;
  type: 'Texto' | 'Anexo' | 'Assinatura' | 'Caixa de Seleção' | 'Múltipla Escolha' | 'Data' | 'Cabeçalho' | 'Tabela' | 'Grade de Pedidos';
  label: string;
  required?: boolean;
  displayAs?: 'radio' | 'dropdown';
  placeholder?: string;
  description?: string;
  options?: string[];
  columns?: {
    id: string;
    label: string;
    type: 'text' | 'number' | 'date' | 'select';
    options?: string[];
  }[];
  rows?: { id: string; label: string; }[];
}

// --- FORMULÁRIO PRINCIPAL ---
export interface Form {
  id: string;
  title: string;
  description?: string;
  fields: FormField[];
  companyId: string;
  departmentId: string;
  collaborators: string[];
  authorizedUsers: string[];
  status?: 'active' | 'draft' | 'archived';
  order?: number;
  logo?: {
    url: string;
    size: number;
    align: 'left' | 'center' | 'right';
    name?: string;
  };
  createdAt: Timestamp | FieldValue | null;
  updatedAt?: Timestamp | FieldValue;
  theme: FormTheme;
  settings: {
    allowSave: boolean;
    showProgress: boolean;
    confirmBeforeSubmit: boolean;
  };
  // Workflow fields
  isWorkflowEnabled?: boolean;
  workflowStages?: WorkflowStage[];
  defaultWorkflowId?: string;
  workflowSettings?: WorkflowSettings;
}

// --- TIPO DE RESPOSTA DE FORMULÁRIO ---
export interface FormResponse {
  id: string;
  formId: string;
  createdAt: Timestamp;
  formTitle: string;
  companyId: string;
  departmentId: string;
  department?: string; // New structure: department name
  collaboratorId: string;
  collaboratorUsername: string; 
  answers: Record<string, any>;
  submittedAt: Timestamp;
  status: 'pending' | 'approved' | 'rejected' | 'submitted';
  deletedAt?: Timestamp | null;
  deletedBy?: string;
  deletedByUsername?: string;
  // Workflow fields
  currentStageId?: string;
  previousStageId?: string;
  assignedTo?: string;
  workflowHistory?: WorkflowHistoryEntry[];
  stageMetadata?: {
    [stageId: string]: {
      enteredAt: Timestamp;
      enteredBy: string;
      duration?: number;
      attachments?: string[];
    };
  };
}

// --- TIPOS DE ORGANIZAÇÃO ---
export interface Company {
  id: string;
  name: string;
  createdAt: Timestamp;
}

export interface Department {
  id: string;
  name: string;
  companyId: string;
  createdAt: Timestamp;
}

// --- TIPO PARA NOTIFICAÇÕES ---
export interface ResetNotification {
  id: string;
  collaboratorId: string;
  collaboratorUsername: string;
  status: 'pending' | 'completed';
  createdAt: Timestamp;
}

// --- INTERFACES PARA GRADE DE PEDIDOS ---

// Configuração da fonte de dados
export interface DataSourceConfig {
  type: 'firestore' | 'api' | 'static';
  collection?: string;
  endpoint?: string;
  filters?: {
    field: string;
    operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'array-contains';
    value: string | number | boolean;
  }[];
  displayField: string;
  valueField: string;
  searchFields?: string[];
}

// Configuração de variações
export interface VariationConfig {
  id: string;
  label: string;
  dependsOn: string;
  required: boolean;
  fieldType: 'select' | 'radio' | 'text';
}

// Configuração de quantidade
export interface QuantityConfig {
  label: string;
  min: number;
  max?: number;
  step: number;
  decimals: boolean;
  unitOfMeasure?: string;
}

// Configuração de preço (preparado para V2.0)
export interface PriceConfig {
  enabled: boolean;
  priceField: string;
  currency: string;
  showInTable: boolean;
  allowEdit: boolean;
  applyDiscount?: boolean;
}

// Features avançadas
export interface AdvancedFeatures {
  allowBarcodeScanner: boolean;
  allowSmartPaste: boolean;
  enableKeyboardShortcuts: boolean;
  enableOfflineMode: boolean;
  enableDragAndDrop: boolean;
  realtimeStockCheck: boolean;
}

// Configuração de exibição
export interface DisplayConfig {
  showSearch: boolean;
  showImages: boolean;
  imageField?: string;
  columns: {
    field: string;
    label: string;
    width?: string;
    isSortable?: boolean;
    isFilterable?: boolean;
  }[];
  emptyStateMessage?: string;
}

// Campos adicionais por item
export interface AdditionalFieldConfig {
  id: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'textarea';
  required: boolean;
  options?: string[];
  defaultValue?: any;
}

// Interface para item individual
export interface OrderItem {
  productId: string;
  productName: string;
  productCode?: string;
  variations: Record<string, string>;
  quantity: number;
  unitPrice?: number;
  subTotal?: number;
  additionalData?: Record<string, any>;
  inputType?: 'manual' | 'barcode' | 'smart_paste';
  imageUrl?: string;
  notes?: string;
}

// Interface para valor completo do campo
export interface OrderGridValue {
  items: OrderItem[];
  summary: {
    totalItems: number;
    totalQuantity: number;
    totalValue?: number;
  };
  metadata?: {
    inputMethods?: Record<string, number>;
    completionTime?: number;
    wasOffline?: boolean;
    lastSync?: string;
  };
}

// Interface para o campo Grade de Pedidos
export interface OrderGridField extends FormField {
  type: 'Grade de Pedidos';
  dataSource: DataSourceConfig;
  variations?: VariationConfig[];
  quantityConfig: QuantityConfig;
  priceConfig?: PriceConfig;
  additionalFields?: AdditionalFieldConfig[];
  advancedFeatures?: AdvancedFeatures;
  displayConfig: DisplayConfig;
}

// --- WORKFLOW SYSTEM INTERFACES ---

// Tipos de etapas disponíveis
export type StageType = 
  | 'start'           // Início do processo
  | 'approval'        // Aprovação/Validação
  | 'review'          // Revisão/Análise
  | 'execution'       // Execução/Trabalho
  | 'waiting'         // Aguardando/Pendente
  | 'decision'        // Decisão/Gateway
  | 'notification'    // Notificação/Comunicação
  | 'documentation'   // Documentação/Registro
  | 'validation'      // Validação/Verificação
  | 'completion'      // Finalização/Conclusão
  | 'custom';         // Personalizada

// Tipo de condição para roteamento
export type RoutingConditionType = 'user' | 'company' | 'department' | 'custom';

// Condição de roteamento para múltiplos caminhos
export interface RoutingCondition {
  id: string;
  targetStageId: string; // ID da etapa de destino
  type: RoutingConditionType;
  label: string; // Nome da condição (ex: "Aprovação Gerencial")
  criteria: {
    userIds?: string[];
    companyIds?: string[];
    departmentIds?: string[];
    customRule?: string; // Regra customizada em texto
  };
}

// Configuração de timer para etapa de aguardo
export interface StageTimer {
  type: 'date' | 'hours' | 'days'; // Tipo de timer
  value: number | string; // Valor (data específica ou número de horas/dias)
  autoAdvance: boolean; // Avançar automaticamente quando timer expirar
}

// Ações possíveis na validação
export type ValidationAction = 
  | 'approve' // Aprovar e passar para próxima etapa
  | 'reject' // Reprovar e voltar uma etapa
  | 'destroy' // Destruir workflow e apagar dados
  | 'approve_with_edit'; // Aprovar com edições e comentários

// Configuração de validação para etapa de validação
export interface ValidationConfig {
  showPreviousStageData: boolean; // Mostrar resumo da etapa anterior
  allowedActions: ValidationAction[]; // Ações permitidas nesta validação
  requireCommentOnEdit: boolean; // Exigir comentário ao editar
  requireCommentOnReject: boolean; // Exigir comentário ao reprovar
  keepEditHistory: boolean; // Manter histórico de edições
}

// Configuração de uma etapa do workflow
export interface WorkflowStage {
  id: string;
  name: string;
  description?: string; // Descrição da etapa
  stageType: StageType;
  color: string;
  icon?: string;
  requireForms?: boolean; // Se exige formulários
  formIds?: string[]; // IDs dos formulários obrigatórios
  allowedRoles: string[];
  allowedUsers: string[];
  assignedUsers?: string[]; // IDs dos usuários atribuídos a esta etapa
  requireComment: boolean;
  requireAttachments: boolean;
  autoNotifications: {
    email: boolean;
    whatsapp: boolean;
    recipients: string[];
    message?: string;
    emailRecipients?: string[];
    whatsappNumbers?: string[];
  };
  routingConditions?: RoutingCondition[]; // Condições para múltiplos caminhos
  timer?: StageTimer; // Configuração de timer para etapas de aguardo
  validationConfig?: ValidationConfig; // Configuração de validação para etapas de validação
  order: number;
  isFinalStage: boolean;
  isInitialStage: boolean;
}

// Entrada no histórico de movimentações do workflow
export interface WorkflowHistoryEntry {
  id: string;
  stageId: string;
  previousStageId?: string;
  changedBy: string;
  changedByUsername: string;
  changedAt: Timestamp;
  comment?: string;
  attachments: string[];
  actionType: 'forward' | 'backward' | 'reassigned';
  metadata?: Record<string, any>;
}

// Configurações gerais do workflow
export interface WorkflowSettings {
  allowStageReversion: boolean;
  requireHistoryComment: boolean;
  autoAssignNextStage: boolean;
}

// --- PERSISTÊNCIA E CONFIGURAÇÕES ---

// Modos de ativação do workflow
export type ActivationMode = 'manual' | 'automatic' | 'on_request';

// Configurações de agendamento automático
export interface AutomaticSchedule {
  time: string;           // Horário no formato "HH:mm" (ex: "09:00")
  daysOfWeek: number[];   // Dias da semana (0=Domingo, 1=Segunda, ..., 6=Sábado)
  timezone: string;       // Timezone (ex: "America/Sao_Paulo")
}

// Configurações de ativação do workflow
export interface ActivationSettings {
  mode: ActivationMode;
  automaticSchedule?: AutomaticSchedule;
  requestApprovalRequired?: boolean; // Se requisições precisam de aprovação
}

// Documento de workflow no Firestore
export interface WorkflowDocument {
  id: string;
  name: string;
  description: string;
  stages: WorkflowStage[];
  companies: string[];        // IDs das empresas que podem usar
  departments: string[];      // IDs dos departamentos que podem usar
  activationSettings: ActivationSettings;
  isActive: boolean;          // Se o workflow está ativo
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;          // UID do admin que criou
  createdByName?: string;     // Nome do admin (cache)
}

// Instância de execução de workflow
export interface WorkflowInstance {
  id: string;
  workflowId: string;         // Referência ao workflow
  workflowName: string;       // Cache do nome
  currentStageId: string;     // Etapa atual
  currentStageIndex: number;
  assignedTo: string;         // ID do colaborador atual
  assignedToName: string;     // Nome do colaborador (cache)
  status: 'in_progress' | 'completed' | 'cancelled' | 'rejected';
  startedAt: Timestamp;
  completedAt?: Timestamp;
  stageHistory: StageHistoryEntry[];
  fieldData: Record<string, any>; // Dados preenchidos em cada etapa
  companyId: string;
  departmentId: string;
}

// Entrada no histórico de etapas da instância
export interface StageHistoryEntry {
  stageId: string;
  stageName: string;
  enteredAt: Timestamp;
  completedAt?: Timestamp;
  completedBy?: string;
  completedByName?: string;
  action: 'validated' | 'rejected' | 'cancelled';
  comment?: string;
  attachments?: string[];
  duration?: number;          // Duração em milissegundos
}
