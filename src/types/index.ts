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

// Configuração de trigger automático para etapas de execução
export interface WorkflowTrigger {
  enabled: boolean;
  type: 'sql_database' | 'webhook' | 'schedule';
  sqlConfig?: {
    profileId: string;           // ID do perfil SQL configurado
    tableName: string;            // Tabela a monitorar
    triggerColumn: string;        // Coluna para detectar novos registros
    lastProcessedValue?: any;     // Último valor processado
    pollingInterval: number;      // Intervalo de verificação (minutos)
    dataMapping?: {               // Mapeamento de colunas SQL para campos do workflow
      [sqlColumn: string]: string; // sqlColumn -> workflowField
    };
  };
  webhookConfig?: {
    url: string;
    secret: string;
    method?: 'POST' | 'GET';
  };
  scheduleConfig?: {
    cron: string;                 // Expressão cron
    timezone: string;
  };
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
  trigger?: WorkflowTrigger; // Configuração de trigger automático para etapas de execução
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

// ============================================
// INTEGRAÇÃO COM BANCO SQL EXTERNO
// ============================================

export type DatabaseType = 'mysql' | 'postgresql' | 'sqlserver' | 'oracle' | 'mongodb' | 'sqlite';

export type IntegrationDirection = 'import' | 'export' | 'bidirectional';

export type EncryptionMethod = 'aes-256-gcm' | 'aes-128-gcm' | 'none';

export interface SQLConnectionConfig {
  id?: string;
  name: string;
  description?: string;
  type: DatabaseType;
  direction: IntegrationDirection;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string; // Será criptografado no backend
  encryptedPassword?: string; // Senha criptografada
  encryptionMethod: EncryptionMethod;
  ssl?: boolean;
  sslCert?: string;
  sslKey?: string;
  sslCA?: string;
  connectionTimeout?: number;
  maxConnections?: number;
  useTailscale?: boolean; // Usar Tailscale para conexão
  tailscaleHostname?: string; // Hostname do Tailscale (ex: server-name.tail-scale.ts.net)
  isActive: boolean;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt?: Timestamp;
  lastTestedAt?: Timestamp;
  lastTestStatus?: 'success' | 'failed';
  lastTestError?: string;
  companyId: string;
  tags?: string[];
}

export interface TableColumn {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey?: boolean;
}

export interface TableInfo {
  name: string;
  schema?: string;
  columns: TableColumn[];
  rowCount?: number;
}

export interface ColumnMapping {
  sourceColumn: string;
  targetField: string;
  transform?: 'none' | 'uppercase' | 'lowercase' | 'trim' | 'date' | 'number' | 'cnpj_format';
  defaultValue?: any;
  required: boolean;
}

export interface DataTransformRule {
  field: string;
  transform: 'none' | 'uppercase' | 'lowercase' | 'trim' | 'date' | 'number' | 'cnpj_format' | 'custom';
  customScript?: string; // JavaScript para transformação customizada
  defaultValue?: any;
  required: boolean;
}

export interface SQLImportConfig {
  id?: string;
  connectionId: string;
  name: string;
  description?: string;
  tableName: string;
  schema?: string;
  targetCollection: 'purchase_orders' | 'form_responses' | 'custom';
  customCollectionName?: string;
  columnMappings: ColumnMapping[];
  transformRules?: DataTransformRule[];
  filterCondition?: string;
  orderBy?: string;
  syncMode: 'manual' | 'scheduled' | 'realtime';
  scheduleInterval?: number;
  scheduleCron?: string; // Expressão cron para agendamentos avançados
  batchSize?: number; // Tamanho do lote para importação
  duplicateHandling: 'skip' | 'update' | 'error';
  uniqueFields?: string[]; // Campos para detectar duplicatas
  lastSyncAt?: Timestamp;
  lastSyncStatus?: 'success' | 'failed' | 'partial';
  lastSyncRecords?: number;
  lastSyncError?: string;
  isActive: boolean;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt?: Timestamp;
  companyId: string;
  notifyOnError?: boolean;
  notifyEmails?: string[];
}

export interface SQLExportConfig {
  id?: string;
  connectionId: string;
  name: string;
  description?: string;
  sourceCollection: 'purchase_orders' | 'form_responses' | 'workflow_instances' | 'custom';
  customCollectionName?: string;
  targetTable: string;
  targetSchema?: string;
  columnMappings: ColumnMapping[];
  transformRules?: DataTransformRule[];
  filterCondition?: string;
  exportMode: 'insert' | 'upsert' | 'update';
  syncMode: 'manual' | 'scheduled' | 'trigger';
  scheduleInterval?: number;
  scheduleCron?: string;
  triggerEvents?: ('create' | 'update' | 'delete')[];
  batchSize?: number;
  createTableIfNotExists?: boolean;
  tableStructure?: {
    columns: {
      name: string;
      type: string;
      nullable: boolean;
      primaryKey?: boolean;
      unique?: boolean;
      defaultValue?: any;
    }[];
    indexes?: {
      name: string;
      columns: string[];
      unique: boolean;
    }[];
  };
  lastSyncAt?: Timestamp;
  lastSyncStatus?: 'success' | 'failed' | 'partial';
  lastSyncRecords?: number;
  lastSyncError?: string;
  isActive: boolean;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt?: Timestamp;
  companyId: string;
  notifyOnError?: boolean;
  notifyEmails?: string[];
}

export interface SyncLog {
  id?: string;
  importConfigId: string;
  startedAt: Timestamp;
  completedAt?: Timestamp;
  status: 'running' | 'success' | 'failed' | 'partial';
  recordsProcessed: number;
  recordsImported: number;
  recordsFailed: number;
  errors?: Array<{
    row: number;
    field?: string;
    message: string;
  }>;
  executedBy: string;
}

export interface SQLPreset {
  id?: string;
  name: string;
  description?: string;
  companyId: string;
  type: 'import' | 'export';
  connectionConfig: {
    dbType: DatabaseType;
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    ssl?: boolean;
    sslCert?: string;
    sslKey?: string;
    sslCA?: string;
    connectionTimeout?: number;
    maxConnections?: number;
  };
  importConfig?: {
    tableName: string;
    schema?: string;
    targetCollection: 'purchase_orders' | 'form_responses' | 'custom';
    customCollectionName?: string;
    columnMappings: ColumnMapping[];
    transformRules?: DataTransformRule[];
    filterCondition?: string;
    orderBy?: string;
    syncMode: 'manual' | 'scheduled' | 'realtime';
    scheduleInterval?: number;
    scheduleCron?: string;
    batchSize?: number;
    duplicateHandling: 'skip' | 'update' | 'error';
    uniqueFields?: string[];
  };
  exportConfig?: {
    sourceCollection: 'purchase_orders' | 'form_responses' | 'workflow_instances' | 'custom';
    customCollectionName?: string;
    targetTable: string;
    targetSchema?: string;
    columnMappings: ColumnMapping[];
    transformRules?: DataTransformRule[];
    filterCondition?: string;
    exportMode: 'insert' | 'upsert' | 'update';
    syncMode: 'manual' | 'scheduled' | 'trigger';
    scheduleInterval?: number;
    scheduleCron?: string;
    triggerEvents?: ('create' | 'update' | 'delete')[];
    batchSize?: number;
    createTableIfNotExists?: boolean;
  };
  encryptionMethod: EncryptionMethod;
  isActive: boolean;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt?: Timestamp;
  lastUsedAt?: Timestamp;
  tags?: string[];
}

export interface CompanySQLPresets {
  companyId: string;
  companyName: string;
  presets: SQLPreset[];
}

export interface SQLIntegrationProfile {
  id?: string;
  name: string;
  description?: string;
  companyId: string;
  type: 'import' | 'export' | 'bidirectional';
  
  connectionConfig: {
    dbType: DatabaseType;
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    ssl?: boolean;
    sslCert?: string;
    sslKey?: string;
    sslCA?: string;
    connectionTimeout?: number;
    maxConnections?: number;
  };
  
  importSettings?: {
    enabled: boolean;
    tableName: string;
    schema?: string;
    targetCollection: 'purchase_orders' | 'form_responses' | 'custom';
    customCollectionName?: string;
    columnMappings: ColumnMapping[];
    transformRules?: DataTransformRule[];
    filterCondition?: string;
    orderBy?: string;
    syncMode: 'manual' | 'scheduled' | 'realtime';
    scheduleInterval?: number;
    scheduleCron?: string;
    batchSize?: number;
    duplicateHandling: 'skip' | 'update' | 'error';
    uniqueFields?: string[];
  };
  
  exportSettings?: {
    enabled: boolean;
    sourceCollection: 'purchase_orders' | 'form_responses' | 'workflow_instances' | 'custom';
    customCollectionName?: string;
    targetTable: string;
    targetSchema?: string;
    columnMappings: ColumnMapping[];
    transformRules?: DataTransformRule[];
    filterCondition?: string;
    exportMode: 'insert' | 'upsert' | 'update';
    syncMode: 'manual' | 'scheduled' | 'trigger';
    scheduleInterval?: number;
    scheduleCron?: string;
    triggerEvents?: ('create' | 'update' | 'delete')[];
    batchSize?: number;
    createTableIfNotExists?: boolean;
    filterType?: 'all' | 'by_company' | 'by_department' | 'by_form' | 'by_date' | 'custom';
    filterCompany?: string;
    filterDepartment?: string;
    filterFormId?: string;
    filterStartDate?: string;
    filterEndDate?: string;
  };
  
  encryptionMethod: EncryptionMethod;
  isActive: boolean;
  status: 'offline' | 'online' | 'error' | 'testing';
  lastConnectionTest?: Timestamp;
  lastSyncAt?: Timestamp;
  lastSyncStatus?: 'success' | 'failed' | 'partial';
  lastSyncError?: string;
  
  createdAt: Timestamp;
  createdBy: string;
  updatedAt?: Timestamp;
  tags?: string[];
}

// --- FLUXO DE COMPRAS COM VALIDAÇÃO XML (FASE 9) ---

// Pedido de Compra
export interface PurchaseOrder {
  id: string;
  orderNumber: string;                    // Número do pedido (ex: "PC-2024-001")
  supplier: {
    cnpj: string;                         // CNPJ do fornecedor
    name: string;                         // Nome do fornecedor
    email?: string;
    phone?: string;
  };
  items: Array<{
    id: string;
    description: string;                  // Descrição do item
    quantity: number;                     // Quantidade solicitada
    unitPrice: number;                    // Preço unitário
    totalPrice: number;                   // Preço total (quantity * unitPrice)
    unit?: string;                        // Unidade de medida (UN, KG, etc)
    ncm?: string;                         // Código NCM (opcional)
  }>;
  totalValue: number;                     // Valor total do pedido
  paymentConditions?: string;             // Condições de pagamento
  deliveryDate?: string;                  // Data prevista de entrega
  notes?: string;                         // Observações gerais
  status: 'novo' | 'aprovado' | 'em_processo' | 'concluido' | 'cancelado' | 'rejeitado';
  createdBy: string;                      // ID do colaborador que criou
  createdByName: string;                  // Nome do colaborador
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  companyId: string;
  departmentId: string;
  workflowInstanceId?: string;            // ID da instância de workflow associada
  isExcludedFromDetection: boolean;       // Se true, não dispara novo workflow
  parentOrderId?: string;                 // Referência ao pedido original (se refeito)
  approvedBy?: string;                    // ID do gerente que aprovou
  approvedByName?: string;
  approvedAt?: Timestamp;
  rejectionReason?: string;               // Motivo da rejeição (se rejeitado)
}

// Dados extraídos do XML da NF-e
export interface XMLNFeData {
  cnpjEmitente: string;                   // CNPJ do emitente (fornecedor)
  nomeEmitente: string;                   // Nome do emitente
  numeroNFe: string;                      // Número da NF-e
  serieNFe: string;                       // Série da NF-e
  chaveAcesso?: string;                   // Chave de acesso da NF-e (44 dígitos)
  dataEmissao: string;                    // Data de emissão (ISO string)
  items: Array<{
    description: string;                  // Descrição do produto
    quantity: number;                     // Quantidade
    unitPrice: number;                    // Valor unitário
    totalPrice: number;                   // Valor total
    unit?: string;                        // Unidade comercial
    ncm?: string;                         // Código NCM
    cfop?: string;                        // CFOP
  }>;
  totalValue: number;                     // Valor total da NF-e
  paymentConditions?: string;             // Forma de pagamento
  xmlFileUrl: string;                     // URL do arquivo XML no Storage
  xmlFileName: string;                    // Nome do arquivo XML
  parsedAt: Timestamp;                    // Quando foi feito o parse
}

// Resultado da validação XML vs Pedido
export interface XMLValidationResult {
  status: 'aprovado' | 'divergente';
  divergences: Array<{
    field: string;                        // Campo com divergência (ex: "cnpj", "item[0].quantity")
    fieldLabel: string;                   // Label amigável (ex: "CNPJ do Fornecedor")
    xmlValue: string;                     // Valor no XML
    orderValue: string;                   // Valor no pedido
    severity: 'critico' | 'aviso';        // Severidade da divergência
    message: string;                      // Mensagem explicativa
  }>;
  validatedAt: Timestamp;
  validatedBy?: string;                   // ID do usuário que validou
  autoValidated: boolean;                 // Se foi validação automática ou manual
  matchPercentage: number;                // Percentual de compatibilidade (0-100)
}

// Resolução de divergência
export interface DivergenceResolution {
  action: 'seguir_com_justificativa' | 'modificar_pedido' | 'novo_pedido';
  justification?: string;                 // Justificativa (obrigatória para "seguir_com_justificativa")
  newOrderNumber?: string;                // Número do novo pedido (para "novo_pedido")
  newOrderId?: string;                    // ID do novo pedido criado
  modifications?: Record<string, any>;    // Modificações feitas no pedido (para "modificar_pedido")
  resolvedBy: string;                     // ID do usuário que resolveu
  resolvedByName: string;
  resolvedAt: Timestamp;
}

// Dados do formulário de recebimento
export interface ReceivingFormData {
  receivingDate: string;                  // Data do recebimento (ISO string)
  nfeNumber: string;                      // Número da NF-e
  supplier: string;                       // Nome do fornecedor
  inspectedItems: Array<{
    id: string;
    description: string;                  // Descrição do item
    nfeQuantity: number;                  // Quantidade na NF-e
    receivedQuantity: number;             // Quantidade recebida fisicamente
    condition: 'conforme' | 'avariado' | 'faltante' | 'excedente';
    notes?: string;                       // Observações sobre o item
    photos?: string[];                    // URLs de fotos do item
  }>;
  generalNotes?: string;                  // Observações gerais do recebimento
  photos?: string[];                      // Fotos gerais do recebimento
  inspectorSignature: string;             // Assinatura do conferente (base64)
  inspectorName: string;                  // Nome do conferente
  completedBy: string;                    // ID do usuário que completou
  completedAt: Timestamp;
  hasDiscrepancies: boolean;              // Se há divergências no recebimento
  discrepancyDetails?: string;            // Detalhes das divergências
}

// Pedido excluído da detecção automática
export interface ExcludedOrder {
  id: string;
  orderNumber: string;                    // Número do pedido excluído
  orderId: string;                        // ID do documento do pedido
  reason: 'refeito' | 'duplicado' | 'cancelado' | 'manual';
  relatedOrderNumber?: string;            // Número do pedido relacionado (novo pedido)
  relatedOrderId?: string;                // ID do pedido relacionado
  workflowInstanceId?: string;            // ID do workflow que gerou a exclusão
  excludedBy: string;                     // ID do usuário que excluiu
  excludedByName: string;
  excludedAt: Timestamp;
  notes?: string;                         // Observações sobre a exclusão
}

// Dados completos do fluxo de compras (para geração de PDF)
export interface PurchaseFlowData {
  purchaseOrder: PurchaseOrder;
  xmlData?: XMLNFeData;
  validationResult?: XMLValidationResult;
  divergenceResolution?: DivergenceResolution;
  receivingForm?: ReceivingFormData;
  workflowInstance: WorkflowInstance;
  pdfUrl?: string;                        // URL do PDF gerado
  pdfGeneratedAt?: Timestamp;
  distributedTo?: string[];               // Emails para quem o PDF foi enviado
  distributedAt?: Timestamp;
}
