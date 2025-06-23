import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// O código agora lê as chaves de variáveis de ambiente seguras
const firebaseConfig = {
  apiKey: "AIzaSyD5QTf_loBVvL56v_I5LN-pXNCQXjVfvy4",
  authDomain: "formbravo-8854e.firebaseapp.com",
  projectId: "formbravo-8854e",
  storageBucket: "formbravo-8854e.appspot.com",
  messagingSenderId: "1047816908015",
  appId: "1:1047816908015:web:0b812eeee23eca21b6ff1a"
};

let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
