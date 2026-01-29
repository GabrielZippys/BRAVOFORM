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
  if (typeof val.toDate === 'function') return val.toDate().toLocaleString('pt-BR');
  if (val.seconds) return new Date(val.seconds * 1000).toLocaleString('pt-BR');
  if (val._seconds) return new Date(val._seconds * 1000).toLocaleString('pt-BR');
  if (typeof val === 'string') return new Date(val).toLocaleString('pt-BR');
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
  if (!open || !response || !form) return null;

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
              {form.title}
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
                  <span>{department?.name || 'Departamento Desconhecido'}</span>
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
              {form.fields.map((field: any) => {
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
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
