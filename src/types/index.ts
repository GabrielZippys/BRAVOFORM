import { Timestamp, DocumentReference, DocumentData, FieldValue } from "firebase/firestore";
import { ReactNode } from "react";

// --- TIPO PARA UTILIZADORES DO FIREBASE AUTH (ADMINS) ---
export interface AppUser {
  uid: string;
  name: string;
  email: string;
  role: 'Admin';
  // Admins podem não ter essas associações diretas, tornando-as opcionais
  companyId?: string;
  departmentId?: string;
  createdAt?: Timestamp;
}

// --- TIPO PARA COLABORADORES (GERENCIADOS NO FIRESTORE) ---
// Este é um tipo separado e mais preciso para seus colaboradores
export interface Collaborator {
  id: string;          // O ID do documento do colaborador
  username: string;
  password?: string;     // A senha que você armazena
  email?: string;        // Para envio de notificações ou resets
  companyId: string;
  departmentId: string;
  isTemporaryPassword?: boolean; // Para o fluxo de reset de senha
  canViewHistory?: boolean;
  canEditHistory?: boolean;
  ref?: DocumentReference<DocumentData, DocumentData>; // Referência para o documento
}

// --- TIPOS DE FORMULÁRIOS ---
// Substitua as definições existentes por estas:

// --- TIPOS DE FORMULÁRIOS (UNIFICADO E CORRIGIDO) ---

// Tipo para os campos dentro de um formulário
export interface FormField {
  id: string; // IDs como string são mais flexíveis
  type: 'Texto' | 'Anexo' | 'Assinatura' | 'Caixa de Seleção' | 'Múltipla Escolha' | 'Data' | 'Cabeçalho' | 'Tabela';
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
};

// A interface principal e unificada para um Formulário
export interface Form {
  id: string;
  title: string;
  description?: string;
  fields: FormField[]; // Certifique-se que FormField também está definido neste arquivo
  companyId: string;
  departmentId: string;
  collaborators: string[];
  authorizedUsers: string[];
  status?: 'active' | 'draft' | 'archived';
  order?: number;
  
  // CORREÇÃO: Permite FieldValue (de serverTimestamp()) e null (para estado inicial)
  createdAt: Timestamp | FieldValue | null;
  updatedAt?: Timestamp | FieldValue;

  // Campos que estavam faltando, vindos do 'EnhancedFormDraft'
  theme: {
    bgColor: string;
    bgImage?: string;
    accentColor: string;
    fontColor: string;
    borderRadius: number;
    spacing: 'compact' | 'normal' | 'spacious';
  };
  settings: {
    allowSave: boolean;
    showProgress: boolean;
    confirmBeforeSubmit: boolean;
  };
  automation?: {
    type: 'email' | 'whatsapp';
    target: string;
  };
}
// --- TIPO DE RESPOSTA DE FORMULÁRIO (CORRIGIDO) ---
export interface FormResponse {
  id: string;
  formId: string;
  createdAt: Timestamp;
  formTitle: string;
  companyId: string;
  departmentId: string;
  collaboratorId: string;
  collaboratorUsername: string; 
  answers: Record<string, any>;
  submittedAt: Timestamp;
  status: 'pending' | 'approved' | 'rejected';
}

// --- TIPOS DE ORGANIZAÇÃO ---
export interface Company {
  id: string;
  name: string;
  createdAt: Timestamp;
  // Outros campos podem ser adicionados conforme necessário
}

export interface Department {
  id: string;
  name: string;
  companyId: string;
  createdAt: Timestamp;
}

// --- TIPO PARA NOTIFICAÇÕES (COMO NO HEADER) ---
export interface ResetNotification {
  id: string;
  collaboratorId: string;
  collaboratorUsername: string;
  status: 'pending' | 'completed';
  createdAt: Timestamp;
}