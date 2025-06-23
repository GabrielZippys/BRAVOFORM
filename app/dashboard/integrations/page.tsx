'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { auth, db } from '../../../firebase/config'; // Importando auth e db
import { doc, getDoc, setDoc } from 'firebase/firestore'; // Funções do Firestore
import { signInWithPopup, GoogleAuthProvider, OAuthProvider, AuthError, onAuthStateChanged, User } from 'firebase/auth';
import styles from '../../styles/Integrations.module.css';

// Tipos
type IntegrationService = 'drive' | 'sheets' | 'oneDrive';
type ConnectionsState = {
    [key in IntegrationService]: boolean;
};
type LogEntry = {
    type: 'info' | 'success' | 'error';
    text: string;
};

export default function IntegrationsPage() {
    // Estados locais
    const [user, setUser] = useState<User | null>(null);
    const [connections, setConnections] = useState<ConnectionsState>({ drive: false, sheets: false, oneDrive: false });
    const [loading, setLoading] = useState(true);
    const [statusLog, setStatusLog] = useState<LogEntry[]>([]);
    
    // Efeito para verificar o usuário logado e buscar suas conexões salvas
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
                // Busca as conexões salvas do Firestore
                const docRef = doc(db, "integrations", currentUser.uid);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    setConnections(docSnap.data() as ConnectionsState);
                }
            } else {
                // Usuário não está logado, talvez redirecionar?
                setUser(null);
            }
            setLoading(false);
        });

        return () => unsubscribe(); // Limpa o listener
    }, []);

    // Função para conectar e salvar o estado
    const handleCloudConnect = async (service: IntegrationService) => {
        if (!user) {
            setStatusLog(prev => [...prev, { type: 'error', text: "Usuário não autenticado." }]);
            return;
        }

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
            
            // ATUALIZA O ESTADO LOCAL
            const newConnections = { ...connections, [service]: true };
            setConnections(newConnections);

            // SALVA O NOVO ESTADO NO FIRESTORE
            const docRef = doc(db, "integrations", user.uid);
            await setDoc(docRef, newConnections, { merge: true });

            setStatusLog(prev => [...prev, { type: 'success', text: `Autorização com ${serviceName} concedida e salva!` }]);

        } catch (error) {
            const authError = error as AuthError;
            setStatusLog(prev => [...prev, { type: 'error', text: `Falha na autorização: ${authError.code}` }]);
            console.error(`Erro de autenticação com ${serviceName}:`, authError);
        }
    };
    
    if (loading) {
        return <p className={styles.title}>Carregando...</p>
    }

    return (
        <div>
            <div className={styles.pageHeader}><h2 className={styles.title}>Integrações e Armazenamento</h2></div>
            <div className={styles.grid}>
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <Image src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Google_Drive_icon_%282020%29.svg/1024px-Google_Drive_icon_%282020%29.svg.png" width={40} height={40} alt="Google Drive"/>
                        <h3 className={styles.cardTitle}>Google Drive</h3>
                    </div>
                    <p className={styles.cardDescription}>Salve anexos de formulários em seu Google Drive.</p>
                    <button onClick={() => handleCloudConnect('drive')} disabled={connections.drive} className={`${styles.button} ${connections.drive ? styles.connectedButton : styles.connectButton}`}>{connections.drive ? 'Conectado' : 'Conectar'}</button>
                </div>
                {/* Outros cards de integração... */}
            </div>
             <div className={styles.statusLog}>
                <h4 style={{color: 'var(--deco-gold)', marginBottom: '0.5rem'}}>Log de Eventos:</h4>
                {statusLog.map((log, index) => (
                    <p key={index} className={`${styles.logEntry} ${log.type === 'success' ? styles.logSuccess : log.type === 'error' ? styles.logError : styles.logInfo}`}>
                       &gt; {log.text}
                    </p>
                ))}
            </div>
        </div>
    );
}
