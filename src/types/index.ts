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

// --- PURCHASE ORDER WORKFLOW INTERFACES (FASE 8) ---

// Interface para pedido de compra
export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  supplier: {
    cnpj: string;
    name: string;
    address?: string;
    contact?: string;
  };
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    code?: string;
    unit?: string;
  }>;
  totalValue: number;
  paymentConditions?: string;
  deliveryDate?: Timestamp;
  status: 'novo' | 'aprovado' | 'em_processo' | 'concluido' | 'cancelado';
  createdBy: string;
  createdByName?: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  workflowInstanceId?: string;  // Vinculado à instância de workflow
  isExcludedFromDetection: boolean; // Flag para pedidos refeitos
  parentOrderId?: string;       // Referência ao pedido original (se refeito)
  companyId: string;
  departmentId: string;
}

// Interface para dados extraídos do XML da NF-e
export interface XMLNFeData {
  cnpjEmitente: string;
  nomeEmitente: string;
  numeroNFe: string;
  serieNFe: string;
  dataEmissao: string;
  chaveAcesso?: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    ncm?: string;
    cfop?: string;
    unit?: string;
  }>;
  totalValue: number;
  paymentConditions?: string;
  xmlFileUrl: string;           // URL do arquivo XML no Storage
  xmlFileName?: string;
  parsedAt?: Timestamp;
}

// Interface para resultado da validação XML vs Pedido
export interface XMLValidationResult {
  status: 'aprovado' | 'divergente';
  divergences: Array<{
    field: string;
    xmlValue: string;
    orderValue: string;
    severity: 'critico' | 'aviso';
    description?: string;
  }>;
  validatedAt: Timestamp;
  validatedBy?: string;
  summary?: {
    totalDivergences: number;
    criticalDivergences: number;
    warningDivergences: number;
  };
}

// Interface para resolução de divergências
export interface DivergenceResolution {
  action: 'seguir_com_justificativa' | 'modificar_pedido' | 'novo_pedido';
  justification?: string;       // Obrigatório se action = 'seguir_com_justificativa'
  newOrderNumber?: string;      // Obrigatório se action = 'novo_pedido'
  modifications?: Record<string, any>; // Se action = 'modificar_pedido'
  resolvedBy: string;
  resolvedByName?: string;
  resolvedAt: Timestamp;
}

// Interface para validação de fornecedor
export interface SupplierValidation {
  fornecedorOriginal: {
    cnpj: string;
    name: string;
  };
  fornecedorCorreto: boolean;   // Check do faturamento
  novoFornecedor?: {
    cnpj: string;
    name: string;
  };
  validatedBy: string;
  validatedByName?: string;
  validatedAt: Timestamp;
  requiresReorder: boolean;     // Se precisa refazer pedido
}

// Interface para dados do formulário de recebimento
export interface ReceivingFormData {
  receivingDate: Timestamp;
  nfeNumber: string;            // Auto-preenchido do XML
  supplier: string;             // Auto-preenchido
  inspectedItems: Array<{
    description: string;
    nfeQuantity: number;
    receivedQuantity: number;
    condition: 'conforme' | 'avariado' | 'faltante';
    notes?: string;
  }>;
  generalNotes?: string;
  photos?: string[];            // URLs das fotos no Storage
  inspectorSignature: string;   // Nome ou assinatura digital
  inspectorId: string;
  completedBy: string;
  completedByName?: string;
  completedAt: Timestamp;
  discrepancies?: {
    hasDiscrepancies: boolean;
    totalDiscrepancies: number;
    details?: string;
  };
}

// Interface para configuração de detecção de pedidos
export interface PedidoDetectionConfig {
  pollInterval: number;         // Intervalo de verificação em ms
  statusFilter: 'novo';         // Apenas pedidos novos
  autoCreateInstance: boolean;  // Criar instância automaticamente
  workflowId: string;           // ID do workflow a ser usado
  enabled: boolean;             // Se a detecção está ativa
}

// Interface para pedidos excluídos da detecção
export interface ExcludedOrder {
  id: string;
  orderNumber: string;
  parentOrderId?: string;       // Pedido original
  reason: 'refazer_fornecedor' | 'refazer_divergencia' | 'manual';
  excludedBy: string;
  excludedByName?: string;
  excludedAt: Timestamp;
  workflowInstanceId: string;   // Instância que causou a exclusão
}

// Interface para dados consolidados do PDF
export interface PDFReceivingData {
  pedido: PurchaseOrder;
  nfe: XMLNFeData;
  supplierValidation?: SupplierValidation;
  xmlValidation: XMLValidationResult;
  divergenceResolution?: DivergenceResolution;
  recebimento: ReceivingFormData;
  historico: StageHistoryEntry[];
  workflowInstance: {
    id: string;
    startedAt: Timestamp;
    completedAt?: Timestamp;
    totalDuration?: number;
  };
  generatedAt: Timestamp;
  generatedBy: string;
  pdfUrl?: string;              // URL do PDF gerado no Storage
}

// Interface para configuração de distribuição do PDF
export interface PDFDistributionConfig {
  destinatarios: {
    qualidade: string[];        // Emails do setor de qualidade
    faturamento: string[];      // Emails do setor de faturamento
    compras?: string[];         // Emails do setor de compras (opcional)
  };
  includeAttachments: boolean;  // Se deve incluir anexos (fotos, XML)
  emailSubject?: string;
  emailBody?: string;
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
