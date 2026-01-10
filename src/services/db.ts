import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";

export type UserDoc = {
  dailyGoal: number;
  createdAt: any;
  unlockedAchievementIds: string[];
  unlockedItemIds: string[];
  avatar: {
    skinTone: string;
    equippedItemIds: string[];
  };
};

export type ScoreDoc = {
  bestDailySteps: number;
  updatedAt: any;
};

export const DEFAULT_DAILY_GOAL = 8000;

/**
 * Hilfsfunktion für den Datums-Key (YYYY-MM-DD).
 * Bewusst lokale Zeit (nicht UTC), damit Tageswechsel mit dem Gerät übereinstimmt.
 */
export function getDayKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function ensureUserDoc(uid: string) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;

  const data: UserDoc = {
    dailyGoal: DEFAULT_DAILY_GOAL,
    createdAt: serverTimestamp(),
    unlockedAchievementIds: [],
    unlockedItemIds: [],
    avatar: { skinTone: "default", equippedItemIds: [] },
  };
  await setDoc(ref, data);
}

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

export async function ensureUserAndScore(uid: string) {
  await Promise.all([ensureUserDoc(uid), ensureScoreDoc(uid)]);
}

/**
 * Speichert die Schritte für den aktuellen Tag in einer Unter-Collection.
 * Pfad: users/{uid}/dailySteps/{YYYY-MM-DD}
 */
async function saveDailyStepEntry(uid: string, steps: number) {
  const dayKey = getDayKey(new Date());
  const ref = doc(db, "users", uid, "dailySteps", dayKey);

  await setDoc(
    ref,
    {
      steps,
      date: dayKey,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Updatet Highscore UND speichert den Tageswert für die Wochenübersicht.
 */
export async function updateHighscoreIfBetter(uid: string, steps: number) {
  // 1) Tageswert speichern (für Weekly-Chart/Streak-Basis)
  await saveDailyStepEntry(uid, steps);

  // 2) All-Time Highscore prüfen/updaten
  const ref = doc(db, "scores", uid);
  const snap = await getDoc(ref);

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
 * Holt die Schritte der letzten 7 Tage für die Wochenübersicht.
 * Rückgabe: Array mit 7 Werten, ältester -> neuester (heute ganz rechts).
 */
export async function getWeeklySteps(uid: string): Promise<number[]> {
  try {
    const dailyRef = collection(db, "users", uid, "dailySteps");
    const q = query(dailyRef, orderBy("date", "desc"), limit(7));
    const snap = await getDocs(q);

    const results: Record<string, number> = {};
    snap.docs.forEach((d) => {
      const data = d.data() as any;
      if (typeof data?.date === "string") {
        results[data.date] = typeof data?.steps === "number" ? data.steps : 0;
      }
    });

    const chartData: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = getDayKey(d);
      chartData.push(results[key] || 0);
    }

    return chartData;
  } catch (e) {
    console.error("getWeeklySteps error:", e);
    return [0, 0, 0, 0, 0, 0, 0];
  }
}

export async function getMyBest(uid: string) {
  const ref = doc(db, "scores", uid);
  const snap = await getDoc(ref);
  return (snap.data() as { bestDailySteps?: number })?.bestDailySteps ?? 0;
}

export async function getUser(uid: string) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function getLeaderboard(topN = 20) {
  const q = query(collection(db, "scores"), orderBy("bestDailySteps", "desc"), limit(topN));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    uid: d.id,
    ...(d.data() as { bestDailySteps?: number }),
  }));
}
