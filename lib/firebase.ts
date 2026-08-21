import { initializeApp, getApps, getApp } from "firebase/app";
import { GoogleAuthProvider, getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBFZfijzKJPrKIqJxCqzo96YDdq3gqcWEw",
  authDomain: "sevensplit-wbs-dashboard.firebaseapp.com",
  projectId: "sevensplit-wbs-dashboard",
  storageBucket: "sevensplit-wbs-dashboard.firebasestorage.app",
  messagingSenderId: "492318827620",
  appId: "1:492318827620:web:52bd7bef5a2c0b16836b71",
  measurementId: "G-1PSKSMCKHY",
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

export function googleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    hd: "sevensplit.com",
    prompt: "select_account",
  });
  return provider;
}
