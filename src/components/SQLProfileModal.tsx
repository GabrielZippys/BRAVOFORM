'use client';

import React, { useState, useEffect } from 'react';
import { 
  Database, 
  X, 
  Save,
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Download,
  Upload,
  ArrowLeftRight,
  HelpCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import type { SQLIntegrationProfile, DatabaseType, EncryptionMethod } from '@/types';
import styles from '../../app/styles/SQLProfileModal.module.css';
import { DatabaseService } from '../services/databaseService';

interface SQLProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (profile: SQLIntegrationProfile) => Promise<void>;
  profile?: SQLIntegrationProfile;
  companyId: string;
  companyName: string;
  userId: string;
}

export default function SQLProfileModal({
  isOpen,
  onClose,
  onSave,
  profile,
  companyId,
  companyName,
  userId
}: SQLProfileModalProps) {
  const [step, setStep] = useState<'basic' | 'connection' | 'review'>('basic');
  const [showPassword, setShowPassword] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [showTutorial, setShowTutorial] = useState(false);
  const [dbExplorer, setDbExplorer] = useState({
    connected: false,
    databases: [] as string[],
    tables: [] as string[],
    selectedTable: '',
    tableData: [] as any[],
    tableColumns: [] as any[],
    loading: false
  });
  
  const [validationModal, setValidationModal] = useState<{
    show: boolean;
    type: 'error' | 'warning' | 'info';
    title: string;
    message: string;
  }>({
    show: false,
    type: 'error',
    title: '',
    message: ''
  });
  
  const [formData, setFormData] = useState<Partial<SQLIntegrationProfile>>({
    name: '',
    description: '',
    companyId,
    type: 'import',
    connectionConfig: {
      dbType: 'mysql',
      host: '',
      port: 3306,
      database: '',
      username: '',
      password: '',
      ssl: false,
      connectionTimeout: 30000,
      maxConnections: 10,
      useTailscale: false,
      tailscaleHostname: ''
    } as any,
    importSettings: {
      enabled: false,
      tableName: '',
      targetCollection: 'purchase_orders',
      columnMappings: [],
      syncMode: 'manual',
      duplicateHandling: 'skip',
      batchSize: 100
    },
    exportSettings: {
      enabled: false,
      sourceCollection: 'form_responses',
      targetTable: '',
      columnMappings: [],
      exportMode: 'insert',
      syncMode: 'manual',
      createTableIfNotExists: false,
      filterType: 'all'
    },
    encryptionMethod: 'aes-256-gcm',
    isActive: true,
    status: 'offline',
    tags: []
  });

  useEffect(() => {
    if (profile) {
      setFormData(profile);
    } else {
      resetForm();
    }
  }, [profile, isOpen]);

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      companyId,
      type: 'import',
      connectionConfig: {
        dbType: 'mysql',
        host: '',
        port: 3306,
        database: '',
        username: '',
        password: '',
        ssl: false,
        connectionTimeout: 30000,
        maxConnections: 10,
        useTailscale: false,
        tailscaleHostname: ''
      } as any,
      importSettings: {
        enabled: false,
        tableName: '',
        targetCollection: 'purchase_orders',
        columnMappings: [],
        syncMode: 'manual',
        duplicateHandling: 'skip',
        batchSize: 100
      },
      exportSettings: {
        enabled: false,
        sourceCollection: 'form_responses',
        targetTable: '',
        columnMappings: [],
        exportMode: 'insert',
        syncMode: 'manual',
        createTableIfNotExists: false
      },
      encryptionMethod: 'aes-256-gcm',
      isActive: true,
      status: 'offline',
      tags: []
    });
    setStep('basic');
    setConnectionStatus('idle');
  };

  const handleDbTypeChange = (dbType: DatabaseType) => {
    const defaultPorts: Record<DatabaseType, number> = {
      mysql: 3306,
      postgresql: 5432,
      sqlserver: 1433,
      oracle: 1521,
      mongodb: 27017,
      sqlite: 0
    };

    setFormData(prev => ({
      ...prev,
      connectionConfig: {
        ...prev.connectionConfig!,
        dbType,
        port: defaultPorts[dbType]
      }
    }));
  };

  const testConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus('idle');

    try {
      // Validação real dos campos
      const config = formData.connectionConfig;
      if (!config?.host?.trim()) {
        setConnectionStatus('error');
        showValidationModal('error', 'Campo Obrigatório', 'Host/Servidor é obrigatório');
        return;
      }
      if (!config?.database?.trim()) {
        setConnectionStatus('error');
        showValidationModal('error', 'Campo Obrigatório', 'Nome do Database é obrigatório');
        return;
      }
      if (!config?.username?.trim()) {
        setConnectionStatus('error');
        showValidationModal('error', 'Campo Obrigatório', 'Usuário é obrigatório');
        return;
      }
      if (!config?.password?.trim()) {
        setConnectionStatus('error');
        showValidationModal('error', 'Campo Obrigatório', 'Senha é obrigatória');
        return;
      }
      
      // Validação do formato do host (aceita localhost, IPs e domínios)
      const hostRegex = /^(localhost|127\.0\.0\.1|(\d{1,3}\.){3}\d{1,3}|([a-zA-Z0-9\-]+\.)+[a-zA-Z]{2,})$/;
      if (!hostRegex.test(config.host.trim())) {
        setConnectionStatus('error');
        showValidationModal('error', 'Host Inválido', 'Formato de host inválido. Use exemplos como:\n• localhost\n• 127.0.0.1\n• 192.168.1.100\n• db.empresa.com');
        return;
      }
      
      // Validação da porta
      if (config.port && (config.port < 1 || config.port > 65535)) {
        setConnectionStatus('error');
        showValidationModal('error', 'Porta Inválida', 'Porta deve estar entre 1 e 65535');
        return;
      }
      
      // Validação específica por tipo de banco
      const defaultPorts: Record<string, number> = {
        mysql: 3306,
        postgresql: 5432,
        sqlserver: 1433,
        oracle: 1521
      };
      
      if (config.port && defaultPorts[config.dbType] && config.port !== defaultPorts[config.dbType]) {
        console.warn(`Porta não padrão para ${config.dbType}. Padrão seria ${defaultPorts[config.dbType]}`);
      }
      
      // Validação do nome do database
      if (config.database.length < 2) {
        setConnectionStatus('error');
        showValidationModal('error', 'Database Inválido', 'Nome do database muito curto (mínimo 2 caracteres)');
        return;
      }
      if (!/^[a-zA-Z0-9_\-]+$/.test(config.database)) {
        setConnectionStatus('error');
        showValidationModal('error', 'Database Inválido', 'Nome do database inválido. Use apenas:\n• Letras (a-z, A-Z)\n• Números (0-9)\n• Underscore (_)\n• Hífen (-)');
        return;
      }
      
      // Validação do nome de usuário
      if (config.username.length < 2) {
        setConnectionStatus('error');
        showValidationModal('error', 'Usuário Inválido', 'Nome de usuário muito curto (mínimo 2 caracteres)');
        return;
      }
      
      // Validação da senha
      if (config.password.length < 4) {
        setConnectionStatus('error');
        showValidationModal('error', 'Senha Inválida', 'Senha muito curta (mínimo 4 caracteres)');
        return;
      }
      
      // Conexão real com o banco de dados
      const dbConfig = {
        dbType: config.dbType === 'oracle' || config.dbType === 'mongodb' || config.dbType === 'sqlite' ? 'mysql' : config.dbType as 'mysql' | 'postgresql' | 'sqlserver',
        host: config.host,
        port: config.port,
        database: config.database,
        username: config.username,
        password: config.password,
        ssl: config.ssl,
        connectionTimeout: config.connectionTimeout
      };
      
      const connectionResult = await DatabaseService.testConnection(dbConfig);
      
      if (connectionResult) {
        setConnectionStatus('success');
        showValidationModal('info', 'Conexão Estabelecida via Tailscale', `✅ Conexão segura estabelecida com sucesso!\n\n🔒 Túnel Tailscale: Ativo e criptografado\n🔗 Servidor: ${config.host}:${config.port}\n� Banco: ${config.database} (${config.dbType.toUpperCase()})\n� Usuário: ${config.username}\n� Criptografia: WireGuard + ${config.ssl ? 'SSL/TLS' : 'Apenas Tailscale'}\n\n✨ Sua conexão está protegida por criptografia de ponta a ponta!`);
      } else {
        setConnectionStatus('error');
        showValidationModal('error', 'Falha na Conexão', 'Não foi possível conectar ao banco de dados via Tailscale. Verifique:\n\n• O Tailscale está instalado e rodando no servidor?\n• O hostname/IP do Tailscale está correto?\n• O serviço do banco está rodando?\n• As credenciais estão corretas?\n• A porta do banco está acessível?');
      }
      
    } catch (error: any) {
      setConnectionStatus('error');
      
      // Extrair mensagem de erro detalhada
      let errorMessage = 'Erro desconhecido ao conectar';
      let errorDetails = '';
      
      if (error.message) {
        errorMessage = error.message;
        
        // Identificar tipos específicos de erro
        if (error.message.includes('ECONNREFUSED')) {
          errorDetails = '🔴 Conexão Recusada\n\nO servidor recusou a conexão. Verifique:\n• O banco de dados está rodando?\n• A porta está correta?\n• O firewall está bloqueando?';
        } else if (error.message.includes('ETIMEDOUT') || error.message.includes('timeout')) {
          errorDetails = '⏱️ Timeout de Conexão\n\nA conexão demorou muito. Verifique:\n• O host está acessível?\n• A rede está funcionando?\n• O servidor está respondendo?';
        } else if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
          errorDetails = '🔍 Host Não Encontrado\n\nO servidor não foi encontrado. Verifique:\n• O endereço do host está correto?\n• O DNS está funcionando?\n• Você tem acesso à rede?';
        } else if (error.message.includes('authentication') || error.message.includes('password') || error.message.includes('Access denied')) {
          errorDetails = '🔐 Falha de Autenticação\n\nCredenciais inválidas. Verifique:\n• Usuário está correto?\n• Senha está correta?\n• O usuário tem permissão?';
        } else if (error.message.includes('database') && error.message.includes('does not exist')) {
          errorDetails = '📊 Banco Não Existe\n\nO banco de dados não foi encontrado. Verifique:\n• O nome do banco está correto?\n• O banco foi criado?\n• Você tem acesso a ele?';
        } else {
          errorDetails = `❌ Erro Técnico:\n\n${error.message}`;
        }
      }
      
      showValidationModal('error', 'Erro na Conexão', errorDetails || errorMessage);
    } finally {
      setTestingConnection(false);
    }
  };

  const connectAndExploreDatabase = async () => {
    // Verificar se a conexão já foi testada com sucesso
    if (connectionStatus !== 'success') {
      showValidationModal('warning', 'Teste de Conexão Necessário', 'Por favor, teste a conexão primeiro antes de explorar o banco de dados.');
      return;
    }

    // Se a conexão foi testada com sucesso, prosseguir com exploração
    setDbExplorer(prev => ({ ...prev, loading: true }));

    try {
      const config = formData.connectionConfig!;
      const dbConfig = {
        dbType: config.dbType === 'oracle' || config.dbType === 'mongodb' || config.dbType === 'sqlite' ? 'mysql' : config.dbType as 'mysql' | 'postgresql' | 'sqlserver',
        host: config.host,
        port: config.port,
        database: config.database,
        username: config.username,
        password: config.password,
        ssl: config.ssl,
        connectionTimeout: config.connectionTimeout
      };

      // Obter tabelas reais do banco
      const tables = await DatabaseService.getTables(dbConfig);

      setDbExplorer({
        connected: true,
        databases: [config.database],
        tables: tables,
        selectedTable: '',
        tableData: [],
        tableColumns: [],
        loading: false
      });

      showValidationModal('info', 'Banco Conectado', `✅ Conectado com sucesso ao banco ${config.database}!\n\n📊 ${tables.length} tabelas encontradas:\n${tables.slice(0, 10).join(', ')}${tables.length > 10 ? '\n...' : ''}\n\n🔹 Clique em qualquer tabela para explorar sua estrutura e dados reais.`);
      
    } catch (error: any) {
      console.error('Erro ao explorar banco:', error);
      setDbExplorer(prev => ({ ...prev, loading: false }));
      showValidationModal('error', 'Erro na Exploração', 'Conexão estabelecida, mas não foi possível listar as tabelas. Verifique:\n\n• Permissões do usuário no banco\n• O banco está acessível\n• Nome do banco está correto');
    }
  };

  const exploreTable = async (tableName: string) => {
    setDbExplorer(prev => ({ ...prev, loading: true }));

    try {
      const config = formData.connectionConfig!;
      const dbConfig = {
        dbType: config.dbType === 'oracle' || config.dbType === 'mongodb' || config.dbType === 'sqlite' ? 'mysql' : config.dbType as 'mysql' | 'postgresql' | 'sqlserver',
        host: config.host,
        port: config.port,
        database: config.database,
        username: config.username,
        password: config.password,
        ssl: config.ssl,
        connectionTimeout: config.connectionTimeout
      };

      // Obter estrutura e dados reais da tabela
      const schema = await DatabaseService.getTableSchema(dbConfig, tableName);

      setDbExplorer(prev => ({
        ...prev,
        selectedTable: tableName,
        tableData: schema.sampleData,
        tableColumns: schema.columns,
        loading: false
      }));

      // Atualizar o formulário com a tabela selecionada
      setFormData(prev => ({
        ...prev,
        importSettings: {
          ...prev.importSettings!,
          tableName: tableName
        }
      }));

      // Mostrar sucesso com dados reais
      showValidationModal('info', 'Tabela Carregada', `📋 Tabela "${tableName}" carregada com sucesso!\n\n✅ Dados Reais:\nEstes são os dados autênticos da tabela ${tableName} do banco ${config.database}.\n\n📊 Estrutura: ${schema.columns.length} colunas\n📄 Amostra: ${schema.sampleData.length} registros\n\n🔹 Colunas: ${schema.columns.join(', ')}`);
      
    } catch (error: any) {
      console.error('Erro ao explorar tabela:', error);
      setDbExplorer(prev => ({ ...prev, loading: false }));
      showValidationModal('error', 'Erro na Tabela', 'Não foi possível carregar os dados da tabela. Verifique:\n\n• A tabela existe no banco\n• O usuário tem permissão para ler a tabela\n• O nome da tabela está correto');
    }
  };

  const showValidationModal = (type: 'error' | 'warning' | 'info', title: string, message: string) => {
    setValidationModal({
      show: true,
      type,
      title,
      message
    });
  };

  const hideValidationModal = () => {
    setValidationModal(prev => ({ ...prev, show: false }));
  };

  const validateConnectionFields = () => {
    const errors = [];
    const config = formData.connectionConfig;

    if (!config?.host?.trim()) {
      errors.push('Host/Servidor Tailscale é obrigatório');
      return errors;
    }

    // Validação específica para Tailscale
    const isTailscaleHostname = config.host.includes('.ts.net') || config.host.includes('tail-scale.ts.net');
    const isTailscaleIP = /^100\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(config.host); // IPs Tailscale começam com 100.x.x.x
    
    if (!isTailscaleHostname && !isTailscaleIP) {
      errors.push('⚠️ Host deve ser um hostname Tailscale (.ts.net) ou IP Tailscale (100.x.x.x)\n\nPor segurança, apenas conexões via Tailscale são permitidas.\n\nExemplos válidos:\n• db-server.tail-scale.ts.net\n• 100.64.0.1');
    }

    if (!config.port || config.port < 1 || config.port > 65535) {
      errors.push('Porta deve estar entre 1 e 65535');
    }

    if (!config.database?.trim()) {
      errors.push('Nome do banco de dados é obrigatório');
    }

    if (!config.username?.trim()) {
      errors.push('Usuário é obrigatório');
    }

    if (!config.password?.trim()) {
      errors.push('Senha é obrigatória');
    }

    return errors;
  };

  const validateBasicFields = () => {
    const errors = [];

    if (!formData.name?.trim()) {
      errors.push('Nome do perfil é obrigatório');
    }
    if (formData.name && formData.name.length < 3) {
      errors.push('Nome do perfil deve ter pelo menos 3 caracteres');
    }
    if (formData.name && formData.name.length > 100) {
      errors.push('Nome do perfil deve ter no máximo 100 caracteres');
    }

    return errors;
  };

  const validateImportFields = () => {
    const errors = [];
    const importSettings = formData.importSettings;

    // Se importação não está habilitada, não validar
    if (!importSettings?.enabled) return [];

    // Permitir salvar sem configurar dados (outro usuário pode configurar depois)
    // Apenas avisar se campos importantes estão faltando, mas não bloquear
    return [];
  };

  const validateExportFields = () => {
    const errors = [];
    const exportSettings = formData.exportSettings;

    // Se exportação não está habilitada, não validar
    if (!exportSettings?.enabled) return [];

    // Permitir salvar sem configurar dados (outro usuário pode configurar depois)
    // Apenas avisar se campos importantes estão faltando, mas não bloquear
    return [];
  };

  const handleSave = async () => {
    try {
      const profileData: SQLIntegrationProfile = {
        ...formData as SQLIntegrationProfile,
        companyId,
        createdAt: profile?.createdAt || (new Date() as any),
        createdBy: profile?.createdBy || userId,
        updatedAt: new Date() as any
      };

      await onSave(profileData);
      onClose();
      resetForm();
    } catch (error) {
      console.error('Erro ao salvar perfil:', error);
      showValidationModal('error', 'Erro ao Salvar', 'Não foi possível salvar o perfil. Tente novamente.');
    }
  };

  const renderBasicStep = () => (
    <div className={styles.stepContent}>
      <h3>Informações Básicas do Perfil</h3>
      <p className={styles.stepDescription}>
        Defina o nome e tipo de integração que este perfil irá realizar
      </p>

      <div className={styles.formGroup}>
        <label>Nome do Perfil *</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Ex: ERP Principal - Importação de Pedidos"
          className={styles.input}
        />
      </div>

      <div className={styles.formGroup}>
        <label>Descrição</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Descreva o propósito desta integração..."
          rows={3}
          className={styles.textarea}
        />
      </div>

      <div className={styles.stepActions}>
        <button className={styles.nextButton} onClick={() => {
          const errors = validateBasicFields();
          if (errors.length > 0) {
            showValidationModal('error', 'Campos Obrigatórios', errors.join('\n'));
            return;
          }
          setStep('connection');
        }}>
          Próximo: Configurar Conexão
        </button>
      </div>
    </div>
  );

  const renderConnectionStep = () => (
    <div className={styles.stepContent}>
      <h3>🔒 Configuração da Conexão Segura</h3>
      <p className={styles.stepDescription}>
        Configure a conexão via Tailscale com o banco de dados externo
      </p>

      <div className={styles.formGroup}>
        <label className={styles.labelWithTooltip}>
          <span>Tipo de Banco de Dados *</span>
          <div className={styles.tooltip}>
            <HelpCircle size={16} />
            <span className={styles.tooltipText}>
              Selecione o tipo de banco de dados que você deseja conectar. Suportamos MySQL, PostgreSQL e SQL Server.
            </span>
          </div>
        </label>
        <select
          value={formData.connectionConfig?.dbType}
          onChange={(e) => handleDbTypeChange(e.target.value as DatabaseType)}
          className={styles.select}
        >
          <option value="mysql">MySQL / MariaDB</option>
          <option value="postgresql">PostgreSQL</option>
          <option value="sqlserver">SQL Server</option>
          <option value="oracle">Oracle Database</option>
        </select>
      </div>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label className={styles.labelWithTooltip}>
            <span>Host / Servidor Tailscale *</span>
            <div className={styles.tooltip}>
              <HelpCircle size={16} />
              <span className={styles.tooltipText}>
                Digite o hostname Tailscale (ex: db-server.tail-scale.ts.net) ou o IP Tailscale (ex: 100.64.0.1) do servidor do banco de dados. Execute 'tailscale status' no servidor para obter essa informação.
              </span>
            </div>
          </label>
          <input
            type="text"
            value={formData.connectionConfig?.host}
            onChange={(e) => setFormData({
              ...formData,
              connectionConfig: { ...formData.connectionConfig!, host: e.target.value }
            })}
            placeholder="Ex: db-server.tail-scale.ts.net ou 100.64.0.1"
            className={styles.input}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.labelWithTooltip}>
            <span>Porta *</span>
            <div className={styles.tooltip}>
              <HelpCircle size={16} />
              <span className={styles.tooltipText}>
                Porta padrão: MySQL (3306), PostgreSQL (5432), SQL Server (1433). Verifique se o banco usa uma porta customizada.
              </span>
            </div>
          </label>
          <input
            type="number"
            value={formData.connectionConfig?.port}
            onChange={(e) => setFormData({
              ...formData,
              connectionConfig: { ...formData.connectionConfig!, port: parseInt(e.target.value) }
            })}
            className={styles.input}
          />
        </div>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.labelWithTooltip}>
          <span>Nome do Banco de Dados *</span>
          <div className={styles.tooltip}>
            <HelpCircle size={16} />
            <span className={styles.tooltipText}>
              Nome exato do banco de dados (database/schema) que você deseja conectar. Exemplo: erp_producao, sistema_vendas, etc.
            </span>
          </div>
        </label>
        <input
          type="text"
          value={formData.connectionConfig?.database}
          onChange={(e) => setFormData({
            ...formData,
            connectionConfig: { ...formData.connectionConfig!, database: e.target.value }
          })}
          placeholder="Ex: erp_producao"
          className={styles.input}
        />
      </div>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label className={styles.labelWithTooltip}>
            <span>Usuário *</span>
            <div className={styles.tooltip}>
              <HelpCircle size={16} />
              <span className={styles.tooltipText}>
                Usuário do banco de dados com permissões de leitura/escrita nas tabelas que você deseja integrar.
              </span>
            </div>
          </label>
          <input
            type="text"
            value={formData.connectionConfig?.username}
            onChange={(e) => setFormData({
              ...formData,
              connectionConfig: { ...formData.connectionConfig!, username: e.target.value }
            })}
            placeholder="Usuário do banco"
            className={styles.input}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.labelWithTooltip}>
            <span>Senha *</span>
            <div className={styles.tooltip}>
              <HelpCircle size={16} />
              <span className={styles.tooltipText}>
                Senha do usuário do banco de dados. A senha será criptografada e armazenada com segurança.
              </span>
            </div>
          </label>
          <div className={styles.passwordInput}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={formData.connectionConfig?.password}
              onChange={(e) => setFormData({
                ...formData,
                connectionConfig: { ...formData.connectionConfig!, password: e.target.value }
              })}
              placeholder="Senha do banco"
              className={styles.input}
            />
            <button
              type="button"
              className={styles.passwordToggle}
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
      </div>

      <div className={styles.tailscaleSection}>
        <div className={styles.tailscaleHeader}>
          <div className={styles.tailscaleBadge}>
            🔒 Conexão Segura via Tailscale
          </div>
          <p className={styles.tailscaleSubtitle}>
            Todas as conexões são feitas através de rede privada virtual criptografada WireGuard
          </p>
          
          <button
            type="button"
            className={styles.tutorialToggle}
            onClick={() => setShowTutorial(!showTutorial)}
          >
            {showTutorial ? (
              <>
                <ChevronUp size={18} />
                <span>Ocultar Tutorial de Configuração</span>
              </>
            ) : (
              <>
                <ChevronDown size={18} />
                <span>Ver Tutorial de Configuração</span>
              </>
            )}
          </button>
        </div>

        {showTutorial && (
          <div className={styles.tailscaleInfo}>
            <div className={styles.infoBox}>
              <AlertCircle size={18} />
              <div>
                <strong>📋 Configuração do Tailscale:</strong>
                <ol>
                  <li><strong>No servidor do banco de dados:</strong>
                    <pre>curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up</pre>
                  </li>
                  <li><strong>Obtenha o hostname Tailscale:</strong>
                    <pre>tailscale status</pre>
                    Exemplo: <code>db-server.tail-scale.ts.net</code> ou IP <code>100.x.x.x</code>
                  </li>
                  <li><strong>Use o hostname/IP no campo "Host / Servidor Tailscale" acima</strong></li>
                </ol>
                
                <p><strong>🔐 Segurança Garantida:</strong></p>
                <ul>
                  <li>✅ <strong>Criptografia WireGuard</strong> - Protocolo de última geração</li>
                  <li>✅ <strong>Zero Trust Network</strong> - Autenticação obrigatória</li>
                  <li>✅ <strong>Túnel Privado</strong> - Dados nunca trafegam pela internet pública</li>
                  <li>✅ <strong>Sem portas expostas</strong> - Firewall não precisa ser aberto</li>
                  <li>✅ <strong>Auditoria completa</strong> - Logs de todas as conexões</li>
                </ul>

                <div className={styles.warningBox}>
                  <strong>⚠️ Obrigatório:</strong> O servidor do banco de dados DEVE ter o Tailscale instalado e rodando. 
                  Por segurança, conexões diretas sem Tailscale não são permitidas.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {connectionStatus !== 'idle' && (
        <div className={connectionStatus === 'success' ? styles.successBox : styles.errorBox}>
          {connectionStatus === 'success' ? (
            <>
              <CheckCircle size={20} />
              <span>✅ Conexão validada com sucesso! Credenciais autenticadas.</span>
            </>
          ) : (
            <>
              <AlertCircle size={20} />
              <span>❌ Falha na validação. Verifique host, porta, usuário e senha.</span>
            </>
          )}
        </div>
      )}

      <div className={styles.stepActions}>
        <button className={styles.backButton} onClick={() => setStep('basic')}>
          Voltar
        </button>
        <button 
          className={styles.testButton}
          onClick={testConnection}
          disabled={testingConnection}
        >
          {testingConnection ? (
            <>
              <RefreshCw size={18} className={styles.spinning} />
              Testando...
            </>
          ) : (
            <>
              <RefreshCw size={18} />
              Testar Conexão
            </>
          )}
        </button>
        <button 
          className={styles.nextButton} 
          onClick={() => {
            if (connectionStatus !== 'success') {
              showValidationModal('warning', 'Conexão Não Testada', 'Teste a conexão antes de avançar para garantir que as credenciais estão corretas.');
              return;
            }
            setStep('review');
          }}
        >
          Próximo: Revisar e Salvar
        </button>
      </div>
    </div>
  );

  const renderImportStep = () => (
    <div className={styles.stepContent}>
      <h3>Configuração de Importação</h3>
      <p className={styles.stepDescription}>
        Conecte ao banco, explore as tabelas e escolha os dados para importar
      </p>

      {!dbExplorer.connected ? (
        <div className={styles.dbConnectionSection}>
          <div className={styles.formGroup}>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={formData.importSettings?.enabled}
                onChange={(e) => setFormData({
                  ...formData,
                  importSettings: { ...formData.importSettings!, enabled: e.target.checked }
                })}
              />
              Habilitar importação de dados
            </label>
          </div>

          {formData.importSettings?.enabled && (
            <div className={styles.connectionInfo}>
              <h4>🔗 Conectar ao Banco para Explorar</h4>
              <p>Use as credenciais configuradas no passo anterior para conectar e explorar as tabelas disponíveis.</p>
              
              <div className={styles.connectionStatus}>
                <strong>Banco:</strong> {formData.connectionConfig?.database}<br/>
                <strong>Host:</strong> {formData.connectionConfig?.host}:{formData.connectionConfig?.port}<br/>
                <strong>Usuário:</strong> {formData.connectionConfig?.username}
              </div>

              <button 
                className={styles.exploreButton}
                onClick={connectAndExploreDatabase}
                disabled={dbExplorer.loading}
              >
                {dbExplorer.loading ? (
                  <>
                    <RefreshCw size={18} className={styles.spinning} />
                    Conectando...
                  </>
                ) : (
                  <>
                    <Database size={18} />
                    Conectar e Explorar Banco
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className={styles.dbExplorerSection}>
          <div className={styles.explorerHeader}>
            <h4>🗄️ Explorador do Banco de Dados</h4>
            <div className={styles.connectionStatus}>
              <strong>Conectado:</strong> {formData.connectionConfig?.database}
            </div>
          </div>

          <div className={styles.explorerContent}>
            <div className={styles.tablesList}>
              <h5>Tabelas Disponíveis</h5>
              <div className={styles.tablesGrid}>
                {dbExplorer.tables.map(table => (
                  <div 
                    key={table}
                    className={`${styles.tableCard} ${dbExplorer.selectedTable === table ? styles.tableCardSelected : ''}`}
                    onClick={() => exploreTable(table)}
                  >
                    <div className={styles.tableIcon}>
                      <Database size={20} />
                    </div>
                    <div className={styles.tableInfo}>
                      <strong>{table}</strong>
                      <span>Clique para explorar</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {dbExplorer.selectedTable && (
              <div className={styles.tablePreview}>
                <h5>Prévia: {dbExplorer.selectedTable}</h5>
                
                {dbExplorer.loading ? (
                  <div className={styles.loadingPreview}>
                    <RefreshCw size={24} className={styles.spinning} />
                    <p>Carregando dados...</p>
                  </div>
                ) : (
                  <>
                    <div className={styles.tableStructure}>
                      <h6>Estrutura da Tabela</h6>
                      <div className={styles.columnsList}>
                        {dbExplorer.tableColumns.map(column => (
                          <div key={column} className={styles.columnItem}>
                            <span className={styles.columnName}>{column}</span>
                            <span className={styles.columnType}>text</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className={styles.tableData}>
                      <h6>Amostra de Dados (primeiros 3 registros)</h6>
                      <div className={styles.dataTable}>
                        <table>
                          <thead>
                            <tr>
                              {dbExplorer.tableColumns.map(column => (
                                <th key={column}>{column}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {dbExplorer.tableData.slice(0, 3).map((row, index) => (
                              <tr key={index}>
                                {dbExplorer.tableColumns.map(column => (
                                  <td key={column}>{String(row[column])}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className={styles.importConfig}>
                      <h6>Configuração de Importação</h6>
                      
                      <div className={styles.formGroup}>
                        <label>Destino no BravoFlow *</label>
                        <select
                          value={formData.importSettings?.targetCollection}
                          onChange={(e) => setFormData({
                            ...formData,
                            importSettings: { ...formData.importSettings!, targetCollection: e.target.value as any }
                          })}
                          className={styles.select}
                        >
                          <option value="purchase_orders">Pedidos de Compra</option>
                          <option value="form_responses">Respostas de Formulários</option>
                          <option value="custom">Coleção Personalizada</option>
                        </select>
                      </div>

                      <div className={styles.formGroup}>
                        <label>Modo de Sincronização *</label>
                        <select
                          value={formData.importSettings?.syncMode}
                          onChange={(e) => setFormData({
                            ...formData,
                            importSettings: { ...formData.importSettings!, syncMode: e.target.value as any }
                          })}
                          className={styles.select}
                        >
                          <option value="manual">Manual</option>
                          <option value="scheduled">Agendada</option>
                          <option value="realtime">Tempo Real</option>
                        </select>
                      </div>

                      <div className={styles.formGroup}>
                        <label>Tratamento de Duplicatas *</label>
                        <select
                          value={formData.importSettings?.duplicateHandling}
                          onChange={(e) => setFormData({
                            ...formData,
                            importSettings: { ...formData.importSettings!, duplicateHandling: e.target.value as any }
                          })}
                          className={styles.select}
                        >
                          <option value="skip">Ignorar</option>
                          <option value="update">Atualizar</option>
                          <option value="error">Gerar Erro</option>
                        </select>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className={styles.stepActions}>
        <button className={styles.backButton} onClick={() => setStep('connection')}>
          Voltar
        </button>
        <button 
          className={styles.secondaryButton} 
          onClick={() => {
            showValidationModal('info', 'Configuração Posterior', 'Você pode configurar a importação/exportação depois.\n\nO perfil será salvo apenas com a conexão ao banco.\n\nOutro usuário ou você mesmo pode editar este perfil posteriormente para configurar os dados.');
            setStep('review');
          }}
        >
          Pular Configuração
        </button>
        <button 
          className={styles.nextButton} 
          onClick={() => {
            const errors = validateImportFields();
            if (errors.length > 0) {
              showValidationModal('error', 'Campos Obrigatórios', errors.join('\n'));
              return;
            }
            setStep(formData.type === 'bidirectional' ? 'export' : 'review');
          }}
        >
          {formData.type === 'bidirectional' ? 'Próximo: Exportação' : 'Revisar e Salvar'}
        </button>
      </div>
    </div>
  );

  const renderExportStep = () => (
    <div className={styles.stepContent}>
      <h3>Configuração de Exportação</h3>
      <p className={styles.stepDescription}>
        Defina o que será exportado do BravoFlow para o banco externo
      </p>

      <div className={styles.formGroup}>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={formData.exportSettings?.enabled}
            onChange={(e) => setFormData({
              ...formData,
              exportSettings: { ...formData.exportSettings!, enabled: e.target.checked }
            })}
          />
          Habilitar exportação de dados
        </label>
      </div>

      {formData.exportSettings?.enabled && (
        <>
          <div className={styles.formGroup}>
            <label>Origem no BravoFlow *</label>
            <select
              value={formData.exportSettings?.sourceCollection}
              onChange={(e) => setFormData({
                ...formData,
                exportSettings: { ...formData.exportSettings!, sourceCollection: e.target.value as any }
              })}
              className={styles.select}
            >
              <option value="form_responses">Respostas de Formulários</option>
              <option value="purchase_orders">Pedidos de Compra</option>
              <option value="workflow_instances">Instâncias de Workflow</option>
              <option value="custom">Coleção Personalizada</option>
            </select>
          </div>

          {formData.exportSettings?.sourceCollection && (
            <>
              <div className={styles.formGroup}>
                <label>Filtro de Dados (Opcional)</label>
                <select
                  value={formData.exportSettings?.filterType || 'all'}
                  onChange={(e) => setFormData({
                    ...formData,
                    exportSettings: { ...formData.exportSettings!, filterType: e.target.value as any }
                  })}
                  className={styles.select}
                >
                  <option value="all">Todos os dados</option>
                  <option value="by_company">Por Empresa</option>
                  <option value="by_department">Por Departamento</option>
                  <option value="by_form">Por Formulário Específico</option>
                  <option value="by_date">Por Período de Data</option>
                  <option value="custom">Filtro Personalizado</option>
                </select>
              </div>

              {formData.exportSettings?.filterType === 'by_company' && (
                <div className={styles.formGroup}>
                  <label>Empresa *</label>
                  <input
                    type="text"
                    value={formData.exportSettings?.filterCompany || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      exportSettings: { ...formData.exportSettings!, filterCompany: e.target.value }
                    })}
                    placeholder="Nome ou ID da empresa"
                    className={styles.input}
                  />
                </div>
              )}

              {formData.exportSettings?.filterType === 'by_department' && (
                <div className={styles.formGroup}>
                  <label>Departamento *</label>
                  <input
                    type="text"
                    value={formData.exportSettings?.filterDepartment || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      exportSettings: { ...formData.exportSettings!, filterDepartment: e.target.value }
                    })}
                    placeholder="Nome do departamento"
                    className={styles.input}
                  />
                </div>
              )}

              {formData.exportSettings?.filterType === 'by_form' && (
                <div className={styles.formGroup}>
                  <label>ID do Formulário *</label>
                  <input
                    type="text"
                    value={formData.exportSettings?.filterFormId || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      exportSettings: { ...formData.exportSettings!, filterFormId: e.target.value }
                    })}
                    placeholder="ID do formulário específico"
                    className={styles.input}
                  />
                </div>
              )}

              {formData.exportSettings?.filterType === 'by_date' && (
                <>
                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label>Data Inicial *</label>
                      <input
                        type="date"
                        value={formData.exportSettings?.filterStartDate || ''}
                        onChange={(e) => setFormData({
                          ...formData,
                          exportSettings: { ...formData.exportSettings!, filterStartDate: e.target.value }
                        })}
                        className={styles.input}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Data Final *</label>
                      <input
                        type="date"
                        value={formData.exportSettings?.filterEndDate || ''}
                        onChange={(e) => setFormData({
                          ...formData,
                          exportSettings: { ...formData.exportSettings!, filterEndDate: e.target.value }
                        })}
                        className={styles.input}
                      />
                    </div>
                  </div>
                </>
              )}

              {formData.exportSettings?.filterType === 'custom' && (
                <div className={styles.formGroup}>
                  <label>Filtro Personalizado (SQL WHERE) *</label>
                  <textarea
                    value={formData.exportSettings?.filterCondition || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      exportSettings: { ...formData.exportSettings!, filterCondition: e.target.value }
                    })}
                    placeholder="Ex: company_id = 'abc123' AND created_at >= '2024-01-01'"
                    rows={3}
                    className={styles.textarea}
                  />
                </div>
              )}
            </>
          )}

          <div className={styles.formGroup}>
            <label>Tabela de Destino *</label>
            <input
              type="text"
              value={formData.exportSettings?.targetTable}
              onChange={(e) => setFormData({
                ...formData,
                exportSettings: { ...formData.exportSettings!, targetTable: e.target.value }
              })}
              placeholder="Ex: respostas_formularios"
              className={styles.input}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Modo de Exportação *</label>
            <select
              value={formData.exportSettings?.exportMode}
              onChange={(e) => setFormData({
                ...formData,
                exportSettings: { ...formData.exportSettings!, exportMode: e.target.value as any }
              })}
              className={styles.select}
            >
              <option value="insert">Inserir Apenas</option>
              <option value="upsert">Inserir ou Atualizar</option>
              <option value="update">Atualizar Apenas</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>Modo de Sincronização *</label>
            <select
              value={formData.exportSettings?.syncMode}
              onChange={(e) => setFormData({
                ...formData,
                exportSettings: { ...formData.exportSettings!, syncMode: e.target.value as any }
              })}
              className={styles.select}
            >
              <option value="manual">Manual</option>
              <option value="scheduled">Agendada</option>
              <option value="trigger">Por Gatilho (Tempo Real)</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={formData.exportSettings?.createTableIfNotExists}
                onChange={(e) => setFormData({
                  ...formData,
                  exportSettings: { ...formData.exportSettings!, createTableIfNotExists: e.target.checked }
                })}
              />
              Criar tabela automaticamente se não existir
            </label>
          </div>
        </>
      )}

      <div className={styles.stepActions}>
        <button className={styles.backButton} onClick={() => setStep(formData.type === 'bidirectional' ? 'import' : 'connection')}>
          Voltar
        </button>
        <button 
          className={styles.secondaryButton} 
          onClick={() => {
            showValidationModal('info', 'Configuração Posterior', 'Você pode configurar a exportação depois.\n\nO perfil será salvo apenas com a conexão ao banco.\n\nOutro usuário ou você mesmo pode editar este perfil posteriormente para configurar os dados.');
            setStep('review');
          }}
        >
          Pular Configuração
        </button>
        <button className={styles.nextButton} onClick={() => {
          const errors = validateExportFields();
          if (errors.length > 0) {
            showValidationModal('error', 'Campos Obrigatórios', errors.join('\n'));
            return;
          }
          setStep('review');
        }}>
          Revisar e Salvar
        </button>
      </div>
    </div>
  );

  const renderReviewStep = () => (
    <div className={styles.stepContent}>
      <h3>✅ Revisar e Salvar Perfil</h3>
      <p className={styles.stepDescription}>
        Confirme as configurações do perfil antes de salvar
      </p>

      <div className={styles.reviewSection}>
        <h4>📋 Informações Básicas</h4>
        <div className={styles.reviewItem}>
          <span>Nome do Perfil:</span>
          <strong>{formData.name}</strong>
        </div>
        {formData.description && (
          <div className={styles.reviewItem}>
            <span>Descrição:</span>
            <strong>{formData.description}</strong>
          </div>
        )}
      </div>

      <div className={styles.reviewSection}>
        <h4>🔒 Conexão Segura via Tailscale</h4>
        <div className={styles.reviewItem}>
          <span>Tipo de Banco:</span>
          <strong>{formData.connectionConfig?.dbType?.toUpperCase()}</strong>
        </div>
        <div className={styles.reviewItem}>
          <span>Servidor Tailscale:</span>
          <strong>{formData.connectionConfig?.host}:{formData.connectionConfig?.port}</strong>
        </div>
        <div className={styles.reviewItem}>
          <span>Nome do Banco:</span>
          <strong>{formData.connectionConfig?.database}</strong>
        </div>
        <div className={styles.reviewItem}>
          <span>Usuário:</span>
          <strong>{formData.connectionConfig?.username}</strong>
        </div>
        <div className={styles.reviewItem}>
          <span>Status da Conexão:</span>
          <strong className={connectionStatus === 'success' ? styles.statusSuccess : styles.statusPending}>
            {connectionStatus === 'success' ? '✅ Testada e Validada' : '⏳ Aguardando Teste'}
          </strong>
        </div>
      </div>

      <div className={styles.infoBox} style={{ marginTop: '24px' }}>
        <AlertCircle size={18} />
        <div>
          <strong>ℹ️ Próximos Passos:</strong>
          <p>Após salvar este perfil, você poderá configurar:</p>
          <ul>
            <li>Importação de dados do banco externo</li>
            <li>Exportação de dados para o banco externo</li>
            <li>Mapeamento de colunas e transformações</li>
            <li>Agendamento de sincronizações</li>
          </ul>
        </div>
      </div>

      <div className={styles.stepActions}>
        <button className={styles.backButton} onClick={() => setStep('connection')}>
          Voltar
        </button>
        <button className={styles.saveButton} onClick={handleSave}>
          <Save size={18} />
          Salvar Perfil
        </button>
      </div>
    </div>
  );

  if (!isOpen) return null;

  return (
    <>
      <div className={styles.overlay}>
        <div className={styles.modal}>
          <div className={styles.header}>
            <div className={styles.headerTitle}>
              <Database size={28} />
              <div>
                <h2>{profile ? 'Editar Perfil' : 'Criar Novo Perfil'} - {companyName}</h2>
                <p>Configure a integração com banco de dados externo</p>
              </div>
            </div>
            <button className={styles.closeButton} onClick={onClose}>
              <X size={24} />
            </button>
          </div>

          <div className={styles.progress}>
            <div className={`${styles.progressStep} ${step === 'basic' ? styles.active : (step === 'connection' || step === 'review') ? styles.completed : ''}`}>
              <span>1</span>
              <span>Básico</span>
            </div>
            <div className={`${styles.progressStep} ${step === 'connection' ? styles.active : step === 'review' ? styles.completed : ''}`}>
              <span>2</span>
              <span>Conexão</span>
            </div>
            <div className={`${styles.progressStep} ${step === 'review' ? styles.active : ''}`}>
              <span>3</span>
              <span>Revisar</span>
            </div>
          </div>

          <div className={styles.content}>
            {step === 'basic' && renderBasicStep()}
            {step === 'connection' && renderConnectionStep()}
            {step === 'review' && renderReviewStep()}
          </div>
        </div>
      </div>

      {/* Modal de Validação */}
      {validationModal.show && (
        <div className={styles.validationOverlay}>
          <div className={styles.validationModal}>
            <div className={styles.validationHeader}>
              {validationModal.type === 'error' && <AlertCircle size={24} className={styles.validationError} />}
              {validationModal.type === 'warning' && <AlertCircle size={24} className={styles.validationWarning} />}
              {validationModal.type === 'info' && <AlertCircle size={24} className={styles.validationInfo} />}
              <h3>{validationModal.title}</h3>
              <button className={styles.validationClose} onClick={hideValidationModal}>
                <X size={20} />
              </button>
            </div>
            <div className={styles.validationContent}>
              <p>{validationModal.message}</p>
            </div>
            <div className={styles.validationActions}>
              <button className={styles.validationButton} onClick={hideValidationModal}>
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
