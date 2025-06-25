

export interface FormField {
  id: number;
  type: 'Texto' | 'Anexo' | 'Assinatura';
  label: string;
}

// CORREÇÃO: Adicionadas as propriedades que faltavam para o formulário
export interface Form {
    id: string; 
    title: string;
    fields: FormField[];
    companyId: string;
    departmentId: string;
    automation: { type: string, target: string };
    assignedCollaborators?: string[];
}

export interface Company { id: string; name: string; }
export interface Department { id: string; name: string; }
export interface Collaborator { id: string; username: string; }
