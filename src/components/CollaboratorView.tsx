'use client';

import React from "react";
import Modal from "@/components/Modal";
import styles from "../../app/styles/Modal.module.css";

interface Field {
  id: string | number;
  label: string;
  type?: string;
}
interface FormType {
  title: string;
  fields: Field[];
}
interface ResponseType {
  answers?: Record<string, any>;
  createdAt?: { seconds: number };
}
interface Props {
  isOpen: boolean;
  onClose: () => void;
  form: FormType;
  response: ResponseType;
  canEdit?: boolean;
}

function renderAnswer(field: Field, value: any) {
  if (value == null || value === "") return <span style={{ opacity: 0.6 }}>Sem resposta</span>;
  // Assinatura base64
  if (typeof value === "string" && value.startsWith("data:image")) {
    return <img src={value} alt="Assinatura" style={{ maxWidth: 170, borderRadius: 6, background: "#181b22", margin: 4, boxShadow: "0 2px 8px #111" }} />;
  }
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object" && value?.type?.includes("image")) {
    if (value.url?.startsWith("data:image")) {
      return <img src={value.url} alt={value.name || "imagem"} style={{ maxWidth: 170, borderRadius: 7, margin: 4, background: "#191b24" }} />;
    }
    return (
      <a href={value.url} target="_blank" rel="noopener noreferrer" style={{ color: "#61b0ff" }}>
        {value.name || "Ver imagem"}
      </a>
    );
  }
  if (typeof value === "object" && value?.name && value?.url) {
    return (
      <a href={value.url} target="_blank" rel="noopener noreferrer" style={{ color: "#61b0ff" }}>
        {value.name}
      </a>
    );
  }
  if (field.type === "Tabela" && typeof value === "object" && value !== null) {
    return (
      <table style={{ width: "100%", border: "1px solid #1a202c", margin: "5px 0", background: "#191c24", borderRadius: 7 }}>
        <tbody>
          {Object.values(value).map((row: any, idx: number) => (
            <tr key={idx}>
              {Array.isArray(row)
                ? row.map((cell, j) => <td key={j} style={{ color: "#fff" }}>{String(cell)}</td>)
                : <td>{String(row)}</td>
              }
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (typeof value === "object") return <span style={{ opacity: 0.7 }}>{JSON.stringify(value, null, 2)}</span>;
  return String(value);
}

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
            {form.fields.map((field) => (
              <tr key={String(field.id)}>
                <th>{field.label}</th>
                <td>{renderAnswer(field, response.answers?.[field.id] ?? response.answers?.[String(field.id)])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
