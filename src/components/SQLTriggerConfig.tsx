'use client';

import React, { useState, useEffect } from 'react';
import { Database, RefreshCw, CheckCircle, XCircle, Loader } from 'lucide-react';
import styles from '../../app/styles/TriggerConfigPanel.module.css';

interface SQLTriggerConfigProps {
  tableName: string;
  triggerColumn: string;
  pollingInterval: number;
  onUpdate: (config: {
    tableName: string;
    triggerColumn: string;
    pollingInterval: number;
  }) => void;
}

interface TableInfo {
  name: string;
}

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
}

export default function SQLTriggerConfig({
  tableName,
  triggerColumn,
  pollingInterval,
  onUpdate
}: SQLTriggerConfigProps) {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [customQuery, setCustomQuery] = useState('');
  const [queryError, setQueryError] = useState('');

  // Carregar tabelas ao montar o componente
  useEffect(() => {
    loadTables();
  }, []);

  // Carregar colunas quando a tabela muda
  useEffect(() => {
    if (tableName) {
      loadColumns();
    }
  }, [tableName]);

  const loadTables = async () => {
    setLoadingTables(true);
    setConnectionStatus('idle');
    setErrorMessage('');

    try {
      const response = await fetch('/api/triggers/list-tables', {
        method: 'GET',
      });

      const data = await response.json();

      if (data.success) {
        setTables(data.tables.map((name: string) => ({ name })));
        setConnectionStatus('success');
      } else {
        setConnectionStatus('error');
        setErrorMessage(data.error || 'Erro ao conectar ao banco');
      }
    } catch (error: any) {
      setConnectionStatus('error');
      setErrorMessage(error.message || 'Erro de rede');
    } finally {
      setLoadingTables(false);
    }
  };

  const loadColumns = async () => {
    setLoadingColumns(true);
    setErrorMessage('');

    try {
      const response = await fetch('/api/triggers/get-columns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableName })
      });

      const data = await response.json();

      if (data.success) {
        setColumns(data.columns);
      } else {
        setErrorMessage(data.error || 'Erro ao carregar colunas');
      }
    } catch (error: any) {
      setErrorMessage(error.message || 'Erro de rede');
    } finally {
      setLoadingColumns(false);
    }
  };

  const testConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus('idle');
    setErrorMessage('');

    try {
      const response = await fetch('/api/triggers/list-tables', {
        method: 'GET',
      });

      const data = await response.json();

      if (data.success) {
        setConnectionStatus('success');
        setTables(data.tables.map((name: string) => ({ name })));
      } else {
        setConnectionStatus('error');
        setErrorMessage(data.error || 'Erro ao conectar');
      }
    } catch (error: any) {
      setConnectionStatus('error');
      setErrorMessage(error.message || 'Erro de rede');
    } finally {
      setTestingConnection(false);
    }
  };

  const validateQuery = () => {
    if (!customQuery) {
      setQueryError('');
      return;
    }

    const query = customQuery.trim().toUpperCase();

    // Verificar se começa com SELECT
    if (!query.startsWith('SELECT')) {
      setQueryError('❌ Apenas comandos SELECT são permitidos (somente leitura)');
      return;
    }

    // Bloquear comandos perigosos
    const dangerousCommands = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'TRUNCATE', 'EXEC'];
    for (const cmd of dangerousCommands) {
      if (query.includes(cmd)) {
        setQueryError(`❌ Comando ${cmd} não é permitido. Apenas SELECT para leitura.`);
        return;
      }
    }

    // Verificar sintaxe básica
    if (!query.includes('FROM')) {
      setQueryError('❌ Query inválida: falta cláusula FROM');
      return;
    }

    // Query válida
    setQueryError('');
  };

  return (
    <div className={styles.sqlTriggerConfig}>
      {/* Status da Conexão - Auto-conecta ao carregar */}
      {connectionStatus === 'error' && (
        <div className={styles.connectionStatusError}>
          <XCircle size={18} />
          <div>
            <strong>Banco não conectado</strong>
            <p>{errorMessage}</p>
            <small>Por favor, verifique com a equipe responsável</small>
          </div>
        </div>
      )}
      {loadingTables && connectionStatus === 'idle' && (
        <div className={styles.connectionStatusLoading}>
          <Loader size={18} className={styles.spinner} />
          <span>Conectando ao PostgreSQL Data Connect...</span>
        </div>
      )}

      {/* Seleção de Tabela - Só exibe se conectado */}
      {connectionStatus === 'success' && (
      <div className={styles.formGroup}>
        <label>Tabela *</label>
        {loadingTables ? (
          <div className={styles.loadingSelect}>
            <Loader size={16} className={styles.spinner} />
            Carregando tabelas...
          </div>
        ) : tables.length > 0 ? (
          <select
            value={tableName}
            onChange={(e) => {
              onUpdate({
                tableName: e.target.value,
                triggerColumn: '',
                pollingInterval
              });
            }}
            className={styles.select}
          >
            <option value="">Selecione uma tabela</option>
            {tables.map((table) => (
              <option key={table.name} value={table.name}>
                {table.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={tableName}
            onChange={(e) => onUpdate({ tableName: e.target.value, triggerColumn, pollingInterval })}
            placeholder="Digite o nome da tabela"
            className={styles.input}
          />
        )}
        <small>Tabela do banco de dados a ser monitorada</small>
      </div>
      )}

      {/* Seleção de Coluna de Trigger */}
      {connectionStatus === 'success' && tableName && (
        <div className={styles.formGroup}>
          <label>Coluna de Trigger *</label>
          {loadingColumns ? (
            <div className={styles.loadingSelect}>
              <Loader size={16} className={styles.spinner} />
              Carregando colunas...
            </div>
          ) : columns.length > 0 ? (
            <select
              value={triggerColumn}
              onChange={(e) => onUpdate({ tableName, triggerColumn: e.target.value, pollingInterval })}
              className={styles.select}
            >
              <option value="">Selecione uma coluna</option>
              {columns.map((column) => (
                <option key={column.name} value={column.name}>
                  {column.name} ({column.type})
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={triggerColumn}
              onChange={(e) => onUpdate({ tableName, triggerColumn: e.target.value, pollingInterval })}
              placeholder="Digite o nome da coluna"
              className={styles.input}
            />
          )}
          <small>Coluna usada para detectar novos registros (ex: id, created_at)</small>
        </div>
      )}

      {/* Intervalo de Polling */}
      {connectionStatus === 'success' && (
      <div className={styles.formGroup}>
        <label>Intervalo de Verificação</label>
        <div className={styles.intervalInput}>
          <input
            type="number"
            value={pollingInterval}
            onChange={(e) => onUpdate({ tableName, triggerColumn, pollingInterval: parseInt(e.target.value) || 5 })}
            min={1}
            max={60}
            className={styles.intervalNumber}
          />
          <span className={styles.intervalUnit}>minutos</span>
        </div>
        <small>
          ⏱️ O sistema verificará novos registros a cada {pollingInterval} {pollingInterval === 1 ? 'minuto' : 'minutos'}
          {pollingInterval < 5 && <span className={styles.warning}> ⚠️ Intervalos muito curtos podem sobrecarregar o banco</span>}
        </small>
      </div>
      )}

      {/* Editor de Query SQL */}
      {connectionStatus === 'success' && tableName && triggerColumn && (
        <div className={styles.formGroup}>
          <label>Query SQL Personalizada</label>
          <textarea
            value={customQuery || `SELECT * FROM ${tableName}\nWHERE ${triggerColumn} > [último_valor_processado]\nORDER BY ${triggerColumn} ASC\nLIMIT 100`}
            onChange={(e) => setCustomQuery(e.target.value)}
            onBlur={validateQuery}
            className={`${styles.queryEditor} ${queryError ? styles.queryError : ''}`}
            rows={5}
            spellCheck={false}
          />
          {queryError && (
            <div className={styles.errorMessage}>
              <XCircle size={16} />
              <span>{queryError}</span>
            </div>
          )}
          {!queryError && customQuery && (
            <div className={styles.successMessage}>
              <CheckCircle size={16} />
              <span>Query SQL válida</span>
            </div>
          )}
          <small>
            ⚠️ Apenas comandos SELECT são permitidos. A query será executada a cada {pollingInterval} {pollingInterval === 1 ? 'minuto' : 'minutos'}.
          </small>
        </div>
      )}
    </div>
  );
}
