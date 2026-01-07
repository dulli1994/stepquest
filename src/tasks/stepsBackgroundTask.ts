import * as TaskManager from "expo-task-manager";
import * as BackgroundTask from "expo-background-task";
import { Pedometer } from "expo-sensors";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { auth } from "../services/firebase";
import { updateHighscoreIfBetter } from "../services/db";
import { unlockAchievementsIfNeeded } from "../services/achievements";

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
 * Hilfsfunktion: YYYY-MM-DD
 */
function getDayKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Start of day (00:00) als Date
 */
function getStartOfDay(d: Date) {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * Versucht, den "heute" Schrittwert zu bestimmen.
 * - Primär: AsyncStorage (zuverlässig, weil wir selbst hochzählen)
 * - Optional: getStepCountAsync (falls verfügbar und liefert einen plausiblen Wert)
 */
async function getBestTodaySteps(): Promise<number> {
  const todayKey = getDayKey(new Date());

  const [storedDayKey, storedSteps] = await Promise.all([
    AsyncStorage.getItem(STORAGE_DAY_KEY),
    AsyncStorage.getItem(STORAGE_STEPS_KEY),
  ]);

  let stepsFromStorage = 0;

  if (storedDayKey === todayKey && storedSteps) {
    const parsed = Number(storedSteps);
    if (Number.isFinite(parsed)) stepsFromStorage = parsed;
  } else {
    // Neuer Tag → reset im Storage
    await Promise.all([
      AsyncStorage.setItem(STORAGE_DAY_KEY, todayKey),
      AsyncStorage.setItem(STORAGE_STEPS_KEY, "0"),
    ]);
  }

  // Optional: System-Wert versuchen (kann auf manchen Geräten 0 sein)
  try {
    const start = getStartOfDay(new Date());
    const res = await Pedometer.getStepCountAsync(start, new Date());

    // Nur übernehmen, wenn es plausibel ist (größer als unser lokaler Wert)
    if (typeof res?.steps === "number" && res.steps > stepsFromStorage) {
      await AsyncStorage.setItem(STORAGE_STEPS_KEY, String(res.steps));
      return res.steps;
    }
  } catch {
    // Ignorieren: nicht jedes Gerät unterstützt es zuverlässig
  }

  return stepsFromStorage;
}

/**
 * Der eigentliche Background Task.
 * Hinweis: Auth muss bereits vorhanden sein. Wenn der Nutzer ausgeloggt ist,
 * beenden wir den Task ohne Arbeit.
 */
TaskManager.defineTask(TASK_NAME, async () => {
  try {
    const user = auth.currentUser;
    if (!user) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    const stepsToday = await getBestTodaySteps();

    // Highscore-Update (falls besser)
    await updateHighscoreIfBetter(user.uid, stepsToday);

    // Achievements prüfen (kann Reads/Writes machen)
    await unlockAchievementsIfNeeded(user.uid, stepsToday);

    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    console.log("Background task failed:", e);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/**
 * Registrierung des Background Tasks.
 * minimumInterval ist "Wunsch" in Sekunden – Android entscheidet dennoch.
 */
export async function registerStepsBackgroundTask() {
  const status = await BackgroundTask.getStatusAsync();

  const available =
    status === BackgroundTask.BackgroundTaskStatus.Available ||
    status === BackgroundTask.BackgroundTaskStatus.Restricted;

  if (!available) return;

  const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
  if (isRegistered) return;

  await BackgroundTask.registerTaskAsync(TASK_NAME, {
    minimumInterval: 10 * 60, // 10 Minuten (Startwert)
  });
}

/**
 * Optional: zum Debuggen/Resetten
 */
export async function unregisterStepsBackgroundTask() {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
  if (!isRegistered) return;

  await BackgroundTask.unregisterTaskAsync(TASK_NAME);
}
