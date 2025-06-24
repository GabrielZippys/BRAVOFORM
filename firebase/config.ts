import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
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

// ========================================================================
// CORREÇÃO DEFINITIVA PARA O ERRO DE TIPO (TypeScript)
// ========================================================================

// Função para inicializar e retornar as instâncias do Firebase
function getFirebaseInstances() {
  // Verifica se todas as chaves necessárias foram fornecidas.
  const areCredentialsValid = Object.values(firebaseConfig).every(Boolean);

  if (!areCredentialsValid) {
    // Se alguma chave estiver faltando, lança um erro claro.
    // Isso interrompe a execução e evita que o app rode em um estado quebrado.
    throw new Error("ERRO CRÍTICO: As credenciais do Firebase não foram encontradas. Verifique suas variáveis de ambiente (.env.local ou Vercel).");
  }

  // Se tudo estiver correto, inicializa o Firebase.
  const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
  const auth = getAuth(app);
  const db = getFirestore(app);
  
  return { app, auth, db };
}

// Inicializa e exporta as instâncias.
// Se a função getFirebaseInstances() lançar um erro, estas variáveis nunca serão exportadas.
const { app, auth, db } = getFirebaseInstances();

export { app, auth, db };
