'use client';

import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, OAuthProvider, type UserCredential, type AuthProvider, type AuthError } from 'firebase/auth';
import { Database, MessageSquare, FolderOpen } from 'lucide-react';

import { auth, db } from '../../../firebase/config';
import styles from '../../styles/Integrations.module.css';

// --- Tipos ---
type IntegrationService = 'sql' | 'twilio' | 'googleDrive';
type SqlCredentials = {
    host: string;
    name: string;
    user: string;
    pass: string;
};
type ConnectionsState = {
    sql: SqlCredentials | null;
    twilio: { accountSid: string; authToken: string; whatsappFrom: string } | null;
    googleDrive: boolean;
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
            <div style={{ flex: 1 }}>
                <h3 className={styles.cardTitle}>{title}</h3>
                <span className={`${styles.statusBadge} ${isConnected ? styles.statusOnline : styles.statusOffline}`}>
                    {isConnected ? '● Online' : '● Offline'}
                </span>
            </div>
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
    const [connections, setConnections] = useState<ConnectionsState>({ sql: null, twilio: null, googleDrive: false });
    const [showSqlModal, setShowSqlModal] = useState(false);
    const [showTwilioModal, setShowTwilioModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [statusLog, setStatusLog] = useState<LogEntry[]>([]);
    const [activeTab, setActiveTab] = useState<'integrations' | 'tutorial'>('integrations');
    
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
                            sql: data.sql || null,
                            twilio: data.twilio || null,
                            googleDrive: data.googleDrive || false
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

    const handleCloudConnect = async () => {
        if (!user) { addLog('error', "Usuário não autenticado."); return; }
        const provider = new GoogleAuthProvider();
        provider.addScope('https://www.googleapis.com/auth/drive.file');
        
        addLog('info', 'Iniciando autenticação com Google Drive...');
        try {
            await signInWithPopup(auth, provider);
            await setDoc(doc(db, "integrations", user.uid), { googleDrive: true }, { merge: true });
            setConnections(prev => ({ ...prev, googleDrive: true }));
            addLog('success', 'Google Drive conectado com sucesso!');
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
                <h2 className={styles.title}>Integrações</h2>
            </div>

            {/* Abas de Navegação */}
            <div className={styles.tabs}>
                <button 
                    className={`${styles.tab} ${activeTab === 'integrations' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('integrations')}
                >
                    Integrações
                </button>
                <button 
                    className={`${styles.tab} ${activeTab === 'tutorial' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('tutorial')}
                >
                    Tutorial Twilio
                </button>
            </div>

            {/* Conteúdo das Abas */}
            {activeTab === 'integrations' ? (
            <>
            <div className={styles.grid}>
                <IntegrationCard 
                    icon={<Database size={40} />}
                    title="Banco SQL"
                    description="Conecte seu banco de dados SQL para salvar respostas automaticamente."
                    isConnected={!!connections.sql}
                    onConnect={() => setShowSqlModal(true)}
                    onDisconnect={handleSqlDisconnect}
                />
                <IntegrationCard 
                    icon={<MessageSquare size={40} />}
                    title="Twilio"
                    description="Configure Twilio para enviar notificações por WhatsApp e SMS."
                    isConnected={!!connections.twilio}
                    onConnect={() => setShowTwilioModal(true)}
                    onDisconnect={async () => {
                        if (!user) return;
                        await setDoc(doc(db, "integrations", user.uid), { twilio: null }, { merge: true });
                        setConnections(prev => ({ ...prev, twilio: null }));
                        addLog('success', 'Twilio desconectado.');
                    }}
                />
                <IntegrationCard 
                    icon={<FolderOpen size={40} />}
                    title="Google Drive"
                    description="Salve respostas de formulários como arquivos no Google Drive."
                    isConnected={connections.googleDrive}
                    onConnect={handleCloudConnect}
                    onDisconnect={async () => {
                        if (!user) return;
                        await setDoc(doc(db, "integrations", user.uid), { googleDrive: false }, { merge: true });
                        setConnections(prev => ({ ...prev, googleDrive: false }));
                        addLog('success', 'Google Drive desconectado.');
                    }}
                />
            </div>

            {/* Modal SQL */}
            {showSqlModal && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalContent}>
                        <SqlForm 
                            onSubmit={async (e) => {
                                await handleSaveSqlConnection(e);
                                setShowSqlModal(false);
                            }}
                            onDisconnect={handleSqlDisconnect}
                            isConnected={!!connections.sql}
                            isConnecting={isDbConnecting}
                            dbHost={dbHost} setDbHost={setDbHost}
                            dbName={dbName} setDbName={setDbName}
                            dbUser={dbUser} setDbUser={setDbUser}
                            dbPass={dbPass} setDbPass={setDbPass}
                        />
                        <button onClick={() => setShowSqlModal(false)} className={styles.modalClose}>Fechar</button>
                    </div>
                </div>
            )}

            {/* Modal Twilio */}
            {showTwilioModal && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalContent}>
                        <h3 className={styles.sqlTitle}>Configurar Twilio</h3>
                        <p className={styles.cardDescription} style={{textAlign: 'center', marginBottom: '2rem'}}>Configure suas credenciais do Twilio para enviar notificações por WhatsApp.</p>
                        <form className={styles.sqlForm} onSubmit={async (e) => {
                            e.preventDefault();
                            if (!user) return;
                            const formData = new FormData(e.currentTarget);
                            const twilioConfig = {
                                accountSid: formData.get('accountSid') as string,
                                authToken: formData.get('authToken') as string,
                                whatsappFrom: formData.get('whatsappFrom') as string,
                            };
                            await setDoc(doc(db, "integrations", user.uid), { twilio: twilioConfig }, { merge: true });
                            setConnections(prev => ({ ...prev, twilio: twilioConfig }));
                            addLog('success', 'Twilio configurado com sucesso!');
                            setShowTwilioModal(false);
                        }}>
                            <div className={styles.inputGroup}>
                                <label className={styles.sqlLabel}>Account SID</label>
                                <input name="accountSid" type="text" className={styles.sqlInput} defaultValue={connections.twilio?.accountSid || ''} required />
                            </div>
                            <div className={styles.inputGroup}>
                                <label className={styles.sqlLabel}>Auth Token</label>
                                <input name="authToken" type="password" className={styles.sqlInput} defaultValue={connections.twilio?.authToken || ''} required />
                            </div>
                            <div className={styles.inputGroup}>
                                <label className={styles.sqlLabel}>WhatsApp From (ex: whatsapp:+5511999999999)</label>
                                <input name="whatsappFrom" type="text" className={styles.sqlInput} defaultValue={connections.twilio?.whatsappFrom || ''} required />
                            </div>
                            <button type="submit" className={`${styles.button} ${styles.connectButton} ${styles.sqlButton}`}>Salvar Configuração</button>
                        </form>
                        <button onClick={() => setShowTwilioModal(false)} className={styles.modalClose}>Fechar</button>
                    </div>
                </div>
            )}

            <EventLog logs={statusLog} />
            </>
            ) : (
            /* Tutorial Twilio */
            <div className={styles.tutorialContainer}>
                <div className={styles.tutorialCard}>
                    <h3 className={styles.tutorialTitle}>Como Configurar o Twilio</h3>
                    
                    <div className={styles.tutorialStep}>
                        <div className={styles.stepNumber}>1</div>
                        <div className={styles.stepContent}>
                            <h4>Crie uma conta no Twilio</h4>
                            <p>Acesse <a href="https://www.twilio.com/try-twilio" target="_blank" rel="noopener noreferrer">twilio.com/try-twilio</a> e crie sua conta gratuita.</p>
                        </div>
                    </div>

                    <div className={styles.tutorialStep}>
                        <div className={styles.stepNumber}>2</div>
                        <div className={styles.stepContent}>
                            <h4>Obtenha suas credenciais</h4>
                            <p>No painel do Twilio, encontre:</p>
                            <ul>
                                <li><strong>Account SID:</strong> Identificador único da sua conta</li>
                                <li><strong>Auth Token:</strong> Token de autenticação (mantenha em segredo)</li>
                            </ul>
                        </div>
                    </div>

                    <div className={styles.tutorialStep}>
                        <div className={styles.stepNumber}>3</div>
                        <div className={styles.stepContent}>
                            <h4>Configure o WhatsApp Sandbox</h4>
                            <p>No menu lateral, vá em: <strong>Messaging → Try it out → Send a WhatsApp message</strong></p>
                            <p>Siga as instruções para conectar seu número de teste.</p>
                        </div>
                    </div>

                    <div className={styles.tutorialStep}>
                        <div className={styles.stepNumber}>4</div>
                        <div className={styles.stepContent}>
                            <h4>Obtenha o número WhatsApp</h4>
                            <p>Copie o número no formato: <code>whatsapp:+14155238886</code></p>
                            <p>Este será seu <strong>WhatsApp From</strong></p>
                        </div>
                    </div>

                    <div className={styles.tutorialStep}>
                        <div className={styles.stepNumber}>5</div>
                        <div className={styles.stepContent}>
                            <h4>Configure no BRAVOFORM</h4>
                            <p>Volte para a aba <strong>Integrações</strong> e clique em <strong>Conectar</strong> no card do Twilio.</p>
                            <p>Preencha os campos com as credenciais obtidas.</p>
                        </div>
                    </div>

                    <div className={styles.tutorialNote}>
                        <strong>💡 Dica:</strong> Para usar em produção, você precisará de um número Twilio verificado e aprovação do WhatsApp Business API.
                    </div>
                </div>
            </div>
            )}
        </div>
    );
}
