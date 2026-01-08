import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { Pedometer } from "expo-sensors";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  AppStateStatus,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";

import { unlockAchievementsIfNeeded } from "../../src/services/achievements";
import { updateHighscoreIfBetter } from "../../src/services/db";
import { auth } from "../../src/services/firebase";

const { width } = Dimensions.get("window");

const STORAGE_DAY_KEY = "stepquest.today.dayKey";
const STORAGE_STEPS_KEY = "stepquest.today.steps";

function getDayKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getStartOfDay(d: Date) {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  return start;
}

export default function Home() {
  const [steps, setSteps] = useState(0);
  const [showBatteryHint, setShowBatteryHint] = useState(true);

  /**
   * Ref für den aktuellen Schrittstand, damit wir in Callbacks immer den neuesten Wert haben.
   */
  const stepsRef = useRef(0);

  const goal = 10000;
  const progress = Math.min(steps / goal, 1);

  /**
   * Sensor/Timer Refs
   */
  const pedometerSubRef = useRef<{ remove: () => void } | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Tages-Tracking
   */
  const dayKeyRef = useRef<string>(getDayKey(new Date()));
  const startOfDayRef = useRef<Date>(getStartOfDay(new Date()));

  /**
   * Delta-Quelle für watchStepCount
   */
  const lastSensorStepsRef = useRef<number | null>(null);

  /**
   * Watchdog: merkt, wann zuletzt irgendein Update kam
   */
  const lastAnyUpdateMsRef = useRef<number>(Date.now());

  /**
   * Merkt sich den letzten Systemwert (getStepCountAsync).
   * Manche Geräte liefern hier lange den gleichen Wert -> den ignorieren wir dann.
   */
  const lastSystemStepsRef = useRef<number | null>(null);
  const lastSystemChangedMsRef = useRef<number>(0);

  /**
   * Backend-Sync Drosselung
   */
  const lastSyncedStepsRef = useRef(0);
  const lastSyncAtMsRef = useRef(0);
  const SYNC_INTERVAL_MS = 30_000;
  const SYNC_MIN_STEP_DELTA = 300;

  /**
   * Polling/Watchdog:
   * - Polling hilft, wenn watchStepCount sporadisch aussetzt
   * - Häufiger als 5s reagiert besser, ohne die App zu belasten
   */
  const POLL_INTERVAL_MS = 2_000;

  /**
   * Wenn lange keine Sensor-Events kommen, setzen wir die Subscription neu auf.
   */
  const RESUBSCRIBE_AFTER_MS = 30_000;

  /**
   * Setzt Schritte, schreibt sie in AsyncStorage und triggert (gedrosselt) Backend Sync.
   */
  function setStepsAndPersist(nextSteps: number) {
    setSteps(nextSteps);
    stepsRef.current = nextSteps;

    Promise.all([
      AsyncStorage.setItem(STORAGE_DAY_KEY, dayKeyRef.current),
      AsyncStorage.setItem(STORAGE_STEPS_KEY, String(nextSteps)),
    ]).catch(() => {});

    syncBackendIfNeeded(nextSteps).catch(() => {});
  }

  /**
   * Lädt die heutigen Schritte aus AsyncStorage.
   * Wenn neuer Tag -> reset auf 0.
   */
  async function loadTodayFromStorage() {
    const todayKey = getDayKey(new Date());
    dayKeyRef.current = todayKey;
    startOfDayRef.current = getStartOfDay(new Date());

    const [storedDayKey, storedSteps] = await Promise.all([
      AsyncStorage.getItem(STORAGE_DAY_KEY),
      AsyncStorage.getItem(STORAGE_STEPS_KEY),
    ]);

    if (storedDayKey === todayKey && storedSteps) {
      const parsed = Number(storedSteps);
      if (Number.isFinite(parsed)) {
        setSteps(parsed);
        stepsRef.current = parsed;
        return;
      }
    }

    setSteps(0);
    stepsRef.current = 0;

    await Promise.all([
      AsyncStorage.setItem(STORAGE_DAY_KEY, todayKey),
      AsyncStorage.setItem(STORAGE_STEPS_KEY, "0"),
    ]);
  }

  /**
   * Prüft, ob ein neuer Tag angefangen hat (00:00).
   * Dann resetten wir lokal und setzen Baselines zurück.
   */
  async function checkMidnightResetIfNeeded() {
    const nowKey = getDayKey(new Date());
    if (nowKey === dayKeyRef.current) return;

    dayKeyRef.current = nowKey;
    startOfDayRef.current = getStartOfDay(new Date());

    lastSensorStepsRef.current = null;
    lastSystemStepsRef.current = null;
    lastSystemChangedMsRef.current = 0;

    setStepsAndPersist(0);
  }

  /**
   * Sync in die Cloud, aber gedrosselt, damit wir nicht bei jedem Update schreiben.
   */
  async function syncBackendIfNeeded(currentSteps: number) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const nowMs = Date.now();
    const msSinceLast = nowMs - lastSyncAtMsRef.current;
    const stepDelta = currentSteps - lastSyncedStepsRef.current;

    const shouldSync = msSinceLast >= SYNC_INTERVAL_MS || stepDelta >= SYNC_MIN_STEP_DELTA;
    if (!shouldSync) return;

    lastSyncAtMsRef.current = nowMs;
    lastSyncedStepsRef.current = currentSteps;

    try {
      await updateHighscoreIfBetter(uid, currentSteps);

      const ach = await unlockAchievementsIfNeeded(uid, currentSteps);
      if (ach.unlocked.length > 0) {
        Alert.alert("Neuer Erfolg freigeschaltet", ach.unlocked.join(", "));
      }
    } catch (e) {
      console.log("Backend Sync Fehler:", e);
    }
  }

  /**
   * Stoppt Subscription und Polling sauber.
   */
  function stopSensors() {
    pedometerSubRef.current?.remove();
    pedometerSubRef.current = null;

    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }

  /**
   * Startet (oder startet neu) die watchStepCount Subscription.
   * Wichtig: watchStepCount liefert Schritte seit Start der Subscription -> wir rechnen über Delta.
   */
  async function startWatchStepCount() {
    pedometerSubRef.current?.remove();

    pedometerSubRef.current = Pedometer.watchStepCount((result) => {
      lastAnyUpdateMsRef.current = Date.now();

      if (lastSensorStepsRef.current === null) {
        lastSensorStepsRef.current = result.steps;
        return;
      }

      const delta = result.steps - lastSensorStepsRef.current;
      lastSensorStepsRef.current = result.steps;

      // Sensor kann in seltenen Fällen zurückspringen oder einen unplausibel großen Sprung liefern.
      // Negative/0 Deltas ignorieren.
      // Sehr große Deltas behandeln wir als Glitch, um Spike-Writes und falsche Zählerstände zu vermeiden.
      if (delta <= 0) return;
      if (delta > 5000) return;

      const next = stepsRef.current + delta;
      setStepsAndPersist(next);
    });
  }

  /**
   * Resubscribe-Helfer:
   * Android drosselt Sensor-Events manchmal (Doze/Akkuoptimierung).
   * Beim Zurückkommen in den Vordergrund starten wir die Subscription neu.
   */
  async function restartPedometerSubscription() {
    lastAnyUpdateMsRef.current = Date.now();
    await startWatchStepCount();
  }

  /**
   * Prüft Availability + fordert Berechtigung an.
   */
  async function ensurePedometerPermission() {
    const available = await Pedometer.isAvailableAsync();
    if (!available) {
      Alert.alert("Schrittzähler nicht verfügbar", "Dein Gerät unterstützt den Schrittzähler eventuell nicht.");
      return false;
    }

    const perm = await Pedometer.requestPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Berechtigung fehlt",
        "Bitte erlaube den Zugriff auf körperliche Aktivität, damit StepQuest Schritte zählen kann."
      );
      return false;
    }

    return true;
  }

  /**
   * System-Korrektur:
   * getStepCountAsync ist je nach Gerät/OS unterschiedlich zuverlässig.
   * Wir übernehmen den Systemwert nur, wenn er:
   * - größer als unser aktueller Stand ist, UND
   * - nicht über längere Zeit exakt gleich bleibt (z.B. 272 fest)
   */
  function shouldAcceptSystemValue(systemSteps: number, nowMs: number) {
    const current = stepsRef.current;

    if (systemSteps <= current) return false;

    if (lastSystemStepsRef.current === systemSteps) {
      const msStale = nowMs - lastSystemChangedMsRef.current;
      if (msStale > 20_000) return false;
    } else {
      lastSystemStepsRef.current = systemSteps;
      lastSystemChangedMsRef.current = nowMs;
    }

    return true;
  }

  /**
   * Polling:
   * - täglicher Reset prüfen
   * - watchdog/resubscribe, wenn lange keine Updates
   * - optional systembasierte Korrektur (falls verfügbar)
   */
  async function poll() {
    await checkMidnightResetIfNeeded();

    const nowMs = Date.now();

    if (nowMs - lastAnyUpdateMsRef.current > RESUBSCRIBE_AFTER_MS) {
      lastAnyUpdateMsRef.current = nowMs;
      await startWatchStepCount();
    }

    // iOS: systembasierte Korrektur möglich.
    // Android: getStepCountAsync ist nicht verfügbar -> nicht versuchen.
    if (Platform.OS === "ios") {
      try {
        const res = await Pedometer.getStepCountAsync(startOfDayRef.current, new Date());
        if (typeof res?.steps === "number" && shouldAcceptSystemValue(res.steps, nowMs)) {
          setStepsAndPersist(res.steps);
          lastAnyUpdateMsRef.current = nowMs;
        }
      } catch {
        // Ignorieren
      }
    }
  }

  /**
   * Startsequenz: Permission -> watchStepCount -> Polling starten.
   */
  async function start() {
    const ok = await ensurePedometerPermission();
    if (!ok) return;

    await startWatchStepCount();

    if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
    pollingTimerRef.current = setInterval(() => {
      poll().catch(() => {});
    }, POLL_INTERVAL_MS);

    poll().catch(() => {});
  }

  /**
   * Initial: Storage laden + Sensor starten.
   */
  useEffect(() => {
    (async () => {
      await loadTodayFromStorage();
      await start();
    })();

    return () => stopSensors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Stabilität: wenn die App wieder aktiv wird, Subscription neu starten.
   * Das hilft gegen "eingefrorene" Sensor-Updates nach Screen-Off/Doze.
   */
  useEffect(() => {
    let prevState: AppStateStatus = AppState.currentState;

    const sub = AppState.addEventListener("change", (nextState) => {
      const wasBackground = prevState === "inactive" || prevState === "background";
      const isActive = nextState === "active";

      if (wasBackground && isActive) {
        restartPedometerSubscription().catch(() => {});
      }

      prevState = nextState;
    });

    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.headerSpacer} />
      <Text style={styles.appTitle}>StepQuest</Text>

      {showBatteryHint && (
        <View style={styles.hintCard}>
          <View style={styles.hintHeader}>
            <Text style={styles.hintTitle}>Hinweis zur Schrittzählung</Text>
            <TouchableOpacity onPress={() => setShowBatteryHint(false)} hitSlop={10}>
              <Ionicons name="close" size={18} color="#334155" />
            </TouchableOpacity>
          </View>
          <Text style={styles.hintText}>
            Auf manchen Android-Geräten können Akkuoptimierung oder Stromsparmodus die Sensor-Updates drosseln. Wenn die Schritte
            unzuverlässig zählen, stelle für StepQuest in den App-Einstellungen den Akku auf „Uneingeschränkt“ und deaktiviere den
            Stromsparmodus.
          </Text>
        </View>
      )}

      <LinearGradient colors={["#5b72ff", "#8b5cf6"]} style={styles.mainCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardLabel}>Heutige Schritte</Text>
          <Ionicons name="stats-chart" size={20} color="white" style={{ opacity: 0.8 }} />
        </View>

        <Text style={styles.stepNumber}>{steps.toLocaleString("de-DE")}</Text>
        <Text style={styles.goalText}>von {goal.toLocaleString("de-DE")} Schritten</Text>

        <View style={styles.progressContainer}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.progressPercent}>{Math.round(progress * 100)}% erreicht</Text>
        </View>
      </LinearGradient>

      <View style={styles.statsRow}>
        <View style={styles.miniCard}>
          <View style={[styles.miniIconBg, { backgroundColor: "#eff6ff" }]}>
            <Ionicons name="locate" size={18} color="#3b82f6" />
          </View>
          <Text style={styles.miniValue}>{Math.round(progress * 100)}%</Text>
          <Text style={styles.miniLabel}>Ziel Fortschritt</Text>
        </View>

        <View style={styles.miniCard}>
          <View style={[styles.miniIconBg, { backgroundColor: "#fff7ed" }]}>
            <Ionicons name="flame" size={18} color="#f97316" />
          </View>
          <Text style={styles.miniValue}>7 Tage</Text>
          <Text style={styles.miniLabel}>Serie</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Schnellzugriff</Text>

      <TouchableOpacity style={styles.actionCard} onPress={() => router.push("/erfolge")} accessibilityRole="button">
        <View style={styles.actionLeft}>
          <View style={[styles.iconBox, { backgroundColor: "#fef3c7" }]}>
            <FontAwesome5 name="medal" size={18} color="#fbbf24" />
          </View>
          <View>
            <Text style={styles.actionTitle}>Erfolge</Text>
            <Text style={styles.actionSub}>Ansehen</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#ccc" />
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fcfcfc" },
  headerSpacer: { height: 60 },
  appTitle: { fontSize: 28, fontWeight: "900", color: "#1e293b", marginLeft: 22, marginBottom: 10 },

  hintCard: {
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: "white",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  hintHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  hintTitle: { fontSize: 14, fontWeight: "800", color: "#0f172a" },
  hintText: { color: "#334155", fontSize: 13, lineHeight: 18 },

  mainCard: {
    margin: 20,
    borderRadius: 28,
    padding: 25,
    elevation: 10,
    shadowColor: "#8b5cf6",
    shadowOpacity: 0.3,
    shadowRadius: 15,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 5 },
  cardLabel: { color: "rgba(255,255,255,0.9)", fontSize: 16, fontWeight: "600" },
  stepNumber: { color: "white", fontSize: 60, fontWeight: "bold", textAlign: "center", marginVertical: 10 },
  goalText: { color: "rgba(255,255,255,0.7)", textAlign: "center", fontSize: 16, marginBottom: 25 },
  progressContainer: { marginTop: 5 },
  progressBarBg: { height: 12, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 6 },
  progressBarFill: { height: 12, backgroundColor: "white", borderRadius: 6 },
  progressPercent: { color: "white", textAlign: "right", marginTop: 10, fontSize: 13, fontWeight: "bold" },

  statsRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 25 },
  miniCard: {
    backgroundColor: "white",
    width: width * 0.43,
    padding: 18,
    borderRadius: 24,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  miniIconBg: { width: 38, height: 38, borderRadius: 12, justifyContent: "center", alignItems: "center", marginBottom: 12 },
  miniValue: { fontSize: 24, fontWeight: "bold", color: "#1e293b" },
  miniLabel: { color: "#94a3b8", fontSize: 13 },

  sectionTitle: { fontSize: 20, fontWeight: "bold", marginLeft: 22, marginBottom: 15, color: "#1e293b" },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "white",
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
    elevation: 1,
  },
  actionLeft: { flexDirection: "row", alignItems: "center" },
  iconBox: { width: 48, height: 48, borderRadius: 14, justifyContent: "center", alignItems: "center", marginRight: 16 },
  actionTitle: { fontSize: 17, fontWeight: "700", color: "#1e293b" },
  actionSub: { fontSize: 13, color: "#94a3b8" },
});
