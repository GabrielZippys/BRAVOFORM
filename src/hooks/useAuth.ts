'use client';

import { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../../firebase/config';

// Interface para definir a estrutura do estado de autenticação
interface AuthState {
  user: User | null;
  loading: boolean;
}

// Nosso hook customizado para gerenciar o estado do usuário
export function useAuth(): AuthState {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    loading: true, // Começa carregando por padrão
  });

  useEffect(() => {
    // O onAuthStateChanged é um listener que avisa sobre mudanças no login
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      // Quando o Firebase responde, atualizamos o estado
      setAuthState({ user, loading: false });
    });

    // Limpa o listener para evitar vazamentos de memória
    return () => unsubscribe();
  }, []);

  return authState;
}
