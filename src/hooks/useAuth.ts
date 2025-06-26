'use client';

import { useState, useEffect } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
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
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          setAuthState({ user, appUser: userDocSnap.data() as AppUser, loading: false });
        } else {
          // Utilizador do Firebase existe, mas não há documento no Firestore
          // Isto pode ser um estado de erro, então tratamos como não logado
          setAuthState({ user: null, appUser: null, loading: false });
        }
      } else {
        // Nenhum utilizador autenticado
        setAuthState({ user: null, appUser: null, loading: false });
      }
    });

    return () => unsubscribe();
  }, []);

  return authState;
}
