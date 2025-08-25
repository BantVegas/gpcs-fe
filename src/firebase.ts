// src/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
  type Unsubscribe,
  type UserCredential,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const config = {
  apiKey: import.meta.env.VITE_FB_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FB_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FB_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FB_APP_ID as string | undefined,
};

// Guard: nech to spadne s jasnou chybou ešte pred Firebase
const missing = Object.entries(config).filter(([, v]) => !v);
if (missing.length) {
  const keys = missing.map(([k]) => k).join(", ");
  throw new Error(`[Firebase] Missing env vars: ${keys}. Skontroluj .env.local a reštartuj dev server.`);
}

// Single init (dôležité pri hot-reload)
const app = getApps().length ? getApp() : initializeApp(config as Required<typeof config>);

const auth = getAuth(app);
const db: Firestore = getFirestore(app);
const provider = new GoogleAuthProvider();

export { app, auth, db };

export function signInWithGoogle(): Promise<UserCredential> {
  return signInWithPopup(auth, provider);
}
export function signOutFirebase(): Promise<void> {
  return signOut(auth);
}
export function onAuthStateChangedFirebase(cb: (u: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, cb);
}
