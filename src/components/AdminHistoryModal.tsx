'use client';
import React, { useState, useMemo } from 'react';
import styles from '../../app/styles/AdminHistoryModal.module.css';

interface AdminHistoryModalProps {
  open: boolean;
  onClose: () => void;
  collaboratorName: string;
  companyName: string;
  responses: any[]; // [{ answers, formId, createdAt }]
  forms: any[];
}


function toDateCompat(val: any): string {
  if (!val) return '-';
  if (typeof val.toDate === 'function') return val.toDate().toLocaleString('pt-BR');
  if (val.seconds) return new Date(val.seconds * 1000).toLocaleString('pt-BR');
  if (val._seconds) return new Date(val._seconds * 1000).toLocaleString('pt-BR');
  if (typeof val === 'string') return new Date(val).toLocaleString('pt-BR');
  return '-';
}

// Cria listas para filtros
function getUniqueForms(responses: any[], forms: any[]) {
  const ids = [...new Set(responses.map(r => r.formId))];
  return forms.filter(f => ids.includes(f.id));
}

function filterByPeriod(responses: any[], period: string) {
  if (period === 'all') return responses;
  const now = new Date();
  return responses.filter(r => {
    const d = r.createdAt ? new Date(toDateCompat(r.createdAt)) : null;
    if (!d) return false;
    if (period === '7d') {
      const lastWeek = new Date(now); lastWeek.setDate(now.getDate() - 7);
      return d >= lastWeek;
    }
    if (period === 'month') {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    if (period === 'year') {
      return d.getFullYear() === now.getFullYear();
    }
    return true;
  });
}

export default function AdminHistoryModal({
  open,
  onClose,
  collaboratorName,
  companyName,
  responses,
  forms
}: AdminHistoryModalProps) {
  // Filtros:
  const [formFilter, setFormFilter] = useState<string>('all');
  const [periodFilter, setPeriodFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Formulários únicos para o filtro
  const availableForms = useMemo(() => getUniqueForms(responses, forms), [responses, forms]);

  // Filtro aplicado:
  const filteredResponses = useMemo(() => {
    let arr = [...responses];
    if (formFilter !== 'all') arr = arr.filter(r => r.formId === formFilter);
    arr = filterByPeriod(arr, periodFilter);
    if (search) {
      arr = arr.filter(r =>
        JSON.stringify(r.answers || {})
          .toLowerCase()
          .includes(search.toLowerCase())
      );
    }
    return arr;
  }, [responses, formFilter, periodFilter, search]);

  // Paginação
  const [page, setPage] = useState(1);
  const perPage = 6;
  const maxPage = Math.ceil(filteredResponses.length / perPage);
  const paginated = filteredResponses.slice((page-1)*perPage, page*perPage);

  if (!open) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalPanel} style={{maxWidth:1200, minWidth:520, height:'85vh', maxHeight: '94vh'}} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>
            Histórico de <b>{collaboratorName}</b>
            <span className={styles.company}>({companyName})</span>
          </h2>
          <button className={styles.modalClose} onClick={onClose}>✖</button>
        </div>
        {/* Filtros */}
        <div className={styles.modalFilters}>
          <select value={formFilter} onChange={e=>{ setFormFilter(e.target.value); setPage(1); }}>
            <option value="all">Todos os formulários</option>
            {availableForms.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
          </select>
          <select value={periodFilter} onChange={e=>{ setPeriodFilter(e.target.value); setPage(1); }}>
            <option value="all">Todos os períodos</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="month">Este mês</option>
            <option value="year">Este ano</option>
          </select>
          <input
            placeholder="Buscar resposta..."
            value={search}
            onChange={e => {setSearch(e.target.value); setPage(1);}}
            className={styles.searchBox}
          />
          <span className={styles.paginationInfo}>
            Mostrando {paginated.length} de {filteredResponses.length} resposta{filteredResponses.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className={styles.modalBody}>
          {filteredResponses.length === 0 && (
            <div className={styles.emptyMessage}>Nenhuma resposta encontrada.</div>
          )}
          <div className={styles.responsesList}>
            {paginated.map((resp, i) => {
              const form = forms.find(f => f.id === resp.formId);
              if (!form) return null;
              return (
                <div key={resp.id || i} className={styles.responseCard}>
                  <div className={styles.responseHeader}>
                    <div>
                      <span className={styles.formTitle}>{form.title || resp.formId}</span>
                      <span className={styles.answeredAt}>
                        Respondido em: <b>{toDateCompat(resp.createdAt || resp.submittedAt)}</b>
                      </span>
                    </div>
                  </div>
                  <div className={styles.respostaGridWrapper}>
                    <table className={styles.respostaGrid}>
                      <thead>
                        <tr>
                          <th>Pergunta</th>
                          <th>Resposta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {form.fields.map((field: any) => {
                          const answer = resp.answers?.[field.id];
                          if (field.type === 'Tabela' && typeof answer === 'object' && answer !== null) {
                            return (
                              <tr key={field.id}>
                                <td colSpan={2} className={styles.tabelaField}>
                                  <div className={styles.fieldLabel}>{field.label}</div>
                                  <div className={styles.tableWrapper}>
                                    <table className={styles.innerTable}>
                                      <thead>
                                        <tr>
                                          <th>Linha</th>
                                          {field.columns?.map((col: any) =>
                                            <th key={col.id}>{col.label}</th>
                                          )}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {field.rows?.map((row: any) =>
                                          <tr key={row.id}>
                                            <td>{row.label}</td>
                                            {field.columns?.map((col: any) =>
                                              <td key={col.id}>{answer?.[row.id]?.[col.id] ?? '-'}</td>
                                            )}
                                          </tr>
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            );
                          }
                         if (typeof answer === 'string' && answer.startsWith('data:image')) {
  return (
    <tr key={field.id}>
      <td className={styles.fieldLabel}>{field.label}</td>
      <td>
        <img
          src={answer}
          alt="imagem/assinatura"
          style={{
            maxWidth: 160,
            maxHeight: 60,
            borderRadius: 7,
            border: '1.2px solid #ececec',
            boxShadow: '0 1px 6px #cfc6b9a1',
            background: '#faf9f6'
          }}
        />
      </td>
    </tr>
  );
}

                         if (Array.isArray(answer) && answer.length > 0 && answer[0]?.type?.startsWith('image')) {
  return (
    <tr key={field.id}>
      <td className={styles.fieldLabel}>{field.label}</td>
      <td>
        {answer.map((img: any, idx: number) => (
          <img
            key={idx}
            src={img.data || img.url}
            alt={`anexo imagem ${idx + 1}`}
            style={{
              maxWidth: 120,
              maxHeight: 70,
              marginRight: 6,
              borderRadius: 6,
              border: '1.2px solid #ececec',
              background: '#faf9f6'
            }}
          />
        ))}
      </td>
    </tr>
  );
}
                          return (
                            <tr key={field.id}>
                              <td className={styles.fieldLabel}>{field.label}</td>
                              <td>{answer === undefined || answer === null || answer === '' ? <span className={styles.emptyValue}>-</span> : String(answer)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {/* Paginação */}
        {maxPage > 1 && (
          <div className={styles.paginationBar}>
            <button onClick={() => setPage(p=>Math.max(p-1,1))} disabled={page<=1}>◀</button>
            <span>Página {page} de {maxPage}</span>
            <button onClick={() => setPage(p=>Math.min(p+1,maxPage))} disabled={page>=maxPage}>▶</button>
          </div>
        )}
      </div>
    </div>
  );
}