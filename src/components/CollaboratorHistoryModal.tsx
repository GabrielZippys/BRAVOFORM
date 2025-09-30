// components/CollaboratorHistoryModal.tsx
'use client';

import { useMemo } from 'react';
import { X } from 'lucide-react';

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
  if (!isOpen) return null;

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
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <strong style={{ fontSize: 18 }}>{form.title || response.formTitle || 'Formulário'}</strong>
            <small style={{ opacity: 0.9 }}>
              {created ? `Enviado em ${fmt(created)}` : ''}
              {response.collaboratorUsername ? ` — por ${response.collaboratorUsername}` : ''}
            </small>
          </div>
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

        {/* BODY */}
        <div style={{ padding: 16, overflowY: 'auto' }}>
          {fieldsToRender.length === 0 && (
            <div style={{ opacity: 0.8 }}>Sem campos para exibir.</div>
          )}

          {fieldsToRender.map((field, fieldIndex) => {
            const value = readAnswerForField(field, response);
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
                                return (
                                  <td
                                    key={`cell_${String(field.id)}_${rid}_${cid}_${cidx}`}
                                    style={{ padding: 8, borderBottom: `1px solid ${theme.border}` }}
                                  >
                                    {safeStr(cell)}
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
                <div style={{ whiteSpace: 'pre-wrap' }}>
                  {safeStr(value)}
                </div>
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
