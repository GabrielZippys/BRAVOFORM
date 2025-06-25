/******************************************************************************
 * CONFIGURAÇÃO DO FIREBASE CORRIGIDA
 * * Este padrão de inicialização e exportação é mais robusto e evita problemas
 * comuns de "module has no exported member" em projetos modernos com
 * renderização no servidor e no cliente (como o Next.js).
 ******************************************************************************/

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Valida se todas as chaves do ambiente foram carregadas corretamente.
if (!Object.values(firebaseConfig).every(Boolean)) {
    throw new Error("ERRO CRÍTICO: As credenciais do Firebase não foram encontradas. Verifique suas variáveis de ambiente (.env.local ou Vercel).");
}

// Inicializa a app do Firebase apenas uma vez.
// A função getApp() é usada para evitar a reinicialização no lado do cliente com o HMR (Hot Module Replacement) do Next.js
const app: FirebaseApp = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Cria e exporta as instâncias dos serviços do Firebase diretamente.
const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);

export { app, auth, db };
