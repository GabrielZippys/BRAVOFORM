import { getDataConnect, connectDataConnectEmulator } from '@firebase/data-connect';
import { app } from '../../firebase/config';

// Configuração do Data Connect
const dataConnectConfig = {
  connector: 'formbravo-8854e-service',
  service: 'formbravo-8854e-service',
  location: 'southamerica-east1'
};

// Inicializar Data Connect
export const dataConnect = getDataConnect(app, dataConnectConfig);

// Para desenvolvimento local (opcional)
export function connectToEmulator() {
  if (process.env.NODE_ENV === 'development') {
    try {
      connectDataConnectEmulator(dataConnect, 'localhost', 9399);
      console.log('Data Connect conectado ao emulador');
    } catch (error) {
      console.warn('Não foi possível conectar ao emulador Data Connect:', error);
    }
  }
}

// Tipos para tabelas de exemplo
export interface Product {
  id: string;
  name: string;
  price: number;
  description?: string;
  created_at: Date;
}

export interface Order {
  id: string;
  product_id: string;
  quantity: number;
  total: number;
  status: string;
  created_at: Date;
}

// Funções helper para queries (vamos implementar depois que criar o schema)
export const DataConnectService = {
  // Placeholder - vamos adicionar queries depois
  isConnected: () => {
    return dataConnect !== null;
  }
};
