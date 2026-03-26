/**
 * Serviço centralizado de Dual-Save
 * Sincroniza automaticamente Firestore → PostgreSQL
 * 
 * USO:
 * import { dualSave } from '@/services/dualSaveService';
 * 
 * // Após salvar no Firestore:
 * dualSave.saveFormResponse(responseData);
 * dualSave.saveForm(formData);
 * dualSave.saveProduct(productData);
 * dualSave.saveUser(userData);
 */

const API_BASE = '/api/dataconnect';

// Helper para chamadas fire-and-forget
const fireAndForget = async (url: string, method: 'POST' | 'DELETE', body?: any) => {
  try {
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    
    if (body && method === 'POST') {
      options.body = JSON.stringify(body);
    }
    
    fetch(url, options).catch(err => 
      console.warn(`[DualSave] PostgreSQL sync falhou (${url}):`, err)
    );
  } catch (err) {
    console.warn(`[DualSave] Erro ao sincronizar:`, err);
  }
};

export const dualSave = {
  
  // ========== FORM RESPONSES ==========
  saveFormResponse: (data: {
    responseId: string;
    formId: string;
    formTitle: string;
    companyId: string;
    departmentId: string;
    department: string;
    collaboratorId: string;
    collaboratorUsername: string;
    status: string;
    answers: Record<string, any>;
    fieldMetadata?: Record<string, any>;
  }) => {
    fireAndForget(`${API_BASE}/save-response`, 'POST', data);
  },

  deleteFormResponse: (responseId: string) => {
    fireAndForget(`${API_BASE}/save-response?id=${responseId}`, 'DELETE');
  },

  // ========== FORMS ==========
  saveForm: (data: {
    formId: string;
    title: string;
    description?: string;
    companyId: string;
    departmentId: string;
    departmentName?: string;
    isActive?: boolean;
    fields: any[];
  }) => {
    fireAndForget(`${API_BASE}/save-form`, 'POST', {
      formId: data.formId,
      title: data.title,
      description: data.description || '',
      companyId: data.companyId,
      departmentId: data.departmentId,
      departmentName: data.departmentName || '',
      isActive: data.isActive !== false,
      fieldsJson: JSON.stringify(data.fields),
    });
  },

  deleteForm: (formId: string) => {
    fireAndForget(`${API_BASE}/save-form?id=${formId}`, 'DELETE');
  },

  // ========== PRODUCTS ==========
  saveProduct: (data: {
    productId: string;
    catalogId: string;
    nome?: string;
    name?: string;
    codigo?: string;
    ean?: string;
    unidade?: string;
    quantidadeMax?: number;
    quantidadeMin?: number;
    preco?: number;
    estoque?: number;
    collection?: string;
    companyId?: string;
  }) => {
    fireAndForget(`${API_BASE}/save-product`, 'POST', data);
  },

  deleteProduct: (productId: string) => {
    fireAndForget(`${API_BASE}/save-product?id=${productId}`, 'DELETE');
  },

  // ========== PRODUCT CATALOGS ==========
  saveCatalog: (data: {
    catalogId: string;
    name: string;
    description?: string;
    companyId?: string;
    displayField?: string;
    searchFields?: string[];
    valueField?: string;
    fields?: any[];
    additionalFields?: any[];
  }) => {
    fireAndForget(`${API_BASE}/save-catalog`, 'POST', data);
  },

  deleteCatalog: (catalogId: string) => {
    fireAndForget(`${API_BASE}/save-catalog?id=${catalogId}`, 'DELETE');
  },

  // ========== USERS ==========
  saveUser: (data: {
    userId: string;
    name: string;
    email: string;
    role?: string;
    companyId?: string;
    departmentId?: string;
  }) => {
    fireAndForget(`${API_BASE}/save-user`, 'POST', data);
  },

  deleteUser: (userId: string) => {
    fireAndForget(`${API_BASE}/save-user?id=${userId}`, 'DELETE');
  },

  // ========== COLLABORATORS ==========
  saveCollaborator: (data: {
    collaboratorId: string;
    uid?: string;
    username: string;
    name?: string;
    email?: string;
    role?: string;
    active?: boolean;
    companyId?: string;
    departmentId?: string;
    departmentName?: string;
    isTemporaryPassword?: boolean;
    canViewHistory?: boolean;
    canEditHistory?: boolean;
    permissions?: Record<string, boolean>;
  }) => {
    fireAndForget(`${API_BASE}/save-collaborator`, 'POST', data);
  },

  deleteCollaborator: (collaboratorId: string) => {
    fireAndForget(`${API_BASE}/save-collaborator?id=${collaboratorId}`, 'DELETE');
  },

  // ========== COMPANIES ==========
  saveCompany: (data: {
    companyId: string;
    name: string;
  }) => {
    fireAndForget(`${API_BASE}/save-company`, 'POST', data);
  },

  deleteCompany: (companyId: string) => {
    fireAndForget(`${API_BASE}/save-company?id=${companyId}`, 'DELETE');
  },

  // ========== DEPARTMENTS ==========
  saveDepartment: (data: {
    departmentId: string;
    name: string;
    companyId: string;
  }) => {
    fireAndForget(`${API_BASE}/save-department`, 'POST', data);
  },

  deleteDepartment: (departmentId: string) => {
    fireAndForget(`${API_BASE}/save-department?id=${departmentId}`, 'DELETE');
  },
};

// Export default para uso alternativo
export default dualSave;
