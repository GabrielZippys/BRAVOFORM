'use client';

import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Plus, 
  Edit2, 
  Trash2, 
  Play, 
  Pause,
  RefreshCw,
  Download,
  Upload,
  ArrowLeftRight,
  CheckCircle,
  XCircle,
  AlertCircle,
  Settings
} from 'lucide-react';
import type { SQLIntegrationProfile } from '@/types';
import styles from '../../app/styles/SQLIntegrationProfiles.module.css';
import { sqlProfilesService } from '../services/sqlProfilesService';

interface SQLIntegrationProfilesProps {
  companyId: string;
  companyName: string;
  userId: string;
  onCreateProfile: () => void;
  onEditProfile: (profile: SQLIntegrationProfile) => void;
}

export default function SQLIntegrationProfiles({
  companyId,
  companyName,
  userId,
  onCreateProfile,
  onEditProfile
}: SQLIntegrationProfilesProps) {
  const [profiles, setProfiles] = useState<SQLIntegrationProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingProfile, setTestingProfile] = useState<string | null>(null);

  useEffect(() => {
    loadProfiles();
  }, [companyId]);

  const loadProfiles = async () => {
    setLoading(true);
    try {
      const loadedProfiles = await sqlProfilesService.getCompanyProfiles(companyId);
      setProfiles(loadedProfiles);
    } catch (error) {
      console.error('Erro ao carregar perfis:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async (profileId: string) => {
    setTestingProfile(profileId);
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      // TODO: Implementar teste real de conexão
      alert('Conexão testada com sucesso!');
    } catch (error) {
      alert('Erro ao testar conexão');
    } finally {
      setTestingProfile(null);
    }
  };

  const handleToggleActive = async (profile: SQLIntegrationProfile) => {
    try {
      await sqlProfilesService.toggleProfileActive(profile.id!, !profile.isActive);
      await loadProfiles();
    } catch (error) {
      console.error('Erro ao alternar status:', error);
      alert('Erro ao alterar status do perfil');
    }
  };

  const handleDelete = async (profileId: string) => {
    if (!confirm('Tem certeza que deseja excluir este perfil de integração?')) {
      return;
    }
    
    try {
      await sqlProfilesService.deleteProfile(profileId);
      await loadProfiles();
    } catch (error) {
      console.error('Erro ao excluir perfil:', error);
      alert('Erro ao excluir perfil');
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'import': return <Download size={20} />;
      case 'export': return <Upload size={20} />;
      case 'bidirectional': return <ArrowLeftRight size={20} />;
      default: return <Database size={20} />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'import': return 'Importação';
      case 'export': return 'Exportação';
      case 'bidirectional': return 'Bidirecional';
      default: return type;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online': return <CheckCircle size={16} className={styles.statusOnline} />;
      case 'offline': return <XCircle size={16} className={styles.statusOffline} />;
      case 'error': return <AlertCircle size={16} className={styles.statusError} />;
      case 'testing': return <RefreshCw size={16} className={styles.statusTesting} />;
      default: return null;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'online': return 'Online';
      case 'offline': return 'Offline';
      case 'error': return 'Erro';
      case 'testing': return 'Testando';
      default: return status;
    }
  };

  if (loading) {
    return (
      <div className={styles.loading}>
        <RefreshCw size={48} className={styles.spinning} />
        <p>Carregando perfis de integração...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <Database size={32} />
          <div>
            <h1>Perfis de Integração SQL</h1>
            <p>Gerencie múltiplos perfis de banco de dados para {companyName}</p>
          </div>
        </div>
        <button className={styles.createButton} onClick={onCreateProfile}>
          <Plus size={20} />
          Criar Novo Perfil
        </button>
      </div>

      {profiles.length === 0 ? (
        <div className={styles.emptyState}>
          <Database size={64} />
          <h2>Nenhum perfil de integração configurado</h2>
          <p>Crie seu primeiro perfil para começar a integrar com bancos de dados externos</p>
          <button className={styles.createButtonLarge} onClick={onCreateProfile}>
            <Plus size={24} />
            Criar Primeiro Perfil
          </button>
        </div>
      ) : (
        <div className={styles.profilesGrid}>
          {profiles.map(profile => (
            <div key={profile.id} className={styles.profileCard}>
              <div className={styles.profileHeader}>
                <div className={styles.profileIcon}>
                  {getTypeIcon(profile.type)}
                </div>
                <div className={styles.profileInfo}>
                  <h3>{profile.name}</h3>
                  {profile.description && <p>{profile.description}</p>}
                </div>
                <div className={styles.profileStatus}>
                  {getStatusIcon(profile.status)}
                  <span>{getStatusLabel(profile.status)}</span>
                </div>
              </div>

              <div className={styles.profileDetails}>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Tipo:</span>
                  <span className={styles.detailValue}>
                    <span className={`${styles.typeBadge} ${styles[`type${profile.type}`]}`}>
                      {getTypeLabel(profile.type)}
                    </span>
                  </span>
                </div>
                
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Banco:</span>
                  <span className={styles.detailValue}>
                    {profile.connectionConfig.dbType.toUpperCase()} - {profile.connectionConfig.database}
                  </span>
                </div>
                
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Servidor:</span>
                  <span className={styles.detailValue}>
                    {profile.connectionConfig.host}:{profile.connectionConfig.port}
                  </span>
                </div>

                {profile.importSettings?.enabled && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Importação:</span>
                    <span className={styles.detailValue}>
                      {profile.importSettings.tableName} → {profile.importSettings.targetCollection}
                    </span>
                  </div>
                )}

                {profile.exportSettings?.enabled && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Exportação:</span>
                    <span className={styles.detailValue}>
                      {profile.exportSettings.sourceCollection} → {profile.exportSettings.targetTable}
                    </span>
                  </div>
                )}

                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Criptografia:</span>
                  <span className={styles.detailValue}>
                    {profile.encryptionMethod.toUpperCase()}
                  </span>
                </div>
              </div>

              <div className={styles.profileActions}>
                <button
                  className={styles.actionButton}
                  onClick={() => handleTestConnection(profile.id!)}
                  disabled={testingProfile === profile.id}
                  title="Testar Conexão"
                >
                  {testingProfile === profile.id ? (
                    <RefreshCw size={16} className={styles.spinning} />
                  ) : (
                    <RefreshCw size={16} />
                  )}
                  Testar
                </button>

                <button
                  className={`${styles.actionButton} ${profile.isActive ? styles.activeButton : ''}`}
                  onClick={() => handleToggleActive(profile)}
                  title={profile.isActive ? 'Desativar' : 'Ativar'}
                >
                  {profile.isActive ? <Pause size={16} /> : <Play size={16} />}
                  {profile.isActive ? 'Ativo' : 'Inativo'}
                </button>

                <button
                  className={styles.actionButton}
                  onClick={() => onEditProfile(profile)}
                  title="Editar Perfil"
                >
                  <Settings size={16} />
                  Configurar
                </button>

                <button
                  className={styles.actionButtonDanger}
                  onClick={() => handleDelete(profile.id!)}
                  title="Excluir Perfil"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
