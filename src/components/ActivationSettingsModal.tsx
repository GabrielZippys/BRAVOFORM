'use client';

import React, { useState } from 'react';
import { X, Clock, Calendar, Users } from 'lucide-react';
import type { ActivationSettings, ActivationMode, AutomaticSchedule } from '@/types';
import styles from '../../app/styles/ActivationSettingsModal.module.css';

interface ActivationSettingsModalProps {
  settings: ActivationSettings;
  onSave: (settings: ActivationSettings) => void;
  onClose: () => void;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terça' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sábado' },
];

export default function ActivationSettingsModal({
  settings,
  onSave,
  onClose
}: ActivationSettingsModalProps) {
  const [mode, setMode] = useState<ActivationMode>(settings.mode);
  const [time, setTime] = useState(settings.automaticSchedule?.time || '09:00');
  const [selectedDays, setSelectedDays] = useState<number[]>(
    settings.automaticSchedule?.daysOfWeek || [1, 2, 3, 4, 5]
  );
  const [timezone, setTimezone] = useState(
    settings.automaticSchedule?.timezone || 'America/Sao_Paulo'
  );
  const [requireApproval, setRequireApproval] = useState(
    settings.requestApprovalRequired || false
  );

  const handleDayToggle = (day: number) => {
    setSelectedDays(prev =>
      prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day].sort()
    );
  };

  const handleSave = () => {
    const newSettings: ActivationSettings = {
      mode,
      requestApprovalRequired: mode === 'on_request' ? requireApproval : false,
      automaticSchedule: mode === 'automatic' ? {
        time,
        daysOfWeek: selectedDays,
        timezone
      } : undefined
    };

    onSave(newSettings);
    onClose();
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>Configurações de Ativação</h2>
          <button onClick={onClose} className={styles.closeButton}>
            <X size={24} />
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.section}>
            <h3>Modo de Ativação</h3>
            <p className={styles.description}>
              Escolha como as instâncias deste workflow serão criadas
            </p>

            <div className={styles.modeOptions}>
              {/* Modo Manual */}
              <div
                className={`${styles.modeCard} ${mode === 'manual' ? styles.selected : ''}`}
                onClick={() => setMode('manual')}
              >
                <div className={styles.modeIcon}>
                  <Users size={24} />
                </div>
                <div className={styles.modeInfo}>
                  <h4>Manual</h4>
                  <p>Admin cria instâncias manualmente quando necessário</p>
                </div>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'manual'}
                  onChange={() => setMode('manual')}
                />
              </div>

              {/* Modo Automático */}
              <div
                className={`${styles.modeCard} ${mode === 'automatic' ? styles.selected : ''}`}
                onClick={() => setMode('automatic')}
              >
                <div className={styles.modeIcon}>
                  <Clock size={24} />
                </div>
                <div className={styles.modeInfo}>
                  <h4>Automático</h4>
                  <p>Cria instâncias automaticamente em horários agendados</p>
                </div>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'automatic'}
                  onChange={() => setMode('automatic')}
                />
              </div>

              {/* Modo Por Requisição */}
              <div
                className={`${styles.modeCard} ${mode === 'on_request' ? styles.selected : ''}`}
                onClick={() => setMode('on_request')}
              >
                <div className={styles.modeIcon}>
                  <Calendar size={24} />
                </div>
                <div className={styles.modeInfo}>
                  <h4>Por Requisição</h4>
                  <p>Usuários solicitam e admin aprova a criação</p>
                </div>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'on_request'}
                  onChange={() => setMode('on_request')}
                />
              </div>
            </div>
          </div>

          {/* Configurações do Modo Automático */}
          {mode === 'automatic' && (
            <div className={styles.section}>
              <h3>Agendamento Automático</h3>
              
              <div className={styles.formGroup}>
                <label style={{ color: '#374151', fontWeight: 500 }}>Horário de Criação</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className={styles.timeInput}
                  style={{ color: '#1F2937' }}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Dias da Semana</label>
                <div className={styles.daysGrid}>
                  {DAYS_OF_WEEK.map(day => (
                    <button
                      key={day.value}
                      type="button"
                      className={`${styles.dayButton} ${
                        selectedDays.includes(day.value) ? styles.selected : ''
                      }`}
                      onClick={() => handleDayToggle(day.value)}
                    >
                      {day.label.substring(0, 3)}
                    </button>
                  ))}
                </div>
                <p className={styles.hint}>
                  Selecione os dias em que o workflow será criado automaticamente
                </p>
              </div>

              <div className={styles.formGroup}>
                <label style={{ color: '#374151', fontWeight: 500 }}>Fuso Horário</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className={styles.input}
                  style={{ color: '#1F2937' }}
                >
                  <option value="America/Sao_Paulo">Horário de Brasília (GMT-3)</option>
                  <option value="America/New_York">Nova York (GMT-5)</option>
                  <option value="America/Los_Angeles">Los Angeles (GMT-8)</option>
                  <option value="Europe/London">Londres (GMT+0)</option>
                  <option value="Europe/Paris">Paris (GMT+1)</option>
                  <option value="Asia/Tokyo">Tóquio (GMT+9)</option>
                  <option value="Australia/Sydney">Sydney (GMT+10)</option>
                </select>
                <p className={styles.hint}>
                  Selecione o fuso horário para criação automática
                </p>
              </div>
            </div>
          )}

          {/* Configurações do Modo Por Requisição */}
          {mode === 'on_request' && (
            <div className={styles.section}>
              <h3>Configurações de Requisição</h3>
              
              <div className={styles.checkboxGroup}>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={requireApproval}
                    onChange={(e) => setRequireApproval(e.target.checked)}
                  />
                  <span>Exigir aprovação do admin</span>
                </label>
                <p className={styles.hint}>
                  Se marcado, requisições precisam ser aprovadas antes de criar a instância
                </p>
              </div>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button onClick={onClose} className={styles.btnCancel}>
            Cancelar
          </button>
          <button onClick={handleSave} className={styles.btnSave}>
            Salvar Configurações
          </button>
        </div>
      </div>
    </div>
  );
}
