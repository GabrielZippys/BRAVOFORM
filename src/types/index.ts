// --- Tipos de Dados Globais ---

// Define a estrutura de um campo dentro de um formulário
export interface FormField {
  id: number;
  type: 'Texto' | 'Anexo' | 'Assinatura';
  label: string;
}

// Define a estrutura de um formulário completo
// CORREÇÃO: Adicionadas as propriedades que faltavam
export interface Form {
    id: string; 
    title: string;
    fields: FormField[];
    companyId: string;
    departmentId: string;
    automation: { type: string, target: string };
    assignedCollaborators?: string[];
}

// Outros tipos que usamos no projeto
export interface Company { id: string; name: string; }
export interface Department { id: string; name: string; }
export interface Collaborator { id: string; username: string; }
