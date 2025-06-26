import { Timestamp } from "firebase/firestore";

// --- Tipos de Utilizadores ---
export interface AppUser {
  uid: string;
  name: string;
  email: string;
  role: 'Admin' | 'Collaborator';
  companyId?: string;
  departmentId?: string;
}

// O tipo 'Collaborator' representa os dados guardados na subcoleção
// e os dados que passamos para a página do colaborador.
export interface Collaborator {
  id: string; // ID do documento do colaborador
  username: string;
  password?: string; // Apenas para verificação, não deve ser exposto na UI
  departmentId?: string; // ID do departamento a que pertence
}

// --- Tipos de Formulários ---
export interface FormField {
  id: number;
  type: 'Texto' | 'Anexo' | 'Assinatura' | 'Caixa de Seleção' | 'Múltipla Escolha' | 'Data' | 'Cabeçalho';
  label: string;
  options?: string[];
}

export interface Form {
  id: string;
  title: string;
  fields: FormField[];
  companyId: string;
  departmentId: string;
  automation: { type: string; target: string; };
  ownerId: string;
  collaborators: string[];
  authorizedUsers: string[];
  createdAt?: Timestamp;
}

// --- Outros Tipos ---
export interface Company {
  id: string;
  name: string;
}

export interface Department {
  id: string;
  name: string;
}
