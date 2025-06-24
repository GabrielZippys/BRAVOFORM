import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// A configuração agora lê as chaves das variáveis de ambiente de forma segura.
// É crucial que os nomes aqui (ex: NEXT_PUBLIC_FIREBASE_API_KEY) sejam
// exatamente os mesmos que você cadastrou no painel da Vercel.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

let app;

// Esta verificação garante que o Firebase seja inicializado apenas uma vez.
if (!getApps().length) {
  // Apenas tenta inicializar se a chave da API estiver presente.
  // Isso evita erros durante o processo de build se as chaves não forem encontradas.
  if (firebaseConfig.apiKey) {
    app = initializeApp(firebaseConfig);
  } else {
    console.error("ERRO CRÍTICO: As credenciais do Firebase não foram encontradas. Verifique suas variáveis de ambiente (.env.local ou Vercel).");
  }
} else {
  app = getApps()[0];
}

// Inicializa os serviços do Firebase que vamos usar
const auth = getAuth(app);
const db = getFirestore(app);

// Exporta as instâncias para serem usadas em outras partes do site
export { app, auth, db };
