// components/HistoryPanel.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../../firebase/config';
import {
  collectionGroup,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  Timestamp
} from 'firebase/firestore';
import styles from '../../app/styles/CollaboratorView.module.css';

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
        const snap = await getDoc(doc(db, 'forms', fid));
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
  const handleExportPdf = async () => {
    const dataset = filtered.filter((r) => selected.size === 0 || selected.has(r.id));
    if (dataset.length === 0) {
      alert('Nenhum item selecionado ou filtrado para exportar.');
      return;
    }

    // importa libs só quando precisa
    const [{ default: jsPDF }, autoTableMod] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const autoTable = (autoTableMod as any).default || (autoTableMod as any);

    const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true }); // pt=1/72"
    const brand = {
      primary: '#10b3ff',     // cor do botão do seu print
      dark: '#0f172a',        // fundo escuro
      text: '#0b1220',        // título no header claro
      muted: '#64748b'
    };

    // helpers
    const mm = (v: number) => v * 2.83465; // pt -> mm if you ever need
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    const drawHeader = (title: string, sub: string) => {
      // faixa superior
      doc.setFillColor(16, 179, 255); // #10b3ff
      doc.rect(0, 0, pageW, 64, 'F');

      // BRAVOFORM “badge”
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.text('BRAVOFORM', 28, 38);

      // título do relatório
      doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'normal');
      doc.text(title, 28, 58);

      if (sub) {
        doc.setFontSize(10);
        doc.setTextColor(255, 255, 255);
        doc.text(sub, pageW - 28, 58, { align: 'right' });
      }
    };

    const drawFooter = (pageNo: number, total: number) => {
      const text = `Gerado a partir do BRAVOFORM · ${new Date().toLocaleString('pt-BR')} · pág. ${pageNo}/${total}`;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(120, 144, 156);
      doc.text(text, pageW / 2, pageH - 16, { align: 'center' });
    };

    // primeira página – cabeçalho geral
    drawHeader(
      'Relatório de Respostas',
      `${dataset.length} resposta(s) · ${collaboratorId ? `colaborador: ${dataset[0]?.collaboratorUsername || collaboratorId}` : ''}`
    );

    let first = true;
    let pageIndex = 1;

    for (let i = 0; i < dataset.length; i++) {
      const r = dataset[i];
      const schema = schemas[r.formId];
      const flat = flattenAnswersWithLabels(r.answers, schema);

      if (!first) {
        doc.addPage();
        pageIndex++;
        drawHeader('Relatório de Respostas', `${dataset.length} resposta(s)`);
      }
      first = false;

      // bloco: metadados do formulário
      const topY = 84;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(20, 23, 35);
      doc.text(r.formTitle || schema?.title || r.formId, 28, topY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(80, 94, 108);

      const metaLeft = 28;
      const metaGap = 16;
      const meta = [
        `Data/Hora: ${formatDateTime(toJSDate(r.createdAt))}`,
        `Formulário (ID): ${r.formId}`,
        `Colaborador: ${r.collaboratorUsername || '-'}`,
        `RespostaID: ${r.id}`
      ];
      meta.forEach((line, idx) => doc.text(line, metaLeft, topY + 18 + idx * metaGap));

      // tabela Campo/Valor
      const bodyRows = Object.entries(flat)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, v]);

      autoTable(doc, {
        startY: topY + 18 + meta.length * metaGap + 10,
        head: [['Campo', 'Valor']],
        body: bodyRows.length ? bodyRows : [['(sem dados)', '']],
        styles: {
          font: 'helvetica',
          fontSize: 10,
          cellPadding: 6,
          textColor: [22, 28, 45]
        },
        headStyles: {
          fillColor: [16, 179, 255],
          textColor: [255, 255, 255],
          fontStyle: 'bold'
        },
        alternateRowStyles: { fillColor: [245, 249, 255] },
        columnStyles: {
          0: { cellWidth: 220 }, // Campo
          1: { cellWidth: 'auto' } // Valor
        },
        margin: { left: 28, right: 28, top: 0, bottom: 48 },
        didDrawPage: (data: any) => {
          // rodapé por página
          const total = doc.internal.getNumberOfPages();
          const thisNo = doc.internal.getCurrentPageInfo().pageNumber;
          drawFooter(thisNo, total);
        }
      });
    }

    // salva
    const fname = `relatorio_BRAVOFORM_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.pdf`;
    doc.save(fname);
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
