import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { getFirestore, doc, setDoc, Timestamp } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging, getToken, onMessage, type MessagePayload } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export { app };
export const auth = getAuth(app);
export const db = getFirestore(app);
// Explicitly use the correct bucket
export const storage = getStorage(app, "gs://gpcs-ucty.firebasestorage.app");

// trvalá session v prehliadači
setPersistence(auth, browserLocalPersistence).catch(console.error);

// Google provider + helpery
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

export const signInWithGoogle = () => signInWithPopup(auth, provider);
export const signOutFirebase = () => signOut(auth);
export const onAuthStateChangedFirebase = (cb: (u: User | null) => void) =>
  onAuthStateChanged(auth, cb);

// ============================================================================
// FIREBASE CLOUD MESSAGING (FCM) - Push Notifications
// ============================================================================

let messaging: ReturnType<typeof getMessaging> | null = null;

// Initialize messaging only in browser with service worker support
function initMessaging() {
  if (typeof window !== "undefined" && "serviceWorker" in navigator && !messaging) {
    try {
      messaging = getMessaging(app);
    } catch (e) {
      console.warn("FCM not supported:", e);
    }
  }
  return messaging;
}

// Request permission and get FCM token for push notifications
export async function requestNotificationPermission(): Promise<string | null> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.log("Notification permission denied");
      return null;
    }

    const msg = initMessaging();
    if (!msg) return null;

    // Get VAPID key from environment
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      console.warn("VAPID key not configured");
      return null;
    }

    // Register service worker
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    
    // Get FCM token
    const token = await getToken(msg, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });

    console.log("FCM Token:", token);
    return token;
  } catch (error) {
    console.error("Error getting FCM token:", error);
    return null;
  }
}

// Save FCM token to Firestore for the user
export async function saveFCMToken(userId: string, token: string, companyId: string): Promise<void> {
  const tokenRef = doc(db, "companies", companyId, "fcmTokens", userId);
  await setDoc(tokenRef, {
    token,
    userId,
    updatedAt: Timestamp.now(),
    platform: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? "mobile" : "web",
    userAgent: navigator.userAgent,
  }, { merge: true });
}

// Listen for foreground messages
export function onForegroundMessage(callback: (payload: MessagePayload) => void): () => void {
  const msg = initMessaging();
  if (!msg) return () => {};
  
  return onMessage(msg, callback);
}
