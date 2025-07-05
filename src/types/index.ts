import { Timestamp } from "firebase/firestore";
import { ReactNode } from "react";

// --- Tipo de Utilizador Unificado ---
// Define a estrutura de um utilizador na coleção 'users' do Firestore.
export interface AppUser {
  password: string;
  id(arg0: string, arg1: string, id: any): import("@firebase/firestore").QueryConstraint;
  username: ReactNode;
  uid: string;
  name: string;
  email: string;
  role: 'Admin' | 'Collaborator';
  companyId?: string;
  departmentId?: string;
  createdAt?: Timestamp;
  canViewHistory?: boolean;
  canEditHistory?: boolean;
}

// --- Tipos de Formulários ---
export type FormField = {
  id: number;
  type: 'Texto' | 'Anexo' | 'Assinatura' | 'Caixa de Seleção' | 'Múltipla Escolha' | 'Data' | 'Cabeçalho' | 'Tabela';
  label: string;
  options?: string[];
  columns?: {
    id: number;
    label: string;
    type: 'Texto' | 'Data' | 'Caixa de Seleção' | 'Múltipla Escolha';
  }[];
};

// Define a estrutura de um formulário, incluindo campos, automação e colaboradores.



export interface Form {
  id: string;
  title: string;
  description?: string;
  fields: FormField[];
  companyId: string;
  departmentId: string;
  automation: {
    type: string;
    target: string;
    frequency?: string;
  };
  ownerId: string;
  collaborators: string[];
  authorizedUsers: string[];
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  status: 'active' | 'draft' | 'archived';
  responseCount?: number;
}

// --- Tipo de Resposta de Formulário ---
export interface FormResponse {
  answers(answers: any, label: string): unknown;
  id: string;
  formId: string;
  formTitle: string;
  companyId: string;
  departmentId: string;
  collaboratorId: string;
  collaboratorName: string;
  responses: Record<string, any>;
  submittedAt: Timestamp;
  completed: boolean;
  status: 'pending' | 'submitted' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  reviewComments?: string;
}

// --- Tipos de Organização ---
export interface Company {
  id: string;
  name: string;
  description?: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  ownerId: string;
  departmentsCount?: number;
  usersCount?: number;
}

export interface Department {
  id: string;
  name: string;
  companyId: string;
  description?: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  managerId?: string;
  usersCount?: number;
}

// --- Tipos Adicionais ---
export type Collaborator = AppUser;

export interface DashboardStats {
  totalForms: number;
  totalResponses: number;
  activeUsers: number;
  completionRate: number;
  responsesByDay: Array<{ date: string; count: number }>;
  formsByStatus: Array<{ status: string; count: number }>;
  recentForms: Form[];
  recentResponses: FormResponse[];
}

export interface ChartData {
  name: string;
  value: number;
  color?: string;
}

export interface FilterOptions {
  companyId: string;
  departmentId: string;
  timeRange: 'day' | 'week' | 'month' | 'year' | 'custom';
  startDate?: Date;
  endDate?: Date;
  status?: string;
}
