'use client'; 

import React, { useState } from 'react'; 
import Header from '@/components/Header'; 
import Sidebar from '@/components/Sidebar'; 
import styles from '../../app/styles/Login.module.css';  // ATENÇÃO: Considere renomear este ficheiro para Dashboard.module.css para mais clareza

export default function DashboardLayout({ children }: { children: React.ReactNode }) { 
  const [pageTitle, setPageTitle] = useState('Dashboard'); 


  
  return ( 
    // CORREÇÃO: Removidas as tags <html> e <body> que não devem estar aqui.
    // Este componente retorna apenas o layout da sua dashboard.
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
