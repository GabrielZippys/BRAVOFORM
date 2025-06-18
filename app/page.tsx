'use client'; 

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase/config';

export default function LoginPage() {
  const [email, setEmail] = useState('bravo@formbravo.com');
  const [password, setPassword] = useState('123456');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    
    // Verificação para garantir que o auth foi inicializado.
    if (!auth.app) {
        setError("Configuração do Firebase não encontrada. Verifique as credenciais.");
        return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/dashboard');
    } catch (err) {
      // Trata erros específicos do Firebase de forma mais clara
      if (err instanceof Error && 'code' in err) {
        const firebaseError = err as { code: string };
        switch (firebaseError.code) {
          case 'auth/invalid-credential':
          case 'auth/user-not-found':
          case 'auth/wrong-password':
            setError('Acesso Negado. Verifique as credenciais.');
            break;
          case 'auth/invalid-api-key':
            setError('Chave de API do Firebase inválida.');
            break;
          default:
            setError('Ocorreu um erro inesperado.');
        }
      } else {
        setError('Ocorreu um erro inesperado.');
      }
      console.error(err);
    }
  };

  return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md p-8 text-center bg-[rgba(7,72,91,0.5)] border border-deco-gold shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] animate-fade-in">
            <h1 className="font-display font-bold text-deco-gold text-5xl mb-8 [text-shadow:1px_1px_2px_rgba(0,0,0,0.7)] animate-glitch">FORMBRAVO</h1>
            
            <form onSubmit={handleLogin} className="space-y-6" style={{animationDelay: '200ms'}}>
                <div>
                    <label htmlFor="email" className="block text-left mb-2 text-deco-gold font-sans">Identidade</label>
                    <input
                        type="email"
                        id="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="bg-[rgba(10,46,54,0.8)] border border-deco-brass text-deco-ivory w-full p-3 rounded-sm transition-all duration-200 focus:outline-none focus:border-deco-gold focus:shadow-[0_0_8px_rgba(197,160,92,0.5)]"
                        required
                    />
                </div>
                <div>
                    <label htmlFor="password" className="block text-left mb-2 text-deco-gold font-sans">Código de Acesso</label>
                    <input
                        type="password"
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="bg-[rgba(10,46,54,0.8)] border border-deco-brass text-deco-ivory w-full p-3 rounded-sm transition-all duration-200 focus:outline-none focus:border-deco-gold focus:shadow-[0_0_8px_rgba(197,160,92,0.5)]"
                        required
                    />
                </div>
                 {error && <p className="text-red-400 text-center font-sans">{error}</p>}
                <button type="submit" className="w-full p-3 font-display font-bold text-deco-dark bg-gradient-to-b from-deco-gold to-deco-brass border border-deco-ivory shadow-[0_2px_4px_rgba(0,0,0,0.5)] rounded-sm transition-all duration-200 hover:brightness-110 hover:shadow-[0_0_3px_#C5A05C] active:translate-y-[1px] active:brightness-90 flex items-center justify-center">
                    <span>Acessar Terminal</span>
                </button>
            </form>
        </div>
      </main>
  );
}
