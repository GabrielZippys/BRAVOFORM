'use client';

import React, { useState } from 'react';
import { Database, Download, Upload, ArrowLeftRight, Shield, Settings2 } from 'lucide-react';
import type { SQLConnectionConfig, IntegrationDirection, DatabaseType, EncryptionMethod } from '@/types';
import styles from '../../app/styles/DatabaseIntegration.module.css';

interface DatabaseIntegrationProps {
  onSave: (config: SQLConnectionConfig) => Promise<void>;
  companyId: string;
  userId: string;
}

export default function DatabaseIntegration({
  onSave,
  companyId,
  userId
}: DatabaseIntegrationProps) {
  const [step, setStep] = useState<'direction' | 'connection' | 'advanced'>('direction');
  const [direction, setDirection] = useState<IntegrationDirection>('import');
  
  const [config, setConfig] = useState<Partial<SQLConnectionConfig>>({
    name: '',
    description: '',
    type: 'mysql',
    direction: 'import',
    host: '',
    port: 3306,
    database: '',
    username: '',
    password: '',
    encryptionMethod: 'aes-256-gcm',
    ssl: false,
    connectionTimeout: 30000,
    maxConnections: 10,
    isActive: true,
    tags: []
  });

  const handleTypeChange = (type: DatabaseType) => {
    const defaultPorts: Record<DatabaseType, number> = {
      mysql: 3306,
      postgresql: 5432,
      sqlserver: 1433,
      oracle: 1521,
      mongodb: 27017,
      sqlite: 0
    };
    
    setConfig(prev => ({
      ...prev,
      type,
      port: defaultPorts[type]
    }));
  };

  const handleDirectionSelect = (dir: IntegrationDirection) => {
    setDirection(dir);
    setConfig(prev => ({ ...prev, direction: dir }));
    setStep('connection');
  };

  const handleSave = async () => {
    try {
      const finalConfig: SQLConnectionConfig = {
        ...config as SQLConnectionConfig,
        createdAt: new Date() as any,
        createdBy: userId,
        companyId
      };
      
      await onSave(finalConfig);
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar configuração');
    }
  };

  const renderDirectionStep = () => (
    <div className={styles.stepContent}>
      <h2>Escolha o Tipo de Integração</h2>
      <p className={styles.subtitle}>
        Selecione se deseja importar dados para o BravoFlow, exportar dados do BravoFlow, ou ambos.
      </p>

      <div className={styles.directionCards}>
        <div 
          className={styles.directionCard}
          onClick={() => handleDirectionSelect('import')}
        >
          <div className={styles.iconWrapper}>
            <Download size={48} />
          </div>
          <h3>Importar Dados</h3>
          <p>
            Buscar dados de um banco externo e importar para o BravoFlow automaticamente.
          </p>
          <ul className={styles.features}>
            <li>✓ Importar pedidos de compra</li>
            <li>✓ Sincronização agendada</li>
            <li>✓ Detecção de duplicatas</li>
            <li>✓ Transformação de dados</li>
          </ul>
        </div>

        <div 
          className={styles.directionCard}
          onClick={() => handleDirectionSelect('export')}
        >
          <div className={styles.iconWrapper}>
            <Upload size={48} />
          </div>
          <h3>Exportar Dados</h3>
          <p>
            Enviar dados do BravoFlow para um banco externo automaticamente.
          </p>
          <ul className={styles.features}>
            <li>✓ Exportar respostas de formulários</li>
            <li>✓ Exportar workflows concluídos</li>
            <li>✓ Sincronização em tempo real</li>
            <li>✓ Criar tabelas automaticamente</li>
          </ul>
        </div>

        <div 
          className={styles.directionCard}
          onClick={() => handleDirectionSelect('bidirectional')}
        >
          <div className={styles.iconWrapper}>
            <ArrowLeftRight size={48} />
          </div>
          <h3>Bidirecional</h3>
          <p>
            Importar E exportar dados, mantendo sincronização completa entre sistemas.
          </p>
          <ul className={styles.features}>
            <li>✓ Sincronização completa</li>
            <li>✓ Importação + Exportação</li>
            <li>✓ Resolução de conflitos</li>
            <li>✓ Máxima flexibilidade</li>
          </ul>
        </div>
      </div>
    </div>
  );

  const renderConnectionStep = () => (
    <div className={styles.stepContent}>
      <h2>Configurar Conexão com Banco de Dados</h2>
      <p className={styles.subtitle}>
        Preencha os dados de conexão. Todas as credenciais serão criptografadas.
      </p>

      <div className={styles.formGrid}>
        {/* Informações Básicas */}
        <div className={styles.section}>
          <h3>Informações Básicas</h3>
          
          <div className={styles.formGroup}>
            <label>Nome da Integração *</label>
            <input
              type="text"
              value={config.name}
              onChange={(e) => setConfig({ ...config, name: e.target.value })}
              placeholder="Ex: ERP Principal - Importação"
              className={styles.input}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Descrição</label>
            <textarea
              value={config.description}
              onChange={(e) => setConfig({ ...config, description: e.target.value })}
              placeholder="Descrição opcional da integração..."
              rows={3}
              className={styles.textarea}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Tags (opcional)</label>
            <input
              type="text"
              value={config.tags?.join(', ')}
              onChange={(e) => setConfig({ ...config, tags: e.target.value.split(',').map(t => t.trim()) })}
              placeholder="Ex: produção, compras, crítico"
              className={styles.input}
            />
            <small>Separe as tags por vírgula</small>
          </div>
        </div>

        {/* Configuração do Banco */}
        <div className={styles.section}>
          <h3>Configuração do Banco</h3>
          
          <div className={styles.formGroup}>
            <label>Tipo de Banco *</label>
            <select
              value={config.type}
              onChange={(e) => handleTypeChange(e.target.value as DatabaseType)}
              className={styles.select}
            >
              <option value="mysql">MySQL / MariaDB</option>
              <option value="postgresql">PostgreSQL</option>
              <option value="sqlserver">SQL Server</option>
              <option value="oracle">Oracle Database</option>
              <option value="mongodb">MongoDB</option>
              <option value="sqlite">SQLite</option>
            </select>
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Host / Servidor *</label>
              <input
                type="text"
                value={config.host}
                onChange={(e) => setConfig({ ...config, host: e.target.value })}
                placeholder="Ex: localhost ou 192.168.1.100"
                className={styles.input}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Porta *</label>
              <input
                type="number"
                value={config.port}
                onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) })}
                className={styles.input}
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Nome do Banco de Dados *</label>
            <input
              type="text"
              value={config.database}
              onChange={(e) => setConfig({ ...config, database: e.target.value })}
              placeholder="Ex: erp_producao"
              className={styles.input}
            />
          </div>
        </div>

        {/* Credenciais */}
        <div className={styles.section}>
          <h3>
            <Shield size={20} />
            Credenciais (Criptografadas)
          </h3>
          
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Usuário *</label>
              <input
                type="text"
                value={config.username}
                onChange={(e) => setConfig({ ...config, username: e.target.value })}
                placeholder="Usuário do banco"
                className={styles.input}
                autoComplete="off"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Senha *</label>
              <input
                type="password"
                value={config.password}
                onChange={(e) => setConfig({ ...config, password: e.target.value })}
                placeholder="Senha do banco"
                className={styles.input}
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Método de Criptografia</label>
            <select
              value={config.encryptionMethod}
              onChange={(e) => setConfig({ ...config, encryptionMethod: e.target.value as EncryptionMethod })}
              className={styles.select}
            >
              <option value="aes-256-gcm">AES-256-GCM (Recomendado)</option>
              <option value="aes-128-gcm">AES-128-GCM</option>
              <option value="none">Sem Criptografia (Não Recomendado)</option>
            </select>
          </div>

          <div className={styles.securityNote}>
            <Shield size={16} />
            <span>
              Suas credenciais serão criptografadas usando {config.encryptionMethod === 'aes-256-gcm' ? 'AES-256-GCM' : config.encryptionMethod === 'aes-128-gcm' ? 'AES-128-GCM' : 'nenhuma criptografia'} antes de serem armazenadas.
            </span>
          </div>
        </div>

        {/* SSL/TLS */}
        <div className={styles.section}>
          <h3>Segurança SSL/TLS</h3>
          
          <div className={styles.formGroup}>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={config.ssl}
                onChange={(e) => setConfig({ ...config, ssl: e.target.checked })}
              />
              Usar SSL/TLS
            </label>
          </div>

          {config.ssl && (
            <>
              <div className={styles.formGroup}>
                <label>Certificado SSL (opcional)</label>
                <textarea
                  value={config.sslCert}
                  onChange={(e) => setConfig({ ...config, sslCert: e.target.value })}
                  placeholder="Cole o certificado SSL aqui..."
                  rows={4}
                  className={styles.textarea}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Chave SSL (opcional)</label>
                <textarea
                  value={config.sslKey}
                  onChange={(e) => setConfig({ ...config, sslKey: e.target.value })}
                  placeholder="Cole a chave SSL aqui..."
                  rows={4}
                  className={styles.textarea}
                />
              </div>

              <div className={styles.formGroup}>
                <label>CA Certificate (opcional)</label>
                <textarea
                  value={config.sslCA}
                  onChange={(e) => setConfig({ ...config, sslCA: e.target.value })}
                  placeholder="Cole o CA certificate aqui..."
                  rows={4}
                  className={styles.textarea}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <div className={styles.buttonGroup}>
        <button
          type="button"
          onClick={() => setStep('direction')}
          className={styles.backButton}
        >
          Voltar
        </button>

        <button
          type="button"
          onClick={() => setStep('advanced')}
          className={styles.nextButton}
        >
          Próximo: Configurações Avançadas
        </button>
      </div>
    </div>
  );

  const renderAdvancedStep = () => (
    <div className={styles.stepContent}>
      <h2>Configurações Avançadas</h2>
      <p className={styles.subtitle}>
        Personalize o comportamento da integração.
      </p>

      <div className={styles.formGrid}>
        <div className={styles.section}>
          <h3>
            <Settings2 size={20} />
            Performance
          </h3>
          
          <div className={styles.formGroup}>
            <label>Timeout de Conexão (ms)</label>
            <input
              type="number"
              value={config.connectionTimeout}
              onChange={(e) => setConfig({ ...config, connectionTimeout: parseInt(e.target.value) })}
              className={styles.input}
              min="1000"
              step="1000"
            />
            <small>Tempo máximo para estabelecer conexão (padrão: 30000ms)</small>
          </div>

          <div className={styles.formGroup}>
            <label>Máximo de Conexões Simultâneas</label>
            <input
              type="number"
              value={config.maxConnections}
              onChange={(e) => setConfig({ ...config, maxConnections: parseInt(e.target.value) })}
              className={styles.input}
              min="1"
              max="100"
            />
            <small>Número máximo de conexões no pool (padrão: 10)</small>
          </div>
        </div>

        <div className={styles.section}>
          <h3>Status</h3>
          
          <div className={styles.formGroup}>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={config.isActive}
                onChange={(e) => setConfig({ ...config, isActive: e.target.checked })}
              />
              Ativar integração imediatamente após salvar
            </label>
          </div>
        </div>
      </div>

      <div className={styles.buttonGroup}>
        <button
          type="button"
          onClick={() => setStep('connection')}
          className={styles.backButton}
        >
          Voltar
        </button>

        <button
          type="button"
          onClick={handleSave}
          className={styles.saveButton}
          disabled={!config.name || !config.host || !config.database || !config.username || !config.password}
        >
          <Database size={18} />
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
          <h1>Integração com Banco de Dados</h1>
          <p>Configure importação e exportação de dados com segurança e criptografia</p>
        </div>
      </div>

      <div className={styles.progressBar}>
        <div className={`${styles.progressStep} ${step === 'direction' ? styles.active : styles.completed}`}>
          <span>1</span>
          <span>Direção</span>
        </div>
        <div className={`${styles.progressStep} ${step === 'connection' ? styles.active : step === 'advanced' ? styles.completed : ''}`}>
          <span>2</span>
          <span>Conexão</span>
        </div>
        <div className={`${styles.progressStep} ${step === 'advanced' ? styles.active : ''}`}>
          <span>3</span>
          <span>Avançado</span>
        </div>
      </div>

      {step === 'direction' && renderDirectionStep()}
      {step === 'connection' && renderConnectionStep()}
      {step === 'advanced' && renderAdvancedStep()}
    </div>
  );
}
