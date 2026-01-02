import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  getDocs,
  orderBy,
  limit,
  query,
} from "firebase/firestore";
import { db } from "./firebase";

export type UserDoc = {
  dailyGoal: number;
  createdAt: any; // serverTimestamp()
  avatar: {
    skinTone: string;
    equippedItemIds: string[];
  };
};

export type ScoreDoc = {
  bestDailySteps: number;
  updatedAt: any; // serverTimestamp()
};

export const DEFAULT_DAILY_GOAL = 8000;

/**
 * Legt users/{uid} an, falls nicht vorhanden (mit Defaults).
 */
export async function ensureUserDoc(uid: string) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);

  if (snap.exists()) return;

  const data: UserDoc = {
    dailyGoal: DEFAULT_DAILY_GOAL,
    createdAt: serverTimestamp(),
    avatar: {
      skinTone: "default",
      equippedItemIds: [],
    },
  };

  await setDoc(ref, data);
}

/**
 * Legt scores/{uid} an, falls nicht vorhanden (mit Defaults).
 */
export async function ensureScoreDoc(uid: string) {
  const ref = doc(db, "scores", uid);
  const snap = await getDoc(ref);

  if (snap.exists()) return;

  const data: ScoreDoc = {
    bestDailySteps: 0,
    updatedAt: serverTimestamp(),
  };

  await setDoc(ref, data);
}

/**
 * Convenience: stellt sicher, dass Basis-Dokumente existieren.
 */
export async function ensureUserAndScore(uid: string) {
  await Promise.all([ensureUserDoc(uid), ensureScoreDoc(uid)]);
}

/**
 * Updatet bestDailySteps nur, wenn "steps" besser ist als der gespeicherte Wert.
 */
export async function updateHighscoreIfBetter(uid: string, steps: number) {
  const ref = doc(db, "scores", uid);
  const snap = await getDoc(ref);

  // Falls score noch nicht existiert, zuerst anlegen
  if (!snap.exists()) {
    await setDoc(ref, { bestDailySteps: steps, updatedAt: serverTimestamp() });
    return { updated: true, bestDailySteps: steps };
  }

  const current = snap.data() as { bestDailySteps?: number };
  const best = current.bestDailySteps ?? 0;

  if (steps > best) {
    await updateDoc(ref, { bestDailySteps: steps, updatedAt: serverTimestamp() });
    return { updated: true, bestDailySteps: steps };
  }

  return { updated: false, bestDailySteps: best };
}

/**
 * Leaderboard: Top N scores.
 */
export async function getLeaderboard(topN = 20) {
  const q = query(collection(db, "scores"), orderBy("bestDailySteps", "desc"), limit(topN));
  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    uid: d.id,
    ...(d.data() as { bestDailySteps?: number }),
  }));
}
