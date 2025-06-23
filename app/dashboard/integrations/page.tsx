'use client';

import React, { useState, useEffect } from 'react';
// CORREÇÃO: Usando o alias para apontar para o local correto do CSS
import styles from '../../styles/Integrations.module.css';

// Simulação de mensagens para o log de status
const logMessages = [
    { type: 'info', text: 'Iniciando sincronização...' },
    { type: 'success', text: 'Usuário "douglas.digiglio" salvo no DB SQL.' },
    { type: 'success', text: 'Empresa "IPANEMA FOODS" salva no DB SQL.' },
    { type: 'success', text: 'Formulário "Checklist Qualidade" salvo no DB SQL.' },
    { type: 'info', text: 'Aguardando novas respostas...' },
    { type: 'success', text: 'Nova resposta recebida do formulário #102. Salvando...' },
];

export default function IntegrationsPage() {
    const [statusLog, setStatusLog] = useState<typeof logMessages>([]);

    useEffect(() => {
        // Simula a chegada de novas mensagens no log
        let i = 0;
        const interval = setInterval(() => {
            if (i < logMessages.length) {
                setStatusLog(prev => [...prev, logMessages[i]]);
                i++;
            } else {
                clearInterval(interval);
            }
        }, 1500);
        return () => clearInterval(interval);
    }, []);


    return (
        <div>
            <div className={styles.pageHeader}>
                <h2 className={styles.title}>Integrações e Armazenamento</h2>
            </div>

            {/* Cards de Integração em Nuvem */}
            <div className={styles.grid}>
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Google_Drive_icon_%282020%29.svg/1024px-Google_Drive_icon_%282020%29.svg.png" className={styles.cardIcon} alt="Google Drive"/>
                        <h3 className={styles.cardTitle}>Google Drive</h3>
                    </div>
                    <p className={styles.cardDescription}>Salve anexos de formulários, como imagens e PDFs, diretamente em uma pasta do seu Google Drive.</p>
                    <button className={`${styles.button} ${styles.connectedButton}`}>Conectado</button>
                </div>
                <div className={styles.card}>
                     <div className={styles.cardHeader}>
                        <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Google_Sheets_logo_%282014-2020%29.svg/1498px-Google_Sheets_logo_%282014-2020%29.svg.png" className={styles.cardIcon} alt="Google Sheets"/>
                        <h3 className={styles.cardTitle}>Google Sheets</h3>
                    </div>
                    <p className={styles.cardDescription}>Envie os dados de cada formulário preenchido como uma nova linha em uma planilha do Google.</p>
                    <button className={`${styles.button} ${styles.connectButton}`}>Conectar</button>
                </div>
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/OneDrive_logo.svg/2560px-OneDrive_logo.svg.png" className={styles.cardIcon} style={{height: '24px'}} alt="OneDrive"/>
                        <h3 className={styles.cardTitle}>OneDrive</h3>
                    </div>
                    <p className={styles.cardDescription}>Sincronize automaticamente os documentos gerados com o seu OneDrive for Business.</p>
                    <button className={`${styles.button} ${styles.connectButton}`}>Conectar</button>
                </div>
            </div>

            {/* Seção do Banco de Dados SQL */}
            <div className={styles.sqlFrame}>
                <h3 className={styles.sqlTitle}>Banco de Dados Externo (SQL)</h3>
                <p style={{color: 'rgba(240, 234, 214, 0.7)', fontSize: '0.875rem', marginBottom: '1.5rem'}}>
                  Conecte a um banco de dados SQL para ter um backup robusto e em tempo real de todas as informações da plataforma.
                </p>
                <form className={styles.sqlForm}>
                    <div className={styles.inputGroup}>
                        <label className={styles.sqlLabel} htmlFor="db-host">Host</label>
                        <input id="db-host" type="text" placeholder="ex: 127.0.0.1" className={styles.sqlInput} />
                    </div>
                    <div className={styles.inputGroup}>
                        <label className={styles.sqlLabel} htmlFor="db-name">Database</label>
                        <input id="db-name" type="text" placeholder="Nome do Banco" className={styles.sqlInput} />
                    </div>
                    <div className={styles.inputGroup}>
                        <label className={styles.sqlLabel} htmlFor="db-user">Usuário</label>
                        <input id="db-user" type="text" className={styles.sqlInput} />
                    </div>
                    <div className={styles.inputGroup}>
                        <label className={styles.sqlLabel} htmlFor="db-pass">Senha</label>
                        <input id="db-pass" type="password" className={styles.sqlInput} />
                    </div>
                     <button type="submit" className={styles.sqlButton}>Testar & Salvar</button>
                </form>
            </div>
            
            {/* Log de Status */}
            <div className={styles.statusLog}>
                <h4 style={{color: 'var(--deco-gold)', marginBottom: '0.5rem'}}>Status de Sincronização:</h4>
                {statusLog.map((log, index) => (
                    <p key={index} className={`${styles.logEntry} ${log.type === 'success' ? styles.logSuccess : log.type === 'error' ? styles.logError : styles.logInfo}`}>
                       &gt; {log.text}
                    </p>
                ))}
            </div>
        </div>
    );
}
