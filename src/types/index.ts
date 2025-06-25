/**********************************************************************************
 * TIPOS DE DADOS GLOBAIS - VERSÃO CORRIGIDA
 *
 * Use este ficheiro como a sua fonte única de verdade para os tipos de dados.
 * Ele contém todas as atualizações necessárias para o FormEditor e as regras
 * de segurança do Firestore.
 *
 **********************************************************************************/


// --- Tipos para Formulários ---

/**
 * Define a estrutura de um campo individual dentro de um formulário.
 * O tipo 'type' foi expandido para incluir todas as novas opções de campo.
 */
export interface FormField {
  id: number;
  type: 'Texto' | 'Anexo' | 'Assinatura' | 'Caixa de Seleção' | 'Múltipla Escolha' | 'Data' | 'Cabeçalho';
  label: string;
  options?: string[]; // Usado APENAS para 'Caixa de Seleção' e 'Múltipla Escolha'
}

/**
 * Define a estrutura de um documento de formulário completo no Firestore.
 * Inclui os campos de segurança 'ownerId', 'collaborators', e 'authorizedUsers'.
 */
export interface Form {
  id: string;
  title: string;
  fields: FormField[];
  companyId: string;
  departmentId: string;
  automation: { type: string; target: string; };
  
  // --- Campos de Segurança e Colaboração ---
  ownerId: string;              // Dono do formulário (UID do Firebase)
  collaborators: string[];      // Lista de IDs dos colaboradores atribuídos
  authorizedUsers: string[];    // Lista de IDs do Dono + Colaboradores (para regras de segurança)
  
  createdAt?: any; // ou importe e use o tipo Timestamp do Firebase
}


// --- Outros Tipos de Dados do Projeto ---

/** Define a estrutura de um documento de Empresa */
export interface Company {
  id: string;
  name: string;
}

/** Define a estrutura de um documento de Departamento */
export interface Department {
  id: string;
  name: string;
}

/** Define a estrutura de um documento de Colaborador */
export interface Collaborator {
  id: string;
  username: string;
  // pode adicionar outros campos como email, se necessário
  // email?: string;
}
