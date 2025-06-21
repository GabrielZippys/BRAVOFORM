
'use client'; 

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase/config';
import styles from '../app/styles/Login.module.css';
import Image from 'next/image'; // Importando o componente de Imagem


export default function LoginPage() {
  const [email, setEmail] = useState('bravo@formbravo.com');
  const [password, setPassword] = useState('123456');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/dashboard');
    } catch (err) {
      setError('Acesso Negado. Verifique as credenciais.');
      console.error(err);
    }
  };

  return (
      <main className={styles.main}>
        <div className={styles.frame}>
            {/* Substituindo o H1 pela Logo com animação */}
            <Image
              src="/formbravo-logo.png"
              alt="Logo FORMBRAVO"
              width={250}
              height={300} // Mantém a proporção correta do SVG (100x120)
              priority
              className={styles.logo}
            />
            
            <form onSubmit={handleLogin} className={styles.form}>
                <div>
                    <label htmlFor="email" className={styles.label}>Identidade</label>
                    <input
                        type="email"
                        id="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={styles.input}
                        required
                    />
                </div>
                <div>
                    <label htmlFor="password" className={styles.label}>Código de Acesso</label>
                    <input
                        type="password"
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={styles.input}
                        required
                    />
                </div>
                 {error && <p className={styles.error}>{error}</p>}
                <button type="submit" className={styles.button}>
                    Acessar Terminal
                </button>
            </form>
        </div>
      </main>
  );
}
