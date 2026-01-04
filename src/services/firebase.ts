import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: "AIzaSyD-vIdKjBRo4H1lTmDhbPFrK3rBOIY3nGA",
  authDomain: "stepquest-827d2.firebaseapp.com",
  projectId: "stepquest-827d2",
  storageBucket: "stepquest-827d2.firebasestorage.app",
  messagingSenderId: "502727854868",
  appId: "1:502727854868:web:24f2a35ffa771016035001",
};

// Firebase App initialisieren
const app = initializeApp(firebaseConfig);

// 🔐 Firebase Auth (mit Persistenz für React Native / Expo)
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});

// 🗄 Firestore Database
export const db = getFirestore(app);
