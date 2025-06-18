'use client'; // Necessário para usar hooks como useState e useRouter

import { useState } from 'react';
import { useRouter } from 'next/navigation'; // Importe de 'next/navigation' no App Router
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase/config'; // Usaremos o arquivo de config do Firebase
import Head from 'next/head';

// Estilos específicos do design Art Deco
const styles = {
  frame: "bg-[rgba(7,72,91,0.5)] border border-deco-gold shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] animate-fade-in",
  title: "font-display font-bold text-deco-gold text-5xl mb-8 text-shadow-[1px_1px_2px_rgba(0,0,0,0.7)] animate-glitch",
  label: "block text-left mb-2 text-deco-gold font-sans",
  input: "bg-[rgba(10,46,54,0.8)] border border-deco-brass text-deco-ivory w-full p-3 rounded-sm transition-all duration-200 focus:outline-none focus:border-deco-gold focus:shadow-[0_0_8px_rgba(197,160,92,0.5)]",
  button: "w-full p-3 font-display font-bold text-deco-dark bg-gradient-to-b from-deco-gold to-deco-brass border border-deco-ivory shadow-[0_2px_4px_rgba(0,0,0,0.5)] rounded-sm transition-all duration-200 hover:brightness-110 hover:shadow-[0_0_3px_#C5A05C] active:translate-y-[1px] active:brightness-90 flex items-center justify-center"
};

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
      router.push('/dashboard'); // Redireciona para o dashboard
    } catch (err) {
      setError('Acesso Negado. Verifique as credenciais.');
      console.error(err);
    }
  };

  return (
    <>
      <Head>
        <title>FORMBRAVO - Login</title>
      </Head>
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className={`w-full max-w-md p-8 text-center ${styles.frame}`}>
            <h1 className={styles.title}>FORMBRAVO</h1>
            
            <form onSubmit={handleLogin} className="space-y-6 animate-fade-in" style={{animationDelay: '200ms'}}>
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
                 {error && <p className="text-red-400 text-center">{error}</p>}
                <button type="submit" className={styles.button}>
                    <span>Acessar Terminal</span>
                </button>
            </form>
        </div>
      </main>
    </>
  );
}
