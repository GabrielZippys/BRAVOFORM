'use client';

import React, { useState, useEffect } from 'react';
import { WorkflowTrigger } from '@/types';
import { Database, Webhook, Clock, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import SQLTriggerConfig from './SQLTriggerConfig';
import styles from '../../app/styles/TriggerConfigPanel.module.css';

interface TriggerConfigPanelProps {
  trigger?: WorkflowTrigger;
  onUpdate: (trigger: WorkflowTrigger | undefined) => void;
}

export default function TriggerConfigPanel({ trigger, onUpdate }: TriggerConfigPanelProps) {
  const [enabled, setEnabled] = useState(trigger?.enabled || false);
  const [triggerType, setTriggerType] = useState<'sql_database' | 'webhook' | 'schedule'>(
    trigger?.type || 'sql_database'
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  // SQL Config
  const [tableName, setTableName] = useState(trigger?.sqlConfig?.tableName || '');
  const [triggerColumn, setTriggerColumn] = useState(trigger?.sqlConfig?.triggerColumn || '');
  const [pollingInterval, setPollingInterval] = useState(trigger?.sqlConfig?.pollingInterval || 5);

  // Webhook Config
  const [webhookUrl, setWebhookUrl] = useState(trigger?.webhookConfig?.url || '');
  const [webhookSecret, setWebhookSecret] = useState(trigger?.webhookConfig?.secret || '');
  const [webhookMethod, setWebhookMethod] = useState<'POST' | 'GET'>(
    trigger?.webhookConfig?.method || 'POST'
  );

  // Schedule Config
  const [cronExpression, setCronExpression] = useState(trigger?.scheduleConfig?.cron || '');
  const [timezone, setTimezone] = useState(trigger?.scheduleConfig?.timezone || 'America/Sao_Paulo');

  useEffect(() => {
    if (!enabled) {
      onUpdate(undefined);
      return;
    }

    const newTrigger: WorkflowTrigger = {
      enabled: true,
      type: triggerType,
    };

    if (triggerType === 'sql_database' && tableName && triggerColumn) {
      newTrigger.sqlConfig = {
        tableName,
        triggerColumn,
        pollingInterval,
      };
    } else if (triggerType === 'webhook' && webhookUrl && webhookSecret) {
      newTrigger.webhookConfig = {
        url: webhookUrl,
        secret: webhookSecret,
        method: webhookMethod,
      };
    } else if (triggerType === 'schedule' && cronExpression) {
      newTrigger.scheduleConfig = {
        cron: cronExpression,
        timezone,
      };
    }

    onUpdate(newTrigger);
  }, [enabled, triggerType, tableName, triggerColumn, pollingInterval, webhookUrl, webhookSecret, webhookMethod, cronExpression, timezone]);

  return (
    <div className={styles.triggerPanel}>
      <div className={styles.header}>
        <h3>⚡ Trigger Automático</h3>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span className={styles.slider}></span>
        </label>
      </div>

      {enabled && (
        <>
          <div className={styles.typeSelector}>
            <button
              className={`${styles.typeButton} ${triggerType === 'sql_database' ? styles.active : ''}`}
              onClick={() => setTriggerType('sql_database')}
            >
              <Database size={20} />
              <span>Banco SQL</span>
            </button>
            <button
              className={`${styles.typeButton} ${triggerType === 'webhook' ? styles.active : ''}`}
              onClick={() => setTriggerType('webhook')}
            >
              <Webhook size={20} />
              <span>Webhook</span>
            </button>
            <button
              className={`${styles.typeButton} ${triggerType === 'schedule' ? styles.active : ''}`}
              onClick={() => setTriggerType('schedule')}
            >
              <Clock size={20} />
              <span>Agendado</span>
            </button>
          </div>

          {triggerType === 'sql_database' && (
            <div className={styles.configSection}>
              <div className={styles.infoBox}>
                <AlertCircle size={16} />
                <p>
                  O sistema monitorará a tabela SQL do PostgreSQL Data Connect e <strong>ativará esta etapa automaticamente</strong> quando novos registros forem detectados.
                </p>
              </div>

              <SQLTriggerConfig
                tableName={tableName}
                triggerColumn={triggerColumn}
                pollingInterval={pollingInterval}
                onUpdate={(config) => {
                  setTableName(config.tableName);
                  setTriggerColumn(config.triggerColumn);
                  setPollingInterval(config.pollingInterval);
                }}
              />
            </div>
          )}

          {triggerType === 'webhook' && (
            <div className={styles.configSection}>
              <div className={styles.infoBox}>
                <AlertCircle size={16} />
                <p>
                  Configure um webhook para receber notificações de sistemas externos e criar workflows automaticamente.
                </p>
              </div>

              <div className={styles.formGroup}>
                <label>URL do Webhook *</label>
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://api.exemplo.com/webhook"
                  className={styles.input}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Secret Key *</label>
                  <input
                    type="password"
                    value={webhookSecret}
                    onChange={(e) => setWebhookSecret(e.target.value)}
                    placeholder="Chave secreta"
                    className={styles.input}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Método HTTP</label>
                  <select
                    value={webhookMethod}
                    onChange={(e) => setWebhookMethod(e.target.value as 'POST' | 'GET')}
                    className={styles.select}
                  >
                    <option value="POST">POST</option>
                    <option value="GET">GET</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {triggerType === 'schedule' && (
            <div className={styles.configSection}>
              <div className={styles.infoBox}>
                <AlertCircle size={16} />
                <p>
                  Configure um agendamento para criar workflows automaticamente em horários específicos.
                </p>
              </div>

              <div className={styles.formGroup}>
                <label>Expressão Cron *</label>
                <input
                  type="text"
                  value={cronExpression}
                  onChange={(e) => setCronExpression(e.target.value)}
                  placeholder="0 9 * * 1-5"
                  className={styles.input}
                />
                <small>Exemplo: "0 9 * * 1-5" = Todo dia útil às 9h</small>
              </div>

              <div className={styles.formGroup}>
                <label>Fuso Horário</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className={styles.select}
                >
                  <option value="America/Sao_Paulo">Brasília (GMT-3)</option>
                  <option value="America/New_York">Nova York (GMT-5)</option>
                  <option value="Europe/London">Londres (GMT+0)</option>
                  <option value="Asia/Tokyo">Tóquio (GMT+9)</option>
                </select>
              </div>

              <div className={styles.exampleBox}>
                <strong>Exemplos de Cron:</strong>
                <ul>
                  <li><code>0 9 * * 1-5</code> - Todo dia útil às 9h</li>
                  <li><code>0 */2 * * *</code> - A cada 2 horas</li>
                  <li><code>0 0 1 * *</code> - Todo dia 1º do mês à meia-noite</li>
                </ul>
              </div>
            </div>
          )}

        </>
      )}
    </div>
  );
}
