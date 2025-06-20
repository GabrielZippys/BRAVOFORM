
'use client';

import React from 'react';
import { Bell } from 'lucide-react';
// CORREÇÃO: Importando do novo local centralizado em src/styles
import styles from '../../app/Login.module.css';

interface HeaderProps {
  pageTitle: string;
}

export default function Header({ pageTitle }: HeaderProps) {
  return (
    <header className={styles.header}>
      <h2 className={styles.headerTitle}>{pageTitle}</h2>
      <div className={styles.headerActions}>
        <button className={styles.headerButton}>
          <Bell />
        </button>
        <div className={styles.userProfile}>
          <img src="https://placehold.co/40x40/C5A05C/0A2E36?text=B" alt="Avatar" className={styles.userAvatar} />
          <div className={styles.userInfo}>
            <h3>Usuário Bravo</h3>
            <p>Administrador</p>
          </div>
        </div>
      </div>
    </header>
  );
}

