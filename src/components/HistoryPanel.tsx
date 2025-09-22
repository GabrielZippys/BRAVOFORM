// components/HistoryPanel.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../../firebase/config';
import {
  collectionGroup,
  doc as fsDoc,
  getDoc,
  onSnapshot,
  query,
  where,
  Timestamp
} from 'firebase/firestore';

import styles from '../../app/styles/CollaboratorView.module.css';

// --- BRANDING (troque quando quiser) ---
const BRAVOFORM_LOGO = '/formbravo-logo.png'; // ou dataURL
const BRAND_PRIMARY = '#C5A05C';
const BRAND_DARK = '#0B1220';

type FireTs = Timestamp | undefined;

export interface HistoryResp {
  id: string;
  formId: string;
  formTitle?: string;
  collaboratorId?: string;
  collaboratorUsername?: string;
  answers?: Record<string, any>;
  createdAt?: FireTs;
  submittedAt?: FireTs;
}

// ------- Tipos de schema do Form -------
type FormCol = { id: string | number; label: string; type?: string; options?: string[] };
type FormRow = { id: string | number; label: string };
type FormField = {
  id: string | number;
  type: string;            // 'Texto' | 'Data' | 'Tabela' | ...
  label: string;
  required?: boolean;
  options?: string[];
  columns?: FormCol[];
  rows?: FormRow[];
  [k: string]: any;
};
type FormSchema = {
  id: string;
  title: string;
  fields: FormField[];
};

// ------- Utils -------
function toJSDate(ts?: FireTs): Date | undefined {
  if (!ts) return undefined;
  try {
    // @ts-ignore Firestore TS
    if (typeof ts.toDate === 'function') return ts.toDate();
  } catch {}
  // compat {seconds}
  // @ts-ignore
  if (typeof ts?.seconds === 'number') return new Date(ts.seconds * 1000);
  return undefined;
}
function formatDateTime(d?: Date): string {
  if (!d) return 'Sem data';
  try {
    return d.toLocaleString('pt-BR');
  } catch {
    return d?.toISOString() ?? 'Sem data';
  }
}

// ----- Mapeia answers com base no schema (para PDF e busca) -----
// { 'Campo': 'valor', 'Campo[Row][Col]': 'valor', ... }
function flattenAnswersWithLabels(
  answers: Record<string, any> | undefined,
  schema: FormSchema | undefined
): Record<string, string> {
  if (!answers || !schema) return {};

  const byFieldId = new Map<string, FormField>();
  for (const f of schema.fields || []) {
    byFieldId.set(String(f.id), f);
  }

  const out: Record<string, string> = {};

  Object.entries(answers).forEach(([fid, rawVal]) => {
    const field = byFieldId.get(String(fid));
    const fieldLabel = field?.label ?? fid;

    if (!field) {
      out[fieldLabel] = normalizeValue(rawVal);
      return;
    }

    if (field.type === 'Tabela') {
      const rows = field.rows || [];
      const cols = field.columns || [];
      if (!rawVal || typeof rawVal !== 'object') {
        out[fieldLabel] = normalizeValue(rawVal);
        return;
      }

      const rowLabelById = new Map(rows.map(r => [String(r.id), r.label]));
      const colLabelById = new Map(cols.map(c => [String(c.id), c.label]));

      // rawVal: { [rowId]: { [colId]: value } }
      Object.entries(rawVal as Record<string, any>).forEach(([rowId, colsObj]) => {
        const rLabel = rowLabelById.get(String(rowId)) ?? rowId;
        if (!colsObj || typeof colsObj !== 'object') {
          out[`${fieldLabel}[${rLabel}]`] = normalizeValue(colsObj);
          return;
        }
        Object.entries(colsObj as Record<string, any>).forEach(([colId, cell]) => {
          const cLabel = colLabelById.get(String(colId)) ?? colId;
          out[`${fieldLabel}[${rLabel}][${cLabel}]`] = normalizeValue(cell);
        });
      });
      return;
    }

    // Demais tipos
    out[fieldLabel] = normalizeValue(rawVal);
  });

  return out;
}

// Converte answers em linhas [{campo, valor}] para o PDF
function rowsFromAnswers(ans: any): Array<{ campo: string; valor: string }> {
  const rows: Array<{ campo: string; valor: string }> = [];

  const pushKV = (k: string, v: any) => {
    let val: string = '';
    if (v == null || v === '') val = '-';
    else if (typeof v === 'string') val = v;
    else if (Array.isArray(v)) val = v.map(x => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ');
    else if (typeof v === 'object') val = JSON.stringify(v);
    else val = String(v);
    rows.push({ campo: k, valor: val });
  };

  try {
    if (ans == null) return rows;

    // Tabela “oficial”: object com chaves => valores
    if (typeof ans === 'object' && !Array.isArray(ans)) {
      Object.entries(ans).forEach(([k, v]) => pushKV(k, v));
      return rows;
    }

    // Lista genérica
    if (Array.isArray(ans)) {
      ans.forEach((item, idx) => {
        if (item && typeof item === 'object') {
          const label =
            item.label ?? item.question ?? item.name ?? item.title ?? `item_${idx}`;
          const value =
            item.value ?? item.answer ?? item.response ?? item[label] ?? item;
          pushKV(String(label), value);
        } else {
          pushKV(`item_${idx}`, item);
        }
      });
      return rows;
    }

    // Qualquer outra coisa
    pushKV('Resposta', ans);
    return rows;
  } catch {
    pushKV('Resposta', ans);
    return rows;
  }
}


function normalizeValue(v: any): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(normalizeValue).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// ------- Componente -------
type Props = {
  collaboratorId?: string;
  canEdit?: boolean;
  onOpen?: (resp: HistoryResp) => void;
};

export default function HistoryPanel({ collaboratorId, canEdit = false, onOpen = () => {} }: Props) {
  // base
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [responses, setResponses] = useState<HistoryResp[]>([]);

  // cache de schema por formId
  const [schemas, setSchemas] = useState<Record<string, FormSchema>>({});
  const fetchingForms = useRef<Set<string>>(new Set());

  // filtros
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState<string>(''); // yyyy-mm-dd
  const [endDate, setEndDate] = useState<string>('');     // yyyy-mm-dd

  // seleção
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Carrega respostas SOMENTE do colaborador
  useEffect(() => {
    setSelected(new Set());
    if (!collaboratorId) {
      setResponses([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const qRef = query(
      collectionGroup(db, 'responses'),
      where('collaboratorId', '==', collaboratorId)
    );

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const items: HistoryResp[] = snap.docs.map((d) => {
          const x = d.data() as any;
          const createdAt: FireTs =
            x?.submittedAt instanceof Timestamp ? x.submittedAt :
            x?.createdAt   instanceof Timestamp ? x.createdAt   : undefined;

          return {
            id: d.id,
            formId: x?.formId ?? '',
            formTitle: x?.formTitle ?? '',
            collaboratorId: x?.collaboratorId ?? '',
            collaboratorUsername: x?.collaboratorUsername ?? '',
            answers: x?.answers,
            createdAt,
            submittedAt: x?.submittedAt
          };
        });

        items.sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
        setResponses(items);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setError('Falha ao carregar o histórico.');
        setResponses([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [collaboratorId]);

  // Busca schema dos forms envolvidos
  useEffect(() => {
    const uniqueFormIds = Array.from(new Set(responses.map(r => r.formId).filter(Boolean)));
    uniqueFormIds.forEach(async (fid) => {
      if (!fid || schemas[fid] || fetchingForms.current.has(fid)) return;
      fetchingForms.current.add(fid);
      try {
        const snap = await getDoc(fsDoc(db, 'forms', fid));
        if (snap.exists()) {
          const data = snap.data() as any;
          setSchemas(prev => ({
            ...prev,
            [fid]: {
              id: snap.id,
              title: data?.title ?? '',
              fields: Array.isArray(data?.fields) ? data.fields : []
            }
          }));
        }
      } finally {
        fetchingForms.current.delete(fid);
      }
    });
  }, [responses, schemas]);

  // Aplica filtros + indexa por schema/labels
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const start = startDate ? new Date(`${startDate}T00:00:00`) : undefined;
    const end = endDate ? new Date(`${endDate}T23:59:59.999`) : undefined;

    return responses.filter((r) => {
      const d = toJSDate(r.createdAt);

      if (start && d && d < start) return false;
      if (end && d && d > end) return false;

      if (!q) return true;

      const schema = schemas[r.formId];
      const flat = flattenAnswersWithLabels(r.answers, schema);
      const hay = [
        r.formTitle || schema?.title,
        r.formId,
        r.collaboratorUsername,
        ...Object.entries(flat).flatMap(([k, v]) => [k, v]),
        formatDateTime(d),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return hay.includes(q);
    });
  }, [responses, search, startDate, endDate, schemas]);

  // seleção
  const isAllFilteredSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const toggleSelectAllFiltered = () => {
    const next = new Set(selected);
    if (isAllFilteredSelected) filtered.forEach((r) => next.delete(r.id));
    else filtered.forEach((r) => next.add(r.id));
    setSelected(next);
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  // ====== EXPORTAR PDF ======
  // ====== EXPORTAR PDF (logo menor + TABELA em colunas) ======
const handleExportPdf = async () => {
  const dataset = filtered.filter(r => selected.size === 0 || selected.has(r.id));
  if (dataset.length === 0) {
    alert('Nenhum item selecionado ou filtrado para exportar.');
    return;
  }

  // libs
  const JsPDF = (await import('jspdf')).default;
  const autoTable = (await import('jspdf-autotable')).default as any;

  // doc base
  const pdf = new JsPDF({ unit: 'pt', format: 'a4', compress: true });
  const pageW = (pdf as any).internal.pageSize.getWidth();
  const pageH = (pdf as any).internal.pageSize.getHeight();
  const headerH = 56;

  // — logo (ajustado para ficar pequeno)
  let logo: HTMLImageElement | null = null;
  try { logo = await loadImage(BRAVOFORM_LOGO); } catch {}
  const LOGO_MAX_H = Math.floor(headerH * 0.6); // ~34px
  const LOGO_MAX_W = 110;

  // header / footer
  const header = (left?: string, right?: string) => {
    pdf.setFillColor(BRAND_DARK);
    pdf.rect(0, 0, pageW, headerH, 'F');

    let xAfterLogo = 24;
    if (logo) {
      const r = logo.height ? LOGO_MAX_H / logo.height : 1;
      const w = Math.min(LOGO_MAX_W, (logo.width || LOGO_MAX_W) * r);
      const h = Math.min(LOGO_MAX_H, (logo.height || LOGO_MAX_H) * r);
      const y = (headerH - h) / 2;
      try { (pdf as any).addImage(logo, 'PNG', 24, y, w, h); } catch {}
      xAfterLogo = 24 + w + 12;
    }

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor('#fff');
    pdf.text(left ?? 'Relatório de Respostas', xAfterLogo, headerH / 2 + 4);

    if (right) {
      const tw = (pdf as any).getTextWidth(right);
      pdf.text(right, pageW - 24 - tw, headerH / 2 + 4);
    }

    pdf.setDrawColor(BRAND_PRIMARY);
    pdf.setLineWidth(1.2);
    pdf.line(0, headerH, pageW, headerH);
  };

  const pageNo   = () => (pdf as any).internal.getCurrentPageInfo().pageNumber;
  const pageCount= () => (pdf as any).internal.getNumberOfPages();

  const footer = () => {
    const left = `Gerado a partir do BRAVOFORM · ${new Date().toLocaleString('pt-BR')}`;
    const right = `pág. ${pageNo()}/${pageCount()}`;

    pdf.setFont('helvetica','normal'); pdf.setFontSize(9); pdf.setTextColor('#666');
    pdf.setDrawColor('#e0e0e0'); pdf.setLineWidth(0.7);
    pdf.line(40, pageH - 48, pageW - 40, pageH - 48);
    pdf.text(left, 40, pageH - 30);
    const tw = (pdf as any).getTextWidth(right);
    pdf.text(right, pageW - 40 - tw, pageH - 30);
  };

  const ensureSpace = (need = 120, left?: string, right?: string) => {
    if (y + need > pageH - 72) {
      pdf.addPage();
      header(left, right);
      footer();
      y = 80;
    }
  };

  // primeira página
  header('BRAVOFORM · Relatório de Respostas', `${dataset.length} resposta(s)`);
  footer();
  let y = 80;

  for (let i = 0; i < dataset.length; i++) {
    const r = dataset[i];
    const d = toJSDate(r.createdAt);
    const when = formatDateTime(d);
    const sectionTitle = r.formTitle || r.formId || 'Formulário';
    const sectionMeta  = `Colaborador: ${r.collaboratorUsername || '-'} · ID resposta: ${r.id}`;
    const schema = schemas[r.formId];
    const answers = r.answers || {};

    // Cabeçalho da seção
    ensureSpace(160, sectionTitle, when);
    pdf.setFont('helvetica','bold'); pdf.setFontSize(13.5); pdf.setTextColor('#111');
    pdf.text(sectionTitle, 40, y);
    pdf.setFont('helvetica','normal'); pdf.setFontSize(10.5); pdf.setTextColor('#555');
    pdf.text(`${when}  •  ${sectionMeta}`, 40, y + 16);
    pdf.setDrawColor(BRAND_PRIMARY); pdf.setLineWidth(1);
    pdf.line(40, y + 24, pageW - 40, y + 24);
    y += 36;

    // 1) Campos simples (não-tabela) — juntamos e imprimimos em uma KV table
    const simpleRows: [string, string][] = [];
    for (const f of (schema?.fields ?? [])) {
      if (f.type === 'Tabela') continue;
      const v = answers[String(f.id)];
      simpleRows.push([f.label ?? String(f.id), normalizeValue(v) || '-']);
    }
    if (simpleRows.length) {
      ensureSpace(140, sectionTitle, when);
      autoTable(pdf, {
        startY: y,
        head: [['Campo','Valor']],
        body: simpleRows,
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 10, cellPadding: 6, lineColor: [220,220,220], textColor: [20,20,20] },
        headStyles: { fillColor: hexToRgb(BRAND_PRIMARY), textColor: [20,25,36], fontStyle: 'bold', halign: 'left' },
        alternateRowStyles: { fillColor: [248,248,248] },
        margin: { left: 40, right: 40 },
        didDrawPage: () => { header(sectionTitle, when); footer(); }
      });
      y = (pdf as any).lastAutoTable.finalY + 20;
    }

    // 2) Para cada campo Tabela, imprimir como grade: [Linha/Item | ...colunas]
    for (const f of (schema?.fields ?? [])) {
      if (f.type !== 'Tabela') continue;

      const tableVal = answers[String(f.id)] || {}; // {rowId: {colId: value}}
      const cols = (f.columns ?? []).map(c => ({ id: String(c.id), label: c.label || String(c.id) }));
      const rows = (f.rows ?? []).map(rw => ({ id: String(rw.id), label: rw.label || String(rw.id) }));

      // título da tabela
      ensureSpace(100, sectionTitle, when);
      pdf.setFont('helvetica','bold'); pdf.setFontSize(12); pdf.setTextColor('#111');
      pdf.text(f.label || 'Tabela', 40, y);
      y += 8;

      // head: [ [ <label da tabela>, ...labels das colunas ] ]
      const head = [[ (f.label || 'Item'), ...cols.map(c => c.label) ]];

      // body: uma linha por "row", espalhando valores nas colunas
      const body = rows.map(rw => {
        const obj = tableVal?.[rw.id] || {};
        return [ rw.label, ...cols.map(c => normalizeValue(obj?.[c.id]) || '-') ];
      });

      autoTable(pdf, {
        startY: y + 8,
        head,
        body,
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 10, cellPadding: 6, lineColor: [220,220,220], textColor: [20,20,20] },
        headStyles: { fillColor: hexToRgb(BRAND_PRIMARY), textColor: [20,25,36], fontStyle: 'bold', halign: 'left' },
        alternateRowStyles: { fillColor: [248,248,248] },
        margin: { left: 40, right: 40 },
        columnStyles: { 0: { cellWidth: 240 } }, // primeira coluna (nomes dos itens) mais larga
        didDrawPage: () => { header(sectionTitle, when); footer(); }
      });

      y = (pdf as any).lastAutoTable.finalY + 20;
    }

    // espaço entre respostas
    if (i < dataset.length - 1 && y > pageH - 140) {
      pdf.addPage(); header(); footer(); y = 80;
    }
  }

  const filename = `relatorio_BRAVOFORM_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.pdf`;
  pdf.save(filename);

  // helpers locais
  function hexToRgb(hex: string): [number,number,number] {
    const h = hex.replace('#','');
    const n = parseInt(h.length===3 ? h.split('').map(c=>c+c).join('') : h, 16);
    return [(n>>16)&255, (n>>8)&255, n&255];
  }
  function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img); img.onerror = reject; img.src = src;
    });
  }
};

  if (loading) return <p className={styles.emptyState}>Carregando…</p>;
  if (error)   return <p className={styles.errorText}>{error}</p>;

  return (
    <div className={styles.historyContainer ?? ''}>
      {/* Filtros */}
      <div
        className={styles.filtersBar ?? ''}
        style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr 2fr auto', alignItems: 'end', marginBottom: 16 }}
      >
        <div>
          <label className={styles.userInfoLabel} htmlFor="startDate">Data inicial</label>
          <input
            id="startDate"
            type="date"
            className={styles.input ?? ''}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div>
          <label className={styles.userInfoLabel} htmlFor="endDate">Data final</label>
          <input
            id="endDate"
            type="date"
            className={styles.input ?? ''}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <div>
          <label className={styles.userInfoLabel} htmlFor="search">Pesquisar (título, usuário, respostas…)</label>
          <input
            id="search"
            type="text"
            placeholder="Digite para filtrar…"
            className={styles.input ?? ''}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className={styles.cardButton} onClick={toggleSelectAllFiltered}>
            {isAllFilteredSelected ? 'Desmarcar lista' : 'Selecionar lista'}
          </button>
          <button
            className={styles.cardButton}
            onClick={handleExportPdf}
            title="Gera um PDF com os selecionados (ou todos os filtrados, se nada estiver selecionado)"
          >
            Gerar PDF
          </button>
        </div>
      </div>

      {/* resumo */}
      <div style={{ marginBottom: 8, fontSize: 14, opacity: 0.85 }}>
        Itens: <strong>{filtered.length}</strong>
        {selected.size > 0 && <> — Selecionados: <strong>{selected.size}</strong></>}
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <p>Nenhum histórico encontrado com os filtros atuais.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {filtered.map((r) => {
            const d = toJSDate(r.createdAt);
            const schema = schemas[r.formId];
            const checked = selected.has(r.id);

            return (
              <div key={r.id} className={styles.card}>
                <div className={styles.cardBody}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <h2 className={styles.cardTitle} style={{ marginRight: 8 }}>
                      {r.formTitle || schema?.title || r.formId}
                    </h2>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOne(r.id)}
                      />
                      Selecionar
                    </label>
                  </div>

                  <p className={styles.cardSubtitle}>{formatDateTime(d)}</p>
                </div>

                <button className={styles.cardButton} onClick={() => onOpen(r)}>
                  {canEdit ? 'Editar' : 'Visualizar'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
