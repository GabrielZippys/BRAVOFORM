import type { StageType } from '@/types';

export interface StageTypeDefinition {
  type: StageType;
  label: string;
  description: string;
  icon: string;
  color: string;
  examples: string;
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
  };
}

export const STAGE_TYPES: StageTypeDefinition[] = [
  { 
    type: 'execution', 
    label: 'Execução', 
    description: 'Trabalho em andamento',
    icon: '⚙️',
    color: '#8B5CF6',
    examples: 'Em Execução, Desenvolvimento, Produção',
    fields: {
      requireComment: false,
      requireAttachments: true,
      showNotifications: false,
    }
  },
  { 
    type: 'waiting', 
    label: 'Aguardando', 
    description: 'Aguardando ação externa',
    icon: '⏳',
    color: '#EF4444',
    examples: 'Aguardando Peça, Aguardando Cliente, Pendente',
    fields: {
      showTimer: true,
      hideUserPermissions: true,
    }
  },
  { 
    type: 'notification', 
    label: 'Notificação', 
    description: 'Envio de comunicações',
    icon: '📧',
    color: '#06B6D4',
    examples: 'Notificar Cliente, Enviar Email, Alerta',
    fields: {
      showNotifications: true,
    }
  },
  { 
    type: 'documentation', 
    label: 'Documentação', 
    description: 'Registro e arquivamento',
    icon: '📝',
    color: '#6366F1',
    examples: 'Registrar Informações, Arquivar, Documentar',
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
    description: 'Verificação e validação',
    icon: '✅',
    color: '#14B8A6',
    examples: 'Validar Dados, Checklist, Conferência',
    fields: {
      requireComment: false,
      showValidation: true,
    }
  },
  { 
    type: 'custom', 
    label: 'Personalizada', 
    description: 'Etapa customizada',
    icon: '⭐',
    color: '#6B7280',
    examples: 'Etapa Específica do Processo',
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
