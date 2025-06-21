'use client';

import React from 'react';
import { X, Type, Paperclip, PenSquare } from 'lucide-react';
import styles from '../../app/styles/FormEditor.module.css';

interface FormEditorProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FormEditor({ isOpen, onClose }: FormEditorProps) {
  const [fields, setFields] = React.useState<string[]>([]);
  const [formTitle, setFormTitle] = React.useState("Novo Documento");

  const addField = (fieldType: string) => {
    setFields([...fields, fieldType]);
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.panel} slideIn`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>Editor de Formulário</h3>
          <button onClick={onClose} className={styles.closeButton}><X /></button>
        </div>
        
        <div className={styles.editorGrid}>
          {/* Coluna de Controles */}
          <div className={styles.controlsColumn}>
            <div>
              <label htmlFor="form-title" className={styles.label}>Título do Formulário</label>
              <input 
                type="text" 
                id="form-title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className={styles.input}
              />
            </div>

            <div>
              <h4 className={styles.subTitle}>Adicionar Campos</h4>
              <div className={styles.fieldButtons}>
                <button onClick={() => addField('Texto')} className={styles.button}><Type size={16} /><span>Texto</span></button>
                <button onClick={() => addField('Anexo')} className={styles.button}><Paperclip size={16} /><span>Anexo de Arquivo</span></button>
                <button onClick={() => addField('Assinatura')} className={styles.button}><PenSquare size={16} /><span>Assinatura Digital</span></button>
              </div>
            </div>

            <div>
              <h4 className={styles.subTitle}>Automação</h4>
              <div className={styles.automationBox}>
                <p>Gatilho: Ao receber uma nova resposta</p>
                <div className="mt-4">
                  <label className={styles.label}>Ação:</label>
                  <div className="flex gap-2 mt-1">
                    <select className={styles.input + ' flex-grow'}>
                      <option>Enviar por E-mail</option>
                      <option>Enviar por WhatsApp</option>
                    </select>
                    <input type="text" placeholder="Destinatário..." className={styles.input + ' flex-grow'} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Coluna de Pré-visualização */}
          <div className={styles.previewColumn}>
            <div className={styles.previewFrame}>
              <h2 className={styles.previewTitle}>{formTitle}</h2>
              <div className={styles.previewFieldsContainer}>
                {fields.map((field, index) => (
                  <div key={index} className={styles.previewField}>
                    {field === 'Texto' && <><label className={styles.previewLabel}>Nova Pergunta</label><div className={styles.previewInput}></div></>}
                    {field === 'Anexo' && <><label className={styles.previewLabel}>Anexo</label><div className={styles.previewAttachment}><Paperclip size={24}/></div></>}
                    {field === 'Assinatura' && <><label className={styles.previewLabel}>Assinatura</label><div className={styles.previewSignature}></div></>}
                  </div>
                ))}
              </div>
              <button className={styles.previewButton}>Submeter</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}  
