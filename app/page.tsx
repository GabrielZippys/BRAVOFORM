'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import styles from '../app/styles/entrada.module.css';
import Image from 'next/image';
import { KeyRound, User, LogIn, AlertCircle, X, Shield, Eye, EyeOff } from 'lucide-react';
import { type AppUser } from '../src/types';

// O componente de Modal permanece o mesmo
const ForgotPasswordModal = ({ onClose }: { onClose: () => void }) => {
    // ... (toda a lógica do seu modal) ...
    const [username, setUsername] = useState('');
    const [step, setStep] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [answers, setAnswers] = useState({ company: '', department: '' });
    const handleAnswerChange = (field: keyof typeof answers, value: string) => { setAnswers(prev => ({ ...prev, [field]: value })); };
    const handleUsernameSubmit = (e: React.FormEvent) => { e.preventDefault(); if(!username) { setError("Por favor, insira um nome de usuário."); return; } setError(''); setStep(2); };
    const handleSecuritySubmit = async (e: React.FormEvent) => {
        e.preventDefault(); setIsLoading(true); setError('');
        try {
            const response = await fetch('https://us-central1-formbravo-8854e.cloudfunctions.net/ResetSenha', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, answers }),
            });
            const result = await response.json();
            if (response.ok) { setStep(3); } 
            else { setError(result.error || 'Falha ao verificar as informações.'); }
        } catch (apiError) {
            setError('Não foi possível conectar ao servidor. Tente novamente.');
        } finally { setIsLoading(false); }
    };
    return ( <div className={styles.modalOverlay}> <div className={styles.modalContent}> <button onClick={onClose} className={styles.closeModalButton}><X size={24} /></button> {step === 1 && ( <form onSubmit={handleUsernameSubmit}> <h3 className={styles.modalTitle}>Recuperar Senha de Colaborador</h3> <p className={styles.modalDescription}>Digite seu nome de usuário para começar.</p> <div className={styles.inputGroup}> <User className={styles.inputIcon} size={20} /> <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required className={styles.input} placeholder="seu.usuario" /> </div> {error && <p className={styles.error} style={{textAlign: 'center'}}>{error}</p>} <button type="submit" className={styles.button}>Continuar</button> </form> )} {step === 2 && ( <form onSubmit={handleSecuritySubmit}> <h3 className={styles.modalTitle}>Verificação de Segurança</h3> <p className={styles.modalDescription}>Confirme suas informações para continuar.</p> <div className={styles.inputGroup} style={{marginBottom: '1rem'}}> <label className={styles.label}>Empresa a que pertence</label> <input type="text" value={answers.company} onChange={(e) => handleAnswerChange('company', e.target.value)} required className={styles.input} /> </div> <div className={styles.inputGroup} style={{marginBottom: '1rem'}}> <label className={styles.label}>Seu Departamento</label> <input type="text" value={answers.department} onChange={(e) => handleAnswerChange('department', e.target.value)} required className={styles.input} /> </div> {error && <p className={styles.error} style={{textAlign: 'center'}}>{error}</p>} <button type="submit" className={styles.button} disabled={isLoading}> {isLoading ? <div className={styles.spinner}></div> : 'Verificar e Solicitar'} </button> </form> )} {step === 3 && ( <div className={styles.successStep}> <Shield size={48} className={styles.successIcon} /> <h3 className={styles.modalTitle}>Solicitação Enviada!</h3> <p className={styles.modalDescription}>Sua solicitação foi enviada para um administrador, que irá analisar e entrar em contato.</p> <button onClick={onClose} className={styles.button}>Fechar</button> </div> )} </div> </div> );
};


export default function LoginPage() {
  const [credential, setCredential] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const router = useRouter();

  // UX: guarda último usuário
  useEffect(() => {
    const last = localStorage.getItem('last_credential');
    if (last) setCredential(last);
  }, []);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isLoading) return;
    setError('');
    setIsLoading(true);

    const isEmail = credential.includes('@');
    try {
      if (isEmail) {
        const userCredential = await signInWithEmailAndPassword(auth, credential, password);
        const usersQuery = query(collection(db, "users"), where("uid", "==", userCredential.user.uid));
        const snap = await getDocs(usersQuery);
        if (!snap.empty && (snap.docs[0].data() as AppUser).role === 'Admin') {
          localStorage.setItem('last_credential', credential);
          router.push('/dashboard');
        } else {
          await auth.signOut();
          throw new Error('Este utilizador não tem permissões de administrador.');
        }
      } else {
        const response = await fetch('https://southamerica-east1-formbravo-8854e.cloudfunctions.net/collaboratorLogin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: credential, password })
        });
        const sessionData = await response.json();
        if (!response.ok) throw new Error(sessionData.error || 'Falha no login.');
        sessionStorage.setItem('collaborator_data', JSON.stringify(sessionData));
        localStorage.setItem('last_credential', credential);
        router.push(sessionData.isTemporaryPassword ? '/set-new-password' : '/collaborator-view');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao autenticar.');
      setIsLoading(false);
    }
  };

  return (
    <main className={styles.main}>
      <div className={styles.backgroundShapes} />
      <div className={`${styles.frame} ${styles.floatUp}`}>
        <div className={styles.cardTopGlow} />
        <div className={styles.logoContainer}>
          <Image
            src="/formbravo-logo.png"
            alt="Logo FORMBRAVO"
            width={120}
            height={120}
            priority
            className={styles.logo}
          />
        </div>

        <form onSubmit={handleLogin} className={styles.form}>
          <div className={styles.inputGroup}>
            <User className={styles.inputIcon} size={20} />
            <input
              type="text"
              id="credential"
              value={credential}
              onChange={(e) => setCredential(e.target.value)}
              className={styles.input}
              placeholder="Email ou Nome de Usuário"
              required
              disabled={isLoading}
            />
          </div>

          <div className={`${styles.inputGroup} ${capsOn ? styles.inputWarn : ''}`}>
            <KeyRound className={styles.inputIcon} size={20} />
            <input
              type={showPass ? 'text' : 'password'}
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyUp={(e) => setCapsOn((e as any).getModifierState?.('CapsLock'))}
              className={styles.input}
              placeholder="Senha"
              required
              disabled={isLoading}
            />
            <button
              type="button"
              className={styles.peek}
              onClick={() => setShowPass(s => !s)}
              aria-label={showPass ? 'Ocultar senha' : 'Mostrar senha'}
              tabIndex={-1}
            >
              {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {capsOn && <div className={styles.hint}>Caps Lock está ativado</div>}

          {error && (
            <div className={`${styles.errorContainer} ${styles.popIn}`}>
              <AlertCircle size={18} />
              <p className={styles.error}>{error}</p>
            </div>
          )}

          <button type="submit" className={`${styles.button} ${styles.sweep}`} disabled={isLoading}>
            {isLoading ? <div className={styles.spinner} /> : (<><LogIn size={18} /><span>Acessar</span></>)}
          </button>
        </form>

        <div className={styles.forgotPasswordContainer}>
          <button onClick={() => setIsRecovering(true)} className={styles.forgotPasswordButton}>
            Esqueci minha senha
          </button>
        </div>
      </div>

      {isRecovering && <ForgotPasswordModal onClose={() => setIsRecovering(false)} />}
    </main>
  );
}

