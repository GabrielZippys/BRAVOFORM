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
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalPanel} onClick={e => e.stopPropagation()}>
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
                  <label>Data de Criação</label>
                  <span>{toDateCompat(response.createdAt)}</span>
                </div>
              </div>
              
              <div className={styles.infoItem}>
                <Calendar size={16} className={styles.infoIcon} />
                <div>
                  <label>Data de Envio</label>
                  <span>{toDateCompat(response.submittedAt)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Respostas do Formulário */}
          <div className={styles.answersSection}>
            <h3 className={styles.sectionTitle}>Respostas do Formulário</h3>
            <div className={styles.answersList}>
              {form?.fields ? form.fields.map((field: any) => {
                const answer = response.answers?.[field.id];
                return (
                  <div key={field.id} className={styles.answerItem}>
                    <div className={styles.questionHeader}>
                      <label className={styles.questionLabel}>{field.label}</label>
                      {field.required && <span className={styles.requiredBadge}>Obrigatório</span>}
                    </div>
                    <div className={styles.questionAnswer}>
                      {renderAnswer(field, answer)}
                    </div>
                  </div>
                );
              }) : (
                <div className={styles.noFieldsMessage}>
                  {(() => {
                    // If we have fieldMetadata, use answers object (with IDs) + metadata (with labels)
                    // Otherwise, use direct fields (saved by label)
                    const hasMetadata = !!(response as any).fieldMetadata;
                    
                    let fieldsToShow: [string, any][];
                    
                    if (hasMetadata) {
                      // Use answers object when we have metadata
                      fieldsToShow = Object.entries(response.answers || {});
                    } else {
                      // Use direct fields (by label) when no metadata
                      fieldsToShow = Object.entries(response as any)
                        .filter(([key]) => 
                          !['id', 'formId', 'formTitle', 'collaboratorId', 'collaboratorUsername', 
                            'companyId', 'departmentId', 'department', 'status', 'createdAt', 
                            'submittedAt', 'updatedAt', 'answers', 'fieldMetadata'].includes(key)
                        )
                        .filter(([_, value]) => value !== '' && value !== null && value !== undefined);
                    }
                    
                    if (fieldsToShow.length === 0) {
                      return <p style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>Nenhuma resposta encontrada.</p>;
                    }
                    
                    return fieldsToShow.map(([key, value]) => {
                      // Handle different value types
                      let content;
                      
                      // Try to get metadata for this field
                      const metadata = (response as any).fieldMetadata?.[key];
                      
                      // Check if this is a table field
                      const isTable = typeof value === 'object' && value !== null && !Array.isArray(value);
                      const hasTableMetadata = metadata?.type === 'Tabela' && Array.isArray(metadata?.rows) && Array.isArray(metadata?.columns);
                      
                      console.log('Field:', key, 'IsTable:', isTable, 'HasMetadata:', hasTableMetadata, 'Metadata:', metadata);
                      
                      if (typeof value === 'object' && value !== null) {
                        if (Array.isArray(value)) {
                          // Check if it's a Grade de Pedidos (array of order items)
                          const isOrderGrid = metadata?.type === 'Grade de Pedidos' || 
                                             (value.length > 0 && value[0]?.nome && value[0]?.quantidade);
                          
                          if (isOrderGrid) {
                            // Render as order grid table
                            content = value.length === 0 ? (
                              <span className={styles.emptyValue}>Nenhum item adicionado</span>
                            ) : (
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
                                    {value.map((item: any, idx: number) => (
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
                                      <td colSpan={2} style={{ textAlign: 'left' }}>Total de Produtos: {value.length}</td>
                                      <td style={{ textAlign: 'right' }}>Total: {value.reduce((sum: number, item: any) => sum + (parseFloat(item.quantidade) || 0), 0)}</td>
                                      <td></td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            );
                          } else {
                            // Array - show as comma-separated list
                            content = <span className={styles.answerText}>{value.join(', ')}</span>;
                          }
                        } else if (hasTableMetadata) {
                          // Table with metadata - render as proper HTML table
                          console.log('✅ Rendering table with metadata for:', key, metadata);
                          content = (
                            <div className={styles.tableContainer}>
                              <table className={styles.table}>
                                <thead>
                                  <tr>
                                    <th>Linha</th>
                                    {metadata.columns.map((col: any) => (
                                      <th key={col.id}>{col.label}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {metadata.rows.map((row: any) => (
                                    <tr key={row.id}>
                                      <td>{row.label}</td>
                                      {metadata.columns.map((col: any) => (
                                        <td key={col.id}>{value?.[row.id]?.[col.id] ?? '-'}</td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          );
                        } else {
                          // Object without metadata - show as cards
                          content = (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              {Object.entries(value).map(([rowKey, rowValue]: [string, any]) => {
                                if (typeof rowValue === 'object' && rowValue !== null) {
                                  return (
                                    <div key={rowKey} style={{ 
                                      padding: '0.75rem', 
                                      background: '#f8f9fa', 
                                      borderRadius: '6px',
                                      border: '1px solid #e0e0e0'
                                    }}>
                                      <strong style={{ display: 'block', marginBottom: '0.5rem', color: '#333' }}>
                                        {rowKey}
                                      </strong>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.9rem' }}>
                                        {Object.entries(rowValue).map(([colKey, colValue]) => (
                                          <div key={colKey} style={{ display: 'flex', gap: '0.5rem' }}>
                                            <span style={{ color: '#666', minWidth: '150px' }}>{colKey}:</span>
                                            <span style={{ color: '#333', fontWeight: 500 }}>{String(colValue)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                }
                                return (
                                  <div key={rowKey} style={{ padding: '0.5rem', background: '#f8f9fa', borderRadius: '4px' }}>
                                    <strong>{rowKey}:</strong> {String(rowValue)}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }
                      } else {
                        // Simple value
                        content = <span className={styles.answerText}>{String(value)}</span>;
                      }
                      
                      return (
                        <div key={key} className={styles.answerItem}>
                          <div className={styles.questionHeader}>
                            <label className={styles.questionLabel}>{metadata?.label || key}</label>
                          </div>
                          <div className={styles.questionAnswer}>
                            {content}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
