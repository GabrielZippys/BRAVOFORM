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
}

// --- CAMPOS DO FORMULÁRIO ---
export interface FormField {
  id: string;
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
  automation?: {
    type: 'email' | 'whatsapp';
    target: string;
  };
}

// --- TIPO DE RESPOSTA DE FORMULÁRIO ---
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
