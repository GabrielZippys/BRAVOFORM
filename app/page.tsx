'use client'; 

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
// Importações necessárias do Firestore
import { doc, getDoc, collection, query, where, getDocs, collectionGroup } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import styles from '../app/styles/Login.module.css';
import Image from 'next/image';
import { type AppUser, type Collaborator } from '../src/types';

export default function LoginPage() {
  const [credential, setCredential] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const isEmail = credential.includes('@');

    if (isEmail) {
      // --- TENTATIVA DE LOGIN DE ADMINISTRADOR (LÓGICA CORRIGIDA) ---
      try {
        const userCredential = await signInWithEmailAndPassword(auth, credential, password);
        const user = userCredential.user;
        
        // LÓGICA CORRIGIDA: Em vez de procurar pelo ID do documento,
        // fazemos uma consulta para encontrar o documento onde o CAMPO 'uid' corresponde.
        const usersQuery = query(collection(db, "users"), where("uid", "==", user.uid));
        const querySnapshot = await getDocs(usersQuery);

        if (!querySnapshot.empty) {
          // Assume que há apenas um utilizador com este UID
          const userDoc = querySnapshot.docs[0];
          const appUser = userDoc.data() as AppUser;

          if (appUser.role === 'Admin') {
            router.push('/dashboard');
          } else {
            await auth.signOut();
            setError('Este utilizador não tem permissões de administrador.');
          }
        } else {
            await auth.signOut();
            setError('Utilizador autenticado, mas sem perfil na base de dados.');
        }

      } catch (error) {
        setError('Credenciais de administrador inválidas. Verifique o email e a senha.');
        console.error("Erro no login de Admin:", error);
      } finally {
        setIsLoading(false);
      }

    } else {
      // --- TENTATIVA DE LOGIN DE COLABORADOR ---
      try {
        const collaboratorsQuery = query(
          collectionGroup(db, 'collaborators'), 
          where("username", "==", credential)
        );
        const querySnapshot = await getDocs(collaboratorsQuery);

        if (querySnapshot.empty) {
          setError('Colaborador não encontrado.');
          setIsLoading(false);
          return;
        }

        let loggedIn = false;
        for (const docSnap of querySnapshot.docs) {
          const collaboratorData = docSnap.data() as Collaborator;
          if (collaboratorData.password === password) {
            loggedIn = true;
            
            const departmentId = docSnap.ref.parent.parent?.id;
            const sessionData = {
                id: docSnap.id,
                username: collaboratorData.username,
                departmentId: departmentId,
            };
            sessionStorage.setItem('collaborator_data', JSON.stringify(sessionData));
            
            router.push('/collaborator-view');
            break; 
          }
        };

        if (!loggedIn) {
          setError('Senha de colaborador incorreta.');
        }

      } catch (collabError: any) {
        console.error("Erro na busca por colaborador:", collabError);
        setError("Erro na base de dados. Verifique o índice do Firestore.");
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
      <main className={styles.main}>
        <div className={styles.frame}>
            <Image
              src="/formbravo-logo.png"
              alt="Logo FORMBRAVO"
              width={250}
              height={150}
              priority
              className={styles.logo}
            />
            
            <form onSubmit={handleLogin} className={styles.form}>
                <div>
                    <label htmlFor="credential" className={styles.label}>Email ou Nome de Usuário</label>
                    <input
                        type="text"
                        id="credential"
                        value={credential}
                        onChange={(e) => setCredential(e.target.value)}
                        className={styles.input}
                        placeholder="Digite sua credencial de acesso"
                        required
                        disabled={isLoading}
                    />
                </div>
                <div>
                    <label htmlFor="password" className={styles.label}>Senha</label>
                    <input
                        type="password"
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={styles.input}
                        required
                        disabled={isLoading}
                    />
                </div>
                {error && <p className={styles.error}>{error}</p>}
                <button type="submit" className={styles.button} disabled={isLoading}>
                    {isLoading ? 'A verificar...' : 'Acessar'}
                </button>
            </form>
        </div>
      </main>
  );
}
