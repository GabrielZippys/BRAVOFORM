'use client';

import { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
// Certifique-se de que o caminho para a configuração do Firebase está correto.
// O alias '@/' aponta para a pasta raiz ou 'src/', dependendo da sua configuração.
import { auth } from '../../firebase/config';

interface AuthState {
  user: User | null;
  loading: boolean;
}

// Hook customizado que gerencia e expõe o estado de autenticação do usuário.
export function useAuth(): AuthState {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    loading: true, // A aplicação começa em estado de carregamento.
  });

  useEffect(() => {
    // O onAuthStateChanged é um listener do Firebase que nos avisa sempre que o status de login muda.
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      // Quando o Firebase nos dá uma resposta (seja um usuário ou nulo),
      // atualizamos nosso estado e informamos que o carregamento da autenticação terminou.
      setAuthState({ user, loading: false });
    });

    // Esta função é chamada quando o componente que usa o hook é desmontado.
    // Ela "desliga" o listener para evitar vazamentos de memória.
    return () => unsubscribe();
  }, []);

  return authState;
}
