import type { StageType } from '@/types';

/**
 * StageTypeDefinition — Catálogo técnico dos tipos de etapa.
 *
 * Cada tipo define:
 *  • `behavior`   — descrição técnica do que acontece quando a etapa é executada
 *  • `inputs`     — o que a etapa consome (anexos, comentários, formulários, timer)
 *  • `outputs`    — o que a etapa produz (transição, e-mail, registro)
 *  • `whoAdvances` — quem dispara a saída (usuário humano, timer, evento)
 *
 * Esses metadados são usados pelo StageConfigPanel para mostrar ao admin
 * EXATAMENTE o que cada etapa fará em runtime.
 */
export interface StageTypeDefinition {
  type: StageType;
  label: string;
  description: string;
  icon: string;
  color: string;
  examples: string;

  /** Resumo técnico mostrado ao admin */
  behavior: string;
  inputs: string[];
  outputs: string[];
  whoAdvances: 'usuario' | 'timer' | 'sistema' | 'evento_externo';

  fields: {
    requireComment?: boolean;
    requireAttachments?: boolean;
    requireApproval?: boolean;
    requireForms?: boolean;
    showNotifications?: boolean;
    showDocumentation?: boolean;
    showValidation?: boolean;
    showTimer?: boolean;
    hideUserPermissions?: boolean;
    showSubWorkflow?: boolean;
    showParallelConfig?: boolean;
    showIdentityLookup?: boolean;
  };
}

export const STAGE_TYPES: StageTypeDefinition[] = [
  {
    type: 'identity-validation',
    label: 'Validação de Identidade',
    description: 'Colaborador digita seu ID e confirma identidade antes de seguir',
    icon: '🪪',
    color: '#0EA5E9',
    examples: 'Digite sua matrícula, Identifique-se com seu CPF, Confirme seus dados',
    behavior: 'O colaborador digita um identificador (matrícula, CPF, etc.) e o sistema busca em uma tabela externa (ex: cadastro do RH alimentado por Pentaho). Os dados encontrados são exibidos para o colaborador confirmar "Sou eu, prosseguir". A identidade fica vinculada à instância do workflow para uso nas etapas seguintes e no histórico.',
    inputs: ['ID digitado pelo colaborador', 'Configuração de tabela/coluna pelo admin'],
    outputs: ['Identidade validada gravada na instância (identity_table, identity_value, identity_data)', 'Avança para a próxima etapa'],
    whoAdvances: 'usuario',
    fields: {
      hideUserPermissions: true,
      showIdentityLookup: true,
    }
  },
  {
    type: 'execution',
    label: 'Execução',
    description: 'Trabalho operacional em andamento',
    icon: '⚙️',
    color: '#8B5CF6',
    examples: 'Em Execução, Desenvolvimento, Produção, Coleta',
    behavior: 'Mantém a instância "em trabalho" até que um usuário autorizado marque como concluída. Pode receber gatilho automático para iniciar.',
    inputs: ['Anexos do executor', 'Eventos de gatilho (opcional)'],
    outputs: ['Avança para próxima etapa', 'Registra anexos no histórico'],
    whoAdvances: 'usuario',
    fields: {
      requireComment: false,
      requireAttachments: true,
      showNotifications: false,
    }
  },
  {
    type: 'waiting',
    label: 'Aguardando',
    description: 'Pausa temporal — espera ação externa ou prazo',
    icon: '⏳',
    color: '#EF4444',
    examples: 'Aguardando Peça, Aguardando Cliente, Cooldown 24h',
    behavior: 'Permanece bloqueada até o timer expirar. Avança automaticamente quando o tempo configurado esgotar.',
    inputs: ['Timer (horas / dias / data específica)'],
    outputs: ['Avança automaticamente após timeout'],
    whoAdvances: 'timer',
    fields: {
      showTimer: true,
      hideUserPermissions: true,
    }
  },
  {
    type: 'notification',
    label: 'Notificação',
    description: 'Envia comunicação automatizada e avança',
    icon: '📧',
    color: '#06B6D4',
    examples: 'Notificar Cliente, Alerta SLA, Confirmação por E-mail',
    behavior: 'Dispara e-mail e/ou WhatsApp para destinatários configurados e imediatamente avança para a próxima etapa. Não exige interação humana.',
    inputs: ['Lista de destinatários (e-mails / números)', 'Mensagem template'],
    outputs: ['E-mail enviado', 'WhatsApp enviado', 'Avança automaticamente'],
    whoAdvances: 'sistema',
    fields: {
      showNotifications: true,
    }
  },
  {
    type: 'documentation',
    label: 'Documentação',
    description: 'Coleta de informação obrigatória (formulários + anexos)',
    icon: '📝',
    color: '#6366F1',
    examples: 'Registrar NF, Arquivar Documento, Preencher Checklist',
    behavior: 'Exige que o usuário preencha formulário(s) específico(s) e anexe arquivos antes de avançar. Histórico fica auditável.',
    inputs: ['Formulários selecionados', 'Anexos obrigatórios', 'Comentário'],
    outputs: ['Respostas armazenadas em fact_form_response', 'Anexos vinculados', 'Avança após validação dos campos'],
    whoAdvances: 'usuario',
    fields: {
      requireComment: true,
      requireAttachments: true,
      requireForms: true,
      showDocumentation: true,
    }
  },
  {
    type: 'validation',
    label: 'Validação',
    description: 'Aprovação / Reprovação por responsável',
    icon: '✅',
    color: '#14B8A6',
    examples: 'Aprovação Qualidade, Conferência Gerencial, Visto do Supervisor',
    behavior: 'Apresenta os dados das etapas anteriores ao validador. Decisões disponíveis: Aprovar (avança), Aprovar com Edição, Reprovar (volta etapa) ou Destruir Workflow.',
    inputs: ['Dados consolidados das etapas anteriores', 'Comentário (em rejeição)'],
    outputs: ['Próxima etapa OU etapa anterior OU cancelamento', 'Registro de quem decidiu + timestamp'],
    whoAdvances: 'usuario',
    fields: {
      requireComment: false,
      showValidation: true,
    }
  },
  {
    type: 'parallel-fork',
    label: 'Bifurcação Paralela',
    description: 'Divide o fluxo em N caminhos que executam ao mesmo tempo',
    icon: '🔀',
    color: '#0EA5E9',
    examples: 'Pedido → [Aprovação Financeira ‖ Aprovação Técnica ‖ Aprovação Jurídica]',
    behavior: 'Quando uma instância chega aqui, ela é replicada em N paths paralelos definidos pelas conexões de saída. Cada path executa de forma independente. Todos devem convergir em uma etapa do tipo "Junção Paralela" mais adiante.',
    inputs: ['Conexões de saída no canvas (cada uma vira um path paralelo)'],
    outputs: ['N "sub-instâncias" virtuais, uma por path'],
    whoAdvances: 'sistema',
    fields: {
      hideUserPermissions: true,
      showParallelConfig: true,
    }
  },
  {
    type: 'parallel-join',
    label: 'Junção Paralela',
    description: 'Aguarda todos paths paralelos chegarem aqui',
    icon: '🔁',
    color: '#0284C7',
    examples: 'Após [Financeiro ‖ Técnico ‖ Jurídico] → todos aprovaram → seguir',
    behavior: 'Espera N paths paralelos chegarem. Configure quantos paths devem completar antes de avançar (default = todos). Suporta timeout para forçar avanço mesmo se algum path não chegar.',
    inputs: ['Sinais de conclusão dos paths paralelos'],
    outputs: ['Avança para próxima etapa quando condição atendida'],
    whoAdvances: 'sistema',
    fields: {
      hideUserPermissions: true,
      showParallelConfig: true,
      showTimer: true,
    }
  },
  {
    type: 'sub-workflow',
    label: 'Sub-Workflow',
    description: 'Invoca outro workflow como sub-rotina',
    icon: '🔗',
    color: '#7C3AED',
    examples: 'Aprovação Compra → executa "Workflow de Cotação" → continua quando completo',
    behavior: 'Spawnar uma nova instância de outro workflow vinculada por parent_response_id. Modo "wait" pausa o pai até o sub completar; "fire-and-forget" continua imediatamente.',
    inputs: ['ID do workflow alvo + mapeamento de campos opcional'],
    outputs: ['Nova instância do sub-workflow + retorno ao pai quando concluído'],
    whoAdvances: 'evento_externo',
    fields: {
      showSubWorkflow: true,
      hideUserPermissions: true,
    }
  },
  {
    type: 'custom',
    label: 'Personalizada',
    description: 'Etapa livre — você define o comportamento',
    icon: '⭐',
    color: '#6B7280',
    examples: 'Etapa específica do seu processo',
    behavior: 'Comportamento livre. Use quando nenhum dos tipos pré-definidos atende ao seu caso. Defina manualmente os requisitos.',
    inputs: ['Configuração manual'],
    outputs: ['Conforme configurado'],
    whoAdvances: 'usuario',
    fields: {
      requireComment: false,
      requireAttachments: false,
      showNotifications: false,
    }
  }
];

export function getStageTypeDefinition(type: StageType): StageTypeDefinition {
  return STAGE_TYPES.find(st => st.type === type) || STAGE_TYPES[STAGE_TYPES.length - 1];
}

export function getDefaultColorForType(type: StageType): string {
  return getStageTypeDefinition(type).color;
}

/**
 * Tradução visual de `whoAdvances` para o admin.
 */
export function getAdvanceLabel(whoAdvances: StageTypeDefinition['whoAdvances']): string {
  switch (whoAdvances) {
    case 'usuario':        return '👤 Usuário decide quando avançar';
    case 'timer':          return '⏱️ Avança automaticamente quando o timer expira';
    case 'sistema':        return '🤖 Sistema avança após enviar a notificação';
    case 'evento_externo': return '📡 Aguarda evento externo (webhook / API)';
  }
}
