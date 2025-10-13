// components/CollaboratorHistoryModal.tsx
'use client';

import { useMemo, useState } from 'react';
import { X, Save } from 'lucide-react';
import { doc, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';

type FireTs = { toDate?: () => Date; seconds?: number } | undefined;

type EnhancedFormField = {
  id: string | number;
  type: string;         // 'Texto' | 'Data' | 'Múltipla Escolha' | 'Caixa de Seleção' | 'Tabela' | 'Assinatura' | 'Anexo' | 'Cabeçalho' | ...
  label: string;
  required?: boolean;
  description?: string;
  options?: string[];
  columns?: { id: string | number; label: string; type?: string; options?: string[] }[];
  rows?: { id: string | number; label: string }[];
  [k: string]: any;
};

type Form = {
  id: string;
  title: string;
  description?: string;
  logo?: { url?: string; name?: string; align?: 'left' | 'center' | 'right'; size?: number };
  theme?: any;
  fields: EnhancedFormField[];
  companyId?: string;
  departmentId?: string;
};

export type HistoryResp = {
  id: string;
  formId: string;
  formTitle?: string;
  collaboratorId?: string;
  collaboratorUsername?: string;
  answers?: Record<string, any>; // **SEMPRE priorizar isto**
  // legados/compat:
  [k: string]: any;
  createdAt?: FireTs;
  submittedAt?: FireTs;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  form: Form;                 // o formulário completo (com fields)
  response: HistoryResp;      // o documento de resposta carregado
  canEdit?: boolean;          // aqui você só visualiza (edição é outro fluxo)
};

function fmtDate(d?: Date) {
  if (!d) return '';
  try { return d.toLocaleDateString('pt-BR'); } catch { return ''; }
}
function fmtTime(d?: Date) {
  if (!d) return '';
  try { return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}

// ISO: 2025-10-01T08:26 (ou com espaço no lugar do T)
const ISO_DT = /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(:\d{2})?$/;

function prettyDateAnswer(field: EnhancedFormField, value: any): string {
  // formata se o tipo do campo for 'Data' OU se a string "parecer" um datetime ISO
  if (field.type === 'Data' || (typeof value === 'string' && ISO_DT.test(value))) {
    const raw = typeof value === 'string' ? value.replace(' ', 'T') : value;
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      return `${fmtDate(d)} • ${fmtTime(d)}`.trim();
    }
  }
  // fallback padrão
  return safeStr(value);
}


function toJSDate(ts?: FireTs): Date | undefined {
  if (!ts) return undefined;
  // Firestore Timestamp
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (typeof ts?.seconds === 'number') return new Date(ts.seconds * 1000);
  return undefined;
}

function fmt(d?: Date) {
  if (!d) return '';
  try { return d.toLocaleString('pt-BR'); } catch { return d.toISOString(); }
}

function safeStr(v: any): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// Converte a resposta de TABELA salva como {rowId: {colId: value}} para uma matriz
function extractTableMatrix(
  tableAnswer: any,
  rows: { id: string | number; label: string }[] = [],
  cols: { id: string | number; label: string; type?: string; options?: string[] }[] = []
) {
  const rowIds = rows?.length ? rows.map(r => String(r.id)) : Object.keys(tableAnswer || {});
  const colIds = cols?.length ? cols.map(c => String(c.id)) :
    (rowIds.length ? Object.keys(tableAnswer?.[rowIds[0]] || {}) : []);

  return { rowIds, colIds };
}

// Prioriza `answers[field.id]`; se faltar, tenta legacy pelo label
function readAnswerForField(field: EnhancedFormField, resp: HistoryResp): any {
  const fid = String(field.id);
  if (resp?.answers && Object.prototype.hasOwnProperty.call(resp.answers, fid)) {
    return resp.answers[fid];
  }
  // LEGADO: podia estar no documento flatten por label
  if (Object.prototype.hasOwnProperty.call(resp, field.label)) {
    return (resp as any)[field.label];
  }
  return undefined;
}

export default function CollaboratorHistoryModal({
  isOpen, onClose, form, response, canEdit = false
}: Props) {
  const [editedAnswers, setEditedAnswers] = useState<Record<string, any>>(response.answers || {});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!canEdit) return;
    
    setIsSaving(true);
    setSaveError('');
    setSaveSuccess(false);
    
    try {
      // Usa o caminho completo se disponível, senão assume coleção raiz
      const docPath = (response as any).path || `responses/${response.id}`;
      
      console.log('🔍 Tentando salvar resposta:', {
        id: response.id,
        formId: response.formId,
        path: docPath
      });
      
      // Cria referência usando o caminho completo do documento
      const pathParts = docPath.split('/');
      let responseRef;
      
      if (pathParts.length === 2) {
        // Caminho simples: collection/doc
        responseRef = doc(db, pathParts[0], pathParts[1]);
      } else {
        // Caminho complexo: collection/doc/subcollection/doc/...
        responseRef = doc(db, docPath);
      }
      
      // Verifica se o documento existe antes de tentar atualizar
      const docSnap = await getDoc(responseRef);
      
      if (!docSnap.exists()) {
        console.error('❌ Documento não encontrado no Firestore:', docPath);
        throw new Error(
          `Resposta não encontrada no banco de dados.\n` +
          `Caminho: ${docPath}\n` +
          `Este documento pode ter sido deletado ou nunca foi criado.`
        );
      }
      
      console.log('✅ Documento encontrado, atualizando...');
      
      // Documento existe, atualiza apenas o campo answers
      await updateDoc(responseRef, {
        answers: editedAnswers,
        updatedAt: new Date(),
      });
      
      console.log('✅ Resposta atualizada com sucesso!');
      
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 1500);
    } catch (error: any) {
      console.error('❌ Erro ao salvar:', error);
      setSaveError(error.message || 'Erro ao salvar alterações');
    } finally {
      setIsSaving(false);
    }
  };

  const updateAnswer = (fieldId: string | number, value: any) => {
    setEditedAnswers(prev => ({
      ...prev,
      [String(fieldId)]: value
    }));
  };

  // estilo mínimo (usa tema do form se quiser)
  const theme = {
    bg: '#0b1220',
    card: '#121a2b',
    border: '#1f2b45',
    text: '#e6eefc',
    accent: '#49cfff',
    soft: '#9fb6d1',
  };

  const created = toJSDate(response.createdAt) || toJSDate(response.submittedAt);

  const fieldsToRender = useMemo(
    () => (form?.fields || []).filter(f => f && f.type !== 'Cabeçalho'),
    [form?.fields]
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#0009', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 12,
      }}
      onClick={(e) => {
        // fecha ao clicar fora do cartão
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 'min(1100px, 96vw)',
          maxHeight: '92vh',
          background: theme.card,
          color: theme.text,
          border: `2px solid ${theme.border}`,
          borderRadius: 14,
          boxShadow: '0 18px 60px #000a',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* HEADER */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', background: theme.accent, color: '#06131f',
            flexWrap: 'wrap', gap: 8,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 200 }}>
            <strong style={{ fontSize: 18 }}>{form.title || response.formTitle || 'Formulário'}</strong>
            <small style={{ opacity: 0.9 }}>
          {created ? `Enviado em ${fmtDate(created)} • ${fmtTime(created)}` : ''}
          {response.collaboratorUsername ? ` — por ${response.collaboratorUsername}` : ''}
         </small>
          </div>
          
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {canEdit && (
              <button
                onClick={handleSave}
                disabled={isSaving}
                style={{
                  background: isSaving ? '#ccc' : '#22c55e',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: 8,
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                <Save size={16} />
                {isSaving ? 'Salvando...' : 'Salvar'}
              </button>
            )}
            
            <button
              onClick={onClose}
              aria-label="Fechar"
              style={{
                background: 'transparent', border: 'none', color: '#06131f', cursor: 'pointer',
                padding: 6, borderRadius: 8,
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>
        
        {/* Mensagens de feedback */}
        {saveSuccess && (
          <div style={{ background: '#22c55e', color: '#fff', padding: '8px 16px', textAlign: 'center', fontWeight: 600 }}>
            ✓ Alterações salvas com sucesso!
          </div>
        )}
        {saveError && (
          <div style={{ background: '#ef4444', color: '#fff', padding: '8px 16px', textAlign: 'center' }}>
            ✗ {saveError}
          </div>
        )}

        {/* BODY */}
        <div style={{ padding: 16, overflowY: 'auto' }}>
          {fieldsToRender.length === 0 && (
            <div style={{ opacity: 0.8 }}>Sem campos para exibir.</div>
          )}

          {fieldsToRender.map((field, fieldIndex) => {
            // Usa editedAnswers se canEdit, senão usa o valor original
            const value = canEdit 
              ? editedAnswers[String(field.id)] ?? readAnswerForField(field, response)
              : readAnswerForField(field, response);
            const keyField = `field_${String(field.id) || fieldIndex}`;

            // Render específico por tipo
            if (field.type === 'Tabela') {
              const rows = field.rows || [];
              const cols = field.columns || [];
              const { rowIds, colIds } = extractTableMatrix(value, rows, cols);

              return (
                <div key={keyField} style={{
                  border: `1px solid ${theme.border}`,
                  borderRadius: 10, marginBottom: 14, overflow: 'hidden'
                }}>
                  <div style={{ background: '#17233a', padding: '10px 12px', fontWeight: 600 }}>
                    {field.label}
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                      <thead>
                        <tr>
                          <th
                            style={{
                              textAlign: 'left', padding: 8, borderBottom: `1px solid ${theme.border}`,
                              background: '#141e33', position: 'sticky', left: 0, zIndex: 1
                            }}
                          >
                            {/* Cabeçalho da linha (vazio/“Linha”) */}
                          </th>
                          {colIds.map((cid, cidx) => {
                            const col = cols.find(c => String(c.id) === cid);
                            return (
                              <th
                                key={`col_${String(field.id)}_${cid}_${cidx}`}
                                style={{ textAlign: 'left', padding: 8, borderBottom: `1px solid ${theme.border}`, background: '#141e33' }}
                              >
                                {col?.label ?? cid}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {rowIds.map((rid, ridx) => {
                          const row = rows.find(r => String(r.id) === rid);
                          return (
                            <tr key={`row_${String(field.id)}_${rid}_${ridx}`}>
                              <td
                                style={{
                                  padding: 8, borderBottom: `1px solid ${theme.border}`,
                                  background: '#141e33', fontWeight: 600, position: 'sticky', left: 0
                                }}
                              >
                                {row?.label ?? rid}
                              </td>
                              {colIds.map((cid, cidx) => {
                                const cell = value?.[rid]?.[cid];
                                const col = cols.find(c => String(c.id) === cid);
                                
                                return (
                                  <td
                                    key={`cell_${String(field.id)}_${rid}_${cid}_${cidx}`}
                                    style={{ padding: 8, borderBottom: `1px solid ${theme.border}` }}
                                  >
                                    {canEdit ? (
                                      // Modo de edição
                                      col?.type === 'select' && col?.options ? (
                                        <select
                                          value={cell || ''}
                                          onChange={(e) => {
                                            const newTableValue = { ...value };
                                            if (!newTableValue[rid]) newTableValue[rid] = {};
                                            newTableValue[rid][cid] = e.target.value;
                                            updateAnswer(field.id, newTableValue);
                                          }}
                                          style={{
                                            width: '100%',
                                            padding: '6px 8px',
                                            background: '#0e172a',
                                            border: `1px solid ${theme.border}`,
                                            borderRadius: 4,
                                            color: theme.text,
                                            fontSize: 13,
                                          }}
                                        >
                                          <option value="">-</option>
                                          {col.options.map((opt, oidx) => (
                                            <option key={oidx} value={opt}>{opt}</option>
                                          ))}
                                        </select>
                                      ) : (
                                        <input
                                          type={
                                            col?.type === 'number' ? 'number' :
                                            col?.type === 'date' ? 'date' :
                                            'text'
                                          }
                                          value={cell || ''}
                                          onChange={(e) => {
                                            const newTableValue = { ...value };
                                            if (!newTableValue[rid]) newTableValue[rid] = {};
                                            // Para números, valida e converte
                                            if (col?.type === 'number') {
                                              const numValue = e.target.value;
                                              newTableValue[rid][cid] = numValue === '' ? '' : numValue;
                                            } else {
                                              newTableValue[rid][cid] = e.target.value;
                                            }
                                            updateAnswer(field.id, newTableValue);
                                          }}
                                          step={col?.type === 'number' ? 'any' : undefined}
                                          style={{
                                            width: '100%',
                                            padding: '6px 8px',
                                            background: '#0e172a',
                                            border: `1px solid ${theme.border}`,
                                            borderRadius: 4,
                                            color: theme.text,
                                            fontSize: 13,
                                          }}
                                        />
                                      )
                                    ) : (
                                      // Modo de visualização
                                      safeStr(cell)
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            }

            if (field.type === 'Anexo') {
  const files = Array.isArray(value) ? value : [];
  const isImg = (u?: string, t?: string, n?: string) =>
    (t && t.startsWith?.('image/')) ||
    (typeof u === 'string' && /^data:image\//i.test(u)) ||
    (typeof u === 'string' && /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(u)) ||
    (typeof n === 'string' && /\.(png|jpe?g|webp|gif|svg)$/i.test(n));

  return (
    <div key={keyField} style={{
      border: `1px solid ${theme.border}`, borderRadius: 10, padding: 12, marginBottom: 14
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{field.label}</div>

      {files.length === 0 ? (
        <div style={{ opacity: 0.8 }}>Sem anexos.</div>
      ) : (
        <>
          {/* galeria de imagens */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
            {files.filter((f: any) => isImg(f?.url, f?.type, f?.name)).map((f: any, i: number) => (
              <div key={`img_${String(field.id)}_${i}`} style={{ background: '#0e172a', border: `1px solid ${theme.border}`, borderRadius: 8, padding: 6 }}>
                <img
                  src={f.url}
                  alt={f.name || 'imagem'}
                  style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 6 }}
                />
                <div style={{ fontSize: 12, marginTop: 6, opacity: 0.9 }}>{f.name}</div>
              </div>
            ))}
          </div>

          {/* lista de arquivos não-imagem */}
          <ul style={{ margin: '12px 0 0', paddingLeft: 18 }}>
            {files.filter((f: any) => !isImg(f?.url, f?.type, f?.name)).map((f: any, i: number) => (
              <li key={`file_${String(field.id)}_${i}`}>
                {f?.url ? (
                  <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color: theme.accent }}>
                    {f?.name || f.url}
                  </a>
                ) : (
                  <span>{f?.name || 'arquivo'}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

            if (field.type === 'Assinatura') {
              const isDataURL = typeof value === 'string' && value.startsWith('data:image');
              return (
                <div key={keyField} style={{
                  border: `1px solid ${theme.border}`, borderRadius: 10, padding: 12, marginBottom: 14
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>{field.label}</div>
                  {isDataURL ? (
                    <img
                      src={value}
                      alt="Assinatura"
                      style={{ maxWidth: '100%', border: `1px dashed ${theme.border}`, borderRadius: 8 }}
                    />
                  ) : (
                    <div style={{ opacity: 0.8 }}>Sem assinatura.</div>
                  )}
                </div>
              );
            }

            // Genéricos: Texto, Data, Múltipla Escolha, Caixa de Seleção, etc.
            return (
              <div key={keyField} style={{
                border: `1px solid ${theme.border}`, borderRadius: 10, padding: 12, marginBottom: 14
              }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>{field.label}</div>
                
                {canEdit ? (
                  // Modo de edição
                  <>
                    {field.type === 'Data' ? (
                      <input
                        type="date"
                        value={value || ''}
                        onChange={(e) => updateAnswer(field.id, e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          background: '#0e172a',
                          border: `1px solid ${theme.border}`,
                          borderRadius: 6,
                          color: theme.text,
                          fontSize: 14,
                        }}
                      />
                    ) : field.type === 'Múltipla Escolha' && field.options ? (
                      <select
                        value={value || ''}
                        onChange={(e) => updateAnswer(field.id, e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          background: '#0e172a',
                          border: `1px solid ${theme.border}`,
                          borderRadius: 6,
                          color: theme.text,
                          fontSize: 14,
                        }}
                      >
                        <option value="">Selecione...</option>
                        {field.options.map((opt, idx) => (
                          <option key={idx} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : field.type === 'Caixa de Seleção' && field.options ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {field.options.map((opt, idx) => {
                          const checked = Array.isArray(value) ? value.includes(opt) : false;
                          return (
                            <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const currentArray = Array.isArray(value) ? value : [];
                                  const newValue = e.target.checked
                                    ? [...currentArray, opt]
                                    : currentArray.filter(v => v !== opt);
                                  updateAnswer(field.id, newValue);
                                }}
                                style={{ cursor: 'pointer' }}
                              />
                              <span>{opt}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      // Campo de texto padrão
                      // Verifica se o campo deve aceitar apenas números
                      (() => {
                        // Prioriza propriedades explícitas do campo
                        const explicitType = (field as any).inputType || (field as any).validation;
                        const labelLower = (field.label || '').toLowerCase();
                        const descLower = (field.description || '').toLowerCase();
                        
                        const isNumeric = 
                          explicitType === 'number' ||
                          explicitType === 'numeric' ||
                          labelLower.includes('quantidade') ||
                          labelLower.includes('número') ||
                          labelLower.includes('numero') ||
                          labelLower.includes('qtd') ||
                          labelLower.includes('valor') ||
                          labelLower.includes('preço') ||
                          labelLower.includes('preco') ||
                          labelLower.includes('kg') ||
                          labelLower.includes('peso') ||
                          labelLower.includes('medida') ||
                          descLower.includes('apenas números') ||
                          descLower.includes('apenas numeros') ||
                          descLower.includes('somente números') ||
                          descLower.includes('somente numeros') ||
                          descLower.includes('numérico') ||
                          descLower.includes('numerico');
                        
                        const isEmail = 
                          explicitType === 'email' ||
                          labelLower.includes('email') ||
                          labelLower.includes('e-mail');
                        
                        const isTel = 
                          explicitType === 'tel' ||
                          explicitType === 'phone' ||
                          labelLower.includes('telefone') ||
                          labelLower.includes('celular') ||
                          labelLower.includes('fone');
                        
                        const inputType = isNumeric ? 'number' : isEmail ? 'email' : isTel ? 'tel' : 'text';
                        
                        return isNumeric || isEmail || isTel ? (
                          <input
                            type={inputType}
                            value={value || ''}
                            onChange={(e) => updateAnswer(field.id, e.target.value)}
                            step={isNumeric ? 'any' : undefined}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              background: '#0e172a',
                              border: `1px solid ${theme.border}`,
                              borderRadius: 6,
                              color: theme.text,
                              fontSize: 14,
                            }}
                          />
                        ) : (
                          <textarea
                            value={value || ''}
                            onChange={(e) => updateAnswer(field.id, e.target.value)}
                            rows={3}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              background: '#0e172a',
                              border: `1px solid ${theme.border}`,
                              borderRadius: 6,
                              color: theme.text,
                              fontSize: 14,
                              resize: 'vertical',
                              fontFamily: 'inherit',
                            }}
                          />
                        );
                      })()
                    )}
                  </>
                ) : (
                  // Modo de visualização
                  <div style={{ whiteSpace: 'pre-wrap' }}>
                    {prettyDateAnswer(field, value)}
                  </div>
                )}

                {field.description && (
                  <div style={{ opacity: 0.8, fontSize: 12, marginTop: 6 }}>
                    {field.description}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* FOOTER */}
        <div style={{
          padding: 12, display: 'flex', justifyContent: 'flex-end',
          gap: 8, borderTop: `1px solid ${theme.border}`
        }}>
          <button
            onClick={onClose}
            style={{
              background: '#243351', color: '#e6eefc', border: `1px solid ${theme.border}`,
              padding: '8px 14px', borderRadius: 10, cursor: 'pointer', fontWeight: 600
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
