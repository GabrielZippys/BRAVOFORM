'use client';

import React from "react";
import Modal from "@/components/Modal";
import styles from "../../app/styles/Modal.module.css";

// ----------------------------------
// TIPOS
// ----------------------------------

export interface Field {
  id: string | number;
  label: string;
  type?: string;
  columns?: { id: number; label: string; type: string; options?: string[] }[];
  rows?: { id: number; label: string }[];
  options?: string[];
}

export interface FormType {
  title: string;
  fields: Field[];
}

export interface ResponseType {
  answers?: Record<string, any>;
  createdAt?: { seconds: number };
  // Dinamicamente aceita qualquer campo extra (flattened)
  [key: string]: any;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  form: FormType;
  response: ResponseType;
  canEdit?: boolean;
}

// ----------------------------------
// RENDERIZAÇÃO DA RESPOSTA
// ----------------------------------

function renderAnswer(field: Field, value: any) {
  if (value == null || value === "") return <span style={{ opacity: 0.6 }}>Sem resposta</span>;

  // Renderização especial para tabelas
  if (field.type === "Tabela" && typeof value === "object" && value !== null) {
    const columns = field.columns || [];
    const rows = field.rows || [];
    return (
      <div style={{ overflowX: "auto", margin: "6px 0" }}>
        <table style={{
          width: "100%", background: "#191c24", borderRadius: 7, borderCollapse: "collapse", marginTop: 4
        }}>
          <thead>
            <tr>
              <th style={{ background: "#16181e", color: "#7ddfff", padding: "6px 12px", minWidth: 70, fontWeight: 600, fontSize: 14, border: "1px solid #20232d" }}></th>
              {columns.map((col) => (
                <th key={col.id} style={{ background: "#16181e", color: "#7ddfff", padding: "6px 12px", fontWeight: 600, fontSize: 14, border: "1px solid #20232d" }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td style={{ color: "#fff", fontWeight: 600, padding: "5px 12px", border: "1px solid #20232d", background: "#23263b" }}>{row.label}</td>
                {columns.map((col) => {
                  const cellValue =
                    value?.[String(row.id)]?.[String(col.id)] ??
                    value?.[row.id]?.[col.id] ??
                    "";
                  return (
                    <td key={col.id} style={{ color: "#fff", padding: "5px 12px", border: "1px solid #20232d" }}>
                      {cellValue !== "" && cellValue !== undefined
                        ? String(cellValue)
                        : <span style={{ opacity: 0.45 }}>–</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Outras respostas (igual já estava)
  if (typeof value === "string" && value.startsWith("data:image")) {
    return <img src={value} alt="Assinatura" style={{ maxWidth: 170, borderRadius: 6, background: "#181b22", margin: 4, boxShadow: "0 2px 8px #111" }} />;
  }
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object" && value?.name && value?.url) {
    return (
      <a href={value.url} target="_blank" rel="noopener noreferrer" style={{ color: "#61b0ff" }}>
        {value.name}
      </a>
    );
  }
  if (typeof value === "object") {
    return <span style={{ opacity: 0.7, wordBreak: "break-all" }}>{JSON.stringify(value, null, 2)}</span>;
  }
  return String(value);
}


// ----------------------------------
// COMPONENTE MODAL
// ----------------------------------

export default function CollaboratorHistoryModal({ isOpen, onClose, form, response, canEdit }: Props) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={form.title}>
      <div className={styles.modalContent}>
        <div style={{ color: "#47ecb1", fontWeight: 700, marginBottom: 10, fontSize: 15 }}>
          Respondido em:{" "}
          {response.createdAt
            ? new Date(response.createdAt.seconds * 1000).toLocaleString("pt-BR")
            : "Sem data"}
        </div>
        {canEdit && (
          <div style={{ color: "#45e2f2", fontWeight: 500, fontSize: 14, marginBottom: 10 }}>
            ✏️ Você tem permissão para editar esta resposta
          </div>
        )}
        <table className={styles.responseTable}>
          <tbody>
            {form.fields.map((field) => {
              // Busca tanto por id, String(id) quanto por label (flattened)
              const answer =
                (response.answers?.[field.id] ??
                  response.answers?.[String(field.id)] ??
                  response[field.label]) ?? "";
              return (
                <tr key={String(field.id)}>
                  <th>{field.label}</th>
                  <td>{renderAnswer(field, answer)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
