'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
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

  // Limpar dados antigos quando a página carregar (importante para mobile)
  useEffect(() => {
    console.log('🧹 Limpando dados antigos ao carregar página de login...');
    
    // Limpar sessionStorage para evitar conflitos com IDs antigos
    sessionStorage.clear();
    
    // Manter apenas o último credential para UX
    const last = localStorage.getItem('last_credential');
    if (last) setCredential(last);
    
    console.log('✅ Página de login limpa e pronta');
  }, []);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    console.log('=== INÍCIO DO HANDLE LOGIN ===');
    console.log('credential:', credential);
    console.log('password:', password ? '***' : 'vazio');
    console.log('isLoading:', isLoading);
    
    e.preventDefault();
    if (isLoading) return;
    setError('');
    setIsLoading(true);

    // Limpar dados antigos de sessão antes do login
    console.log('🧹 Limpando dados antigos de sessão...');
    try {
      // Limpar sessionStorage completamente
      sessionStorage.clear();
      
      // Limpar apenas dados sensíveis do localStorage (mantém preferências do usuário)
      const keysToRemove = ['formDraft'];
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      console.log('✅ Cache limpo com sucesso');
    } catch (cleanupError) {
      console.warn('⚠️ Erro ao limpar cache (não crítico):', cleanupError);
    }

    // Buscar email correto no Firestore se for username
    console.log('=== LOGIN POR USERNAME/EMAIL ===');
    
    let email = credential;
    
    // Se não for email, buscar o colaborador para obter o email correto
    if (!credential.includes('@')) {
      console.log('Buscando colaborador pelo username:', credential);
      
      const collaboratorQuery = query(collection(db, "collaborators"), where("username", "==", credential));
      const collaboratorSnap = await getDocs(collaboratorQuery);
      
      if (!collaboratorSnap.empty) {
        const collaboratorData = collaboratorSnap.docs[0].data();
        email = collaboratorData.email || `${credential.toLowerCase()}@bravoform.com`;
        console.log('Email encontrado no Firestore:', email);
      } else {
        // Se não encontrar, gerar email automático
        email = `${credential.toLowerCase()}@bravoform.com`;
        console.log('Email gerado (usuário não encontrado):', email);
      }
    }
    
    console.log('Credential fornecido:', credential);
    console.log('Email usado para login:', email);
    
    try {
      // Login com Firebase Auth usando o email
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log('Firebase Auth successful:', userCredential.user.uid);
      
      // Buscar dados do colaborador na coleção raiz
      const collaboratorQueryByUid = query(collection(db, "collaborators"), where("uid", "==", userCredential.user.uid));
      const collaboratorSnapByUid = await getDocs(collaboratorQueryByUid);
      console.log('Collaborator query snapshot:', collaboratorSnapByUid.empty ? 'empty' : collaboratorSnapByUid.docs[0].data());
      
      if (!collaboratorSnapByUid.empty) {
        const collaboratorDataFound = collaboratorSnapByUid.docs[0].data();
        console.log('Collaborator data found:', collaboratorDataFound);
        
        // Verificar se está ativo
        if (!collaboratorDataFound.active) {
          await auth.signOut();
          throw new Error('Usuário inativo.');
        }
        
        // Salvar dados da sessão
        const sessionData = {
          id: collaboratorSnapByUid.docs[0].id,  // ID do documento Firestore, não o UID
          username: collaboratorDataFound.username,
          name: collaboratorDataFound.name,
          email: collaboratorDataFound.email,
          department: collaboratorDataFound.department,
          role: collaboratorDataFound.role,
          permissions: collaboratorDataFound.permissions || {},
          isTemporaryPassword: collaboratorDataFound.isTemporaryPassword || false,
          lastLogin: new Date().toISOString()
        };
        
        console.log('Session data created:', sessionData);
        sessionStorage.setItem('collaborator_data', JSON.stringify(sessionData));
        localStorage.setItem('last_credential', credential);
        
        // Atualizar último login no Firestore
        await updateDoc(collaboratorSnapByUid.docs[0].ref, {
          lastLogin: new Date(),
          updatedAt: new Date()
        });
        
        router.push(sessionData.isTemporaryPassword ? '/set-new-password' : '/collaborator-view');
        
      } else {
        console.log('Colaborador não encontrado, tentando login como admin...');
        
        // Se não encontrou como colaborador, tentar como admin (só se for email)
        if (credential.includes('@')) {
          console.log('=== TENTANDO LOGIN COMO ADMIN ===');
          const usersQuery = query(collection(db, "admins"), where("uid", "==", userCredential.user.uid));
          const snap = await getDocs(usersQuery);
          console.log('Admin query result - empty:', snap.empty, 'docs count:', snap.docs.length);
          
          if (!snap.empty && (snap.docs[0].data() as AppUser).role === 'Admin') {
            console.log('Admin user found and role is Admin:', snap.docs[0].data());
            localStorage.setItem('last_credential', credential);
            router.push('/dashboard');
          } else {
            console.log('Admin user not found or role is not Admin');
            await auth.signOut();
            throw new Error('Usuário ou senha incorretos');
          }
        } else {
          await auth.signOut();
          throw new Error('Usuário ou senha incorretos');
        }
      }
    } catch (err) {
      console.error('Erro durante login - tipo:', typeof err);
      console.error('Erro durante login - valor:', err);
      console.error('Erro durante login - string:', String(err));
      console.error('Erro durante login - JSON:', JSON.stringify(err, null, 2));
      console.error('Erro durante login - keys:', err ? Object.keys(err) : 'no keys');
      
      // Tentar acessar propriedades específicas do erro
      if (err && typeof err === 'object') {
        console.error('Erro.code:', (err as any).code);
        console.error('Erro.message:', (err as any).message);
        console.error('Erro.customData:', (err as any).customData);
      }
      
      // Se for erro de credenciais inválidas, mostrar qual email foi tentado
      if ((err as any)?.code === 'auth/invalid-credential') {
        console.log('🔍 DEBUG - Credenciais inválidas:');
        console.log('   Username informado:', credential);
        console.log('   Email tentado:', email);
        console.log('   Possíveis causas:');
        console.log('   1. Email no Firebase Auth é diferente');
        console.log('   2. Senha está incorreta');
        console.log('   3. Usuário não existe no Firebase Auth');
        
        // Tentar buscar o usuário pelo username para ver qual email está cadastrado
        console.log('🔍 Buscando usuário no Firestore para verificar email cadastrado...');
        const collaboratorQuery = query(collection(db, "collaborators"), where("username", "==", credential));
        const collaboratorSnap = await getDocs(collaboratorQuery);
        
        if (!collaboratorSnap.empty) {
          const collaboratorData = collaboratorSnap.docs[0].data();
          console.log('   Usuário encontrado no Firestore:', collaboratorData);
          console.log('   Email cadastrado no Firestore:', collaboratorData.email);
        } else {
          console.log('   Usuário não encontrado no Firestore');
        }
      }
      
      let errorMessage = 'Usuário ou senha incorretos';
      
      // Verificar se é um erro do Firebase Auth
      if (err && typeof err === 'object' && 'code' in err) {
        const firebaseError = err as any;
        console.log('Firebase error code:', firebaseError.code);
        console.log('Firebase error message:', firebaseError.message);
        
        switch (firebaseError.code) {
          case 'auth/invalid-credential':
            errorMessage = 'Email ou senha incorretos';
            break;
          case 'auth/user-not-found':
            errorMessage = 'Usuário não encontrado';
            break;
          case 'auth/wrong-password':
            errorMessage = 'Senha incorreta';
            break;
          case 'auth/email-already-in-use':
            errorMessage = 'Email já está em uso';
            break;
          case 'auth/weak-password':
            errorMessage = 'A senha deve ter pelo menos 6 caracteres';
            break;
          case 'auth/too-many-requests':
            errorMessage = 'Muitas tentativas de login. Por favor, aguarde alguns minutos e tente novamente.';
            break;
          default:
            errorMessage = firebaseError.message || 'Usuário ou senha incorretos';
        }
      } else if (err && typeof err === 'object' && 'message' in err) {
        errorMessage = (err as any).message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      }
      
      console.log('Mensagem de erro final:', errorMessage);
      setError(errorMessage);
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

