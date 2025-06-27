import { Timestamp } from "firebase/firestore";

// --- Tipo de Utilizador Unificado ---
export interface AppUser {
  uid: string;
  name: string;
  email: string;
  role: 'Admin' | 'Collaborator';
  companyId?: string;
  departmentId?: string;
  createdAt?: Timestamp;
}

// --- Tipos de Formulários ---
export interface FormField {
  id: number;
  type: 'Texto' | 'Anexo' | 'Assinatura' | 'Caixa de Seleção' | 'Múltipla Escolha' | 'Data' | 'Cabeçalho';
  label: string;
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

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
  dueDate?: Timestamp;
  responseCount?: number;
}

export interface FormResponse {
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