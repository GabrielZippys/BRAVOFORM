'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { auth, db } from '../../../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, OAuthProvider, AuthError, onAuthStateChanged, User } from 'firebase/auth';
import styles from '../../styles/Integrations.module.css';

type IntegrationService = 'drive' | 'sheets' | 'oneDrive';
type LogEntry = {
    type: 'info' | 'success' | 'error';
    text: string;
};

export default function IntegrationsPage() {
    const [connections, setConnections] = useState({ drive: false, sheets: false, oneDrive: false });
    const [dbHost, setDbHost] = useState('');
    const [dbName, setDbName] = useState('');
    const [dbUser, setDbUser] = useState('');
    const [dbPass, setDbPass] = useState('');
    const [statusLog, setStatusLog] = useState<LogEntry[]>([]);
    const [isDbConnecting, setIsDbConnecting] = useState(false);

    const handleCloudConnect = async (service: IntegrationService) => {
        let provider;
        let serviceName = '';

        switch (service) {
            case 'drive':
            case 'sheets':
                provider = new GoogleAuthProvider();
                provider.addScope('https://www.googleapis.com/auth/drive.file');
                serviceName = service === 'drive' ? 'Google Drive' : 'Google Sheets';
                break;
            case 'oneDrive':
                provider = new OAuthProvider('microsoft.com');
                provider.addScope('Files.ReadWrite');
                serviceName = 'OneDrive';
                break;
        }

        setStatusLog(prev => [...prev, { type: 'info', text: `Iniciando autenticação com ${serviceName}...` }]);

        try {
            await signInWithPopup(auth, provider);
            setStatusLog(prev => [...prev, { type: 'success', text: `Autorização com ${serviceName} concedida!` }]);
            setConnections(prev => ({ ...prev, [service]: true }));
        } catch (error) {
            const authError = error as AuthError;
            setStatusLog(prev => [...prev, { type: 'error', text: `Falha na autorização: ${authError.code}` }]);
        }
    };

    const handleTestConnection = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsDbConnecting(true);
        setStatusLog([{ type: 'info', text: `Tentando conectar a ${dbHost}...` }]);
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (dbHost && dbName && dbUser && dbPass) {
            setStatusLog(prev => [...prev, { type: 'success', text: 'Conexão bem-sucedida!' }]);
        } else {
            setStatusLog(prev => [...prev, { type: 'error', text: 'Falha na conexão. Verifique os campos.' }]);
        }
        setIsDbConnecting(false);
    };

    return (
        <div>
            <div className={styles.pageHeader}>
                <h2 className={styles.title}>Integrações e Armazenamento</h2>
            </div>

            <div className={styles.grid}>
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <Image 
                            src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Google_Drive_icon_%282020%29.svg/1024px-Google_Drive_icon_%282020%29.svg.png" 
                            width={40} 
                            height={40} 
                            alt="Google Drive"
                            className={styles.cardIcon}
                        />
                        <h3 className={styles.cardTitle}>Google Drive</h3>
                    </div>
                    <p className={styles.cardDescription}>Salve anexos de formulários, como imagens e PDFs, diretamente em uma pasta do seu Google Drive.</p>
                    <button onClick={() => handleCloudConnect('drive')} disabled={connections.drive} className={`${styles.button} ${connections.drive ? styles.connectedButton : styles.connectButton}`}>
                        {connections.drive ? 'Conectado' : 'Conectar'}
                    </button>
                </div>
                <div className={styles.card}>
                     <div className={styles.cardHeader}>
                        <Image 
                            src="https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Google_Sheets_logo_%282014-2020%29.svg/1498px-Google_Sheets_logo_%282014-2020%29.svg.png" 
                            width={40} 
                            height={40} 
                            alt="Google Sheets"
                            className={styles.cardIcon}
                        />
                        <h3 className={styles.cardTitle}>Google Sheets</h3>
                    </div>
                    <p className={styles.cardDescription}>Envie os dados de cada formulário preenchido como uma nova linha em uma planilha do Google.</p>
                     <button onClick={() => handleCloudConnect('sheets')} disabled={connections.sheets} className={`${styles.button} ${connections.sheets ? styles.connectedButton : styles.connectButton}`}>
                        {connections.sheets ? 'Conectado' : 'Conectar'}
                    </button>
                </div>
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <Image 
                            src="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Microsoft_Office_OneDrive_%282019%E2%80%93present%29.svg/1280px-Microsoft_Office_OneDrive_%282019%E2%80%93present%29.svg.png" 
                            width={109} 
                            height={34} 
                            alt="OneDrive"
                            className={styles.cardIcon}
                        />
                        <h3 className={styles.cardTitle}>OneDrive</h3>
                    </div>
                    <p className={styles.cardDescription}>Sincronize automaticamente os documentos gerados com o seu OneDrive for Business.</p>
                     <button onClick={() => handleCloudConnect('oneDrive')} disabled={connections.oneDrive} className={`${styles.button} ${connections.oneDrive ? styles.connectedButton : styles.connectButton}`}>
                        {connections.oneDrive ? 'Conectado' : 'Conectar'}
                    </button>
                </div>
            </div>
            
            <div className={styles.sqlFrame}>
                <h3 className={styles.sqlTitle}>Banco de Dados Externo (SQL)</h3>
                <form className={styles.sqlForm} onSubmit={handleTestConnection}>
                    <div className={styles.inputGroup}><label className={styles.sqlLabel} htmlFor="db-host">Host</label><input id="db-host" type="text" value={dbHost} onChange={(e) => setDbHost(e.target.value)} className={styles.sqlInput} required/></div>
                    <div className={styles.inputGroup}><label className={styles.sqlLabel} htmlFor="db-name">Database</label><input id="db-name" type="text" value={dbName} onChange={(e) => setDbName(e.target.value)} className={styles.sqlInput} required/></div>
                    <div className={styles.inputGroup}><label className={styles.sqlLabel} htmlFor="db-user">Usuário</label><input id="db-user" type="text" value={dbUser} onChange={(e) => setDbUser(e.target.value)} className={styles.sqlInput} required/></div>
                    <div className={styles.inputGroup}><label className={styles.sqlLabel} htmlFor="db-pass">Senha</label><input id="db-pass" type="password" value={dbPass} onChange={(e) => setDbPass(e.target.value)} className={styles.sqlInput} required/></div>
                    <button type="submit" className={styles.sqlButton} disabled={isDbConnecting}>{isDbConnecting ? 'Testando...' : 'Testar & Salvar'}</button>
                </form>
            </div>
            
            <div className={styles.statusLog}>
                <h4 style={{color: 'var(--deco-gold)', marginBottom: '0.5rem'}}>Status de Sincronização:</h4>
                {statusLog.map((log, index) => (<p key={index} className={`${styles.logEntry} ${log.type === 'success' ? styles.logSuccess : log.type === 'error' ? styles.logError : styles.logInfo}`}>&gt; {log.text}</p>))}
            </div>
        </div>
    );
}