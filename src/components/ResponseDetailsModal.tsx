'use client';
import React from 'react';
import { X, FileText, User, Calendar, Building, Users, CheckCircle, XCircle, Clock, Send } from 'lucide-react';
import { FormResponse, Form, Company, Department } from '@/types';
import styles from '../../app/styles/ResponseDetailsModal.module.css';

interface ResponseDetailsModalProps {
  open: boolean;
  onClose: () => void;
  response: FormResponse | null;
  form: Form | null;
  company: Company | null;
  department: Department | null;
}

function toDateCompat(val: any): string {
  if (!val) return '-';
  
  try {
    // Firestore Timestamp com método toDate()
    if (typeof val.toDate === 'function') {
      return val.toDate().toLocaleString('pt-BR');
    }
    
    // Firestore Timestamp serializado (seconds)
    if (val.seconds) {
      return new Date(val.seconds * 1000).toLocaleString('pt-BR');
    }
    
    // Firestore Timestamp serializado (_seconds)
    if (val._seconds) {
      return new Date(val._seconds * 1000).toLocaleString('pt-BR');
    }
    
    // Timestamp em milissegundos
    if (typeof val === 'number') {
      return new Date(val).toLocaleString('pt-BR');
    }
    
    // String ISO ou outra string de data
    if (typeof val === 'string') {
      const date = new Date(val);
      if (!isNaN(date.getTime())) {
        return date.toLocaleString('pt-BR');
      }
    }
    
    // Objeto Date
    if (val instanceof Date) {
      return val.toLocaleString('pt-BR');
    }
  } catch (error) {
    console.error('Erro ao converter data:', error, val);
  }
  
  return '-';
}

export default function ResponseDetailsModal({
  open,
  onClose,
  response,
  form,
  company,
  department
}: ResponseDetailsModalProps) {
  if (!open || !response) return null;

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'approved':
        return { icon: <CheckCircle size={20} className={styles.approved} />, text: 'Aprovado', class: styles.statusApproved };
      case 'rejected':
        return { icon: <XCircle size={20} className={styles.rejected} />, text: 'Rejeitado', class: styles.statusRejected };
      case 'submitted':
        return { icon: <Send size={20} className={styles.submitted} />, text: 'Enviado', class: styles.statusSubmitted };
      case 'pending':
      default:
        return { icon: <Clock size={20} className={styles.pending} />, text: 'Pendente', class: styles.statusPending };
    }
  };

  const statusInfo = getStatusInfo(response.status);

  const renderAnswer = (field: any, answer: any) => {
    if (answer === undefined || answer === null || answer === '') {
      return <span className={styles.emptyValue}>-</span>;
    }

    // Grade de Pedidos
    if (field.type === 'Grade de Pedidos' && Array.isArray(answer)) {
      if (answer.length === 0) {
        return <span className={styles.emptyValue}>Nenhum item adicionado</span>;
      }
      return (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Código</th>
                <th>Quantidade</th>
                <th>Unidade</th>
              </tr>
            </thead>
            <tbody>
              {answer.map((item: any, idx: number) => (
                <tr key={item.id || idx}>
                  <td>{item.nome || '-'}</td>
                  <td>{item.codigo || '-'}</td>
                  <td style={{ textAlign: 'right' }}>{item.quantidade || 0}</td>
                  <td>{item.unidade || 'UN'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, background: '#f3f4f6' }}>
                <td colSpan={2} style={{ textAlign: 'left' }}>Total de Produtos: {answer.length}</td>
                <td style={{ textAlign: 'right' }}>Total: {answer.reduce((sum: number, item: any) => sum + (parseFloat(item.quantidade) || 0), 0)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      );
    }

    if (field.type === 'Tabela' && typeof answer === 'object' && answer !== null) {
      return (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Linha</th>
                {field.columns?.map((col: any) => (
                  <th key={col.id}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {field.rows?.map((row: any) => (
                <tr key={row.id}>
                  <td>{row.label}</td>
                  {field.columns?.map((col: any) => (
                    <td key={col.id}>{answer?.[row.id]?.[col.id] ?? '-'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (typeof answer === 'string' && answer.startsWith('data:image')) {
      return (
        <img
          src={answer}
          alt="imagem/assinatura"
          className={styles.imageAnswer}
        />
      );
    }

    if (Array.isArray(answer) && answer.length > 0 && answer[0]?.type?.startsWith('image')) {
      return (
        <div className={styles.imageGallery}>
          {answer.map((img: any, idx: number) => (
            <img
              key={idx}
              src={img.data || img.url}
              alt={`anexo imagem ${idx + 1}`}
              className={styles.galleryImage}
            />
          ))}
        </div>
      );
    }

    return <span className={styles.answerText}>{String(answer)}</span>;
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalPanel}>
        <div className={styles.modalHeader}>
          <div className={styles.headerInfo}>
            <h2 className={styles.modalTitle}>
              <FileText size={24} />
              {response.formTitle || form?.title || 'Formulário Desconhecido'}
            </h2>
            <div className={styles.responseMeta}>
              <span className={`${styles.statusBadge} ${statusInfo.class}`}>
                {statusInfo.icon}
                {statusInfo.text}
              </span>
            </div>
          </div>
          <button className={styles.modalClose} onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className={styles.modalContent}>
          {/* Informações Gerais */}
          <div className={styles.infoSection}>
            <h3 className={styles.sectionTitle}>Informações da Resposta</h3>
            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <User size={16} className={styles.infoIcon} />
                <div>
                  <label>Colaborador</label>
                  <span>{response.collaboratorUsername || 'Usuário Desconhecido'}</span>
                </div>
              </div>
              
              <div className={styles.infoItem}>
                <Building size={16} className={styles.infoIcon} />
                <div>
                  <label>Empresa</label>
                  <span>{company?.name || 'Empresa Desconhecida'}</span>
                </div>
              </div>
              
              <div className={styles.infoItem}>
                <Users size={16} className={styles.infoIcon} />
                <div>
                  <label>Departamento</label>
                  <span>{response.department || department?.name || 'Departamento Desconhecido'}</span>
                </div>
              </div>
              
              <div className={styles.infoItem}>
                <Calendar size={16} className={styles.infoIcon} />
                <div>
                  <label>Data de Envio</label>
                  <span>{toDateCompat(response.submittedAt || response.createdAt)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Respostas do Formulário */}
          <div className={styles.answersSection}>
            <h3 className={styles.sectionTitle}>Respostas do Formulário</h3>
            {form?.fields ? (
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
                      const answer = response.answers?.[field.id];
                      
                      // Grade de Pedidos
                      if (field.type === 'Grade de Pedidos' && Array.isArray(answer)) {
                        return (
                          <tr key={field.id}>
                            <td colSpan={2} className={styles.tabelaField}>
                              <div className={styles.fieldLabel}>{field.label}</div>
                              {answer.length === 0 ? (
                                <span className={styles.emptyValue}>Nenhum item adicionado</span>
                              ) : (
                                <div className={styles.tableWrapper}>
                                  <table className={styles.innerTable}>
                                    <thead>
                                      <tr>
                                        <th>Produto</th>
                                        <th>Código</th>
                                        <th style={{ textAlign: 'right' }}>Quantidade</th>
                                        <th>Unidade</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {answer.map((item: any, idx: number) => (
                                        <tr key={item.id || idx}>
                                          <td>{item.nome || '-'}</td>
                                          <td>{item.codigo || '-'}</td>
                                          <td style={{ textAlign: 'right' }}>{item.quantidade || 0}</td>
                                          <td>{item.unidade || 'UN'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      }
                      
                      // Tabela
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
                                      {field.columns?.map((col: any) => (
                                        <th key={col.id}>{col.label}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {field.rows?.map((row: any) => (
                                      <tr key={row.id}>
                                        <td>{row.label}</td>
                                        {field.columns?.map((col: any) => (
                                          <td key={col.id}>{answer?.[row.id]?.[col.id] ?? '-'}</td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        );
                      }
                      
                      // Imagem/Assinatura (base64)
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
                      
                      // Array de imagens
                      if (Array.isArray(answer) && answer.length > 0 && answer[0]?.type?.startsWith('image')) {
                        return (
                          <tr key={field.id}>
                            <td className={styles.fieldLabel}>{field.label}</td>
                            <td>
                              {answer.map((img: any, idx: number) => (
                                <img
                                  key={idx}
                                  src={img.url || img.data}
                                  alt={`imagem-${idx}`}
                                  style={{
                                    maxWidth: 120,
                                    maxHeight: 80,
                                    marginRight: 8,
                                    borderRadius: 6,
                                    border: '1px solid #ddd'
                                  }}
                                />
                              ))}
                            </td>
                          </tr>
                        );
                      }
                      
                      // Resposta padrão
                      return (
                        <tr key={field.id}>
                          <td className={styles.fieldLabel}>{field.label}</td>
                          <td className={styles.fieldValue}>
                            {answer === undefined || answer === null || answer === '' ? (
                              <span className={styles.emptyValue}>-</span>
                            ) : Array.isArray(answer) ? (
                              answer.join(', ')
                            ) : typeof answer === 'object' ? (
                              JSON.stringify(answer)
                            ) : (
                              String(answer)
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : response.answers && Object.keys(response.answers).length > 0 ? (
              <div className={styles.respostaGridWrapper}>
                <table className={styles.respostaGrid}>
                  <tbody>
                    {Object.entries(response.answers).map(([key, answer]: [string, any]) => {
                      // Grade de Pedidos (detectar pelo formato do array)
                      if (Array.isArray(answer) && answer.length > 0 && answer[0]?.nome !== undefined) {
                        return (
                          <tr key={key}>
                            <td colSpan={2} className={styles.tabelaField}>
                              <div className={styles.fieldLabel}>Grade de Pedidos</div>
                              <div className={styles.tableWrapper}>
                                <table className={styles.innerTable}>
                                  <thead>
                                    <tr>
                                      <th>Produto</th>
                                      <th>Código</th>
                                      <th style={{ textAlign: 'right' }}>Quantidade</th>
                                      <th>Unidade</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {answer.map((item: any, idx: number) => (
                                      <tr key={item.id || idx}>
                                        <td>{item.nome || '-'}</td>
                                        <td>{item.codigo || '-'}</td>
                                        <td style={{ textAlign: 'right' }}>{item.quantidade || 0}</td>
                                        <td>{item.unidade || 'UN'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        );
                      }
                      
                      // Imagem/Assinatura (base64)
                      if (typeof answer === 'string' && answer.startsWith('data:image')) {
                        return (
                          <tr key={key}>
                            <td className={styles.fieldLabel}>{key}</td>
                            <td>
                              <img
                                src={answer}
                                alt="imagem/assinatura"
                                style={{
                                  maxWidth: 160,
                                  maxHeight: 60,
                                  borderRadius: 7,
                                  border: '1.2px solid #ececec'
                                }}
                              />
                            </td>
                          </tr>
                        );
                      }
                      
                      // Array simples
                      if (Array.isArray(answer)) {
                        return (
                          <tr key={key}>
                            <td className={styles.fieldLabel}>{key}</td>
                            <td className={styles.fieldValue}>{answer.join(', ')}</td>
                          </tr>
                        );
                      }
                      
                      // Objeto
                      if (typeof answer === 'object' && answer !== null) {
                        return (
                          <tr key={key}>
                            <td className={styles.fieldLabel}>{key}</td>
                            <td className={styles.fieldValue}>
                              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.875rem' }}>
                                {JSON.stringify(answer, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        );
                      }
                      
                      // Valor simples
                      return (
                        <tr key={key}>
                          <td className={styles.fieldLabel}>{key}</td>
                          <td className={styles.fieldValue}>
                            {answer === undefined || answer === null || answer === '' ? (
                              <span className={styles.emptyValue}>-</span>
                            ) : (
                              String(answer)
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.noFieldsMessage}>
                <p style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>
                  Nenhuma resposta disponível.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
