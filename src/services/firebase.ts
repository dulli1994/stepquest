import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";


const firebaseConfig = {
  apiKey: "AIzaSyD-vIdKjBRo4H1lTmDhbPFrK3rBOIY3nGA",
  authDomain: "stepquest-827d2.firebaseapp.com",
  projectId: "stepquest-827d2",
  storageBucket: "stepquest-827d2.firebasestorage.app",
  messagingSenderId: "502727854868",
  appId: "1:502727854868:web:24f2a35ffa771016035001"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);