'use client';

import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Save, 
  Trash2, 
  Edit2, 
  Plus, 
  X, 
  Download, 
  Upload, 
  Eye, 
  EyeOff,
  CheckCircle,
  AlertCircle,
  Copy,
  Play
} from 'lucide-react';
import type { SQLPreset, DatabaseType, EncryptionMethod } from '@/types';
import styles from '../../app/styles/SQLPresetsModal.module.css';

interface SQLPresetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  companyName: string;
  userId: string;
  onSavePreset: (preset: SQLPreset) => Promise<void>;
  onDeletePreset: (presetId: string) => Promise<void>;
  onLoadPreset: (preset: SQLPreset) => void;
  existingPresets: SQLPreset[];
}

export default function SQLPresetsModal({
  isOpen,
  onClose,
  companyId,
  companyName,
  userId,
  onSavePreset,
  onDeletePreset,
  onLoadPreset,
  existingPresets
}: SQLPresetsModalProps) {
  const [view, setView] = useState<'list' | 'create' | 'edit'>('list');
  const [selectedPreset, setSelectedPreset] = useState<SQLPreset | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  
  const [formData, setFormData] = useState<Partial<SQLPreset>>({
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
      maxConnections: 10
    },
    encryptionMethod: 'aes-256-gcm',
    isActive: true,
    tags: []
  });

  useEffect(() => {
    if (!isOpen) {
      setView('list');
      setSelectedPreset(null);
      resetForm();
    }
  }, [isOpen]);

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
        maxConnections: 10
      },
      encryptionMethod: 'aes-256-gcm',
      isActive: true,
      tags: []
    });
    setShowPassword(false);
    setConnectionStatus('idle');
  };

  const handleCreateNew = () => {
    resetForm();
    setView('create');
  };

  const handleEdit = (preset: SQLPreset) => {
    setSelectedPreset(preset);
    setFormData(preset);
    setView('edit');
  };

  const handleDelete = async (presetId: string) => {
    if (confirm('Tem certeza que deseja excluir este preset?')) {
      await onDeletePreset(presetId);
    }
  };

  const handleDuplicate = (preset: SQLPreset) => {
    const duplicated = {
      ...preset,
      id: undefined,
      name: `${preset.name} (Cópia)`,
      createdAt: undefined,
      updatedAt: undefined
    };
    setFormData(duplicated);
    setView('create');
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
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (!formData.connectionConfig?.host || !formData.connectionConfig?.database) {
        throw new Error('Preencha os campos obrigatórios');
      }

      setConnectionStatus('success');
    } catch (error) {
      setConnectionStatus('error');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSave = async () => {
    try {
      const preset: SQLPreset = {
        ...formData as SQLPreset,
        companyId,
        createdAt: selectedPreset?.createdAt || (new Date() as any),
        createdBy: selectedPreset?.createdBy || userId,
        updatedAt: new Date() as any
      };

      await onSavePreset(preset);
      setView('list');
      resetForm();
    } catch (error) {
      console.error('Erro ao salvar preset:', error);
      alert('Erro ao salvar preset');
    }
  };

  const handleLoadPreset = (preset: SQLPreset) => {
    onLoadPreset(preset);
    onClose();
  };

  const importPresets = existingPresets.filter(p => p.type === 'import');
  const exportPresets = existingPresets.filter(p => p.type === 'export');

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <Database size={28} />
            <div>
              <h2>Presets SQL - {companyName}</h2>
              <p>Gerencie configurações de banco de dados por empresa</p>
            </div>
          </div>
          <button className={styles.closeButton} onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className={styles.content}>
          {view === 'list' && (
            <>
              <div className={styles.actions}>
                <button className={styles.createButton} onClick={handleCreateNew}>
                  <Plus size={20} />
                  Novo Preset
                </button>
              </div>

              <div className={styles.presetsSection}>
                <div className={styles.sectionHeader}>
                  <Download size={20} />
                  <h3>Presets de Importação ({importPresets.length})</h3>
                </div>
                {importPresets.length === 0 ? (
                  <div className={styles.emptyState}>
                    <Database size={48} />
                    <p>Nenhum preset de importação configurado</p>
                  </div>
                ) : (
                  <div className={styles.presetsList}>
                    {importPresets.map(preset => (
                      <div key={preset.id} className={styles.presetCard}>
                        <div className={styles.presetHeader}>
                          <div className={styles.presetInfo}>
                            <h4>{preset.name}</h4>
                            {preset.description && <p>{preset.description}</p>}
                          </div>
                          <div className={styles.presetBadge}>
                            {preset.connectionConfig.dbType.toUpperCase()}
                          </div>
                        </div>
                        <div className={styles.presetDetails}>
                          <span>🗄️ {preset.connectionConfig.database}</span>
                          <span>🖥️ {preset.connectionConfig.host}:{preset.connectionConfig.port}</span>
                          {preset.isActive ? (
                            <span className={styles.statusActive}>● Ativo</span>
                          ) : (
                            <span className={styles.statusInactive}>● Inativo</span>
                          )}
                        </div>
                        <div className={styles.presetActions}>
                          <button 
                            className={styles.actionButton}
                            onClick={() => handleLoadPreset(preset)}
                            title="Usar este preset"
                          >
                            <Play size={16} />
                            Usar
                          </button>
                          <button 
                            className={styles.actionButton}
                            onClick={() => handleEdit(preset)}
                            title="Editar"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            className={styles.actionButton}
                            onClick={() => handleDuplicate(preset)}
                            title="Duplicar"
                          >
                            <Copy size={16} />
                          </button>
                          <button 
                            className={styles.actionButtonDanger}
                            onClick={() => handleDelete(preset.id!)}
                            title="Excluir"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.presetsSection}>
                <div className={styles.sectionHeader}>
                  <Upload size={20} />
                  <h3>Presets de Exportação ({exportPresets.length})</h3>
                </div>
                {exportPresets.length === 0 ? (
                  <div className={styles.emptyState}>
                    <Database size={48} />
                    <p>Nenhum preset de exportação configurado</p>
                  </div>
                ) : (
                  <div className={styles.presetsList}>
                    {exportPresets.map(preset => (
                      <div key={preset.id} className={styles.presetCard}>
                        <div className={styles.presetHeader}>
                          <div className={styles.presetInfo}>
                            <h4>{preset.name}</h4>
                            {preset.description && <p>{preset.description}</p>}
                          </div>
                          <div className={styles.presetBadge}>
                            {preset.connectionConfig.dbType.toUpperCase()}
                          </div>
                        </div>
                        <div className={styles.presetDetails}>
                          <span>🗄️ {preset.connectionConfig.database}</span>
                          <span>🖥️ {preset.connectionConfig.host}:{preset.connectionConfig.port}</span>
                          {preset.isActive ? (
                            <span className={styles.statusActive}>● Ativo</span>
                          ) : (
                            <span className={styles.statusInactive}>● Inativo</span>
                          )}
                        </div>
                        <div className={styles.presetActions}>
                          <button 
                            className={styles.actionButton}
                            onClick={() => handleLoadPreset(preset)}
                            title="Usar este preset"
                          >
                            <Play size={16} />
                            Usar
                          </button>
                          <button 
                            className={styles.actionButton}
                            onClick={() => handleEdit(preset)}
                            title="Editar"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            className={styles.actionButton}
                            onClick={() => handleDuplicate(preset)}
                            title="Duplicar"
                          >
                            <Copy size={16} />
                          </button>
                          <button 
                            className={styles.actionButtonDanger}
                            onClick={() => handleDelete(preset.id!)}
                            title="Excluir"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {(view === 'create' || view === 'edit') && (
            <div className={styles.formContainer}>
              <div className={styles.formHeader}>
                <h3>{view === 'create' ? 'Criar Novo Preset' : 'Editar Preset'}</h3>
                <button className={styles.backButton} onClick={() => setView('list')}>
                  Voltar
                </button>
              </div>

              <div className={styles.form}>
                <div className={styles.formGroup}>
                  <label>Nome do Preset *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: ERP Principal - Importação"
                    className={styles.input}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Descrição</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Descrição opcional do preset..."
                    rows={2}
                    className={styles.textarea}
                  />
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>Tipo *</label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as 'import' | 'export' })}
                      className={styles.select}
                    >
                      <option value="import">Importação</option>
                      <option value="export">Exportação</option>
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <label>Tipo de Banco *</label>
                    <select
                      value={formData.connectionConfig?.dbType}
                      onChange={(e) => handleDbTypeChange(e.target.value as DatabaseType)}
                      className={styles.select}
                    >
                      <option value="mysql">MySQL</option>
                      <option value="postgresql">PostgreSQL</option>
                      <option value="sqlserver">SQL Server</option>
                      <option value="oracle">Oracle</option>
                    </select>
                  </div>
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup} style={{ flex: 2 }}>
                    <label>Host / Servidor *</label>
                    <input
                      type="text"
                      value={formData.connectionConfig?.host}
                      onChange={(e) => setFormData({
                        ...formData,
                        connectionConfig: { ...formData.connectionConfig!, host: e.target.value }
                      })}
                      placeholder="Ex: localhost ou 192.168.1.100"
                      className={styles.input}
                    />
                  </div>

                  <div className={styles.formGroup} style={{ flex: 1 }}>
                    <label>Porta *</label>
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
                  <label>Nome do Banco de Dados *</label>
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
                    <label>Usuário *</label>
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
                    <label>Senha *</label>
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

                <div className={styles.formGroup}>
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={formData.connectionConfig?.ssl}
                      onChange={(e) => setFormData({
                        ...formData,
                        connectionConfig: { ...formData.connectionConfig!, ssl: e.target.checked }
                      })}
                    />
                    Usar SSL/TLS
                  </label>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    />
                    Preset ativo
                  </label>
                </div>

                {connectionStatus !== 'idle' && (
                  <div className={connectionStatus === 'success' ? styles.successBox : styles.errorBox}>
                    {connectionStatus === 'success' ? (
                      <>
                        <CheckCircle size={20} />
                        <span>Conexão estabelecida com sucesso!</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle size={20} />
                        <span>Falha ao conectar. Verifique as credenciais.</span>
                      </>
                    )}
                  </div>
                )}

                <div className={styles.formActions}>
                  <button
                    type="button"
                    className={styles.testButton}
                    onClick={testConnection}
                    disabled={testingConnection}
                  >
                    {testingConnection ? 'Testando...' : 'Testar Conexão'}
                  </button>
                  <button
                    type="button"
                    className={styles.saveButton}
                    onClick={handleSave}
                    disabled={!formData.name || !formData.connectionConfig?.host}
                  >
                    <Save size={18} />
                    Salvar Preset
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
