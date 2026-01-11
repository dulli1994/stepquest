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
  runTransaction,
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

  // ✅ neu (optional, weil alte User es evtl. noch nicht haben)
  username?: string;
  usernameLower?: string;
  updatedAt?: any;
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

/**
 * ✅ Wichtig: niemals "hart überschreiben", sonst gehen username-Felder verloren.
 * Daher immer merge:true.
 */
export async function ensureUserDoc(uid: string) {
  const ref = doc(db, "users", uid);

  const data: UserDoc = {
    dailyGoal: DEFAULT_DAILY_GOAL,
    createdAt: serverTimestamp(),
    unlockedAchievementIds: [],
    unlockedItemIds: [],
    avatar: { skinTone: "default", equippedItemIds: [] },
  };

  // ✅ merge verhindert clobber
  await setDoc(ref, data, { merge: true });
}

export async function ensureScoreDoc(uid: string) {
  const ref = doc(db, "scores", uid);

  const data: ScoreDoc = {
    bestDailySteps: 0,
    updatedAt: serverTimestamp(),
  };

  // ✅ safe
  await setDoc(ref, data, { merge: true });
}

export async function ensureUserAndScore(uid: string) {
  await Promise.all([ensureUserDoc(uid), ensureScoreDoc(uid)]);
}

/**
 * Username normalisieren
 */
function normalizeUsername(raw: string) {
  const display = raw.trim();
  const lower = display.toLowerCase();
  return { display, lower };
}

/**
 * ✅ Username eindeutig reservieren + in users/{uid} speichern
 *
 * Registry: usernames/{usernameLower}
 *  - verhindert Duplikate (case-insensitive)
 *  - Transaction schützt vor Race-Conditions
 *
 * Speichert außerdem in users/{uid}:
 *  - username
 *  - usernameLower
 */
export async function setUsername(uid: string, username: string) {
  const { display, lower } = normalizeUsername(username);

  if (!display) throw new Error("Benutzername darf nicht leer sein.");
  if (lower.length > 20) throw new Error("Benutzername darf maximal 20 Zeichen haben.");

  const userRef = doc(db, "users", uid);
  const nameRef = doc(db, "usernames", lower);

  await runTransaction(db, async (tx) => {
    const [nameSnap, userSnap] = await Promise.all([tx.get(nameRef), tx.get(userRef)]);

    // UserDoc sicherstellen (damit setUsername auch direkt nach register() stabil ist)
    if (!userSnap.exists()) {
      tx.set(
        userRef,
        {
          dailyGoal: DEFAULT_DAILY_GOAL,
          createdAt: serverTimestamp(),
          unlockedAchievementIds: [],
          unlockedItemIds: [],
          avatar: { skinTone: "default", equippedItemIds: [] },
        },
        { merge: true }
      );
    }

    // Name schon vergeben?
    if (nameSnap.exists()) {
      const existing = nameSnap.data() as any;
      if (existing?.uid && existing.uid !== uid) {
        throw new Error("Benutzername ist leider schon vergeben.");
      }
    }

    // Registry setzen/halten
    tx.set(
      nameRef,
      {
        uid,
        username: display,
        usernameLower: lower,
        updatedAt: serverTimestamp(),
        createdAt: nameSnap.exists()
          ? (nameSnap.data() as any)?.createdAt ?? serverTimestamp()
          : serverTimestamp(),
      },
      { merge: true }
    );

    // Im User-Dokument speichern
    tx.set(
      userRef,
      {
        username: display,
        usernameLower: lower,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
}

/**
 * Daily Goal lesen
 */
export async function getDailyGoal(uid: string): Promise<number> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  const v = (snap.data() as any)?.dailyGoal;
  return typeof v === "number" ? v : DEFAULT_DAILY_GOAL;
}

/**
 * Hilfsfunktion: aktualisiert today's dailySteps.goal + goalReached anhand gespeicherter steps.
 * (damit nach Goal-Änderung die Streak für "heute" sofort korrekt ist)
 */
async function syncTodayGoalFromStoredSteps(uid: string, goal: number) {
  const dayKey = getDayKey(new Date());
  const ref = doc(db, "users", uid, "dailySteps", dayKey);
  const snap = await getDoc(ref);

  if (!snap.exists()) return;

  const data = snap.data() as any;
  const steps = typeof data?.steps === "number" ? data.steps : 0;

  await setDoc(
    ref,
    {
      goal,
      goalReached: steps >= goal,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Daily Goal setzen (UserDoc) + heute sofort "goalReached" neu berechnen.
 * Robust: erstellt users/{uid} notfalls (kein updateDoc-Crash)
 */
export async function setDailyGoal(uid: string, goal: number) {
  await ensureUserDoc(uid);

  const ref = doc(db, "users", uid);

  // merge = safe, falls Dokument minimal/anders ist
  await setDoc(ref, { dailyGoal: goal }, { merge: true });

  await syncTodayGoalFromStoredSteps(uid, goal);
}

/**
 * Upsert: Tageswert in Unter-Collection speichern (Basis: Weekly + Streak)
 * Pfad: users/{uid}/dailySteps/{YYYY-MM-DD}
 *
 * Wichtig: wir speichern goal + goalReached pro Tag -> Streak bleibt korrekt,
 * auch wenn das Ziel später geändert wird.
 */
export async function upsertDailySteps(uid: string, steps: number, goal: number) {
  const dayKey = getDayKey(new Date());
  const ref = doc(db, "users", uid, "dailySteps", dayKey);

  await setDoc(
    ref,
    {
      steps,
      date: dayKey,
      goal,
      goalReached: steps >= goal,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Updatet Highscore (Highscore ist unabhängig vom Tagesziel.)
 */
export async function updateHighscoreIfBetter(uid: string, steps: number) {
  const ref = doc(db, "scores", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, { bestDailySteps: steps, updatedAt: serverTimestamp() }, { merge: true });
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

/**
 * Streak: zählt rückwärts ab heute, wie viele Tage in Folge goalReached=true sind.
 * (goalReached wird pro Tag gespeichert -> historisch korrekt)
 *
 * 2. Parameter optional nur für Backwards-Compatibility (falls Home noch getCurrentStreak(uid, goal) nutzt).
 */
export async function getCurrentStreak(uid: string, _unusedGoal?: number): Promise<number> {
  try {
    const dailyRef = collection(db, "users", uid, "dailySteps");
    const q = query(dailyRef, orderBy("date", "desc"), limit(60));
    const snap = await getDocs(q);

    const byDate: Record<string, { goalReached: boolean }> = {};
    snap.docs.forEach((d) => {
      const data = d.data() as any;
      if (typeof data?.date === "string") {
        byDate[data.date] = { goalReached: !!data.goalReached };
      }
    });

    let streak = 0;
    for (let i = 0; i < 60; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = getDayKey(d);

      const entry = byDate[key];
      if (entry?.goalReached) streak += 1;
      else break;
    }

    return streak;
  } catch (e) {
    console.log("getCurrentStreak error:", e);
    return 0;
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
