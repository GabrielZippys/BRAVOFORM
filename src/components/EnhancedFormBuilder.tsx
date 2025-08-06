'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent, DragOverEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus, Trash2, GripVertical, Save, ChevronLeft, Type, CheckSquare,
  List, Calendar, PenTool, Paperclip, Table, Heading, Eye, Settings, MoreVertical,
  Download, Sun, Moon, RefreshCcw, Mail, MessageCircle
} from 'lucide-react';
import { db } from '../../firebase/config';
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp, query, onSnapshot } from 'firebase/firestore';
import styles from '../../app/styles/FormBuilder.module.css';
import type { Form } from "@/types";
// Tipos principais
type FieldType = 'Texto' | 'Caixa de Seleção' | 'Múltipla Escolha' | 'Data' | 'Assinatura' | 'Anexo' | 'Tabela' | 'Cabeçalho';

interface TableColumn {
  id: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select';
  options?: string[];
}
interface TableRow { id: string; label: string; }
interface Collaborator { id: string; username: string; }

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

interface FormTheme {
  bgColor: string;
  bgImage?: string;
  accentColor: string;
  fontColor: string;
  borderRadius: number;
  spacing: 'compact' | 'normal' | 'spacious';
}
interface EnhancedFormDraft {
  title: string;
  description: string;
  fields: EnhancedFormField[];
  theme: FormTheme;
  settings: {
    allowSave: boolean;
    showProgress: boolean;
    confirmBeforeSubmit: boolean;
  };
  automation?: {
    type: 'email' | 'whatsapp';
    target: string;
  };
  companyId?: string;
  departmentId?: string;
  authorizedUsers?: string[];
  collaborators?: string[];
  updatedAt?: any;
  createdAt?: any;
}

// Field Types
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

// Utils
const FORM_KEY = (companyId: string, deptId: string, formId: string) =>
  `enhanced_formbuilder_draft_${companyId}_${deptId}_${formId || 'novo'}`;

const generateFieldId = () => `field_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
const generateTableId = (prefix: string) => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

// Estilo para botões do menu
const menuBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: 'none',
  border: 'none',
  color: '#fff',
  textAlign: 'left',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  fontSize: '14px',
  borderRadius: '4px',
  transition: 'background-color 0.2s'
};

// SortableField
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
      onClick={() => onSelect(field.id)}
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

// DraggableFieldType
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
          </div>
        </div>
      )}

      {/* TABELA */}
      {field.type === 'Tabela' && (
        <>
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
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <button className={styles.actionBtn} onClick={addColumn} type="button">
                <Plus size={14} /> Nova coluna
              </button>
            </div>
          </div>

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
            </div>
          </div>
        </>
      )}

      {field.type === 'Cabeçalho' && (
        <div className={styles.propertyGroup}>
          <label>Descrição (opcional)</label>
          <textarea
            value={field.description || ''}
            onChange={e => updateField({ description: e.target.value })}
            className={styles.propertyTextarea}
            placeholder="Texto do cabeçalho/descrição"
          />
        </div>
      )}

    </div>
  );
}

function PreviewFields({ fields }: { fields: EnhancedFormField[] }) {
  if (!fields || !fields.length)
    return (
      <div style={{ opacity: 0.7, textAlign: 'center', margin: 60 }}>
        <span>Adicione campos para ver o preview do formulário.</span>
      </div>
    );

  return (
    <form autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {fields.map(field => {
        switch (field.type) {
          case 'Texto':
            return (
              <div key={field.id} style={{ marginBottom: 12 }}>
                <label style={{ fontWeight: 500, marginBottom: 4, display: 'block' }}>
                  {field.label} {field.required && <span style={{ color: '#e43' }}>*</span>}
                </label>
                <input
                  type="text"
                  className={styles.propertyInput}
                  placeholder={field.placeholder || ''}
                  disabled
                  style={{ background: '#12182a', color: '#a7bbcc', borderColor: '#202a46', opacity: 0.7 }}
                />
              </div>
            );
          case 'Caixa de Seleção':
            return (
              <div key={field.id} style={{ marginBottom: 12 }}>
                <label style={{ fontWeight: 500, marginBottom: 4, display: 'block' }}>
                  {field.label} {field.required && <span style={{ color: '#e43' }}>*</span>}
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(field.options || []).map((opt, i) => (
                    <label key={i} style={{ fontWeight: 400, color: '#b6c8e2' }}>
                      <input type="checkbox" disabled /> {opt}
                    </label>
                  ))}
                </div>
              </div>
            );
          case 'Múltipla Escolha':
            return (
              <div key={field.id} style={{ marginBottom: 12 }}>
                <label style={{ fontWeight: 500, marginBottom: 4, display: 'block' }}>
                  {field.label} {field.required && <span style={{ color: '#e43' }}>*</span>}
                </label>
                {(field.displayAs === 'dropdown') ? (
                  <select disabled className={styles.propertyInput} style={{ opacity: 0.7 }}>
                    <option value="">Selecione</option>
                    {(field.options || []).map((opt, i) => (
                      <option key={i} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(field.options || []).map((opt, i) => (
                      <label key={i} style={{ fontWeight: 400, color: '#b6c8e2' }}>
                        <input type="radio" name={field.id} disabled /> {opt}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );

          case 'Data':
            return (
              <div key={field.id} style={{ marginBottom: 12 }}>
                <label style={{ fontWeight: 500, marginBottom: 4, display: 'block' }}>
                  {field.label} {field.required && <span style={{ color: '#e43' }}>*</span>}
                </label>
                <input
                  type="date"
                  className={styles.propertyInput}
                  disabled
                  style={{ background: '#12182a', color: '#a7bbcc', borderColor: '#202a46', opacity: 0.7 }}
                />
              </div>
            );
          case 'Assinatura':
            return (
              <div key={field.id} style={{ marginBottom: 12 }}>
                <label style={{ fontWeight: 500, marginBottom: 4, display: 'block' }}>
                  {field.label} {field.required && <span style={{ color: '#e43' }}>*</span>}
                </label>
                <div style={{
                  width: 220, height: 60, border: '2px dashed #36cfff77',
                  background: '#141b2e', borderRadius: 8, opacity: 0.6,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#35cfff', fontStyle: 'italic'
                }}>
                  Área de assinatura
                </div>
              </div>
            );
          case 'Anexo':
            return (
              <div key={field.id} style={{ marginBottom: 12 }}>
                <label style={{ fontWeight: 500, marginBottom: 4, display: 'block' }}>
                  {field.label} {field.required && <span style={{ color: '#e43' }}>*</span>}
                </label>
                <input type="file" className={styles.propertyInput} disabled style={{ opacity: 0.7 }} />
              </div>
            );
          case 'Tabela':
            return (
              <div key={field.id} style={{ marginBottom: 12 }}>
                <label style={{ fontWeight: 500, marginBottom: 4, display: 'block' }}>
                  {field.label} {field.required && <span style={{ color: '#e43' }}>*</span>}
                </label>
                <div style={{
                  overflowX: 'auto',
                  background: '#101624',
                  borderRadius: 8,
                  border: '1.5px solid #222a40',
                  margin: '6px 0 0',
                }}>
                  <table style={{
                    minWidth: 420, width: '100%',
                    borderCollapse: 'collapse', color: '#bfe3fc'
                  }}>
                    <thead>
                      <tr>
                        {(field.columns || []).map(col => (
                          <th key={col.id} style={{
                            background: '#15234d',
                            color: '#fff',
                            fontWeight: 600,
                            padding: '8px 10px',
                            borderBottom: '1.5px solid #28345d'
                          }}>
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(field.rows || []).map(row => (
                        <tr key={row.id}>
                          {(field.columns || []).map((col, ci) => (
                            <td key={col.id} style={{
                              padding: '8px 10px',
                              background: ci % 2 ? '#121d36' : '#101624',
                              borderBottom: '1px solid #1e2945'
                            }}>
                              {col.type === 'text' && <input type="text" disabled className={styles.propertyInput} style={{ width: '100%', opacity: 0.5 }} />}
                              {col.type === 'number' && <input type="number" disabled className={styles.propertyInput} style={{ width: '100%', opacity: 0.5 }} />}
                              {col.type === 'date' && <input type="date" disabled className={styles.propertyInput} style={{ width: '100%', opacity: 0.5 }} />}
                              {col.type === 'select' && (
                                <select disabled className={styles.propertyInput} style={{ width: '100%', opacity: 0.5 }}>
                                  <option value="">Selecione</option>
                                  {(col.options || []).map((opt, i) => (
                                    <option key={i} value={opt}>{opt}</option>
                                  ))}
                                </select>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          case 'Cabeçalho':
            return (
              <div key={field.id} style={{
                background: 'linear-gradient(90deg, #1c2948 40%, #0e5c97 100%)',
                color: '#fff', fontWeight: 700,
                fontSize: 22, padding: '18px 24px 8px 0', margin: '18px 0 8px',
                borderLeft: '4px solid #30c6fa', borderRadius: 4
              }}>
                {field.label}
                {field.description &&
                  <div style={{ color: '#bae6fd', marginTop: 4, fontWeight: 400, fontSize: 16 }}>{field.description}</div>
                }
              </div>
            );
          default:
            return null;
        }
      })}
    </form>
  );
}
interface FormEditorProps {
  companyId: string;
  departmentId: string;
  existingForm: Form | null;
  onSaveSuccess: () => void;
  onCancel: () => void;
}


// Componente principal
const EnhancedFormBuilderPage: React.FC<FormEditorProps> = ({
  companyId,
  departmentId,
  existingForm,
  onSaveSuccess,
  onCancel
}) => {
  const router = useRouter();
  const params = useParams();
  const formId = params.id as string;

  // Estados principais
 
  const [activeTab, setActiveTab] = useState<'design' | 'preview'>('design');
  const [draft, setDraft] = useState<EnhancedFormDraft>({
    title: '',
    description: '',
    fields: [],
    theme: {
      bgColor: '#111623',
      accentColor: '#30c6fa',
      fontColor: '#f1f5f9',
      borderRadius: 8,
      spacing: 'normal'
    },
    settings: {
      allowSave: true,
      showProgress: true,
      confirmBeforeSubmit: false
    },
    automation: { type: 'email', target: '' }
  });

  // Estados de colaboradores
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [assignedCollaborators, setAssignedCollaborators] = useState<string[]>([]);

  // Estados de UI
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draggedFieldType, setDraggedFieldType] = useState<FieldType | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Sensores drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Carregar colaboradores
  useEffect(() => {
    if (!departmentId) return;
    const collabsRef = collection(db, `departments/${departmentId}/collaborators`);
    const q = query(collabsRef);
    const unsub = onSnapshot(q, (snapshot) => {
      setCollaborators(snapshot.docs.map(doc => ({
        id: doc.id,
        username: doc.data().username
      })));
    });
    return () => unsub();
  }, [departmentId]);

  // Carregar formulário salvo ou local - CORRIGIDO: removido useEffect duplicado
  useEffect(() => {
    if (!companyId || !departmentId) return;
    
    const key = FORM_KEY(companyId, departmentId, formId);
    const local = localStorage.getItem(key);

    if (local) {
      try {
        const localDraft = JSON.parse(local);
        setDraft(localDraft);
        setAssignedCollaborators(localDraft.collaborators || []);
      } catch (e) {
        console.error('Erro ao carregar draft local:', e);
      }
      setLoading(false);
    } else if (formId !== 'novo') {
      getDoc(doc(db, 'forms', formId)).then(snap => {
        if (snap.exists()) {
          const data = snap.data();
          setDraft({
            title: data.title || '',
            description: data.description || '',
            fields: data.fields || [],
            theme: data.theme || draft.theme,
            settings: data.settings || draft.settings,
            automation: data.automation || { type: 'email', target: '' }
          });
          setAssignedCollaborators(data.collaborators || []);
        }
        setLoading(false);
      }).catch(e => {
        console.error('Erro ao carregar formulário:', e);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [companyId, departmentId, formId]);

  // Salvamento automático (draft local) - CORRIGIDO: dependências corretas
  useEffect(() => {
    if (loading || !companyId || !departmentId) return;
    const key = FORM_KEY(companyId, departmentId, formId);
    localStorage.setItem(key, JSON.stringify({ ...draft, collaborators: assignedCollaborators }));
  }, [draft, companyId, departmentId, formId, assignedCollaborators, loading]);

  // Manipulação de campos
  const createField = useCallback((type: FieldType): EnhancedFormField => {
    const baseField: EnhancedFormField = {
      id: generateFieldId(),
      type,
      label: `${type} ${draft.fields.length + 1}`,
      required: false,
      style: { width: 'full', alignment: 'left' }
    };

    switch (type) {
      case 'Texto':
        baseField.placeholder = 'Digite aqui...';
        break;
      case 'Caixa de Seleção':
      case 'Múltipla Escolha':
        baseField.options = ['Opção 1', 'Opção 2', 'Opção 3'];
        break;
      case 'Tabela':
        baseField.columns = [
          { id: generateTableId('col'), label: 'Coluna 1', type: 'text' },
          { id: generateTableId('col'), label: 'Coluna 2', type: 'text' }
        ];
        baseField.rows = [
          { id: generateTableId('row'), label: 'Linha 1' },
          { id: generateTableId('row'), label: 'Linha 2' }
        ];
        break;
      case 'Cabeçalho':
        baseField.label = 'Título da Seção';
        break;
    }
    return baseField;
  }, [draft.fields.length]);

  const addField = useCallback((type: FieldType, index?: number) => {
    const newField = createField(type);
    setDraft(prev => {
      const newFields = [...prev.fields];
      if (typeof index === 'number') {
        newFields.splice(index, 0, newField);
      } else {
        newFields.push(newField);
      }
      return { ...prev, fields: newFields };
    });
    setSelectedFieldId(newField.id);
  }, [createField]);

  const removeField = useCallback((id: string) => {
    setDraft(prev => ({
      ...prev,
      fields: prev.fields.filter(f => f.id !== id)
    }));
    if (selectedFieldId === id) setSelectedFieldId(null);
  }, [selectedFieldId]);

  const duplicateField = useCallback((id: string) => {
    const field = draft.fields.find(f => f.id === id);
    if (!field) return;
    const duplicatedField: EnhancedFormField = {
      ...field,
      id: generateFieldId(),
      label: `${field.label} (Cópia)`
    };
    const fieldIndex = draft.fields.findIndex(f => f.id === id);
    setDraft(prev => {
      const newFields = [...prev.fields];
      newFields.splice(fieldIndex + 1, 0, duplicatedField);
      return { ...prev, fields: newFields };
    });
    setSelectedFieldId(duplicatedField.id);
  }, [draft.fields]);

  const updateField = useCallback((updates: Partial<EnhancedFormField>) => {
    if (!selectedFieldId) return;
    setDraft(prev => ({
      ...prev,
      fields: prev.fields.map(field =>
        field.id === selectedFieldId ? { ...field, ...updates } : field
      )
    }));
  }, [selectedFieldId]);

  const updateTheme = useCallback((themeUpdates: Partial<FormTheme>) => {
    setDraft(prev => ({
      ...prev,
      theme: { ...prev.theme, ...themeUpdates }
    }));
  }, []);

  const handleCanvasClick = (e: React.MouseEvent<HTMLElement, MouseEvent>) => {
    // Só desmarca se clicar no canvas e não em um campo
    setSelectedFieldId(null);
  };

  // ESC desmarca campo
  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedFieldId(null);
    }
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, []);

  // Dropdown: fechar ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [menuOpen]);

  // Ações do menu suspenso
  const handleMenuAction = (action: string) => {
    setMenuOpen(false);
    if (action === 'clear') {
      if (window.confirm('Remover TODOS os campos do formulário?')) {
        setDraft(prev => ({ ...prev, fields: [] }));
        setSelectedFieldId(null);
      }
    }
    if (action === 'export') {
      const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${draft.title || 'formulario'}_draft.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    if (action === 'dark') {
      setDraft(prev => ({
        ...prev,
        theme: { ...prev.theme, bgColor: '#151f34', fontColor: '#e3e7ec' }
      }));
    }
    if (action === 'light') {
      setDraft(prev => ({
        ...prev,
        theme: { ...prev.theme, bgColor: '#fff', fontColor: '#1e293b' }
      }));
    }
    if (action === 'reset-theme') {
      setDraft(prev => ({
        ...prev,
        theme: {
          bgColor: '#111623',
          accentColor: '#30c6fa',
          fontColor: '#f1f5f9',
          borderRadius: 8,
          spacing: 'normal'
        }
      }));
    }
    if (action === 'dashboard') {
      router.replace('/dashboard');
    }
  };

  // Drag and drop handlers
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const fieldType = FIELD_TYPES.find(ft => ft.type === active.id);
    if (fieldType) setDraggedFieldType(fieldType.type);
  };
  const handleDragOver = (event: DragOverEvent) => {};
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setDraggedFieldType(null);
    if (!over) return;
    if (draggedFieldType) {
      const overFieldIndex = draft.fields.findIndex(f => f.id === over.id);
      addField(draggedFieldType, overFieldIndex >= 0 ? overFieldIndex + 1 : undefined);
      return;
    }
    if (active.id !== over.id) {
      const oldIndex = draft.fields.findIndex(f => f.id === active.id);
      const newIndex = draft.fields.findIndex(f => f.id === over.id);
      if (oldIndex >= 0 && newIndex >= 0) {
        setDraft(prev => ({
          ...prev,
          fields: arrayMove(prev.fields, oldIndex, newIndex)
        }));
      }
    }
  };

  const setAutomationType = (type: 'email' | 'whatsapp') => {
    setDraft(prev => ({
      ...prev,
      automation: { ...prev.automation, type, target: '' }
    }));
  };

  const setAutomationTarget = (target: string) => {
    setDraft(prev => ({
      ...prev,
      automation: { 
        type: prev.automation?.type ?? 'email',
        target 
      }
    }));
  };

  // Atribuição de colaboradores
  const handleCollaboratorToggle = (collaboratorId: string) => {
    setAssignedCollaborators(prev => prev.includes(collaboratorId)
      ? prev.filter(id => id !== collaboratorId)
      : [...prev, collaboratorId]
    );
  };

  // Salvar formulário
  const handleSave = async () => {
    setSaving(true);
    try {
      let resultId = formId;
      const formData = {
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

  const selectedField = draft.fields.find(f => f.id === selectedFieldId);

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
            onClick={handleCanvasClick}
            tabIndex={-1}
            style={{ minHeight: 600, cursor: selectedFieldId ? 'pointer' : undefined }}
          >
            {activeTab === 'design' ? (
              <div className={styles.designCanvas} onClick={e => e.stopPropagation()}>
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
              <div className={styles.previewCanvas} onClick={e => e.stopPropagation()}>
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
                      borderRadius: `${draft.theme.borderRadius}px`
                    }}
                  >
                    <h2>{draft.title || 'Título do Formulário'}</h2>
                    {draft.description && <p>{draft.description}</p>}

                    <PreviewFields fields={draft.fields} />

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
                <div className={styles.formSettings}>
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
                    <label>Cor de Fundo</label>
                    <input
                      type="color"
                      value={draft.theme.bgColor}
                      onChange={e => updateTheme({ bgColor: e.target.value })}
                      className={styles.colorInput}
                    />
                  </div>
                  <div className={styles.propertyGroup}>
                    <label>Cor de Destaque</label>
                    <input
                      type="color"
                      value={draft.theme.accentColor}
                      onChange={e => updateTheme({ accentColor: e.target.value })}
                      className={styles.colorInput}
                    />
                  </div>
                </div>
                {/* Automação */}
                <div className={styles.automationSection}>
                  <h4 className={styles.subTitle}>Automação de Notificação</h4>
                  <div className={styles.automationToggle}>
                    <button
                      className={`${styles.toggleButton} ${draft.automation?.type === 'email' ? styles.active : ''}`}
                      onClick={() => setAutomationType('email')}
                    >
                      <Mail size={16} /> E-mail
                    </button>
                    <button
                      className={`${styles.toggleButton} ${draft.automation?.type === 'whatsapp' ? styles.active : ''}`}
                      onClick={() => setAutomationType('whatsapp')}
                    >
                      <MessageCircle size={16} /> WhatsApp
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
                    {collaborators.map(collaborator => (
                      <label key={collaborator.id} className={styles.collaboratorItem}>
                        <input
                          type="checkbox"
                          checked={assignedCollaborators.includes(collaborator.id)}
                          onChange={() => handleCollaboratorToggle(collaborator.id)}
                        />
                        <span>{collaborator.username}</span>
                      </label>
                    ))}
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