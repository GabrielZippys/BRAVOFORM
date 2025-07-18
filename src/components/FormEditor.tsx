'use client';

import React, { useState, useEffect } from 'react';
// --- ADIÇÃO: Ícones extras e importações do Dnd-kit ---
import { ArrowLeft, Save, Type, Paperclip, PenSquare, Trash2, CheckSquare, CircleDot, Calendar, Heading2, PlusCircle, Mail, MessageCircle, Table2, GripVertical, Edit, Eye } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { type Form, type FormField as ImportedFormField, type Collaborator } from '@/types';
import styles from '../../app/styles/FormEditor.module.css';
import { db, auth } from '../../firebase/config';
import { collection, addDoc, doc, updateDoc, onSnapshot, query, serverTimestamp } from 'firebase/firestore';

// --- MASS ADD ROWS COMPONENT ---
function MassAddRows({ onAddRows }: { onAddRows: (labels: string[]) => void }) {
  const [bulkInput, setBulkInput] = useState('');
  function handleBulkAdd() {
    const items = bulkInput
      .split(/[\n,]+/)
      .map(line => line.trim())
      .filter(line => line.length > 0);
    if (items.length > 0) {
      onAddRows(items);
      setBulkInput('');
    }
  }
  return (
    <div style={{ marginTop: 8 }}>
      <textarea
        rows={3}
        placeholder="Cole ou digite várias linhas, separadas por ENTER ou vírgula"
        value={bulkInput}
        onChange={e => setBulkInput(e.target.value)}
        style={{
          width: "100%",
          fontSize: 15,
          border: "1px solid #3b4661",
          borderRadius: 6,
          marginBottom: 4,
          padding: 6,
        }}
      />
      <button
        style={{
          background: "#30c6fa",
          color: "#fff",
          fontWeight: 600,
          borderRadius: 4,
          border: "none",
          padding: "6px 16px",
          cursor: "pointer"
        }}
        onClick={handleBulkAdd}
        disabled={!bulkInput.trim()}
      >
        + Adicionar Linhas em Massa
      </button>
    </div>
  );
}

// --- TIPOS LOCAIS (sem alterações) ---
type Column = {
  id: number;
  label: string;
  type: 'Texto' | 'Data' | 'Caixa de Seleção' | 'Múltipla Escolha';
  options?: string[];
};
type Row = {
  id: number;
  label: string;
};
type EditorFormField = Omit<ImportedFormField, 'type' | 'columns' | 'rows'> & {
  type: ImportedFormField['type'] | 'Tabela';
  allowOther?: boolean;
  columns?: Column[];
  rows?: Row[];
  tableData?: Record<string, Record<string, any>>;
  placeholder?: string;
};

interface FormEditorProps {
  companyId: string | null;
  departmentId: string | null;
  existingForm: Form | null;
  onSaveSuccess: () => void;
  onCancel: () => void;
}
const allowedColumnTypes: Column['type'][] = ['Texto', 'Data', 'Múltipla Escolha', 'Caixa de Seleção'];

const SortableFieldItem = ({ field, selectedFieldId, setSelectedFieldId, removeField }: { field: EditorFormField, selectedFieldId: number | null, setSelectedFieldId: (id: number) => void, removeField: (id: number) => void }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.fieldItem} ${selectedFieldId === field.id ? styles.selected : ''}`}
      onClick={() => setSelectedFieldId(field.id)}
    >
      <span {...attributes} {...listeners} className={styles.gripIconWrapper} title="Arrastar para reordenar">
        <GripVertical size={18} className={styles.gripIcon} />
      </span>
      <span className={styles.fieldItemLabel}>{field.label}</span>
      <button onClick={(e) => { e.stopPropagation(); removeField(field.id); }} className={styles.deleteFieldButton}><Trash2 size={16} /></button>
    </div>
  );
};

export default function FormEditor({ companyId, departmentId, existingForm, onSaveSuccess, onCancel }: FormEditorProps) {
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [fields, setFields] = useState<EditorFormField[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<number | null>(null);
  const [automation, setAutomation] = useState({ type: 'email', target: '' });
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [assignedCollaborators, setAssignedCollaborators] = useState<string[]>([]);
  const [mobileView, setMobileView] = useState<'editor' | 'preview'>('editor');
  const selectedField = fields.find(f => f.id === selectedFieldId);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setFields((items) => {
        const oldIndex = items.findIndex(item => item.id === active.id);
        const newIndex = items.findIndex(item => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }

  useEffect(() => {
    if (existingForm) {
      setFormTitle(existingForm.title);
      setFormDescription(existingForm.description || "");
      const initialFields = (existingForm.fields as EditorFormField[] || []).map(field => {
        if (field.type === 'Tabela' && field.rows) {
          const rowsWithIds = field.rows.map((row, index) => ({
            ...row,
            id: row.id || Date.now() + index
          }));
          return { ...field, rows: rowsWithIds };
        }
        return field;
      });
      setFields(initialFields);
      setAutomation(existingForm.automation || { type: 'email', target: '' });
      setAssignedCollaborators(existingForm.collaborators || []);
      if (initialFields.length > 0) {
        setSelectedFieldId(initialFields[0].id);
      }
    } else {
      setFormTitle("Novo Formulário");
      setFields([]);
      setAutomation({ type: 'email', target: '' });
      setAssignedCollaborators([]);
    }
  }, [existingForm]);

  useEffect(() => {
    if (departmentId) {
      const collaboratorsPath = `departments/${departmentId}/collaborators`;
      const collaboratorsQuery = query(collection(db, collaboratorsPath));
      const unsubscribe = onSnapshot(collaboratorsQuery, (snapshot) => {
        const collaboratorsData = snapshot.docs.map(doc => ({ id: doc.id, username: doc.data().username } as unknown as Collaborator));
        setCollaborators(collaboratorsData);
      }, (err) => {
        console.error("Erro ao buscar colaboradores:", err);
      });
      return () => unsubscribe();
    }
  }, [departmentId]);

  const addField = (type: EditorFormField['type']) => {
    let newField: EditorFormField = { id: Date.now(), type, label: 'Novo Campo' };

    switch (type) {
      case 'Assinatura':
        newField.label = 'Assinatura';
        break;
      case 'Caixa de Seleção':
      case 'Múltipla Escolha':
        newField.options = ['Opção 1'];
        break;
      case 'Tabela':
        newField.label = 'Tabela de Pedidos';
        newField.columns = [{ id: Date.now() + 1, label: 'Estoque (em caixas)', type: 'Texto' }];
        newField.rows = [{ id: Date.now() + 2, label: 'ALCATRA COMPLETA (PL)' }];
        newField.tableData = {};
        break;
    }
    setFields(prev => [...prev, newField]);
    setSelectedFieldId(newField.id);
  };

  const updateFieldLabel = (id: number, newLabel: string) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, label: newLabel } : f));
  };

  const removeField = (fieldId: number) => {
    setFields(prev => {
      const newFields = prev.filter(f => f.id !== fieldId);
      if (selectedFieldId === fieldId) {
        setSelectedFieldId(newFields[0]?.id || null);
      }
      return newFields;
    });
  };

  const addOption = (fieldId: number) => { setFields(prev => prev.map(f => (f.id === fieldId && (f.type === 'Caixa de Seleção' || f.type === 'Múltipla Escolha')) ? { ...f, options: [...(f.options || []), `Nova Opção`] } : f)); };
  const updateOption = (fieldId: number, optionIndex: number, newText: string) => { setFields(prev => prev.map(f => { if (f.id === fieldId && f.options) { const newOptions = [...f.options]; newOptions[optionIndex] = newText; return { ...f, options: newOptions }; } return f; })); };
  const removeOption = (fieldId: number, optionIndex: number) => { setFields(prev => prev.map(f => { if (f.id === fieldId && f.options) { const newOptions = [...f.options]; newOptions.splice(optionIndex, 1); return { ...f, options: newOptions }; } return f; })); };

  const addTableRow = (fieldId: number) => {
    setFields(prev => prev.map(f => {
      if (f.id === fieldId && f.type === 'Tabela') {
        const newRows = [...(f.rows || []), { id: Date.now(), label: 'Nova Linha' }];
        return { ...f, rows: newRows };
      }
      return f;
    }));
  };
  const updateTableRow = (fieldId: number, rowId: number, newLabel: string) => {
    setFields(prev => prev.map(f => {
      if (f.id === fieldId && f.type === 'Tabela' && f.rows) {
        const newRows = f.rows.map(r => r.id === rowId ? { ...r, label: newLabel } : r);
        return { ...f, rows: newRows };
      }
      return f;
    }));
  };
  const removeTableRow = (fieldId: number, rowId: number) => {
    setFields(prev => prev.map(f => {
      if (f.id === fieldId && f.type === 'Tabela' && f.rows) {
        const newRows = f.rows.filter(r => r.id !== rowId);
        return { ...f, rows: newRows };
      }
      return f;
    }));
  };

  const addTableColumn = (fieldId: number) => {
    setFields(prev => prev.map(f => {
      if (f.id === fieldId && f.type === 'Tabela') {
        const newCols = [...(f.columns || []), { id: Date.now(), label: 'Nova Coluna', type: 'Texto' as const }];
        return { ...f, columns: newCols };
      }
      return f;
    }));
  };

  const updateTableColumn = (fieldId: number, colId: number, newValues: Partial<Column>) => {
    setFields(prev => prev.map(f => {
      if (f.id === fieldId && f.type === 'Tabela' && f.columns) {
        const newColumns = f.columns.map((c): Column => {
          if (c.id === colId) {
            const updatedCol = { ...c, ...newValues };
            if ((updatedCol.type === 'Múltipla Escolha' || updatedCol.type === 'Caixa de Seleção') && !updatedCol.options) {
              updatedCol.options = ['Nova Opção'];
            } else if (updatedCol.type !== 'Múltipla Escolha' && updatedCol.type !== 'Caixa de Seleção') {
              delete updatedCol.options;
            }
            return updatedCol;
          }
          return c;
        });
        return { ...f, columns: newColumns };
      }
      return f;
    }));
  };

  const removeTableColumn = (fieldId: number, colId: number) => {
    setFields(prev => prev.map(f => {
      if (f.id === fieldId && f.type === 'Tabela' && f.columns) {
        const newColumns = f.columns.filter(c => c.id !== colId);
        return { ...f, columns: newColumns };
      }
      return f;
    }));
  };

  const addColumnOption = (fieldId: number, columnId: number) => {
    setFields(prev => prev.map(f => {
      if (f.id === fieldId && f.type === 'Tabela' && f.columns) {
        const newColumns = f.columns.map(c => c.id === columnId ? { ...c, options: [...(c.options || []), 'Nova Opção'] } : c);
        return { ...f, columns: newColumns };
      }
      return f;
    }));
  };

  const updateColumnOption = (fieldId: number, columnId: number, optionIndex: number, text: string) => {
    setFields(prev => prev.map(f => {
      if (f.id === fieldId && f.type === 'Tabela' && f.columns) {
        const newColumns = f.columns.map(c => {
          if (c.id === columnId && c.options) {
            const newOptions = [...c.options];
            newOptions[optionIndex] = text;
            return { ...c, options: newOptions };
          }
          return c;
        });
        return { ...f, columns: newColumns };
      }
      return f;
    }));
  };

  const removeColumnOption = (fieldId: number, columnId: number, optionIndex: number) => {
    setFields(prev => prev.map(f => {
      if (f.id === fieldId && f.type === 'Tabela' && f.columns) {
        const newColumns = f.columns.map(c => {
          if (c.id === columnId && c.options) {
            const newOptions = [...c.options];
            newOptions.splice(optionIndex, 1);
            return { ...c, options: newOptions };
          }
          return c;
        });
        return { ...f, columns: newColumns };
      }
      return f;
    }));
  };

  const handleTableCellChange = (fieldId: number, rowId: number, columnId: number, value: any) => {
    const currentField = fields.find(f => f.id === fieldId);
    if (!currentField) return;

    const newTableData = {
      ...currentField.tableData,
      [rowId]: {
        ...currentField.tableData?.[rowId],
        [columnId]: value,
      }
    };
    setFields(prev => prev.map(f => f.id === fieldId ? { ...f, tableData: newTableData } : f));
  };

  const handleCollaboratorToggle = (collaboratorId: string) => { setAssignedCollaborators(prev => prev.includes(collaboratorId) ? prev.filter(id => id !== collaboratorId) : [...prev, collaboratorId]); };

  const handleSave = async () => {
    setIsSaving(true);
    const currentUser = auth.currentUser;
    if (!currentUser) { setError("Utilizador não autenticado."); setIsSaving(false); return; }
    if (!formTitle.trim() || !companyId || !departmentId) { setError("Título, empresa e departamento são obrigatórios."); setIsSaving(false); return; }
    setError('');

    try {
      const uniqueCollaborators = [...new Set(assignedCollaborators)];
      const formPayload = {
        title: formTitle, description: formDescription, fields, automation, companyId, departmentId, ownerId: currentUser.uid,
        collaborators: uniqueCollaborators, authorizedUsers: [...new Set([currentUser.uid, ...uniqueCollaborators])],
      };

      if (existingForm?.id) {
        await updateDoc(doc(db, "forms", existingForm.id), { ...formPayload, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, "forms"), { ...formPayload, createdAt: serverTimestamp() });
      }
      onSaveSuccess();
    } catch (e) { console.error("Erro ao salvar formulário: ", e); setError("Não foi possível salvar o formulário."); }
    finally { setIsSaving(false); }
  };

  return (
    <div className={`${styles.editorPageWrapper} ${mobileView === 'preview' ? styles.showPreviewOnly : ''}`}>
      <header className={styles.mainHeader}>
        <div className={styles.headerTitle}>
          <button onClick={onCancel} className={styles.backButton} title="Voltar"><ArrowLeft size={27} /></button>
          <h2>{existingForm ? 'Editar Formulário' : 'Criar Novo Formulário'}</h2>
        </div>
      </header>

      <div className={styles.mobileViewToggle}>
        <button className={`${styles.toggleButton} ${mobileView === 'editor' ? styles.active : ''}`} onClick={() => setMobileView('editor')}>
          <Edit size={16} /> Editar Campos
        </button>
        <button className={`${styles.toggleButton} ${mobileView === 'preview' ? styles.active : ''}`} onClick={() => setMobileView('preview')}>
          <Eye size={16} /> Visualizar
        </button>
      </div>

      <div className={styles.editorGrid}>
        <div className={`${styles.controlsColumn} ${mobileView === 'editor' ? styles.mobileVisible : styles.mobileHidden}`}>
          {/* O conteúdo original da sua coluna de controle está aqui */}
          <div>
            <label htmlFor="form-title" className={styles.label}>Título do Formulário</label>
            <input type="text" id="form-title" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} className={styles.input} />
          </div>
          <div>
            <label htmlFor="form-description" className={styles.label}>Descrição do Formulário</label>
            <textarea
              id="form-description"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              className={styles.input}
              placeholder="Ex: Este formulário é para monitoramento diário..."
              rows={3}
            />
          </div>

          <div className={styles.automationSection}>
            <h4 className={styles.subTitle}>Automação de Notificação</h4>
            <div className={styles.automationToggle}>
              <button className={`${styles.toggleButton} ${automation.type === 'email' ? styles.active : ''}`} onClick={() => setAutomation({ type: 'email', target: '' })}><Mail size={16} /> E-mail</button>
              <button className={`${styles.toggleButton} ${automation.type === 'whatsapp' ? styles.active : ''}`} onClick={() => setAutomation({ type: 'whatsapp', target: '' })}><MessageCircle size={16} /> WhatsApp</button>
            </div>
            <input type={automation.type === 'email' ? 'email' : 'tel'} value={automation.target} onChange={(e) => setAutomation({ ...automation, target: e.target.value })} placeholder={automation.type === 'email' ? 'Digite o e-mail' : 'Digite o nº de WhatsApp'} className={styles.input} />
          </div>
          <div>
            <h4 className={styles.subTitle}>Adicionar Campos</h4>
            <div className={styles.fieldButtons}>
              <button onClick={() => addField('Texto')} className={styles.button}><Type size={16} /><span>Texto</span></button>
              <button onClick={() => addField('Anexo')} className={styles.button}><Paperclip size={16} /><span>Anexo</span></button>
              <button onClick={() => addField('Assinatura')} className={styles.button}><PenSquare size={16} /><span>Assinatura</span></button>
              <button onClick={() => addField('Caixa de Seleção')} className={styles.button}><CheckSquare size={16} /><span>Seleção</span></button>
              <button onClick={() => addField('Múltipla Escolha')} className={styles.button}><CircleDot size={16} /><span>Escolha</span></button>
              <button onClick={() => addField('Data')} className={styles.button}><Calendar size={16} /><span>Data</span></button>
              <button onClick={() => addField('Cabeçalho')} className={styles.button}><Heading2 size={16} /><span>Cabeçalho</span></button>
              <button onClick={() => addField('Tabela')} className={styles.button}><Table2 size={16} /><span>Tabela</span></button>
            </div>
          </div>
          <div className={styles.scrollableContent}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={fields} strategy={verticalListSortingStrategy}>
                <div className={styles.fieldsList}>
                  {fields.map(field => (
                    <SortableFieldItem
                      key={field.id}
                      field={field}
                      selectedFieldId={selectedFieldId}
                      setSelectedFieldId={setSelectedFieldId}
                      removeField={removeField}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {selectedField && (
              <div className={styles.selectedFieldEditor}>
                <h3 className={styles.selectedFieldHeader}>Propriedades do Campo</h3>
                <div className={styles.propertyGroup}>
                  <label className={styles.propertyLabel}>Título do Campo</label>
                  <input type="text" value={selectedField.label} onChange={(e) => updateFieldLabel(selectedField.id, e.target.value)} className={styles.input} />
                </div>
                <div className={styles.propertyGroup}>
                  <label className={styles.propertyLabel}>Legenda / Placeholder</label>
                  <input
                    type="text"
                    value={selectedField.placeholder || ''}
                    onChange={(e) => {
                      const newFields = fields.map(f =>
                        f.id === selectedField.id ? { ...f, placeholder: e.target.value } : f
                      );
                      setFields(newFields);
                    }}
                    className={styles.input}
                    placeholder="Ex: 16"
                  />
                </div>

                {(selectedField.type === 'Caixa de Seleção' || selectedField.type === 'Múltipla Escolha') && (
                  <>
                    <div className={styles.propertyGroup}>
                      <label className={styles.propertyLabel}>Opções</label>
                      {selectedField.options?.map((option, index) => (
                        <div key={index} className={styles.propertyListItem}>
                          <input type="text" value={option} onChange={(e) => updateOption(selectedField.id, index, e.target.value)} className={styles.propertyInput} />
                          <button onClick={() => removeOption(selectedField.id, index)} className={styles.propertyDeleteButton}><Trash2 size={14} /></button>
                        </div>
                      ))}
                      <button onClick={() => addOption(selectedField.id)} className={styles.propertyAddButton}><PlusCircle size={16} /> Adicionar Opção</button>
                    </div>
                    <div className={styles.propertyGroup}>
                      <label className={styles.checkboxOptionLabel}>
                        <input
                          type="checkbox"
                          checked={!!selectedField.allowOther}
                          onChange={(e) => {
                            const newFields = fields.map(f => f.id === selectedField.id ? { ...f, allowOther: e.target.checked } : f);
                            setFields(newFields);
                          }}
                        />
                        <span>Permitir uma opção "Outros" com texto livre</span>
                      </label>
                    </div>
                  </>
                )}

                {selectedField.type === 'Tabela' && (
                  <>
                    <div className={styles.propertyGroup}>
                      <label className={styles.propertyLabel}>Linhas</label>
                      {selectedField.rows?.map(row => (
                        <div key={row.id} className={styles.propertyListItem}>
                          <GripVertical size={18} className={styles.gripIcon} />
                          <input type="text" value={row.label} onChange={(e) => updateTableRow(selectedField.id, row.id, e.target.value)} className={styles.propertyInput} />
                          <button onClick={() => removeTableRow(selectedField.id, row.id)} className={styles.propertyDeleteButton}><Trash2 size={14} /></button>
                        </div>
                      ))}
                      <button onClick={() => addTableRow(selectedField.id)} className={styles.propertyAddButton}><PlusCircle size={16} /> Adicionar Linha</button>
                      {/* ADIÇÃO: Adicionar Linhas em Massa */}
                      <MassAddRows
                        onAddRows={(labels) => {
                          setFields(prev =>
                            prev.map(f =>
                              f.id === selectedField.id && f.type === 'Tabela'
                                ? { ...f, rows: [...(f.rows || []), ...labels.map((label, idx) => ({ id: Date.now() + idx, label }))] }
                                : f
                            )
                          );
                        }}
                      />
                    </div>
                    <div className={styles.propertyGroup}>
                      <label className={styles.propertyLabel}>Colunas</label>
                      {selectedField.columns?.map(col => (
                        <div key={col.id}>
                          <div className={styles.columnEditor}>
                            <GripVertical size={18} className={styles.gripIcon} />
                            <input type="text" value={col.label} onChange={(e) => updateTableColumn(selectedField.id, col.id, { label: e.target.value })} className={styles.columnInput} />
                            <select value={col.type} onChange={(e) => updateTableColumn(selectedField.id, col.id, { type: e.target.value as Column['type'] })} className={styles.columnTypeSelector}>
                              {allowedColumnTypes.map(type => <option key={type} value={type}>{type}</option>)}
                            </select>
                            <button onClick={() => removeTableColumn(selectedField.id, col.id)} className={styles.removeColumnButton}><Trash2 size={14} /></button>
                          </div>
                          {(col.type === 'Múltipla Escolha' || col.type === 'Caixa de Seleção') && (
                            <div className={styles.columnOptionsEditor}>
                              {col.options?.map((opt, optIndex) => (
                                <div key={optIndex} className={styles.columnOptionInputGroup}>
                                  <input type="text" value={opt} onChange={(e) => updateColumnOption(selectedField.id, col.id, optIndex, e.target.value)} className={styles.columnOptionInput} />
                                  <button onClick={() => removeColumnOption(selectedField.id, col.id, optIndex)} className={styles.removeColumnOptionButton}><Trash2 size={14} /></button>
                                </div>
                              ))}
                              <button onClick={() => addColumnOption(selectedField.id, col.id)} className={styles.addColumnOptionButton}><PlusCircle size={14} /> Adicionar opção</button>
                            </div>
                          )}
                        </div>
                      ))}
                      <button onClick={() => addTableColumn(selectedField.id)} className={styles.propertyAddButton}><PlusCircle size={16} /> Adicionar Coluna</button>
                    </div>
                  </>
                )}
              </div>
            )}
            <div className={styles.collaboratorSection}>
              <h4 className={styles.subTitle}>Atribuir a Colaboradores</h4>
              <div className={styles.collaboratorList}>
                {collaborators.length > 0 ? collaborators.map(collab => (
                  <label key={String(collab.id)} className={styles.collaboratorItem}>
                    <input
                      type="checkbox"
                      checked={assignedCollaborators.includes(String(collab.id))}
                      onChange={() => handleCollaboratorToggle(String(collab.id))}
                    />
                    <span>{collab.username}</span>
                  </label>
                )) : <p className={styles.emptyListText}>Nenhum colaborador encontrado.</p>}
              </div>
            </div>
          </div>
        </div>

        <div className={`${styles.previewColumn} ${mobileView === 'preview' ? styles.mobileVisible : styles.mobileHidden}`}>
          <div className={styles.previewFrame}>
            <h2 className={styles.previewTitle}>{formTitle}</h2>
            <div className={styles.previewFieldsContainer}>
              {fields.map((field) => (
                <div key={field.id} className={styles.previewFieldWrapper}>
                  <label className={styles.previewLabel}>{field.label}</label>
                  {field.type === 'Texto' && (
                    <input
                      type="text"
                      className={styles.previewInput}
                      readOnly
                      placeholder={field.placeholder || ''}
                    />
                  )}
                  {field.type === 'Anexo' && <div className={styles.previewAttachment}><Paperclip size={24} /></div>}
                  {field.type === 'Assinatura' && <div className={styles.previewSignature}><span>Assine Aqui</span></div>}
                  {field.type === 'Data' && <input type="date" className={styles.previewDateInput} readOnly />}
                  {field.type === 'Caixa de Seleção' && field.options?.map((opt, i) => (<div key={i} className={styles.previewOptionItem}><input type="checkbox" disabled /><span>{opt}</span></div>))}
                  {field.type === 'Múltipla Escolha' && field.options?.map((opt, i) => (<div key={i} className={styles.previewOptionItem}><input type="radio" disabled name={`preview-${field.id}`} /><span>{opt}</span></div>))}
                  {field.type === 'Tabela' && (
                    <div className={styles.tablePreviewWrapper}>
                      <table className={styles.tablePreview}>
                        <thead>
                          <tr>
                            <th className={styles.tablePreviewTh}></th>
                            {field.columns?.map(col => <th key={col.id} className={styles.tablePreviewTh}>{col.label}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {field.rows?.map((row) => (
                            <tr key={row.id}>
                              <td className={styles.tablePreviewFirstCol}>{row.label}</td>
                              {field.columns?.map(col => (
                                <td key={col.id} className={styles.tablePreviewTd}>
                                  {col.type === 'Texto' && <input type="text" className={styles.previewInputSmall} value={field.tableData?.[row.id]?.[col.id] || ''} onChange={(e) => handleTableCellChange(field.id, row.id, col.id, e.target.value)} />}
                                  {col.type === 'Data' && <input type="date" className={styles.previewDateInputSmall} value={field.tableData?.[row.id]?.[col.id] || ''} onChange={(e) => handleTableCellChange(field.id, row.id, col.id, e.target.value)} />}
                                  {col.type === 'Caixa de Seleção' && <input type="checkbox" className={styles.previewCheckbox} checked={!!field.tableData?.[row.id]?.[col.id]} onChange={(e) => handleTableCellChange(field.id, row.id, col.id, e.target.checked)} />}
                                  {col.type === 'Múltipla Escolha' && (
                                    <select className={styles.previewSelectSmall} value={field.tableData?.[row.id]?.[col.id] || ''} onChange={(e) => handleTableCellChange(field.id, row.id, col.id, e.target.value)}>
                                      <option value="">Selecione</option>
                                      {col.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button className={styles.previewButton} type="button">Submeter</button>
          </div>
        </div>
      </div>

      <footer className={styles.editorFooter}>
        <div className={styles.footerContent}>
          <div className={styles.errorWrapper}>
            {error && <p className={styles.errorMessage}>{error}</p>}
          </div>
          <div className={styles.editorHeaderActions}>
            <button onClick={onCancel} className={styles.editorButtonSecondary} disabled={isSaving}>Cancelar</button>
            <button onClick={handleSave} className={styles.editorButtonPrimary} disabled={isSaving}>
              {isSaving ? 'Salvando...' : <><Save size={16} /> Salvar</>}
            </button>
          </div>
        </div>
      </footer>
      {error && <p className={styles.errorMessage}>{error}</p>}
    </div>
  );
}
