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
  path?: string; // Caminho completo do documento no Firestore
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

function formatPTDate(d?: Date): string {
  if (!d) return '-';
  try { return d.toLocaleDateString('pt-BR'); } catch { return '-'; }
}
function formatPTTime(d?: Date): string {
  if (!d) return '';
  try { return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
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


function normalizeValue(v:any): string {
  if (v == null || v === '') return '-';
  if (typeof v === 'string') {
    if (/^data:image\//i.test(v)) return '(imagem)';
    if (/^data:/i.test(v))       return '(arquivo)';
    if (/^https?:\/\//i.test(v) && /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(v)) return '(imagem: link)';
    return v;
  }
  if (Array.isArray(v)) return v.map(normalizeValue).join(', ');
  if (typeof v === 'object') {
    if (v.url && /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(v.url)) return '(imagem)';
    if (v.url || v.href) return v.name || v.filename || '(arquivo)';
    try { return JSON.stringify(v); } catch { return String(v); }
  }
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
            path: d.ref.path, // Adiciona o caminho completo do documento
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
// helper: tipos só-visuais (não viram resposta no PDF)
const isDisplayOnly = (f: FormField) => {
  const t = (f.type || '').toLowerCase();
  return ['cabeçalho','cabecalho','header','título','titulo','seção','secao','section','descrição','descricao','description','separator','separador','label'].includes(t);
};

// Tipos de imagem / arquivos
// Tipos de imagem / arquivos (mais robusto)
const IMAGE_TYPES = [
  'assinatura','signature',
  'imagem','image','foto','photo','camera',
  'registro fotográfico','registro fotografico'
];
const FILE_TYPES  = ['anexo','arquivo','file','upload','documento'];

const isImageField = (f: FormField) => IMAGE_TYPES.includes((f.type||'').toLowerCase());
const isFileField  = (f: FormField) => FILE_TYPES.includes((f.type||'').toLowerCase());

// Urls que realmente parecem arquivo/link
const isLikelyFileUrl = (s?: string) =>
  !!s && (
    /^https?:\/\//i.test(s) ||
    /^data:/i.test(s) ||
    /^blob:/i.test(s) ||
    /^gs:\/\//i.test(s) ||
    /^ipfs:\/\//i.test(s)
  );

const isImageUrl = (s?: string) =>
  !!s && (
    /^data:image\//i.test(s) ||
    (/^https?:\/\//i.test(s) && /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(s))
  );

// Extrai fontes de imagem de vários formatos (string/url/obj/array)
function extractImageSources(v: any): string[] {
  if (!v) return [];
  const acc: string[] = [];
  const push = (s?: string) => { if (isImageUrl(s)) acc.push(s!); };

  if (Array.isArray(v)) {
    v.forEach(item => {
      if (typeof item === 'string') push(item);
      else if (typeof item === 'object') { push(item?.url); push(item?.dataURL); }
    });
  } else if (typeof v === 'object') {
    push(v?.url); push(v?.dataURL);
  } else if (typeof v === 'string') {
    push(v);
  }
  return acc;
}

// Extrai metadados de arquivo (nome/url) — AGORA só entra se tiver URL válido
function extractFileLinks(v: any): Array<{ name: string; url?: string }> {
  const out: Array<{ name: string; url?: string }> = [];
  const add = (name?: string, url?: string) => {
    if (!isLikelyFileUrl(url)) return;            // <- filtro decisivo
    out.push({ name: name?.trim() || url!, url });
  };

  if (!v) return out;

  if (Array.isArray(v)) {
    v.forEach(it => {
      if (typeof it === 'object') add(it.name || it.filename, it.url || it.href);
      else if (typeof it === 'string') add(undefined, it);
    });
  } else if (typeof v === 'object') {
    add(v.name || v.filename, v.url || v.href);
  } else if (typeof v === 'string') {
    add(undefined, v);
  }

  return out;
}


const handleExportPdf = async () => {
  const dataset = filtered.filter(r => selected.size === 0 || selected.has(r.id));
  if (!dataset.length) { alert('Nenhum item selecionado ou filtrado para exportar.'); return; }

  const JsPDF = (await import('jspdf')).default;
  const autoTable = (await import('jspdf-autotable')).default as any;

  const pdf = new JsPDF({ unit: 'pt', format: 'a4', compress: true });
  const pageW = (pdf as any).internal.pageSize.getWidth();
  const pageH = (pdf as any).internal.pageSize.getHeight();
  const headerH = 56;

  // logo pequeno
  let logo: HTMLImageElement | null = null;
  try { logo = await loadImage(BRAVOFORM_LOGO); } catch {}
  const LOGO_MAX_H = Math.floor(headerH * 0.6); // ~34px
  const LOGO_MAX_W = 110;

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

    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); pdf.setTextColor('#fff');
    pdf.text(left ?? 'Relatório de Respostas', xAfterLogo, headerH / 2 + 4);

    if (right) {
      const tw = (pdf as any).getTextWidth(right);
      pdf.text(right, pageW - 24 - tw, headerH / 2 + 4);
    }

    pdf.setDrawColor(BRAND_PRIMARY); pdf.setLineWidth(1.2);
    pdf.line(0, headerH, pageW, headerH);
  };
  const pageNo = () => (pdf as any).internal.getCurrentPageInfo().pageNumber;
  const pageCount = () => (pdf as any).internal.getNumberOfPages();
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
    if (y + need > pageH - 72) { pdf.addPage(); header(left, right); footer(); y = 80; }
  };

  header('BRAVOFORM · Relatório de Respostas', `${dataset.length} resposta(s)`); footer();
  let y = 80;

  for (const r of dataset) {
    const d = toJSDate(r.createdAt);
    const when = formatDateTime(d);
const schema = schemas[r.formId];
const answers = r.answers || {};
const sectionTitle = r.formTitle || schema?.title || r.formId || 'Formulário';
const sectionMeta  = `Colaborador: ${r.collaboratorUsername || '-'} · ID resposta: ${r.id}`;

// título da seção
ensureSpace(160, sectionTitle, when);
pdf.setFont('helvetica','bold'); pdf.setFontSize(13.5); pdf.setTextColor('#111');
pdf.text(sectionTitle, 40, y);
pdf.setFont('helvetica','normal'); pdf.setFontSize(10.5); pdf.setTextColor('#555');
pdf.text(`${when}  •  ${sectionMeta}`, 40, y + 16);
pdf.setDrawColor(BRAND_PRIMARY); pdf.setLineWidth(1);
pdf.line(40, y + 24, pageW - 40, y + 24);
y += 36;

// === 1) CAMPOS SIMPLES (exceto imagem/anexo/tabela/visuais) ===
const simpleRows: [string, string][] = [];
const imageItems: Array<{label:string; src:string}> = [];
const fileItems: Array<{label:string; name:string; url?:string}> = [];

for (const f of (schema?.fields ?? [])) {
  if (isDisplayOnly(f)) continue;

  const v = answers[String(f.id)];
  const label = f.label ?? String(f.id);

  // 1a) Campo marcado como imagem
  if (isImageField(f)) {
    const imgs = extractImageSources(v);
    if (imgs.length) imgs.forEach(src => imageItems.push({ label, src }));
    else simpleRows.push([label, normalizeValue(v)]); // sem imagem, mostra texto
    continue;
  }

  // 1b) Campo marcado como arquivo
  if (isFileField(f)) {
    const links = extractFileLinks(v);
    if (links.length) {
      for (const l of links) {
        if (isImageUrl(l.url)) imageItems.push({ label, src: l.url! });
        else fileItems.push({ label, name: l.name, url: l.url });
      }
    } else {
      simpleRows.push([label, normalizeValue(v)]);
    }
    continue;
  }

  // 1c) Campo comum — mas tenta detectar imagens/arquivos pelo VALOR
  const maybeImgs = extractImageSources(v);
  if (maybeImgs.length) {
    maybeImgs.forEach(src => imageItems.push({ label, src }));
    continue;
  }
  const maybeFiles = extractFileLinks(v);
  if (maybeFiles.length) {
    for (const l of maybeFiles) {
      if (isImageUrl(l.url)) imageItems.push({ label, src: l.url! });
      else fileItems.push({ label, name: l.name, url: l.url });
    }
    continue;
  }

  // 1d) Se for tabela, pula (será renderizada na seção de tabelas)
  if ((f.type || '').toLowerCase() === 'tabela') continue;

  // 1e) Caso padrão: chave/valor
  simpleRows.push([label, normalizeValue(v)]);
}


if (simpleRows.length) {
  ensureSpace(140, sectionTitle, when);
  autoTable(pdf, {
    startY: y,
    head: [['Campo','Valor']],
    body: simpleRows,
    theme: 'grid',
    showHead: 'everyPage',
    margin: { left: 40, right: 40, bottom: 48 },
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 6, lineColor: [220,220,220], textColor: [20,20,20] },
    headStyles: { fillColor: hexToRgb(BRAND_PRIMARY), textColor: [20,25,36], fontStyle: 'bold', halign: 'left' },
    columnStyles: { 0: { cellWidth: 220 }, 1: { cellWidth: 'auto' } },
    didDrawPage: () => { header(sectionTitle, when); footer(); },
  });
  y = (pdf as any).lastAutoTable.finalY + 20;
}

// === 2) TABELAS (linhas x colunas) — cabeçalho em todas as páginas ===
for (const f of (schema?.fields ?? [])) {
  if (f.type !== 'Tabela') continue;
  const tableVal = answers[String(f.id)] || {};
  const cols = (f.columns ?? []).map(c => ({ id: String(c.id), label: c.label || String(c.id) }));
  const rows = (f.rows ?? []).map(rw => ({ id: String(rw.id), label: rw.label || String(rw.id) }));

  ensureSpace(100, sectionTitle, when);
  pdf.setFont('helvetica','bold'); pdf.setFontSize(12); pdf.setTextColor('#111');
  pdf.text(f.label || 'Tabela', 40, y); y += 8;

  const head = [[ (f.label || 'Item'), ...cols.map(c => c.label) ]];
  const body = rows.map(rw => {
    const obj = tableVal?.[rw.id] || {};
    return [ rw.label, ...cols.map(c => normalizeValue(obj?.[c.id])) ];
  });

  autoTable(pdf, {
    startY: y + 8,
    head, body,
    theme: 'grid',
    showHead: 'everyPage',
    margin: { left: 40, right: 40, bottom: 48 },
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 6, lineColor: [220,220,220], textColor: [20,20,20] },
    headStyles: { fillColor: hexToRgb(BRAND_PRIMARY), textColor: [20,25,36], fontStyle: 'bold', halign: 'left' },
    alternateRowStyles: { fillColor: [248,248,248] },
    columnStyles: { 0: { cellWidth: 240 } },
    didDrawPage: () => { header(sectionTitle, when); footer(); },
  });

  y = (pdf as any).lastAutoTable.finalY + 20;
}

// === 3) IMAGENS / ASSINATURAS ===
if (imageItems.length) {
  ensureSpace(28, sectionTitle, when);
  pdf.setFont('helvetica','bold'); pdf.setFontSize(12); pdf.setTextColor('#111');
  pdf.text('Imagens / Assinaturas', 40, y); y += 12;

  const maxW = pageW - 80;   // respeita margens
  const maxH = 220;

  for (const it of imageItems) {
    try {
      const img = await loadImage(it.src); // funciona com dataURL e URL (CORS ok)
      const r = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = Math.max(120, img.width * r);
      const h = img.height * r;

      ensureSpace(h + 34, sectionTitle, when);
      (pdf as any).addImage(img, 'PNG', 40, y, w, h);
      y += h + 14;

      pdf.setFont('helvetica','normal'); pdf.setFontSize(10); pdf.setTextColor('#444');
      pdf.text(it.label, 40, y);
      y += 20;
    } catch { /* ignora imagem com erro */ }
  }
}

// === 4) ANEXOS ===
if (fileItems.length) {
  ensureSpace(28, sectionTitle, when);
  pdf.setFont('helvetica','bold'); pdf.setFontSize(12); pdf.setTextColor('#111');
  pdf.text('Anexos', 40, y); y += 12;

  pdf.setFont('helvetica','normal'); pdf.setFontSize(10); pdf.setTextColor('#222');
  for (const f of fileItems) {
    ensureSpace(20, sectionTitle, when);
    const line = `• ${f.label}: ${f.name}`;
    if (f.url) (pdf as any).textWithLink(line, 40, y, { url: f.url });
    else       pdf.text(line, 40, y);
    y += 16;
  }
}
}


  pdf.save(`relatorio_BRAVOFORM_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.pdf`);

  // helpers
  function hexToRgb(hex: string): [number,number,number] {
  const h = hex.replace('#','');
  const n = parseInt(h.length===3 ? h.split('').map(c=>c+c).join('') : h, 16);
  return [(n>>16)&255, (n>>8)&255, n&255];
}
  // Carregador de imagem com CORS liberado
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
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
          <label className={styles.userInfoLabel} htmlFor="search">Pesquisar</label>
          <input
            id="search"
            type="text"
            placeholder="Digite para filtrar…"
            className={styles.input ?? ''}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

       <div className={styles.actionButtons}>
          
          <button className={styles.cardButton} onClick={toggleSelectAllFiltered}>
            {isAllFilteredSelected ? 'Desmarcar Formulários' : 'Todos os Formulários'}
          </button>
          <button
            className={styles.cardButton}
            onClick={handleExportPdf}
            title="Gera um PDF com os selecionados (ou todos os filtrados, se nada estiver selecionado)"
          >
            Gerar Relatório
          </button>
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

                  <p className={styles.cardSubtitle}>{formatPTDate(d)} • {formatPTTime(d)}</p>
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