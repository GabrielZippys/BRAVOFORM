import { Timestamp, DocumentReference, DocumentData } from "firebase/firestore";
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
export type FormField = {
  id: number;
  type: 'Texto' | 'Anexo' | 'Assinatura' | 'Caixa de Seleção' | 'Múltipla Escolha' | 'Data' | 'Cabeçalho' | 'Tabela';
  label: string;
  options?: string[];
  columns?: {
    id: number;
    label: string;
    type: 'Texto' | 'Data' | 'Caixa de Seleção' | 'Múltipla Escolha';
    options?: string[];
  }[];
  rows?: { id: number; label: string; }[];
};

export interface Form {
  id: string;
  title: string;
  description?: string; // descrição opcional do formulário
  fields: FormField[];
  companyId: string;
  departmentId: string;
  automation: {
    type: 'email' | 'whatsapp';
    target: string;
  };
  ownerId: string;
  collaborators: string[];
  authorizedUsers: string[];
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

// --- TIPO DE RESPOSTA DE FORMULÁRIO (CORRIGIDO) ---
export interface FormResponse {
  id: string;
  formId: string;
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