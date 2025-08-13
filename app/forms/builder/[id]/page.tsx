'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus, Trash2, GripVertical, Save, ChevronLeft, Type, CheckSquare,
  List, Calendar, PenTool, Paperclip, Table, Heading, Eye, Settings, MoreVertical,
  Download, Sun, Moon, RefreshCcw, Mail, MessageCircle
} from 'lucide-react';
import { db } from '../../../../firebase/config';
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp, query, onSnapshot, where, getDocs } from 'firebase/firestore';
import styles from '../../../../app/styles/FormBuilder.module.css';
import type { Form, Collaborator } from "@/types";

// ---- ESTILO DO MENU SUSPENSO ----
const menuBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#fff',
  padding: '8px 14px',
  width: '100%',
  textAlign: 'left',
  fontSize: 15,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  borderRadius: 6,
  margin: 0,
  transition: 'background 0.2s',
};

// ---- TIPOS
type FieldType = 'Texto' | 'Caixa de Seleção' | 'Múltipla Escolha' | 'Data' | 'Assinatura' | 'Anexo' | 'Tabela' | 'Cabeçalho';

interface TableColumn {
  id: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select';
  options?: string[];
}
interface TableRow { id: string; label: string; }

interface EnhancedFormField {
  id: string;
  type: FieldType;
  label: string;
  required?: boolean;
  displayAs?: 'radio' | 'dropdown';
  placeholder?: string;
  description?: string;
  options?: string[];
  columns?: TableColumn[];
  rows?: TableRow[];
  style?: { width?: 'full' | 'half' | 'third'; alignment?: 'left' | 'center' | 'right'; };
}

// --- TEMA DO FORMULÁRIO (FormTheme) ---
export interface FormTheme {
  bgColor: string;
  bgImage?: string;
  accentColor: string;
  fontColor: string;
  inputBgColor?: string;
  inputFontColor?: string;
  sectionHeaderBg?: string;
  sectionHeaderFont?: string;
  buttonBg?: string;
  buttonFont?: string;
  footerBg?: string;
  footerFont?: string;
  borderRadius: number;
  spacing: 'compact' | 'normal' | 'spacious';
  // Novos campos para tabelas:
  tableHeaderBg?: string;
  tableHeaderFont?: string;
  tableBorderColor?: string;
  tableOddRowBg?: string;
  tableEvenRowBg?: string;
  tableCellFont?: string;
}



// ---- THEME DEFAULT
const defaultTheme: FormTheme = {
  bgColor: '#ffffff',
  accentColor: '#3b82f6',
  fontColor: '#1f2937',
  inputBgColor: '#171e2c',
  inputFontColor: '#e8f2ff',
  sectionHeaderBg: '#19263b',
  sectionHeaderFont: '#49cfff',
  buttonBg: '#000',
  buttonFont: '#fff',
  footerBg: '#182138',
  footerFont: '#fff',
  borderRadius: 8,
  spacing: 'normal',

  // NOVOS:
  tableHeaderBg: '#1a2238',
  tableHeaderFont: '#49cfff',
  tableBorderColor: '#19263b',
  tableOddRowBg: '#222c42',
  tableEvenRowBg: '#171e2c',
  tableCellFont: '#e0e6f7'
};


// ---- FIELD TYPES
const FIELD_TYPES: Array<{
  type: FieldType;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  description: string;
}> = [
  { type: 'Texto', label: 'Campo de Texto', icon: Type, description: 'Entrada de texto simples' },
  { type: 'Caixa de Seleção', label: 'Caixa de Seleção', icon: CheckSquare, description: 'Opções com checkboxes' },
  { type: 'Múltipla Escolha', label: 'Múltipla Escolha', icon: List, description: 'Lista suspensa ou radio buttons' },
  { type: 'Data', label: 'Data', icon: Calendar, description: 'Seletor de data' },
  { type: 'Assinatura', label: 'Assinatura', icon: PenTool, description: 'Campo para assinatura digital' },
  { type: 'Anexo', label: 'Anexo', icon: Paperclip, description: 'Upload de arquivos' },
  { type: 'Tabela', label: 'Tabela', icon: Table, description: 'Tabela editável' },
  { type: 'Cabeçalho', label: 'Cabeçalho', icon: Heading, description: 'Título ou seção' }
];

// ---- UTILS
const FORM_KEY = (companyId: string, deptId: string, formId: string) =>
  `enhanced_formbuilder_draft_${companyId}_${deptId}_${formId || 'novo'}`;

const generateFieldId = () => `field_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
const generateTableId = (prefix: string) => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

// ---- NORMALIZE FORM
function normalizeForm(data: any) {
  return {
    ...data,
    theme: { ...defaultTheme, ...(data.theme || {}) },
    settings: {
      allowSave: true,
      showProgress: true,
      confirmBeforeSubmit: false,
      ...(data.settings || {}),
    },
    collaborators: data.collaborators || [],
    authorizedUsers: data.authorizedUsers || [],
    fields: data.fields || [],
  };
}

// ---- COMPONENTES AUXILIARES
function SortableField({ field, onSelect, selected, onRemove, onDuplicate }: {
  field: EnhancedFormField;
  onSelect: (id: string) => void;
  selected: boolean;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const fieldIcon = FIELD_TYPES.find(ft => ft.type === field.type)?.icon || Type;
  const IconComponent = fieldIcon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.sortableField} ${selected ? styles.selected : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(field.id);
      }}
    >
      <span {...attributes} {...listeners} className={styles.dragHandle}>
        <GripVertical size={16} />
      </span>
      <div className={styles.fieldIcon}>
        <IconComponent size={18} />
      </div>
      <div className={styles.fieldContent}>
        <div className={styles.fieldLabel}>{field.label}</div>
        <div className={styles.fieldType}>{field.type}</div>
        {field.required && <span className={styles.requiredBadge}>Obrigatório</span>}
      </div>
      <div className={styles.fieldActions}>
        <button
          onClick={(e) => { e.stopPropagation(); onDuplicate(field.id); }}
          className={styles.actionBtn}
          title="Duplicar campo"
        >
          <Plus size={14} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(field.id); }}
          className={styles.deleteBtn}
          title="Remover campo"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function DraggableFieldType({ fieldType }: { fieldType: typeof FIELD_TYPES[0] }) {
  const IconComponent = fieldType.icon;
  return (
    <div className={styles.draggableFieldType} title={fieldType.description}>
      <IconComponent size={16} />
      <span>{fieldType.label}</span>
    </div>
  );
}

// Sidebar de propriedades do campo selecionado
function FieldProperties({ field, updateField }: {
  field: EnhancedFormField;
  updateField: (updates: Partial<EnhancedFormField>) => void;
}) {

  // Opções para campos de opções (checkbox, múltipla escolha)
  const handleOptionChange = (index: number, value: string) => {
    if (!field.options) return;
    const newOptions = [...field.options];
    newOptions[index] = value;
    updateField({ options: newOptions });
  };

  const addOption = () => {
    updateField({ options: [...(field.options || []), `Opção ${field.options ? field.options.length + 1 : 1}`] });
  };

  const removeOption = (index: number) => {
    if (!field.options) return;
    const newOptions = field.options.filter((_, i) => i !== index);
    updateField({ options: newOptions });
  };

  // Propriedades para tabela (adicionar/remover linhas/colunas, editar label, tipo)
  const handleColumnChange = (colIndex: number, updates: Partial<TableColumn>) => {
    if (!field.columns) return;
    const columns = field.columns.map((col, i) => i === colIndex ? { ...col, ...updates } : col);
    updateField({ columns });
  };

  const addColumn = () => {
    const newCol: TableColumn = {
      id: generateTableId('col'),
      label: `Coluna ${field.columns ? field.columns.length + 1 : 1}`,
      type: 'text',
      options: [],
    };
    updateField({ columns: [...(field.columns || []), newCol] });
  };

  const removeColumn = (colIndex: number) => {
    if (!field.columns) return;
    const columns = field.columns.filter((_, i) => i !== colIndex);
    updateField({ columns });
  };

  const handleRowChange = (rowIndex: number, label: string) => {
    if (!field.rows) return;
    const rows = field.rows.map((row, i) => i === rowIndex ? { ...row, label } : row);
    updateField({ rows });
  };

  const addRow = () => {
    const newRow: TableRow = {
      id: generateTableId('row'),
      label: `Linha ${field.rows ? field.rows.length + 1 : 1}`,
    };
    updateField({ rows: [...(field.rows || []), newRow] });
  };

  const removeRow = (rowIndex: number) => {
    if (!field.rows) return;
    const rows = field.rows.filter((_, i) => i !== rowIndex);
    updateField({ rows });
  };

  // Para editar opções de colunas do tipo select (tabela)
  const handleColumnOptionChange = (colIndex: number, optIndex: number, value: string) => {
    if (!field.columns) return;
    const columns = field.columns.map((col, i) => {
      if (i === colIndex) {
        const opts = col.options ? [...col.options] : [];
        opts[optIndex] = value;
        return { ...col, options: opts };
      }
      return col;
    });
    updateField({ columns });
  };

  const addColumnOption = (colIndex: number) => {
    if (!field.columns) return;
    const columns = field.columns.map((col, i) => {
      if (i === colIndex) {
        const opts = col.options ? [...col.options, `Opção ${col.options.length + 1}`] : ['Opção 1'];
        return { ...col, options: opts };
      }
      return col;
    });
    updateField({ columns });
  };

  const removeColumnOption = (colIndex: number, optIndex: number) => {
    if (!field.columns) return;
    const columns = field.columns.map((col, i) => {
      if (i === colIndex) {
        const opts = col.options ? col.options.filter((_, j) => j !== optIndex) : [];
        return { ...col, options: opts };
      }
      return col;
    });
    updateField({ columns });
  };

  // Renderização por tipo
  return (
    <div className={styles.fieldProperties}>
      <div className={styles.propertyGroup}>
        <label>Título do Campo</label>
        <input
          type="text"
          value={field.label}
          onChange={e => updateField({ label: e.target.value })}
          className={styles.propertyInput}
        />
      </div>

      {field.type === 'Múltipla Escolha' && (
        <div className={styles.propertyGroup}>
          <label>Exibir como</label>
          <select
            value={field.displayAs || 'radio'}
            onChange={e => updateField({ displayAs: e.target.value as 'radio' | 'dropdown' })}
            className={styles.propertyInput}
          >
            <option value="radio">Um por linha</option>
            <option value="dropdown">Menu suspenso</option>
          </select>
        </div>
      )}

      {field.type !== 'Cabeçalho' && (
        <div className={styles.propertyGroup}>
          <label>
            <input
              type="checkbox"
              checked={field.required || false}
              onChange={e => updateField({ required: e.target.checked })}
            />
            Campo obrigatório
          </label>
        </div>
      )}

      {(field.type === 'Texto' || field.type === 'Data') && (
        <div className={styles.propertyGroup}>
          <label>Placeholder</label>
          <input
            type="text"
            value={field.placeholder || ''}
            onChange={e => updateField({ placeholder: e.target.value })}
            className={styles.propertyInput}
          />
        </div>
      )}

      {(field.type === 'Caixa de Seleção' || field.type === 'Múltipla Escolha') && (
        <div className={styles.propertyGroup}>
          <label>Opções</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {field.options?.map((opt, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="text"
                  value={opt}
                  onChange={e => handleOptionChange(i, e.target.value)}
                  className={styles.propertyInput}
                  style={{ flex: 1 }}
                />
                <button className={styles.deleteBtn} onClick={() => removeOption(i)} title="Remover opção" type="button">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <button className={styles.actionBtn} onClick={addOption} type="button">
              <Plus size={14} /> Nova opção
            </button>
            <textarea
  className={styles.propertyTextarea}
  style={{ marginTop: 8 }}
  rows={4}
  placeholder="Cole opções, uma por linha"
  value={(field.options || []).join('\n')}
  onChange={e =>
  updateField({
    options: e.target.value.split('\n')
  })
}

/>
<small style={{ color: '#6fd3fa', fontSize: 12 }}>
  (Cole ou digite várias opções de uma vez, cada linha vira uma opção)
</small>

          </div>
        </div>
      )}

      {/* TABELA */}
     {field.type === 'Tabela' && (
  <>
    {/* COLUNAS */}
    <div className={styles.propertyGroup}>
      <label>Colunas</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {field.columns?.map((col, colIndex) => (
          <div key={col.id} style={{ background: '#101524', borderRadius: 8, padding: 8, marginBottom: 4 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                value={col.label}
                onChange={e => handleColumnChange(colIndex, { label: e.target.value })}
                placeholder="Nome da coluna"
                className={styles.propertyInput}
                style={{ flex: 1 }}
              />
              <select
                value={col.type}
                onChange={e => handleColumnChange(colIndex, { type: e.target.value as TableColumn['type'] })}
                className={styles.propertyInput}
                style={{ width: 100 }}
              >
                <option value="text">Texto</option>
                <option value="number">Número</option>
                <option value="date">Data</option>
                <option value="select">Seleção</option>
              </select>
              <button className={styles.deleteBtn} onClick={() => removeColumn(colIndex)} type="button">
                <Trash2 size={14} />
              </button>
            </div>
            {/* Opções da coluna tipo seleção */}
            {col.type === 'select' && (
              <div style={{ marginLeft: 12, marginTop: 5 }}>
                <label style={{ color: '#6fd3fa', fontSize: 13 }}>Opções da coluna</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {col.options?.map((opt, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="text"
                        value={opt}
                        onChange={e => handleColumnOptionChange(colIndex, i, e.target.value)}
                        className={styles.propertyInput}
                      />
                      <button className={styles.deleteBtn} onClick={() => removeColumnOption(colIndex, i)} type="button">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  <button className={styles.actionBtn} onClick={() => addColumnOption(colIndex)} type="button">
                    <Plus size={13} /> Nova opção
                  </button>
                  <textarea
  className={styles.propertyTextarea}
  style={{ marginTop: 8 }}
  rows={4}
  placeholder="Cole opções, uma por linha"
  value={(col.options || []).join('\n')}
  onChange={e => {
    const newColumns = [...(field.columns || [])];
    newColumns[colIndex] = {
      ...col,
      options: e.target.value.split('\n').filter(s => s.trim() !== ''),
    };
    updateField({ columns: newColumns });
  }}
  onKeyDown={e => {
    if (e.key === 'Enter') {
      const value = (e.target as HTMLTextAreaElement).value;
      const newColumns = [...(field.columns || [])];
      newColumns[colIndex] = {
        ...col,
        options: value.split('\n').filter(s => s.trim() !== ''),
      };
      updateField({ columns: newColumns });
    }
  }}
/>


                  <small style={{ color: '#6fd3fa', fontSize: 11 }}>
                    (Cole várias opções de uma vez — cada linha vira uma opção da coluna)
                  </small>
                </div>
              </div>
            )}
          </div>
        ))}
        <button className={styles.actionBtn} onClick={addColumn} type="button">
          <Plus size={14} /> Nova coluna
        </button>
        {/* TEXTAREA PARA VÁRIAS COLUNAS */}
        <textarea
          className={styles.propertyTextarea}
          style={{ marginTop: 10 }}
          rows={3}
          placeholder="Cole várias colunas, uma por linha"
          value={field.columns?.map(col => col.label).join('\n') || ''}
          onChange={e => {
            // Cria colunas do tipo texto ao colar várias linhas
            const labels = e.target.value.split('\n').filter(l => l.trim() !== '');
            const newColumns = labels.map((label, idx) => ({
              id: field.columns?.[idx]?.id || generateTableId('col'),
              label,
              type: field.columns?.[idx]?.type || 'text',
              options: field.columns?.[idx]?.options || [],
            }));
            updateField({ columns: newColumns });
                options: e.target.value.split('\n')

          }}
        />
        <small style={{ color: '#6fd3fa', fontSize: 11 }}>
          (Cole várias colunas de uma vez — cada linha vira uma coluna)
        </small>
      </div>
    </div>

    {/* LINHAS */}
    <div className={styles.propertyGroup}>
      <label>Linhas</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {field.rows?.map((row, rowIndex) => (
          <div key={row.id} style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={row.label}
              onChange={e => handleRowChange(rowIndex, e.target.value)}
              placeholder="Nome da linha"
              className={styles.propertyInput}
            />
            <button className={styles.deleteBtn} onClick={() => removeRow(rowIndex)} type="button">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button className={styles.actionBtn} onClick={addRow} type="button">
          <Plus size={14} /> Nova linha
        </button>
        {/* TEXTAREA PARA VÁRIAS LINHAS */}
        <textarea
          className={styles.propertyTextarea}
          style={{ marginTop: 10 }}
          rows={3}
          placeholder="Cole várias linhas, uma por linha"
          value={field.rows?.map(row => row.label).join('\n') || ''}
          onChange={e => {
            const labels = e.target.value.split('\n').filter(l => l.trim() !== '');
            const newRows = labels.map((label, idx) => ({
              id: field.rows?.[idx]?.id || generateTableId('row'),
              label,
            }));
            updateField({ rows: newRows });
          }}
        />
        <small style={{ color: '#6fd3fa', fontSize: 11 }}>
          (Cole várias linhas de uma vez — cada linha vira uma linha da tabela)
        </small>
      </div>
    </div>
  </>
)}



      <div className={styles.propertyGroup}>
        <label>Descrição/Ajuda</label>
        <textarea
          value={field.description || ''}
          onChange={e => updateField({ description: e.target.value })}
          className={styles.propertyTextarea}
          placeholder="Texto de ajuda opcional..."
        />
      </div>
    </div>
  );
}


// Componente de preview dos campos
// Substitua TODO o PreviewFields por este novo:

function PreviewFields({ fields, theme }: { fields: EnhancedFormField[], theme: FormTheme }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {fields.map((field) => (
        <div key={field.id} style={{ marginBottom: 16 }}>
          {field.type === 'Cabeçalho' ? (
            <h3
              style={{
                margin: '0 0 8px 0',
                fontSize: '1.25rem',
                fontWeight: 'bold',
                background: theme.sectionHeaderBg,
                color: theme.sectionHeaderFont,
                borderRadius: theme.borderRadius,
                padding: 8,
              }}
            >
              {field.label}
            </h3>
          ) : (
            <>
              <label
                style={{
                  display: 'block',
                  marginBottom: 8,
                  fontWeight: 500,
                  color: theme.fontColor,
                }}
              >
                {field.label}
                {field.required && (
                  <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>
                )}
              </label>
              {field.description && (
                <p
                  style={{
                    margin: '0 0 8px 0',
                    fontSize: '0.875rem',
                    color: '#6b7280',
                  }}
                >
                  {field.description}
                </p>
              )}
              {field.type === 'Texto' && (
                <input
                  type="text"
                  placeholder={field.placeholder}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: `1px solid ${theme.tableBorderColor}`,
                    borderRadius: '6px',
                    fontSize: '14px',
                    background: theme.inputBgColor,
                    color: theme.inputFontColor || theme.fontColor,
                  }}
                  disabled
                />
              )}
              {field.type === 'Data' && (
                <input
                  type="date"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: `1px solid ${theme.tableBorderColor}`,
                    borderRadius: '6px',
                    fontSize: '14px',
                    background: theme.inputBgColor,
                    color: theme.inputFontColor || theme.fontColor,
                  }}
                  disabled
                />
              )}
              {field.type === 'Caixa de Seleção' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {field.options?.map((option, i) => (
                    <label
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        color: theme.fontColor,
                      }}
                    >
                      <input type="checkbox" disabled />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              )}
              {field.type === 'Múltipla Escolha' &&
                (field.displayAs === 'dropdown' ? (
                  <select
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: `1px solid ${theme.tableBorderColor}`,
                      borderRadius: '6px',
                      fontSize: '14px',
                      background: theme.inputBgColor,
                      color: theme.inputFontColor || theme.fontColor,
                    }}
                    disabled
                  >
                    <option>Selecione uma opção</option>
                    {field.options?.map((option, i) => (
                      <option key={i}>{option}</option>
                    ))}
                  </select>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {field.options?.map((option, i) => (
                      <label
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          color: theme.fontColor,
                        }}
                      >
                        <input type="radio" name={field.id} disabled />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                ))}
              {field.type === 'Anexo' && (
                <input
                  type="file"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: `1px solid ${theme.tableBorderColor}`,
                    borderRadius: '6px',
                    fontSize: '14px',
                    background: theme.inputBgColor,
                    color: theme.inputFontColor || theme.fontColor,
                  }}
                  disabled
                />
              )}
              {field.type === 'Assinatura' && (
                <div
                  style={{
                    width: '100%',
                    height: '120px',
                    border: `2px dashed ${theme.tableBorderColor}`,
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#6b7280',
                    fontSize: '14px',
                  }}
                >
                  Área de assinatura
                </div>
              )}
              {field.type === 'Tabela' && (
                <div style={{ overflowX: 'auto' }}>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      border: `1px solid ${theme.tableBorderColor}`,
                    }}
                  >
                    <thead>
                      <tr>
                        <th
                          style={{
                            border: `1px solid ${theme.tableBorderColor}`,
                            padding: '8px',
                            background: theme.tableHeaderBg,
                            color: theme.tableHeaderFont,
                          }}
                        ></th>
                        {field.columns?.map((col) => (
                          <th
                            key={col.id}
                            style={{
                              border: `1px solid ${theme.tableBorderColor}`,
                              padding: '8px',
                              background: theme.tableHeaderBg,
                              color: theme.tableHeaderFont,
                            }}
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {field.rows?.map((row, idx) => (
                        <tr
                          key={row.id}
                          style={{
                            background:
                              idx % 2 === 0
                                ? theme.tableOddRowBg
                                : theme.tableEvenRowBg,
                          }}
                        >
                          <td
                            style={{
                              border: `1px solid ${theme.tableBorderColor}`,
                              padding: '8px',
                              fontWeight: 500,
                              color: theme.tableCellFont || theme.fontColor,
                              background: theme.tableHeaderBg,
                            }}
                          >
                            {row.label}
                          </td>
                          {field.columns?.map((col) => (
                            <td
                              key={col.id}
                              style={{
                                border: `1px solid ${theme.tableBorderColor}`,
                                padding: '4px',
                                color: theme.tableCellFont || theme.fontColor,
                              }}
                            >
                              {col.type === 'select' ? (
                                <select
                                  style={{
                                    width: '100%',
                                    padding: '4px',
                                    border: 'none',
                                    background: theme.inputBgColor,
                                    color: theme.inputFontColor || theme.fontColor,
                                  }}
                                  disabled
                                >
                                  <option>Selecionar</option>
                                  {col.options?.map((opt, i) => (
                                    <option key={i}>{opt}</option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type={
                                    col.type === 'number'
                                      ? 'number'
                                      : col.type === 'date'
                                      ? 'date'
                                      : 'text'
                                  }
                                  style={{
                                    width: '100%',
                                    padding: '4px',
                                    border: 'none',
                                    background: theme.inputBgColor,
                                    color: theme.inputFontColor || theme.fontColor,
                                  }}
                                  disabled
                                />
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}


// Componente principal
interface EnhancedFormBuilderPageProps {
  companyId?: string;
  departmentId?: string;
  existingForm?: Form | null;
  onSaveSuccess?: () => void;
  onCancel?: () => void;
}

interface MenuAction {
  clear: string;
  export: string;
  dark: string;
  light: string;
  'reset-theme': string;
  dashboard: string;
}

function EnhancedFormBuilderPage(props: EnhancedFormBuilderPageProps) {
   const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams(); // Hook para ler a URL
 const formId = props.existingForm?.id || (params?.id as string) || 'novo';
  // Estados principais
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'design' | 'preview'>('design');
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Estados dos dados
  const [companyId, setCompanyId] = useState<string>('');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [assignedCollaborators, setAssignedCollaborators] = useState<string[]>([]);

// Função para carregar colaboradores do Firebase
const loadCollaborators = useCallback(
  async (companyId: string, departmentId: string): Promise<void> => {
    if (!companyId || !departmentId) return;

    try {
      const collaboratorsQuery = query(
        collection(db, 'collaborators'),
        where('companyId', '==', companyId),
        where('departmentId', '==', departmentId)
      );

      const querySnapshot = await getDocs(collaboratorsQuery);
      const collaboratorsList: Collaborator[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        collaboratorsList.push({
          id: doc.id,
          username: data.username,
          email: data.email,
          companyId: data.companyId,
          departmentId: data.departmentId,
          canViewHistory: data.canViewHistory,
          canEditHistory: data.canEditHistory,
          ref: doc.ref
        } as Collaborator);
      });

      setCollaborators(collaboratorsList);
    } catch (error) {
      console.error('Erro ao carregar colaboradores:', error);
      // Fallback para dados mock em caso de erro
      setCollaborators([
        { id: 'user1', username: 'João Silva', companyId, departmentId } as Collaborator,
        { id: 'user2', username: 'Maria Santos', companyId, departmentId } as Collaborator,
        { id: 'user3', username: 'Pedro Costa', companyId, departmentId } as Collaborator
      ]);
    }
  },
  []
);

 useEffect(() => {
    setLoading(true);

    const resolvedCompanyId = props.companyId || searchParams.get('companyId');
    const resolvedDepartmentId = props.departmentId || searchParams.get('departmentId');

    if (!resolvedCompanyId || !resolvedDepartmentId) {
        setLoading(false);
        return;
    }

    setCompanyId(resolvedCompanyId);
    setDepartmentId(resolvedDepartmentId);

    // --- Lógica de Colaboradores (onSnapshot) ---
    const collaboratorsQuery = query(
        collection(db, 'collaborators'),
        where('companyId', '==', resolvedCompanyId),
        where('departmentId', '==', resolvedDepartmentId)
    );

    const unsubscribe = onSnapshot(collaboratorsQuery, (querySnapshot) => {
        const collaboratorsList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Collaborator));
        setCollaborators(collaboratorsList);
    }, (error) => {
        console.error("Erro ao carregar colaboradores: ", error);
        setCollaborators([]);
    });

    // --- Lógica de Carregamento do Formulário (Draft) ---
    // Se o formulário já veio via props (modo de edição), use-o diretamente.
    if (formId !== 'novo' && props.existingForm) {
    const normalized = normalizeForm(props.existingForm);
    setDraft(normalized);
    setAssignedCollaborators(normalized.collaborators || []);
    setLoading(false);
    // Logo preview para upload temporário


}

    // Se não, tente carregar do localStorage ou do Firebase (cenário de refresh da página)
    else {
        const savedDraft = localStorage.getItem(FORM_KEY(resolvedCompanyId, resolvedDepartmentId, formId));
if (savedDraft) {
    const parsed = JSON.parse(savedDraft);
    const normalized = normalizeForm(parsed);
    setDraft(normalized);
    setAssignedCollaborators(normalized.collaborators || []);
    setLoading(false);
}
 else if (formId !== 'novo') {
            getDoc(doc(db, 'forms', formId)).then(docSnap => {
    if (docSnap.exists()) {
        const data = docSnap.data() as Form;
        const normalized = normalizeForm(data);
        setDraft(normalized);
        setAssignedCollaborators(normalized.collaborators || []);
    }
    setLoading(false);
});
        } else {
             setLoading(false); // Caso de formulário novo sem rascunho
        }
    }

    return () => unsubscribe(); // Limpeza do listener de colaboradores

}, [formId, props.companyId, props.departmentId, props.existingForm, searchParams]);

  useEffect(() => {
    if (!departmentId) {
      setCollaborators([]);
      return;
    }
    const collabsRef = collection(db, `departments/${departmentId}/collaborators`);
    const unsubscribe = onSnapshot(collabsRef, (snapshot) => {
      setCollaborators(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as Collaborator)));
    });
    return () => unsubscribe();
  }, [departmentId]);

  // Estado do formulário
  const [draft, setDraft] = useState<Form>({
    id: '',
    title: 'Novo Formulário',
    description: '',
    fields: [],
    companyId: '',
    departmentId: '',
    collaborators: [],
    authorizedUsers: [],
    createdAt: null,
    theme: { ...defaultTheme },
    settings: {
      allowSave: true,
      showProgress: true,
      confirmBeforeSubmit: false,
    }
  });

const [logoPreview, setLogoPreview] = useState<string | null>(draft.logo?.url || null);
const [logoFileName, setLogoFileName] = useState<string>(draft.logo?.name || '');

  // Drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );  

  // Salvar no localStorage automaticamente
  useEffect(() => {
    if (!loading && companyId && departmentId) {
      localStorage.setItem(FORM_KEY(companyId, departmentId, formId), JSON.stringify(draft));
    }
  }, [draft, loading, companyId, departmentId, formId]);

  // Fechar menu ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Funções de manipulação de campos
  const addField = useCallback(
    (type: FieldType): void => {
      const newField: EnhancedFormField = {
        id: generateFieldId(),
        type,
        label: `${type} ${draft.fields.length + 1}`,
        required: false,
        ...(type === 'Múltipla Escolha' && { displayAs: 'radio' as const }),
        ...(type === 'Texto' && { placeholder: 'Digite aqui...' }),
        ...((type === 'Caixa de Seleção' || type === 'Múltipla Escolha') && {
          options: ['Opção 1', 'Opção 2', 'Opção 3']
        }),
        ...(type === 'Tabela' && {
          columns: [
            { id: generateTableId('col'), label: 'Coluna 1', type: 'text' as const },
            { id: generateTableId('col'), label: 'Coluna 2', type: 'text' as const }
          ],
          rows: [
            { id: generateTableId('row'), label: 'Linha 1' },
            { id: generateTableId('row'), label: 'Linha 2' }
          ]
        })
      };

      setDraft(prev => ({
        ...prev,
        fields: [...prev.fields, newField]
      }));
      setSelectedFieldId(newField.id);
    },
    [draft.fields.length]
  );

  const removeField = useCallback(
    (fieldId: string): void => {
      setDraft(prev => ({
        ...prev,
        fields: prev.fields.filter(f => f.id !== fieldId)
      }));
      if (selectedFieldId === fieldId) {
        setSelectedFieldId(null);
      }
    },
    [selectedFieldId]
  );

  const duplicateField = useCallback(
    (fieldId: string): void => {
      const field = draft.fields.find(f => f.id === fieldId);
      if (!field) return;

      const newField: EnhancedFormField = {
        ...field,
        id: generateFieldId(),
        label: `${field.label} (Cópia)`
      };

      setDraft(prev => ({
        ...prev,
        fields: [...prev.fields, newField]
      }));
    },
    [draft.fields]
  );

  const updateField = useCallback(
    (updates: Partial<EnhancedFormField>): void => {
      if (!selectedFieldId) return;

      setDraft(prev => ({
        ...prev,
        fields: prev.fields.map(field =>
          field.id === selectedFieldId ? { ...field, ...updates } : field
        )
      }));
    },
    [selectedFieldId]
  );

  const updateTheme = useCallback(
    (updates: Partial<FormTheme>): void => {
      setDraft(prev => ({
        ...prev,
        theme: { ...prev.theme, ...updates }
      }));
    },
    []
  );

  // Drag and drop handlers
  const handleDragStart = (event: DragStartEvent): void => {
    // Implementar se necessário
  };

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setDraft(prev => {
        const oldIndex = prev.fields.findIndex(f => f.id === active.id);
        const newIndex = prev.fields.findIndex(f => f.id === over.id);

        return {
          ...prev,
          fields: arrayMove(prev.fields, oldIndex, newIndex)
        };
      });
    }
  };

  // Handlers de automação
  const setAutomationType = (type: 'email' | 'whatsapp'): void => {
    setDraft(prev => ({
      ...prev,
      automation: { ...prev.automation, type, target: prev.automation?.target || '' }
    }));
  };

  const setAutomationTarget = (target: string): void => {
    setDraft(prev => ({
      ...prev,
      automation: { ...prev.automation!, target }
    }));
  };

  // Handler de colaboradores
  const handleCollaboratorToggle = (collaboratorId: string): void => {
    setAssignedCollaborators(prev =>
      prev.includes(collaboratorId)
        ? prev.filter(id => id !== collaboratorId)
        : [...prev, collaboratorId]
    );
  };

  // Handlers do menu
  const handleMenuAction = (action: keyof MenuAction): void => {
    setMenuOpen(false);

    switch (action) {
      case 'clear':
        if (confirm('Tem certeza que deseja limpar todos os campos?')) {
          setDraft(prev => ({ ...prev, fields: [] }));
          setSelectedFieldId(null);
        }
        break;
      case 'export':
        const dataStr = JSON.stringify(draft, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${draft.title.replace(/\s+/g, '_')}.json`;
        link.click();
        URL.revokeObjectURL(url);
        break;
      case 'dark':
        updateTheme({ bgColor: '#1f2937', fontColor: '#f9fafb' });
        break;
      case 'light':
        updateTheme({ bgColor: '#ffffff', fontColor: '#1f2937' });
        break;
      case 'reset-theme':
        updateTheme({
          bgColor: '#ffffff',
          accentColor: '#3b82f6',
          fontColor: '#1f2937',
          borderRadius: 8,
          spacing: 'normal'
        });
        break;
      case 'dashboard':
        router.push('/dashboard');
        break;
    }
  };

  // Handler de clique no canvas - CORRIGIDO
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    // Verificar se o clique foi diretamente no canvas, não em um elemento filho
    if (e.target === e.currentTarget) {
      setSelectedFieldId(null);
    }
  };

  // Handler de salvar
  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      let resultId = formId;
      const formData: Form = {
        ...draft,
        companyId,
        departmentId,
        collaborators: assignedCollaborators,
        authorizedUsers: assignedCollaborators,
        updatedAt: serverTimestamp()
      };

      if (formId === 'novo') {
        const docRef = await addDoc(collection(db, 'forms'), {
          ...formData,
          createdAt: serverTimestamp()
        });
        resultId = docRef.id;
      } else {
        await setDoc(doc(db, 'forms', formId), formData);
      }
      localStorage.removeItem(FORM_KEY(companyId, departmentId, formId));
      router.replace('/dashboard');
    } catch (error) {
      alert('Erro ao salvar formulário. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const selectedField: EnhancedFormField | undefined = draft.fields.find(f => f.id === selectedFieldId);

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingSpinner}></div>
        <p>Carregando editor de formulários...</p>
      </div>
    );
  }

  return (
    <div className={styles.pageWrapper}>
      {/* Header */}
      <header className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <button className={styles.backBtn} onClick={() => router.back()}>
            <ChevronLeft size={18} />
            Voltar
          </button>
          <input
            className={styles.titleInput}
            value={draft.title}
            onChange={e => setDraft(prev => ({ ...prev, title: e.target.value }))}
            placeholder="Nome do Formulário"
          />
        </div>
        <div className={styles.topBarCenter}>
          <div className={styles.tabSwitcher}>
            <button
              className={`${styles.tab} ${activeTab === 'design' ? styles.active : ''}`}
              onClick={() => setActiveTab('design')}
            >
              <Settings size={16} />
              Design
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'preview' ? styles.active : ''}`}
              onClick={() => setActiveTab('preview')}
            >
              <Eye size={16} />
              Preview
            </button>
          </div>
        </div>
        <div className={styles.topBarRight}>
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <div className={styles.spinner}></div>
                Salvando...
              </>
            ) : (
              <>
                <Save size={16} />
                Salvar
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className={styles.builderGrid}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={() => {}}
          onDragEnd={handleDragEnd}
        >
          {/* Sidebar Esquerda */}
          <aside className={styles.sidebarLeft}>
            <div className={styles.sidebarHeader}>
              <h3>Adicionar Campos</h3>
              <p>Arraste para o formulário</p>
            </div>
            <div className={styles.fieldTypesList}>
              {FIELD_TYPES.map((fieldType) => (
                <div
                  key={fieldType.type}
                  className={styles.fieldTypeItem}
                  onClick={() => addField(fieldType.type)}
                >
                  <DraggableFieldType fieldType={fieldType} />
                </div>
              ))}
            </div>
          </aside>

          {/* Canvas Central */}
          <main
            className={styles.canvas}
            tabIndex={-1}
            style={{ minHeight: 600 }}
          >
            {activeTab === 'design' ? (
              <div className={styles.designCanvas}
      onClick={handleCanvasClick}>
                <div className={styles.canvasHeader}>
                  <h4>Estrutura do Formulário</h4>
                  <span className={styles.fieldCount}>
                    {draft.fields.length} campo{draft.fields.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {draft.fields.length === 0 ? (
                  <div className={styles.emptyCanvas}>
                    <div className={styles.emptyIcon}>
                      <Plus size={48} />
                    </div>
                    <h3>Comece adicionando campos</h3>
                    <p>Arraste campos da barra lateral ou clique nos botões para adicionar</p>
                  </div>
                ) : (
                  <SortableContext
                    items={draft.fields.map(f => f.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className={styles.fieldsList}>
                      {draft.fields.map((field) => (
                        <SortableField
                          key={field.id}
                          field={field}
                          onSelect={id => { setSelectedFieldId(id); }}
                          selected={field.id === selectedFieldId}
                          onRemove={removeField}
                          onDuplicate={duplicateField}
                        />
                      ))}
                    </div>
                  </SortableContext>
                )}
              </div>
            ) : (
              <div className={styles.previewCanvas}>
                <div className={styles.previewHeader}>
                  <h4>Preview do Formulário</h4>
                  <p>Como o colaborador verá</p>
                </div>
                <div className={styles.formPreview}>
                  <div
                    className={styles.previewForm}
                    style={{
                     backgroundColor: draft.theme.bgColor,
    color: draft.theme.fontColor,
    borderRadius: `${draft.theme.borderRadius}px`,
    border: `2px solid ${draft.theme.accentColor}`,
                    }}
                  >
                    {draft.logo?.url && (
  <div
    style={{
      width: '100%',
      display: 'flex',
      justifyContent:
        draft.logo.align === 'left'
          ? 'flex-start'
          : draft.logo.align === 'right'
          ? 'flex-end'
          : 'center',
      marginBottom: 10,
    }}
  >
    <img
      src={draft.logo.url}
      alt={draft.logo.name || 'Logo'}
      style={{
        width: draft.logo.size ? `${draft.logo.size}%` : '40%',
        maxWidth: 240,
        objectFit: 'contain'
      }}
    />
  </div>
)}

                    <h2>{draft.title || 'Título do Formulário'}</h2>
                    {draft.description && <p>{draft.description}</p>}

<PreviewFields fields={draft.fields} theme={draft.theme} />

                  </div>
                </div>
              </div>
            )}
          </main>

          {/* Sidebar Direita - Propriedades */}
          <aside className={styles.sidebarRight}>
            <div className={styles.sidebarHeader} style={{ position: 'relative' }}>
              <h3>
                {selectedField ? 'Propriedades do Campo' : 'Configurações do Formulário'}
              </h3>
              {/* Botão de menu suspenso */}
              <div style={{ position: 'absolute', right: 12, top: 10 }} ref={menuRef}>
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 4,
                    cursor: 'pointer',
                    borderRadius: 5
                  }}
                  title="Mais opções"
                  tabIndex={0}
                >
                  <MoreVertical size={20} />
                </button>
                {menuOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 32,
                      background: '#171d32',
                      color: '#fff',
                      border: '1px solid #283047',
                      borderRadius: 8,
                      minWidth: 180,
                      boxShadow: '0 4px 18px #12172888',
                      zIndex: 10
                    }}
                  >
                    <button
                      style={menuBtnStyle}
                      onClick={() => handleMenuAction('clear')}
                    >
                      <Trash2 size={15} style={{ marginRight: 8 }} /> Limpar todos campos
                    </button>
                    <button
                      style={menuBtnStyle}
                      onClick={() => handleMenuAction('export')}
                    >
                      <Download size={15} style={{ marginRight: 8 }} /> Exportar JSON
                    </button>
                    <button
                      style={menuBtnStyle}
                      onClick={() => handleMenuAction('dark')}
                    >
                      <Moon size={15} style={{ marginRight: 8 }} /> Tema escuro
                    </button>
                    <button
                      style={menuBtnStyle}
                      onClick={() => handleMenuAction('light')}
                    >
                      <Sun size={15} style={{ marginRight: 8 }} /> Tema claro
                    </button>
                    <button
                      style={menuBtnStyle}
                      onClick={() => handleMenuAction('reset-theme')}
                    >
                      <RefreshCcw size={15} style={{ marginRight: 8 }} /> Resetar tema
                    </button>
                    <button
                      style={menuBtnStyle}
                      onClick={() => handleMenuAction('dashboard')}
                    >
                      <ChevronLeft size={15} style={{ marginRight: 8 }} /> Voltar ao Dashboard
                    </button>
                  </div>
                )}
              </div>
            </div>
            {selectedField ? (
              <FieldProperties
                field={selectedField}
                updateField={updateField}
              />
            ) : (
              <>
              
                <div className={styles.formSettings}></div>
                  <div className={styles.propertyGroup}>
                    <label>Descrição do Formulário</label>
                    <textarea
                      value={draft.description}
                      onChange={e => setDraft(prev => ({ ...prev, description: e.target.value }))}
                      className={styles.propertyTextarea}
                      placeholder="Descrição opcional..."
                    />
                  </div>
                  
                  <div className={styles.propertyGroup}>
  <label>Logo do Formulário</label>
  <input
    type="file"
    accept="image/*"
    onChange={async (e) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          setLogoPreview(ev.target?.result as string);
          setLogoFileName(file.name);
          setDraft((prev) => ({
            ...prev,
            logo: {
              ...prev.logo,
              url: ev.target?.result as string,
              size: prev.logo?.size ?? 40,
              align: prev.logo?.align ?? 'center',
              name: file.name
            }
          }));
        };
        reader.readAsDataURL(file);
      }
    }}
  />
  {logoPreview && (
    <div style={{ margin: '10px 0', textAlign: draft.logo?.align || 'center' }}>
      <img
        src={logoPreview}
        alt="Logo Preview"
        style={{
          width: draft.logo?.size ? `${draft.logo.size}%` : '40%',
          maxWidth: 200,
          display: 'block',
          margin: draft.logo?.align === 'left'
            ? '0 auto 0 0'
            : draft.logo?.align === 'right'
            ? '0 0 0 auto'
            : '0 auto'
        }}
      />
    </div>
  )}
  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
    <label style={{ fontSize: 13 }}>Tamanho:</label>
    <input
      type="range"
      min={10}
      max={100}
      value={draft.logo?.size || 40}
      onChange={e =>
        setDraft(prev => ({
          ...prev,
          logo: {
            ...prev.logo,
            size: Number(e.target.value),
            url: prev.logo?.url || '',
            align: prev.logo?.align || 'center',
            name: prev.logo?.name
          }
        }))
      }
    />
    <span style={{ fontSize: 12 }}>{draft.logo?.size || 40}%</span>
  </div>
  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
    <label style={{ fontSize: 13 }}>Alinhamento:</label>
    <select
      value={draft.logo?.align || 'center'}
      onChange={e =>
        setDraft(prev => ({
          ...prev,
          logo: {
            ...prev.logo,
            align: e.target.value as 'left' | 'center' | 'right',
            url: prev.logo?.url || '',
            size: prev.logo?.size || 40,
            name: prev.logo?.name
          }
        }))
      }
      style={{ fontSize: 13, padding: '2px 8px' }}
    >
      <option value="left">Esquerda</option>
      <option value="center">Centro</option>
      <option value="right">Direita</option>
    </select>
    {draft.logo?.url && (
      <button
        type="button"
        className={styles.deleteBtn}
        style={{ fontSize: 13, padding: '1px 8px', marginLeft: 6 }}
        onClick={() => {
          setLogoPreview(null);
          setLogoFileName('');
          setDraft(prev => ({
            ...prev,
            logo: undefined
          }));
        }}
      >
        Remover Logo
      </button>
    )}
  </div>
</div>


    <div className={styles.card}>
  <div className={styles.cardTitle}>Aparência</div>              
  <div className={styles.propertyGroup}>
  <label>Cor de Fundo do Painel</label>
  <input
    type="color"
    value={draft.theme.bgColor}
    onChange={e => updateTheme({ bgColor: e.target.value })}
    className={styles.colorInput}
  />
</div>

<div className={styles.propertyGroup}>
  <label>Cor de Fundo</label>
  <input
    type="color"
    value={draft.theme.accentColor}
    onChange={e => updateTheme({ accentColor: e.target.value })}
    className={styles.colorInput}
  />
</div>
<div className={styles.propertyGroup}>
  <label>Cor da Borda</label>
  <input
    type="color"
    value={draft.theme.fontColor}
    onChange={e => updateTheme({ fontColor: e.target.value })}
    className={styles.colorInput}
  />
</div>
<div className={styles.propertyGroup}>
  <label>Cor do Cabeçalho</label>
  <input
    type="color"
    value={draft.theme.inputBgColor || "#171e2c"}
    onChange={e => updateTheme({ inputBgColor: e.target.value })}
    className={styles.colorInput}
  />
</div>
{/* --------- NOVOS CAMPOS DE CORES PARA TABELA --------- */}
<div className={styles.propertyGroup}>
  <label>Cor de Fundo do Cabeçalho da Tabela</label>
  <input
    type="color"
    value={draft.theme.tableHeaderBg || "#1a2238"}
    onChange={e => updateTheme({ tableHeaderBg: e.target.value })}
    className={styles.colorInput}
  />
</div>
<div className={styles.propertyGroup}>
  <label>Cor do Texto do Cabeçalho da Tabela</label>
  <input
    type="color"
    value={draft.theme.tableHeaderFont || "#49cfff"}
    onChange={e => updateTheme({ tableHeaderFont: e.target.value })}
    className={styles.colorInput}
  />
</div>
<div className={styles.propertyGroup}>
  <label>Cor da Borda da Tabela</label>
  <input
    type="color"
    value={draft.theme.tableBorderColor || "#19263b"}
    onChange={e => updateTheme({ tableBorderColor: e.target.value })}
    className={styles.colorInput}
  />
</div>
<div className={styles.propertyGroup}>
  <label>Cor das Linhas Ímpares da Tabela</label>
  <input
    type="color"
    value={draft.theme.tableOddRowBg || "#222c42"}
    onChange={e => updateTheme({ tableOddRowBg: e.target.value })}
    className={styles.colorInput}
  />
</div>
<div className={styles.propertyGroup}>
  <label>Cor das Linhas Pares da Tabela</label>
  <input
    type="color"
    value={draft.theme.tableEvenRowBg || "#171e2c"}
    onChange={e => updateTheme({ tableEvenRowBg: e.target.value })}
    className={styles.colorInput}
  />
</div>
<div className={styles.propertyGroup}>
  <label>Cor do Texto das Células da Tabela</label>
  <input
    type="color"
    value={draft.theme.tableCellFont || "#e0e6f7"}
    onChange={e => updateTheme({ tableCellFont: e.target.value })}
    className={styles.colorInput}
  />
</div>
</div>


                {/* Automação */}
                <div className={styles.automationSection}>
                  <h4 className={styles.subTitle}>Automação de Notificação</h4>
                  <div className={styles.automationToggle}>
  <button
    className={`${styles.togglePill} ${draft.automation?.type === 'email' ? styles.on : ''}`}
    onClick={() => setAutomationType('email')}
    type="button"
  >
    <Mail size={16}/> E-mail
  </button>

  <button
    className={`${styles.togglePill} ${draft.automation?.type === 'whatsapp' ? styles.on : ''}`}
    onClick={() => setAutomationType('whatsapp')}
    type="button"
  >
    <MessageCircle size={16}/> WhatsApp
  </button>
</div>

                  <input
                    type={draft.automation?.type === 'email' ? 'email' : 'tel'}
                    value={draft.automation?.target || ''}
                    onChange={e => setAutomationTarget(e.target.value)}
                    placeholder={draft.automation?.type === 'email' ? 'Digite o e-mail' : 'Digite o nº de WhatsApp'}
                    className={styles.propertyInput}
                  />
                </div>
                {/* Colaboradores */}
                <div className={styles.collaboratorsSection}>
                  <h4 className={styles.subTitle}>Colaboradores Autorizados</h4>
                  <div className={styles.collaboratorsList}>
                    {collaborators.length > 0 ? (
                      collaborators.map(collaborator => (
                        <label key={collaborator.id} className={styles.collaboratorItem}>
                          <input
                            type="checkbox"
                            checked={assignedCollaborators.includes(collaborator.id)}
                            onChange={() => handleCollaboratorToggle(collaborator.id)}
                          />
                          <span>{collaborator.username}</span>
                        </label>
                      ))
                    ) : (
                      <p style={{ color: '#6b7280', fontSize: '14px', fontStyle: 'italic' }}>
                        Nenhum colaborador encontrado
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}
          </aside>
        </DndContext>
      </div>
    </div>
  );
}

export default EnhancedFormBuilderPage;

