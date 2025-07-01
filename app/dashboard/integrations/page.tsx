'use client';

import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, OAuthProvider, type UserCredential, type AuthProvider, type AuthError } from 'firebase/auth';
import { Sheet, FolderKanban, Cloud } from 'lucide-react';

import { auth, db } from '../../../firebase/config';
import styles from '../../styles/Integrations.module.css';

// --- Tipos ---
type IntegrationService = 'drive' | 'sheets' | 'oneDrive' | 'sql';
type SqlCredentials = {
    host: string;
    name: string;
    user: string;
    pass: string;
};
type ConnectionsState = {
    drive: boolean;
    sheets: boolean;
    oneDrive: boolean;
    sql: SqlCredentials | null;
};
type LogEntry = { type: 'info' | 'success' | 'error'; text: string };

type IntegrationCardProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  isConnected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
};

type SqlFormProps = {
    onSubmit: (e: React.FormEvent) => void;
    onDisconnect: () => void;
    isConnected: boolean;
    isConnecting: boolean;
    dbHost: string; setDbHost: React.Dispatch<React.SetStateAction<string>>;
    dbName: string; setDbName: React.Dispatch<React.SetStateAction<string>>;
    dbUser: string; setDbUser: React.Dispatch<React.SetStateAction<string>>;
    dbPass: string; setDbPass: React.Dispatch<React.SetStateAction<string>>;
};

type EventLogProps = { logs: LogEntry[] };

// --- Componentes Filhos ---

const SkeletonLoader = () => (
    <div className={styles.grid}>
        {[...Array(3)].map((_, i) => <div key={i} className={styles.cardSkeleton} />)}
    </div>
);

const IntegrationCard: React.FC<IntegrationCardProps> = ({ icon, title, description, isConnected, onConnect, onDisconnect }) => (
    <div className={styles.card}>
        <div className={styles.cardHeader}>
            <div className={styles.cardIcon}>{icon}</div>
            <h3 className={styles.cardTitle}>{title}</h3>
        </div>
        <p className={styles.cardDescription}>{description}</p>
        <button 
            onClick={isConnected ? onDisconnect : onConnect} 
            className={`${styles.button} ${isConnected ? styles.disconnectButton : styles.connectButton}`}
        >
            {isConnected ? 'Desconectar' : 'Conectar'}
        </button>
    </div>
);

const SqlForm: React.FC<SqlFormProps> = ({ onSubmit, onDisconnect, isConnected, isConnecting, dbHost, setDbHost, dbName, setDbName, dbUser, setDbUser, dbPass, setDbPass }) => (
    <div className={styles.sqlFrame}>
        <h3 className={styles.sqlTitle}>Banco de Dados Externo (SQL)</h3>
        <p className={styles.cardDescription} style={{textAlign: 'center', marginBottom: '2rem'}}>Salve respostas de formulários diretamente em uma tabela do seu banco de dados SQL.</p>
        
        {isConnected ? (
            <div style={{textAlign: 'center'}}>
                <p className={styles.logSuccess}>Conectado ao host: {dbHost}</p>
                <button onClick={onDisconnect} className={`${styles.button} ${styles.disconnectButton}`} style={{marginTop: '1rem'}}>
                    Desconectar do Banco SQL
                </button>
            </div>
        ) : (
            <form className={styles.sqlForm} onSubmit={onSubmit}>
                <div className={styles.inputGroup}><label className={styles.sqlLabel} htmlFor="db-host">Host</label><input id="db-host" type="text" value={dbHost} onChange={(e) => setDbHost(e.target.value)} className={styles.sqlInput} required /></div>
                <div className={styles.inputGroup}><label className={styles.sqlLabel} htmlFor="db-name">Database</label><input id="db-name" type="text" value={dbName} onChange={(e) => setDbName(e.target.value)} className={styles.sqlInput} required /></div>
                <div className={styles.inputGroup}><label className={styles.sqlLabel} htmlFor="db-user">Usuário</label><input id="db-user" type="text" value={dbUser} onChange={(e) => setDbUser(e.target.value)} className={styles.sqlInput} required /></div>
                <div className={styles.inputGroup}><label className={styles.sqlLabel} htmlFor="db-pass">Senha</label><input id="db-pass" type="password" value={dbPass} onChange={(e) => setDbPass(e.target.value)} className={styles.sqlInput} required /></div>
                <button type="submit" className={`${styles.button} ${styles.connectButton} ${styles.sqlButton}`} disabled={isConnecting}>{isConnecting ? 'Conectando...' : 'Conectar e Salvar'}</button>
            </form>
        )}
    </div>
);

const EventLog: React.FC<EventLogProps> = ({ logs }) => (
    <div className={styles.statusLog}>
        {logs.length === 0 ? <p className={styles.logInfo}>&gt; Log de eventos aparecerá aqui.</p> : logs.map((log, index) => (
            <p key={index} className={`${styles.logEntry} ${log.type === 'success' ? styles.logSuccess : log.type === 'error' ? styles.logError : styles.logInfo}`}>&gt; {log.text}</p>
        ))}
    </div>
);

// --- Componente Principal ---
export default function IntegrationsPage() {
    const [user, setUser] = useState<User | null>(null);
    const [connections, setConnections] = useState<ConnectionsState>({ drive: false, sheets: false, oneDrive: false, sql: null });
    const [loading, setLoading] = useState(true);
    const [statusLog, setStatusLog] = useState<LogEntry[]>([]);
    
    const [dbHost, setDbHost] = useState('');
    const [dbName, setDbName] = useState('');
    const [dbUser, setDbUser] = useState('');
    const [dbPass, setDbPass] = useState('');
    const [isDbConnecting, setIsDbConnecting] = useState(false);
    
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            try {
                if (currentUser) {
                    setUser(currentUser);
                    const docRef = doc(db, "integrations", currentUser.uid);
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        const data = docSnap.data() as Partial<ConnectionsState>;
                        setConnections({
                            drive: data.drive || false,
                            sheets: data.sheets || false,
                            oneDrive: data.oneDrive || false,
                            sql: data.sql || null
                        });
                        if (data.sql) {
                            setDbHost(data.sql.host);
                            setDbName(data.sql.name);
                            setDbUser(data.sql.user);
                        }
                    }
                } else {
                    setUser(null);
                }
            } catch (error) {
                console.error("Erro ao buscar dados do Firestore:", error);
                addLog('error', "Não foi possível carregar as configurações.");
            } finally {
                setLoading(false); 
            }
        });
        return () => unsubscribe();
    }, []);

    const addLog = (type: LogEntry['type'], text: string) => {
        setStatusLog(prev => [{ type, text }, ...prev]);
    };

    const exportAllDataToGoogleSheets = async (credential: UserCredential) => {
        if (!user) return;
        const credentialFromResult = GoogleAuthProvider.credentialFromResult(credential);
        const token = credentialFromResult?.accessToken;
        if (!token) {
            addLog('error', 'Token de acesso do Google não encontrado.');
            return;
        }
        addLog('info', 'Buscando todos os formulários e respostas...');
        try {
            const formsQuery = query(collection(db, 'forms'), where('userId', '==', user.uid));
            const formsSnapshot = await getDocs(formsQuery);
            if (formsSnapshot.empty) {
                addLog('info', 'Nenhum formulário encontrado para exportar.');
                return;
            }
            let allResponsesData = [['FormID', 'FormName', 'ResponseID', 'SubmissionDate', 'Question', 'Answer']];
            for (const formDoc of formsSnapshot.docs) {
                const formData = formDoc.data();
                const responsesQuery = collection(db, `forms/${formDoc.id}/responses`);
                const responsesSnapshot = await getDocs(responsesQuery);
                responsesSnapshot.forEach(responseDoc => {
                    const responseData = responseDoc.data();
                    const submissionDate = responseData.createdAt?.toDate()?.toISOString() || new Date().toISOString();
                    for (const [question, answer] of Object.entries(responseData.answers)) {
                        allResponsesData.push([formDoc.id, formData.title, responseDoc.id, submissionDate, question, String(answer)]);
                    }
                });
            }
            if (allResponsesData.length <= 1) {
                addLog('info', 'Nenhuma resposta encontrada para exportar.');
                return;
            }
            addLog('info', `Total de ${allResponsesData.length - 1} respostas encontradas. Criando planilha...`);
            const spreadsheetResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ properties: { title: 'BRAVOFORM - Exportação de Respostas' } })
            });
            if (!spreadsheetResponse.ok) {
                 const errorData = await spreadsheetResponse.json();
                 throw new Error(`Falha ao criar a planilha: ${errorData.error.message}`);
            }
            const spreadsheetData = await spreadsheetResponse.json();
            const spreadsheetId = spreadsheetData.spreadsheetId;
            addLog('success', `Planilha criada com sucesso! ID: ${spreadsheetId}`);
            addLog('info', 'Enviando dados para a planilha...');
            const updateResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=USER_ENTERED`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ values: allResponsesData })
            });
            if (!updateResponse.ok) {
                const errorData = await updateResponse.json();
                throw new Error(`Falha ao enviar dados: ${errorData.error.message}`);
            }
            addLog('success', `Exportação concluída! Verifique seu Google Sheets.`);
        } catch (error) {
            console.error("Erro durante a exportação para o Google Sheets:", error);
            if (error instanceof Error) {
                addLog('error', `Erro na exportação: ${error.message}`);
            } else {
                addLog('error', 'Ocorreu um erro desconhecido durante a exportação.');
            }
        }
    };

    const handleCloudConnect = async (service: 'drive' | 'sheets' | 'oneDrive') => {
        if (!user) { addLog('error', "Usuário não autenticado."); return; }
        let provider: GoogleAuthProvider | OAuthProvider;
        let serviceName = '';
        switch (service) {
            case 'drive': 
                serviceName = 'Google Drive'; 
                provider = new GoogleAuthProvider(); 
                provider.addScope('https://www.googleapis.com/auth/drive.file'); 
                break;
            case 'sheets': 
                serviceName = 'Google Sheets'; 
                provider = new GoogleAuthProvider(); 
                provider.addScope('https://www.googleapis.com/auth/spreadsheets');
                break;
            case 'oneDrive': 
                serviceName = 'OneDrive'; 
                provider = new OAuthProvider('microsoft.com'); 
                provider.addScope('Files.ReadWrite'); 
                break;
        }
        addLog('info', `Iniciando autenticação com ${serviceName}...`);
        try {
            const result = await signInWithPopup(auth, provider);
            const newConnections = { ...connections, [service]: true };
            setConnections(newConnections);
            await setDoc(doc(db, "integrations", user.uid), { [service]: true }, { merge: true });
            addLog('success', `Autorização com ${serviceName} concedida e salva!`);
            if (service === 'sheets') {
                await exportAllDataToGoogleSheets(result);
            }
        } catch (error: unknown) {
            if (error instanceof Error && 'code' in error) {
                const firebaseError = error as { code: string; message: string };
                addLog('error', `Falha na autorização: ${firebaseError.code}`);
            } else {
                addLog('error', 'Ocorreu um erro desconhecido durante a autenticação.');
            }
        }
    };

    const handleCloudDisconnect = async (service: 'drive' | 'sheets' | 'oneDrive') => {
        if (!user) { addLog('error', "Usuário não autenticado."); return; }
        const serviceName = service === 'oneDrive' ? 'OneDrive' : `Google ${service.charAt(0).toUpperCase() + service.slice(1)}`;
        addLog('info', `Desconectando de ${serviceName}...`);
        await setDoc(doc(db, "integrations", user.uid), { [service]: false }, { merge: true });
        setConnections(prev => ({ ...prev, [service]: false }));
        addLog('success', `${serviceName} desconectado.`);
    };
    
    const handleSaveSqlConnection = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) { addLog('error', "Usuário não autenticado."); return; }
        setIsDbConnecting(true);
        addLog('info', `Tentando conectar e salvar credenciais para ${dbHost}...`);
        await new Promise(resolve => setTimeout(resolve, 1500));
        if (dbHost && dbName && dbUser && dbPass) {
            const sqlCredentials: SqlCredentials = { host: dbHost, name: dbName, user: dbUser, pass: dbPass };
            try {
                await setDoc(doc(db, "integrations", user.uid), { sql: sqlCredentials }, { merge: true });
                setConnections(prev => ({ ...prev, sql: sqlCredentials }));
                addLog('success', 'Conexão SQL salva com sucesso!');
            } catch (error) {
                addLog('error', 'Falha ao salvar as credenciais no Firestore.');
            }
        } else {
            addLog('error', 'Falha na conexão. Verifique todos os campos.');
        }
        setIsDbConnecting(false);
    };

    const handleSqlDisconnect = async () => {
        if (!user) { addLog('error', "Usuário não autenticado."); return; }
        addLog('info', `Desconectando do banco de dados SQL...`);
        try {
            await setDoc(doc(db, "integrations", user.uid), { sql: null }, { merge: true });
            setConnections(prev => ({ ...prev, sql: null }));
            setDbHost(''); setDbName(''); setDbUser(''); setDbPass('');
            addLog('success', 'Banco de dados SQL desconectado.');
        } catch (error) {
            addLog('error', 'Falha ao desconectar do SQL.');
        }
    };

    if (loading) return <SkeletonLoader />;

    return (
        <div>
            <div className={styles.pageHeader}>
                <h2 className={styles.title}>Bancos de Dados Adicionais</h2>
            </div>
            <div className={styles.grid}>
                <IntegrationCard 
                    icon={<FolderKanban size={40} />}
                    title="Google Drive"
                    description="Salve respostas de formulários como arquivos individuais no seu Google Drive."
                    isConnected={connections.drive}
                    onConnect={() => handleCloudConnect('drive')}
                    onDisconnect={() => handleCloudDisconnect('drive')}
                />
                <IntegrationCard 
                    icon={<Sheet size={40} />}
                    title="Google Sheets"
                    description="Exporte todas as respostas para uma nova planilha."
                    isConnected={connections.sheets}
                    onConnect={() => handleCloudConnect('sheets')}
                    onDisconnect={() => handleCloudDisconnect('sheets')}
                />
                <IntegrationCard 
                    icon={<Cloud size={40} />}
                    title="OneDrive"
                    description="Sincronize documentos com o seu OneDrive (em breve)."
                    isConnected={connections.oneDrive}
                    onConnect={() => handleCloudConnect('oneDrive')}
                    onDisconnect={() => handleCloudDisconnect('oneDrive')}
                />
            </div>
            <SqlForm 
                onSubmit={handleSaveSqlConnection}
                onDisconnect={handleSqlDisconnect}
                isConnected={!!connections.sql}
                isConnecting={isDbConnecting}
                dbHost={dbHost} setDbHost={setDbHost}
                dbName={dbName} setDbName={setDbName}
                dbUser={dbUser} setDbUser={setDbUser}
                dbPass={dbPass} setDbPass={setDbPass}
            />
            <EventLog logs={statusLog} />
        </div>
    );
}
