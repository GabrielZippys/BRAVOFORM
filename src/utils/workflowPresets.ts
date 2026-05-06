/**
 * Presets de workflow — templates técnicos prontos para uso.
 *
 * Cada preset gera um array de WorkflowStage configurado para um cenário
 * específico. O admin pode aplicar um preset e depois ajustar.
 *
 * IMPORTANTE: a primeira posição (`order: 0`) sempre vira a etapa inicial
 * — ela é o ponto de entrada para novas instâncias.
 */
import type { WorkflowStage } from '@/types';

export interface WorkflowPreset {
  id: string;
  /** Nome curto exibido no card */
  label: string;
  /** Categoria para agrupamento visual */
  category: 'aprovacao' | 'operacional' | 'documentacao' | 'comunicacao' | 'completo';
  /** Ícone do preset (emoji) */
  icon: string;
  /** Cor do badge */
  color: string;
  /** Descrição técnica curta */
  description: string;
  /** Resumo "o que esse preset faz" para o admin */
  technicalSummary: string;
  /** Tags para busca / filtro */
  tags: string[];
  /** Função que gera as etapas (uuid gerado on-demand) */
  buildStages: () => WorkflowStage[];
}

// Helper para gerar stages com IDs únicos
const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;

const baseStage = (over: Partial<WorkflowStage>): WorkflowStage => ({
  id: newId(),
  name: 'Etapa',
  stageType: 'custom',
  color: '#6B7280',
  allowedRoles: [],
  allowedUsers: [],
  requireComment: false,
  requireAttachments: false,
  autoNotifications: {
    email: false,
    whatsapp: false,
    recipients: [],
    message: '',
    emailRecipients: [],
    whatsappNumbers: [],
  },
  order: 0,
  isFinalStage: false,
  isInitialStage: false,
  ...over,
});

export const WORKFLOW_PRESETS: WorkflowPreset[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // APROVAÇÃO
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'aprovacao-simples',
    label: 'Aprovação Simples',
    category: 'aprovacao',
    icon: '✅',
    color: '#10B981',
    description: 'Solicitação → Aprovação → Conclusão',
    technicalSummary: '3 etapas. Solicitante envia → Aprovador valida (aprova/reprova) → Workflow é finalizado.',
    tags: ['aprovação', 'simples', 'rápido'],
    buildStages: () => [
      baseStage({ order: 0, isInitialStage: true, name: 'Solicitação', stageType: 'documentation', color: '#6366F1', requireComment: true, requireAttachments: false }),
      baseStage({ order: 1, name: 'Aprovação', stageType: 'validation', color: '#14B8A6' }),
      baseStage({ order: 2, isFinalStage: true, name: 'Concluído', stageType: 'custom', color: '#10B981' }),
    ],
  },

  {
    id: 'aprovacao-multinivel',
    label: 'Aprovação Multi-Nível',
    category: 'aprovacao',
    icon: '🪜',
    color: '#3B82F6',
    description: 'Solicitação → Supervisor → Gerente → Diretor → OK',
    technicalSummary: '5 etapas. Hierarquia de aprovações em cascata. Cada nível pode reprovar e voltar para o solicitante.',
    tags: ['aprovação', 'hierarquia', 'gerencial', 'compliance'],
    buildStages: () => [
      baseStage({ order: 0, isInitialStage: true, name: 'Solicitação', stageType: 'documentation', color: '#6366F1', requireComment: true, requireAttachments: true }),
      baseStage({ order: 1, name: 'Aprovação Supervisor', stageType: 'validation', color: '#14B8A6' }),
      baseStage({ order: 2, name: 'Aprovação Gerência', stageType: 'validation', color: '#0EA5E9' }),
      baseStage({ order: 3, name: 'Aprovação Diretoria', stageType: 'validation', color: '#3B82F6' }),
      baseStage({ order: 4, isFinalStage: true, name: 'Aprovado', stageType: 'custom', color: '#10B981' }),
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // OPERACIONAL — RETIRADA / LOGÍSTICA
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'retirada-bravoflow',
    label: 'Retirada de Qualidade (BravoFlow)',
    category: 'completo',
    icon: '🚚',
    color: '#F59E0B',
    description: 'Solicitação → Aprovação Qualidade → Roteirização → Retirada',
    technicalSummary: '5 etapas. Workflow oficial do BravoFlow para retiradas: solicitante registra → AprovadorQualidade decide → Roteirizador atribui motorista → OperadorRetirada executa → Concluída.',
    tags: ['retirada', 'logística', 'qualidade', 'oficial', 'bravoflow'],
    buildStages: () => [
      baseStage({ order: 0, isInitialStage: true, name: 'Solicitação', stageType: 'documentation', color: '#6366F1', requireComment: true, requireForms: true }),
      baseStage({ order: 1, name: 'Aprovação Qualidade', stageType: 'validation', color: '#14B8A6' }),
      baseStage({ order: 2, name: 'Roteirização', stageType: 'execution', color: '#3B82F6' }),
      baseStage({ order: 3, name: 'Em Retirada', stageType: 'execution', color: '#8B5CF6', requireAttachments: true }),
      baseStage({ order: 4, isFinalStage: true, name: 'Concluída', stageType: 'custom', color: '#10B981' }),
    ],
  },

  {
    id: 'pedido-compra',
    label: 'Pedido de Compra',
    category: 'operacional',
    icon: '🛒',
    color: '#F97316',
    description: 'Pedido → Cotação → Aprovação → Compra → Recebimento',
    technicalSummary: '5 etapas. Solicitante pede → Setor cota fornecedores → Gerência aprova → Comprador executa → Almoxarifado recebe e registra NF.',
    tags: ['compra', 'almoxarifado', 'financeiro'],
    buildStages: () => [
      baseStage({ order: 0, isInitialStage: true, name: 'Pedido', stageType: 'documentation', color: '#6366F1', requireComment: true }),
      baseStage({ order: 1, name: 'Cotação', stageType: 'execution', color: '#8B5CF6', requireAttachments: true }),
      baseStage({ order: 2, name: 'Aprovação Financeira', stageType: 'validation', color: '#14B8A6' }),
      baseStage({ order: 3, name: 'Compra', stageType: 'execution', color: '#F97316' }),
      baseStage({ order: 4, isFinalStage: true, name: 'Recebimento + NF', stageType: 'documentation', color: '#10B981', requireAttachments: true, requireForms: true }),
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // DOCUMENTAÇÃO
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'registro-incidente',
    label: 'Registro de Incidente',
    category: 'documentacao',
    icon: '🚨',
    color: '#EF4444',
    description: 'Notificação Inicial → Investigação → Análise Causa → Plano Ação → Encerramento',
    technicalSummary: '5 etapas. Captura incidente em tempo real, investiga, identifica causa raiz, define ações corretivas e arquiva.',
    tags: ['incidente', 'segurança', 'qualidade', 'auditoria'],
    buildStages: () => [
      baseStage({ order: 0, isInitialStage: true, name: 'Notificação Inicial', stageType: 'documentation', color: '#EF4444', requireComment: true, requireAttachments: true }),
      baseStage({ order: 1, name: 'Investigação', stageType: 'execution', color: '#F59E0B', requireAttachments: true }),
      baseStage({ order: 2, name: 'Análise de Causa Raiz', stageType: 'documentation', color: '#6366F1', requireForms: true }),
      baseStage({ order: 3, name: 'Plano de Ação', stageType: 'documentation', color: '#3B82F6', requireComment: true }),
      baseStage({ order: 4, isFinalStage: true, name: 'Encerramento', stageType: 'validation', color: '#10B981' }),
    ],
  },

  {
    id: 'documentacao-ativos',
    label: 'Documentação de Ativos',
    category: 'documentacao',
    icon: '📦',
    color: '#6366F1',
    description: 'Cadastro → Conferência → Foto/Anexo → Catalogado',
    technicalSummary: '4 etapas. Para inventários, registro de equipamentos, cadastro de produtos. Cada etapa exige formulário ou anexo.',
    tags: ['ativos', 'inventário', 'cadastro'],
    buildStages: () => [
      baseStage({ order: 0, isInitialStage: true, name: 'Cadastro Inicial', stageType: 'documentation', color: '#6366F1', requireForms: true }),
      baseStage({ order: 1, name: 'Conferência Física', stageType: 'execution', color: '#8B5CF6', requireAttachments: true }),
      baseStage({ order: 2, name: 'Validação', stageType: 'validation', color: '#14B8A6' }),
      baseStage({ order: 3, isFinalStage: true, name: 'Catalogado', stageType: 'custom', color: '#10B981' }),
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // COMUNICAÇÃO / NOTIFICAÇÃO
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'aviso-cliente',
    label: 'Aviso ao Cliente',
    category: 'comunicacao',
    icon: '📨',
    color: '#06B6D4',
    description: 'Trigger → E-mail → Aguardar Resposta → Encerramento',
    technicalSummary: '4 etapas. Dispara e-mail/WhatsApp ao cliente, aguarda janela de resposta (timer), e arquiva. Útil para SLA e cobranças.',
    tags: ['comunicação', 'cliente', 'notificação', 'sla'],
    buildStages: () => [
      baseStage({ order: 0, isInitialStage: true, name: 'Disparo Inicial', stageType: 'documentation', color: '#6366F1' }),
      baseStage({ order: 1, name: 'Notificar Cliente', stageType: 'notification', color: '#06B6D4' }),
      baseStage({ order: 2, name: 'Aguardar Resposta (48h)', stageType: 'waiting', color: '#EF4444' }),
      baseStage({ order: 3, isFinalStage: true, name: 'Encerrado', stageType: 'custom', color: '#10B981' }),
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // EM BRANCO
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'em-branco',
    label: 'Começar do Zero',
    category: 'completo',
    icon: '✨',
    color: '#9CA3AF',
    description: 'Workflow vazio — você cria todas as etapas',
    technicalSummary: 'Sem etapas pré-definidas. Use quando seu processo não se encaixa em nenhum preset.',
    tags: ['vazio', 'custom'],
    buildStages: () => [],
  },
];

/** Categorias para o seletor de presets */
export const PRESET_CATEGORIES: Array<{ id: WorkflowPreset['category'] | 'todos'; label: string; icon: string }> = [
  { id: 'todos',         label: 'Todos',          icon: '📋' },
  { id: 'aprovacao',     label: 'Aprovação',      icon: '✅' },
  { id: 'operacional',   label: 'Operacional',    icon: '⚙️' },
  { id: 'documentacao',  label: 'Documentação',   icon: '📝' },
  { id: 'comunicacao',   label: 'Comunicação',    icon: '📧' },
  { id: 'completo',      label: 'Completos',      icon: '⭐' },
];

export function getPresetById(id: string): WorkflowPreset | undefined {
  return WORKFLOW_PRESETS.find(p => p.id === id);
}

export function getPresetsByCategory(category: WorkflowPreset['category'] | 'todos'): WorkflowPreset[] {
  if (category === 'todos') return WORKFLOW_PRESETS;
  return WORKFLOW_PRESETS.filter(p => p.category === category);
}
