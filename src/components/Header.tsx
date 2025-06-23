'use client';

import React from 'react';
import { Bell } from 'lucide-react';
import Image from 'next/image'; // CORREÇÃO: Usando o componente Image
import styles from '../../app/styles/Login.module.css';

interface HeaderProps {
  pageTitle: string;
}

export default function Header({ pageTitle }: HeaderProps) {
  return (
    <header className={styles.header}>
      <h2 className={styles.headerTitle}>{pageTitle}</h2>
      <div className={styles.headerActions}>
        <button className={styles.headerButton}><Bell /></button>
        <div className={styles.userProfile}>
          <Image src="https://placehold.co/40x40/C5A05C/0A2E36?text=B" alt="Avatar" width={40} height={40} className={styles.userAvatar} />
          <div className={styles.userInfo}>
            <h3>Usuário Bravo</h3>
            <p>Administrador</p>
          </div>
        </div>
      </div>
    </header>
  );
}