'use client';

import React, { useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import styles from '../../app/styles/Login.module.css'; 

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [pageTitle, setPageTitle] = useState('Dashboard');

  return (
    <div className={styles.layout}>
      <Sidebar onNavigate={setPageTitle} />
      <div className={styles.mainContent}>
        <Header pageTitle={pageTitle} />
        <main className={styles.pageContainer}>
          {children}
        </main>
      </div>
    </div>
  );
}