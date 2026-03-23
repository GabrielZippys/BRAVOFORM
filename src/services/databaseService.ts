// Definição local do tipo DatabaseConfig para evitar dependência circular
interface DatabaseConfig {
  dbType: 'mysql' | 'postgresql' | 'sqlserver';
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  connectionTimeout?: number;
}

export class DatabaseService {
  private static async callAPI(action: 'test' | 'getTables' | 'getTableSchema', config: DatabaseConfig, tableName?: string) {
    const response = await fetch('/api/database/connect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action,
        config,
        tableName
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erro na conexão com o banco de dados');
    }

    return response.json();
  }

  static async testConnection(config: DatabaseConfig): Promise<boolean> {
    try {
      const result = await this.callAPI('test', config);
      return result.success;
    } catch (error) {
      console.error('Erro ao testar conexão:', error);
      throw error;
    }
  }

  static async getTables(config: DatabaseConfig): Promise<string[]> {
    try {
      const result = await this.callAPI('getTables', config);
      return result.tables;
    } catch (error) {
      console.error('Erro ao obter tabelas:', error);
      throw error;
    }
  }

  static async getTableSchema(config: DatabaseConfig, tableName: string): Promise<{ columns: string[], sampleData: any[] }> {
    try {
      const result = await this.callAPI('getTableSchema', config, tableName);
      return result;
    } catch (error) {
      console.error('Erro ao obter esquema da tabela:', error);
      throw error;
    }
  }
}
