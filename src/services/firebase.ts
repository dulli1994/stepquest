import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp, getApp, getApps } from "firebase/app";
import {
  initializeAuth,
  getAuth,
  getReactNativePersistence,
  setPersistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD-vIdKjBRo4H1lTmDhbPFrK3rBOIY3nGA",
  authDomain: "stepquest-827d2.firebaseapp.com",
  projectId: "stepquest-827d2",
  storageBucket: "stepquest-827d2.firebasestorage.app",
  messagingSenderId: "502727854868",
  appId: "1:502727854868:web:24f2a35ffa771016035001",
};
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

/**
 * Ziel:
 * - initializeAuth mit RN-Persistenz (AsyncStorage)
 * - Falls initializeAuth schon “zu spät” ist: trotzdem setPersistence nachziehen
 * - WICHTIG: nicht still schlucken -> Log, damit wir sehen, was passiert
 */
let authInstance;

try {
  const persistence = getReactNativePersistence(ReactNativeAsyncStorage as any);
  authInstance = initializeAuth(app, { persistence });
  console.log("[firebase] initializeAuth OK (RN persistence aktiv)");
} catch (e: any) {
  console.log("[firebase] initializeAuth FAILED:", e?.message ?? e);

  authInstance = getAuth(app);

  // Wenn Auth schon existiert, versuchen wir Persistenz nachträglich zu setzen.
  try {
    const persistence = getReactNativePersistence(ReactNativeAsyncStorage as any);
    setPersistence(authInstance, persistence).catch((err) => {
      console.log("[firebase] setPersistence FAILED:", err?.message ?? err);
    });
    console.log("[firebase] setPersistence gestartet (Fallback)");
  } catch (e2: any) {
    console.log("[firebase] getReactNativePersistence nicht verfügbar:", e2?.message ?? e2);
  }
}

export const auth = authInstance;
export const db = getFirestore(app);
