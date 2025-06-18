// Importe as funções que você precisa dos SDKs que você precisa
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// A configuração do seu app Firebase da web
// CORREÇÃO: Removidos possíveis caracteres invisíveis e garantida a formatação correta.
const firebaseConfig = {
  apiKey: "AIzaSyD5QTf_loBVvL56v_I5LN-pXNCQXjVfvy4",
  authDomain: "formbravo-8854e.firebaseapp.com",
  projectId: "formbravo-8854e",
  storageBucket: "formbravo-8854e.appspot.com",
  messagingSenderId: "1047816908015",
  appId: "1:1047816908015:web:0b812eeee23eca21b6ff1a"
};

// Inicializa o Firebase
let app;

// Evita a reinicialização do app no Next.js em ambiente de desenvolvimento
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
