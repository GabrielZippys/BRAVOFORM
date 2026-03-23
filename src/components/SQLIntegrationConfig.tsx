'use client';

import React, { useState, useEffect } from 'react';
import { Database, RefreshCw, CheckCircle, XCircle, Settings, Play, Table } from 'lucide-react';
import type { SQLConnectionConfig, TableInfo, ColumnMapping, SQLImportConfig, DatabaseType } from '@/types';
import styles from '../../app/styles/SQLIntegration.module.css';

interface SQLIntegrationConfigProps {
  onSave: (config: SQLImportConfig) => Promise<void>;
  existingConfig?: SQLImportConfig;
  companyId: string;
  userId: string;
}

const PURCHASE_ORDER_FIELDS = [
  { value: 'orderNumber', label: 'Número do Pedido', required: true },
  { value: 'status', label: 'Status', required: true },
  { value: 'totalValue', label: 'Valor Total', required: true },
  { value: 'supplier.cnpj', label: 'CNPJ do Fornecedor', required: true },
  { value: 'supplier.name', label: 'Nome do Fornecedor', required: true },
  { value: 'supplier.address', label: 'Endereço do Fornecedor', required: false },
  { value: 'supplier.contact', label: 'Contato do Fornecedor', required: false },
  { value: 'createdBy', label: 'Criado Por (ID)', required: true },
  { value: 'createdByName', label: 'Criado Por (Nome)', required: true },
  { value: 'companyId', label: 'ID da Empresa', required: true },
  { value: 'departmentId', label: 'ID do Departamento', required: true },
];

export default function SQLIntegrationConfig({
  onSave,
  existingConfig,
  companyId,
  userId
}: SQLIntegrationConfigProps) {
  const [step, setStep] = useState<'connection' | 'table' | 'mapping' | 'schedule'>('connection');
  
  // Connection state
  const [connectionConfig, setConnectionConfig] = useState<Partial<SQLConnectionConfig>>({
    name: '',
    type: 'mysql',
    host: '',
    port: 3306,
    database: '',
    username: '',
    password: '',
    ssl: false,
    isActive: true
  });
  
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<'success' | 'failed' | null>(null);
  const [connectionError, setConnectionError] = useState<string>('');
  
  // Table selection state
  const [availableTables, setAvailableTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  
  // Mapping state
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  
  // Import config state
  const [importConfig, setImportConfig] = useState<Partial<SQLImportConfig>>({
    name: '',
    description: '',
    targetCollection: 'purchase_orders',
    syncMode: 'manual',
    scheduleInterval: 3600,
    isActive: true
  });

  const handlePortChange = (type: DatabaseType) => {
    const defaultPorts: Record<DatabaseType, number> = {
      mysql: 3306,
      postgresql: 5432,
      sqlserver: 1433,
      oracle: 1521
    };
    
    setConnectionConfig(prev => ({
      ...prev,
      type,
      port: defaultPorts[type]
    }));
  };

  const testConnection = async () => {
    setIsTestingConnection(true);
    setConnectionTestResult(null);
    setConnectionError('');

    try {
      // Simular teste de conexão (em produção, chamar API backend)
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Validações básicas
      if (!connectionConfig.host || !connectionConfig.database || !connectionConfig.username) {
        throw new Error('Preencha todos os campos obrigatórios');
      }

      setConnectionTestResult('success');
      
      // Após sucesso, carregar tabelas
      await loadTables();
      
    } catch (error: any) {
      setConnectionTestResult('failed');
      setConnectionError(error.message || 'Erro ao conectar ao banco de dados');
    } finally {
      setIsTestingConnection(false);
    }
  };

  const loadTables = async () => {
    setIsLoadingTables(true);
    try {
      // Simular carregamento de tabelas (em produção, chamar API backend)
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Tabelas de exemplo
      const mockTables: TableInfo[] = [
        {
          name: 'pedidos_compra',
          schema: 'dbo',
          columns: [
            { name: 'id', type: 'int', nullable: false, isPrimaryKey: true },
            { name: 'numero_pedido', type: 'varchar', nullable: false },
            { name: 'status', type: 'varchar', nullable: false },
            { name: 'valor_total', type: 'decimal', nullable: false },
            { name: 'cnpj_fornecedor', type: 'varchar', nullable: false },
            { name: 'nome_fornecedor', type: 'varchar', nullable: false },
            { name: 'endereco_fornecedor', type: 'varchar', nullable: true },
            { name: 'contato_fornecedor', type: 'varchar', nullable: true },
            { name: 'criado_por_id', type: 'varchar', nullable: false },
            { name: 'criado_por_nome', type: 'varchar', nullable: false },
            { name: 'data_criacao', type: 'datetime', nullable: false },
          ],
          rowCount: 1250
        },
        {
          name: 'fornecedores',
          schema: 'dbo',
          columns: [
            { name: 'id', type: 'int', nullable: false, isPrimaryKey: true },
            { name: 'cnpj', type: 'varchar', nullable: false },
            { name: 'razao_social', type: 'varchar', nullable: false },
          ],
          rowCount: 45
        }
      ];
      
      setAvailableTables(mockTables);
      
    } catch (error) {
      console.error('Erro ao carregar tabelas:', error);
    } finally {
      setIsLoadingTables(false);
    }
  };

  const handleTableSelect = (table: TableInfo) => {
    setSelectedTable(table);
    
    // Auto-criar mapeamentos sugeridos
    const suggestedMappings: ColumnMapping[] = PURCHASE_ORDER_FIELDS.map(field => {
      // Tentar encontrar coluna correspondente
      const matchingColumn = table.columns.find(col => {
        const colName = col.name.toLowerCase();
        const fieldName = field.value.toLowerCase().replace(/\./g, '_');
        return colName.includes(fieldName) || fieldName.includes(colName);
      });
      
      return {
        sourceColumn: matchingColumn?.name || '',
        targetField: field.value,
        transform: 'none',
        required: field.required
      };
    });
    
    setColumnMappings(suggestedMappings);
  };

  const updateMapping = (index: number, updates: Partial<ColumnMapping>) => {
    const updated = [...columnMappings];
    updated[index] = { ...updated[index], ...updates };
    setColumnMappings(updated);
  };

  const handleSaveConfig = async () => {
    try {
      const config: SQLImportConfig = {
        connectionId: 'temp-connection-id', // Será gerado pelo backend
        name: importConfig.name!,
        description: importConfig.description,
        tableName: selectedTable!.name,
        schema: selectedTable!.schema,
        targetCollection: 'purchase_orders',
        columnMappings,
        syncMode: importConfig.syncMode!,
        scheduleInterval: importConfig.scheduleInterval,
        isActive: importConfig.isActive!,
        createdAt: new Date() as any,
        createdBy: userId,
        companyId
      };
      
      await onSave(config);
      
    } catch (error) {
      console.error('Erro ao salvar configuração:', error);
      alert('Erro ao salvar configuração');
    }
  };

  const renderConnectionStep = () => (
    <div className={styles.stepContent}>
      <h3>Configurar Conexão com Banco de Dados</h3>
      
      <div className={styles.formGroup}>
        <label>Nome da Conexão *</label>
        <input
          type="text"
          value={connectionConfig.name}
          onChange={(e) => setConnectionConfig({ ...connectionConfig, name: e.target.value })}
          placeholder="Ex: ERP Principal"
          className={styles.input}
        />
      </div>

      <div className={styles.formGroup}>
        <label>Tipo de Banco *</label>
        <select
          value={connectionConfig.type}
          onChange={(e) => handlePortChange(e.target.value as DatabaseType)}
          className={styles.select}
        >
          <option value="mysql">MySQL</option>
          <option value="postgresql">PostgreSQL</option>
          <option value="sqlserver">SQL Server</option>
          <option value="oracle">Oracle</option>
        </select>
      </div>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label>Host / Servidor *</label>
          <input
            type="text"
            value={connectionConfig.host}
            onChange={(e) => setConnectionConfig({ ...connectionConfig, host: e.target.value })}
            placeholder="Ex: localhost ou 192.168.1.100"
            className={styles.input}
          />
        </div>

        <div className={styles.formGroup}>
          <label>Porta *</label>
          <input
            type="number"
            value={connectionConfig.port}
            onChange={(e) => setConnectionConfig({ ...connectionConfig, port: parseInt(e.target.value) })}
            className={styles.input}
          />
        </div>
      </div>

      <div className={styles.formGroup}>
        <label>Nome do Banco de Dados *</label>
        <input
          type="text"
          value={connectionConfig.database}
          onChange={(e) => setConnectionConfig({ ...connectionConfig, database: e.target.value })}
          placeholder="Ex: erp_producao"
          className={styles.input}
        />
      </div>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label>Usuário *</label>
          <input
            type="text"
            value={connectionConfig.username}
            onChange={(e) => setConnectionConfig({ ...connectionConfig, username: e.target.value })}
            placeholder="Usuário do banco"
            className={styles.input}
          />
        </div>

        <div className={styles.formGroup}>
          <label>Senha *</label>
          <input
            type="password"
            value={connectionConfig.password}
            onChange={(e) => setConnectionConfig({ ...connectionConfig, password: e.target.value })}
            placeholder="Senha do banco"
            className={styles.input}
          />
        </div>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={connectionConfig.ssl}
            onChange={(e) => setConnectionConfig({ ...connectionConfig, ssl: e.target.checked })}
          />
          Usar SSL/TLS
        </label>
      </div>

      {connectionTestResult && (
        <div className={connectionTestResult === 'success' ? styles.successBox : styles.errorBox}>
          {connectionTestResult === 'success' ? (
            <>
              <CheckCircle size={20} />
              <span>Conexão estabelecida com sucesso!</span>
            </>
          ) : (
            <>
              <XCircle size={20} />
              <span>{connectionError}</span>
            </>
          )}
        </div>
      )}

      <div className={styles.buttonGroup}>
        <button
          type="button"
          onClick={testConnection}
          disabled={isTestingConnection}
          className={styles.testButton}
        >
          {isTestingConnection ? (
            <>
              <RefreshCw size={18} className={styles.spinning} />
              Testando...
            </>
          ) : (
            <>
              <Database size={18} />
              Testar Conexão
            </>
          )}
        </button>

        {connectionTestResult === 'success' && (
          <button
            type="button"
            onClick={() => setStep('table')}
            className={styles.nextButton}
          >
            Próximo: Selecionar Tabela
          </button>
        )}
      </div>
    </div>
  );

  const renderTableStep = () => (
    <div className={styles.stepContent}>
      <h3>Selecionar Tabela de Pedidos</h3>
      
      {isLoadingTables ? (
        <div className={styles.loading}>
          <RefreshCw size={32} className={styles.spinning} />
          <p>Carregando tabelas...</p>
        </div>
      ) : (
        <>
          <div className={styles.tableList}>
            {availableTables.map((table) => (
              <div
                key={table.name}
                className={`${styles.tableCard} ${selectedTable?.name === table.name ? styles.selected : ''}`}
                onClick={() => handleTableSelect(table)}
              >
                <div className={styles.tableHeader}>
                  <Table size={24} />
                  <div>
                    <h4>{table.name}</h4>
                    {table.schema && <span className={styles.schema}>{table.schema}</span>}
                  </div>
                </div>
                <div className={styles.tableInfo}>
                  <span>{table.columns.length} colunas</span>
                  {table.rowCount && <span>{table.rowCount.toLocaleString('pt-BR')} registros</span>}
                </div>
              </div>
            ))}
          </div>

          {selectedTable && (
            <div className={styles.selectedTableInfo}>
              <h4>Colunas da tabela {selectedTable.name}:</h4>
              <div className={styles.columnsList}>
                {selectedTable.columns.map((col) => (
                  <div key={col.name} className={styles.columnItem}>
                    <span className={styles.columnName}>{col.name}</span>
                    <span className={styles.columnType}>{col.type}</span>
                    {col.isPrimaryKey && <span className={styles.badge}>PK</span>}
                    {!col.nullable && <span className={styles.badge}>NOT NULL</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.buttonGroup}>
            <button
              type="button"
              onClick={() => setStep('connection')}
              className={styles.backButton}
            >
              Voltar
            </button>

            {selectedTable && (
              <button
                type="button"
                onClick={() => setStep('mapping')}
                className={styles.nextButton}
              >
                Próximo: Mapear Colunas
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );

  const renderMappingStep = () => (
    <div className={styles.stepContent}>
      <h3>Mapear Colunas</h3>
      <p className={styles.description}>
        Configure como os dados do banco serão importados para o sistema.
      </p>

      <div className={styles.mappingTable}>
        <div className={styles.mappingHeader}>
          <span>Campo no Sistema</span>
          <span>Coluna no Banco</span>
          <span>Transformação</span>
        </div>

        {columnMappings.map((mapping, index) => {
          const fieldInfo = PURCHASE_ORDER_FIELDS.find(f => f.value === mapping.targetField);
          
          return (
            <div key={index} className={styles.mappingRow}>
              <div className={styles.targetField}>
                <strong>{fieldInfo?.label}</strong>
                {mapping.required && <span className={styles.required}>*</span>}
              </div>

              <select
                value={mapping.sourceColumn}
                onChange={(e) => updateMapping(index, { sourceColumn: e.target.value })}
                className={styles.select}
              >
                <option value="">-- Selecione --</option>
                {selectedTable?.columns.map((col) => (
                  <option key={col.name} value={col.name}>
                    {col.name} ({col.type})
                  </option>
                ))}
              </select>

              <select
                value={mapping.transform}
                onChange={(e) => updateMapping(index, { transform: e.target.value as any })}
                className={styles.select}
              >
                <option value="none">Nenhuma</option>
                <option value="uppercase">MAIÚSCULAS</option>
                <option value="lowercase">minúsculas</option>
                <option value="trim">Remover espaços</option>
                <option value="cnpj_format">Formatar CNPJ</option>
                <option value="date">Converter Data</option>
                <option value="number">Converter Número</option>
              </select>
            </div>
          );
        })}
      </div>

      <div className={styles.buttonGroup}>
        <button
          type="button"
          onClick={() => setStep('table')}
          className={styles.backButton}
        >
          Voltar
        </button>

        <button
          type="button"
          onClick={() => setStep('schedule')}
          className={styles.nextButton}
        >
          Próximo: Configurar Sincronização
        </button>
      </div>
    </div>
  );

  const renderScheduleStep = () => (
    <div className={styles.stepContent}>
      <h3>Configurar Sincronização</h3>

      <div className={styles.formGroup}>
        <label>Nome da Importação *</label>
        <input
          type="text"
          value={importConfig.name}
          onChange={(e) => setImportConfig({ ...importConfig, name: e.target.value })}
          placeholder="Ex: Importação de Pedidos ERP"
          className={styles.input}
        />
      </div>

      <div className={styles.formGroup}>
        <label>Descrição</label>
        <textarea
          value={importConfig.description}
          onChange={(e) => setImportConfig({ ...importConfig, description: e.target.value })}
          placeholder="Descrição opcional..."
          rows={3}
          className={styles.textarea}
        />
      </div>

      <div className={styles.formGroup}>
        <label>Modo de Sincronização *</label>
        <select
          value={importConfig.syncMode}
          onChange={(e) => setImportConfig({ ...importConfig, syncMode: e.target.value as any })}
          className={styles.select}
        >
          <option value="manual">Manual (executar quando necessário)</option>
          <option value="scheduled">Agendada (executar automaticamente)</option>
        </select>
      </div>

      {importConfig.syncMode === 'scheduled' && (
        <div className={styles.formGroup}>
          <label>Intervalo de Sincronização</label>
          <select
            value={importConfig.scheduleInterval}
            onChange={(e) => setImportConfig({ ...importConfig, scheduleInterval: parseInt(e.target.value) })}
            className={styles.select}
          >
            <option value={300}>A cada 5 minutos</option>
            <option value={900}>A cada 15 minutos</option>
            <option value={1800}>A cada 30 minutos</option>
            <option value={3600}>A cada 1 hora</option>
            <option value={7200}>A cada 2 horas</option>
            <option value={21600}>A cada 6 horas</option>
            <option value={86400}>A cada 24 horas</option>
          </select>
        </div>
      )}

      <div className={styles.formGroup}>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={importConfig.isActive}
            onChange={(e) => setImportConfig({ ...importConfig, isActive: e.target.checked })}
          />
          Ativar importação imediatamente
        </label>
      </div>

      <div className={styles.buttonGroup}>
        <button
          type="button"
          onClick={() => setStep('mapping')}
          className={styles.backButton}
        >
          Voltar
        </button>

        <button
          type="button"
          onClick={handleSaveConfig}
          className={styles.saveButton}
          disabled={!importConfig.name}
        >
          <CheckCircle size={18} />
          Salvar Configuração
        </button>
      </div>
    </div>
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Database size={32} />
        <div>
          <h2>Integração com Banco SQL</h2>
          <p>Configure a importação automática de pedidos de compra</p>
        </div>
      </div>

      <div className={styles.steps}>
        <div className={`${styles.stepIndicator} ${step === 'connection' ? styles.active : ''} ${connectionTestResult === 'success' ? styles.completed : ''}`}>
          <span className={styles.stepNumber}>1</span>
          <span>Conexão</span>
        </div>
        <div className={`${styles.stepIndicator} ${step === 'table' ? styles.active : ''} ${selectedTable ? styles.completed : ''}`}>
          <span className={styles.stepNumber}>2</span>
          <span>Tabela</span>
        </div>
        <div className={`${styles.stepIndicator} ${step === 'mapping' ? styles.active : ''}`}>
          <span className={styles.stepNumber}>3</span>
          <span>Mapeamento</span>
        </div>
        <div className={`${styles.stepIndicator} ${step === 'schedule' ? styles.active : ''}`}>
          <span className={styles.stepNumber}>4</span>
          <span>Sincronização</span>
        </div>
      </div>

      {step === 'connection' && renderConnectionStep()}
      {step === 'table' && renderTableStep()}
      {step === 'mapping' && renderMappingStep()}
      {step === 'schedule' && renderScheduleStep()}
    </div>
  );
}
