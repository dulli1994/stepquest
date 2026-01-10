import * as TaskManager from "expo-task-manager";
import * as BackgroundTask from "expo-background-task";
import { Pedometer } from "expo-sensors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import { auth } from "../services/firebase";
import { getDayKey, updateHighscoreIfBetter } from "../services/db";
import { unlockAchievementsIfNeeded } from "../services/achievements";
import { readTodayStepsFromHealthConnect } from "../services/healthConnect";

/**
 * Task-Name muss einzigartig sein.
 */
const TASK_NAME = "stepquest-background-steps-sync";

/**
 * Storage-Keys müssen zur Home.tsx passen.
 */
const STORAGE_DAY_KEY = "stepquest.today.dayKey";
const STORAGE_STEPS_KEY = "stepquest.today.steps";

/**
 * Drosselungs-Keys für den Background-Sync.
 * Damit vermeiden wir unnötige Firestore Writes.
 */
const STORAGE_BG_LAST_SYNC_AT = "stepquest.bg.lastSyncAtMs";
const STORAGE_BG_LAST_SYNC_STEPS = "stepquest.bg.lastSyncSteps";

/**
 * Drosselung: mindestens alle X ms oder bei X Steps Differenz syncen.
 * Hintergrund-Tasks sind ohnehin "best effort", daher eher konservativ.
 */
const BG_SYNC_INTERVAL_MS = 60 * 60 * 1000; // 60 Minuten
const BG_SYNC_MIN_STEP_DELTA = 250;

function getStartOfDay(d: Date) {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * Lädt Steps aus AsyncStorage für den heutigen Tag und initialisiert ggf. einen Reset.
 */
async function getStepsFromStorageForToday(): Promise<number> {
  const todayKey = getDayKey(new Date());

  const [storedDayKey, storedSteps] = await Promise.all([
    AsyncStorage.getItem(STORAGE_DAY_KEY),
    AsyncStorage.getItem(STORAGE_STEPS_KEY),
  ]);

  if (storedDayKey === todayKey && storedSteps) {
    const parsed = Number(storedSteps);
    if (Number.isFinite(parsed)) return parsed;
  }

  // Neuer Tag oder ungültig → reset im Storage
  await Promise.all([
    AsyncStorage.setItem(STORAGE_DAY_KEY, todayKey),
    AsyncStorage.setItem(STORAGE_STEPS_KEY, "0"),
  ]);

  return 0;
}

/**
 * Versucht, den "heute" Schrittwert zu bestimmen.
 * - Primär: Health Connect (Android)
 * - iOS: getStepCountAsync (History)
 * - Fallback: AsyncStorage (unser lokaler Counter)
 */
async function getBestTodaySteps(): Promise<number> {
  const stepsFromStorage = await getStepsFromStorageForToday();

  // Android: Health Connect als "Source of Truth" versuchen
  if (Platform.OS === "android") {
    try {
      const hcSteps = await readTodayStepsFromHealthConnect();
      if (typeof hcSteps === "number") {
        // Nur nach oben korrigieren
        if (hcSteps > stepsFromStorage) {
          await AsyncStorage.setItem(STORAGE_STEPS_KEY, String(hcSteps));
          return hcSteps;
        }
      }
    } catch {
      // Ignorieren
    }

    return stepsFromStorage;
  }

  // iOS: Systemwert versuchen
  try {
    const start = getStartOfDay(new Date());
    const res = await Pedometer.getStepCountAsync(start, new Date());

    if (typeof res?.steps === "number" && res.steps > stepsFromStorage) {
      await AsyncStorage.setItem(STORAGE_STEPS_KEY, String(res.steps));
      return res.steps;
    }
  } catch {
    // Ignorieren
  }

  return stepsFromStorage;
}

async function shouldRunBackgroundSync(currentSteps: number): Promise<boolean> {
  const nowMs = Date.now();

  const [lastAtRaw, lastStepsRaw] = await Promise.all([
    AsyncStorage.getItem(STORAGE_BG_LAST_SYNC_AT),
    AsyncStorage.getItem(STORAGE_BG_LAST_SYNC_STEPS),
  ]);

  const lastAtMs = lastAtRaw ? Number(lastAtRaw) : 0;
  const lastSteps = lastStepsRaw ? Number(lastStepsRaw) : 0;

  const timeOk = !Number.isFinite(lastAtMs) || nowMs - lastAtMs >= BG_SYNC_INTERVAL_MS;
  const deltaOk = !Number.isFinite(lastSteps) || currentSteps - lastSteps >= BG_SYNC_MIN_STEP_DELTA;

  return timeOk || deltaOk;
}

async function markBackgroundSyncDone(currentSteps: number) {
  const nowMs = Date.now();
  await Promise.all([
    AsyncStorage.setItem(STORAGE_BG_LAST_SYNC_AT, String(nowMs)),
    AsyncStorage.setItem(STORAGE_BG_LAST_SYNC_STEPS, String(currentSteps)),
  ]);
}

TaskManager.defineTask(TASK_NAME, async () => {
  try {
    const user = auth.currentUser;
    if (!user) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    const stepsToday = await getBestTodaySteps();

    const shouldSync = await shouldRunBackgroundSync(stepsToday);
    if (!shouldSync) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    // updateHighscoreIfBetter() schreibt bei dir bereits dailySteps mit
    await updateHighscoreIfBetter(user.uid, stepsToday);
    await unlockAchievementsIfNeeded(user.uid, stepsToday);

    await markBackgroundSyncDone(stepsToday);

    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    console.log("Background task failed:", e);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerStepsBackgroundTask() {
  const status = await BackgroundTask.getStatusAsync();

  const available =
    status === BackgroundTask.BackgroundTaskStatus.Available ||
    status === BackgroundTask.BackgroundTaskStatus.Restricted;

  if (!available) return;

  const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
  if (isRegistered) return;

  await BackgroundTask.registerTaskAsync(TASK_NAME, {
    minimumInterval: 15 * 60, // 15 Minuten
  });
}

export async function unregisterStepsBackgroundTask() {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
  if (!isRegistered) return;

  await BackgroundTask.unregisterTaskAsync(TASK_NAME);
}
