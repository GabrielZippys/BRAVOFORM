'use client';

import { useState, useEffect } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../../firebase/config';
import { type AppUser } from '../types';

interface AuthState {
  user: User | null;
  appUser: AppUser | null; // Nossos dados de utilizador do Firestore
  loading: boolean;
}

export function useAuth(): AuthState {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    appUser: null,
    loading: true,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Utilizador autenticado, busca os dados do Firestore
        try {
          // CORREÇÃO: Faz uma consulta para encontrar o documento
          // onde o CAMPO 'uid' é igual ao uid do utilizador autenticado.
          const usersQuery = query(collection(db, "users"), where("uid", "==", user.uid));
          const querySnapshot = await getDocs(usersQuery);

          if (!querySnapshot.empty) {
            const userDoc = querySnapshot.docs[0].data() as AppUser;
            setAuthState({ user, appUser: userDoc, loading: false });
          } else {
            // Utilizador do Firebase existe, mas não há documento correspondente no Firestore.
            console.error(`Utilizador autenticado (UID: ${user.uid}) sem documento na coleção 'users'.`);
            setAuthState({ user: null, appUser: null, loading: false });
          }
        } catch (error) {
            console.error("Erro ao buscar perfil do utilizador no Firestore:", error);
            setAuthState({ user: null, appUser: null, loading: false });
        }
        
      } else {
        // Nenhum utilizador autenticado
        setAuthState({ user: null, appUser: null, loading: false });
      }
    });

    // Limpa o listener ao desmontar o componente
    return () => unsubscribe();
  }, []);

  return authState;
}
