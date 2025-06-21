'use client';
import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
// CORREÇÃO: Usando o atalho @/ que aponta para a pasta 'src'
import styles from '../../styles/Forms.module.css'
import FormEditor from '@/components/FormEditor';

export default function FormsPage() {
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  return (
    <>
      <div>
        <div className={styles.header}>
          <h2 className={styles.title}>Gerenciar Formulários</h2>
          <button onClick={() => setIsEditorOpen(true)} className={styles.button}>
            <Plus size={16} />
            <span>Novo Formulário</span>
          </button>
        </div>

        <div className={styles.frame}>
          <div className={styles.filters}>
            <div className={styles.filterGroup}>
              <label htmlFor="empresa">Empresa</label>
              <select id="empresa" className={styles.filterInput}>
                <option>IPANEMA FOODS</option>
                <option>APETITO</option>
              </select>
            </div>
            <div className={styles.filterGroup}>
              <label htmlFor="depto">Departamento</label>
              <select id="depto" className={styles.filterInput}>
                <option>Qualidade</option>
                <option>Logística</option>
              </select>
            </div>
            <button className={styles.button} style={{height: '37px'}}>
                <Search size={16}/>
                <span>Buscar</span>
            </button>
          </div>
        </div>

        <div className={styles.cardGrid}>
          {/* Exemplos de cartões de formulário irão aqui */}
        </div>
      </div>

      <FormEditor isOpen={isEditorOpen} onClose={() => setIsEditorOpen(false)} />
    </>
  );
}
