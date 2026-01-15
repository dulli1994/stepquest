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
  createdAt?: any;
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
 * ✅ Fix (Step 1): ensure darf NICHT jedes Mal Defaults drüberbügeln.
 * Lösung: create-only via Transaction.
 */
export async function ensureUserDoc(uid: string) {
  const ref = doc(db, "users", uid);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) return;

    tx.set(ref, {
      dailyGoal: DEFAULT_DAILY_GOAL,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      unlockedAchievementIds: [],
      unlockedItemIds: [],
      avatar: { skinTone: "default", equippedItemIds: [] },
    });
  });
}

export async function ensureScoreDoc(uid: string) {
  const ref = doc(db, "scores", uid);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) return;

    tx.set(ref, {
      bestDailySteps: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
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
          updatedAt: serverTimestamp(),
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
 */
export async function setDailyGoal(uid: string, goal: number) {
  await ensureUserDoc(uid);

  const ref = doc(db, "users", uid);
  await setDoc(ref, { dailyGoal: goal }, { merge: true });

  await syncTodayGoalFromStoredSteps(uid, goal);
}

/**
 * Upsert: Tageswert in Unter-Collection speichern
 * (bestehender Export bleibt für Backwards-Compatibility)
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
 * ✅ NEU: Upsert + erkennt "goalJustReached" atomar (Race-Condition-safe)
 *
 * Warum?
 * - Wenn Steps schnell mehrmals rein kommen (UI + Background), willst du Sound/Haptik nur 1x
 * - Wir lesen den alten goalReached und schreiben den neuen Zustand in EINER Transaction.
 *
 * Rückgabe:
 * - goalReached: aktueller Zustand
 * - goalJustReached: true nur beim Wechsel von false -> true
 */
export async function upsertDailyStepsAndDetectGoal(uid: string, steps: number, goal: number) {
  const dayKey = getDayKey(new Date());
  const ref = doc(db, "users", uid, "dailySteps", dayKey);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);

    const prevReached = snap.exists() ? !!(snap.data() as any)?.goalReached : false;
    const nextReached = steps >= goal;

    tx.set(
      ref,
      {
        steps,
        date: dayKey,
        goal,
        goalReached: nextReached,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return {
      goalReached: nextReached,
      goalJustReached: !prevReached && nextReached,
    };
  });
}

/**
 * ✅ Step 2 (Fix): Highscore atomar updaten (Race-Condition-safe)
 * - keine getDoc + updateDoc Kombination
 * - nutzt Transaction und schreibt nur, wenn steps > best
 */
export async function updateHighscoreIfBetter(uid: string, steps: number) {
  const ref = doc(db, "scores", uid);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);

    const best = snap.exists() ? ((snap.data() as any)?.bestDailySteps ?? 0) : 0;

    // nichts zu tun
    if (steps <= best) {
      return { updated: false, bestDailySteps: best };
    }

    // neues best
    if (!snap.exists()) {
      tx.set(ref, {
        bestDailySteps: steps,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      tx.update(ref, {
        bestDailySteps: steps,
        updatedAt: serverTimestamp(),
      });
    }

    return { updated: true, bestDailySteps: steps };
  });
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
