
'use client';
import { useState } from 'react';
import styles from '../styles/Login.module.css'; // Importa do novo local

const StatCard = ({ title, value }: { title: string; value: string; }) => (
    <div className={styles.statCard}>
        <h3 className={styles.statCardTitle}>{title}</h3>
        <p className={styles.statCardValue}>{value}</p>
    </div>
);

export default function DashboardPage() {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div>
      <div className={styles.statsGrid}>
        <StatCard title="Envios (Hoje)" value="12" />
        <StatCard title="Formulários Ativos" value="8" />
        <StatCard title="Total (Mês)" value="241" />
        <StatCard title="Usuários Ativos" value="15" />
      </div>
      <div className={styles.analysisFrame}>
        <h3 className={styles.analysisTitle}>Análise de Dados</h3>
        <div className={styles.filtersContainer}>
          <div className={styles.filterGroup}>
            <label htmlFor="empresa" className={styles.filterLabel}>Empresa</label>
            <select id="empresa" className={styles.filterSelect}>
              <option>Todas</option>
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label htmlFor="departamento" className={styles.filterLabel}>Departamento</label>
            <select id="departamento" className={styles.filterSelect}>
              <option>Todos</option>
            </select>
          </div>
          <button 
            className={styles.filterButton} 
            onClick={() => setShowPreview(!showPreview)}
          >
            Gerar Relatório
          </button>
        </div>
      </div>
    </div>
  );
}