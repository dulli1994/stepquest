import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Pedometer } from "expo-sensors";
import React, { useEffect, useRef, useState } from "react";
import { Alert, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

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

export default function Home() {
  const [steps, setSteps] = useState(0);
  const [showBatteryHint, setShowBatteryHint] = useState(true);

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
  const startOfDayRef = useRef<Date | null>(null);

  /**
   * Delta-Quelle für watchStepCount
   */
  const lastSensorStepsRef = useRef<number | null>(null);

  /**
   * Watchdog: merkt, wann zuletzt irgendein Update kam
   */
  const lastAnyUpdateMsRef = useRef<number>(Date.now());

  /**
   * Backend-Sync Drosselung
   */
  const lastSyncedStepsRef = useRef(0);
  const lastSyncAtMsRef = useRef(0);
  const SYNC_INTERVAL_MS = 30_000;
  const SYNC_MIN_STEP_DELTA = 300;

  /**
   * Polling-Interval:
   * - versucht (wenn möglich) die Tages-Schritte vom System zu holen
   * - ansonsten bleibt Delta-Ansatz aktiv
   * - außerdem watchdog/resubscribe
   */
  const POLL_INTERVAL_MS = 5_000;
  const RESUBSCRIBE_AFTER_MS = 30_000;

  function initStartOfDay() {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    startOfDayRef.current = start;
  }

  async function loadTodayFromStorage() {
    const todayKey = getDayKey(new Date());
    dayKeyRef.current = todayKey;
    initStartOfDay();

    const [storedDayKey, storedSteps] = await Promise.all([
      AsyncStorage.getItem(STORAGE_DAY_KEY),
      AsyncStorage.getItem(STORAGE_STEPS_KEY),
    ]);

    if (storedDayKey === todayKey && storedSteps) {
      const parsed = Number(storedSteps);
      if (Number.isFinite(parsed)) {
        setSteps(parsed);
        return;
      }
    }

    setSteps(0);
    await Promise.all([
      AsyncStorage.setItem(STORAGE_DAY_KEY, todayKey),
      AsyncStorage.setItem(STORAGE_STEPS_KEY, "0"),
    ]);
  }

  async function saveTodayToStorage(nextSteps: number) {
    await Promise.all([
      AsyncStorage.setItem(STORAGE_DAY_KEY, dayKeyRef.current),
      AsyncStorage.setItem(STORAGE_STEPS_KEY, String(nextSteps)),
    ]);
  }

  async function checkMidnightResetIfNeeded() {
    const nowKey = getDayKey(new Date());
    if (nowKey === dayKeyRef.current) return;

    dayKeyRef.current = nowKey;
    initStartOfDay();

    // Baseline zurücksetzen, weil Sensor-Zähler nicht zu unserem Tag passt
    lastSensorStepsRef.current = null;

    setSteps(0);
    await Promise.all([
      AsyncStorage.setItem(STORAGE_DAY_KEY, nowKey),
      AsyncStorage.setItem(STORAGE_STEPS_KEY, "0"),
    ]);
  }

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
    } catch (e: any) {
      console.log("Backend Sync Fehler:", e);
    }
  }

  function stopSensors() {
    pedometerSubRef.current?.remove();
    pedometerSubRef.current = null;

    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }

  async function startWatchStepCount() {
    pedometerSubRef.current?.remove();
    pedometerSubRef.current = Pedometer.watchStepCount((result) => {
      lastAnyUpdateMsRef.current = Date.now();

      // Beim ersten Event nur Baseline setzen
      if (lastSensorStepsRef.current === null) {
        lastSensorStepsRef.current = result.steps;
        return;
      }

      const delta = result.steps - lastSensorStepsRef.current;
      lastSensorStepsRef.current = result.steps;

      if (delta <= 0) return;

      setSteps((prev) => {
        const next = prev + delta;

        // Lokal speichern und Backend drosseln
        saveTodayToStorage(next).catch(() => {});
        syncBackendIfNeeded(next).catch(() => {});

        return next;
      });
    });
  }

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
   * Polling-Funktion:
   * - versucht Tageswert zu holen (wenn möglich)
   * - watchdog/resubscribe, falls lange keine Updates
   */
  async function poll() {
    await checkMidnightResetIfNeeded();

    // Watchdog: wenn lange kein Update, resubscribe
    const nowMs = Date.now();
    if (nowMs - lastAnyUpdateMsRef.current > RESUBSCRIBE_AFTER_MS) {
      lastAnyUpdateMsRef.current = nowMs;
      lastSensorStepsRef.current = null;
      await startWatchStepCount();
    }

    // Optional: wenn getStepCountAsync funktioniert, korrigiert er den Tageswert
    // (auf deinem Gerät war es vorher oft 0 – dann bleibt es einfach wirkungslos)
    try {
      if (!startOfDayRef.current) initStartOfDay();
      const res = await Pedometer.getStepCountAsync(startOfDayRef.current!, new Date());

      // Nur anwenden, wenn der Wert plausibel ist (nicht ständig 0) oder höher als unser lokaler Stand
      if (res.steps > steps) {
        setSteps(res.steps);
        saveTodayToStorage(res.steps).catch(() => {});
        syncBackendIfNeeded(res.steps).catch(() => {});
        lastAnyUpdateMsRef.current = nowMs;
      }
    } catch {
      // Ignorieren: nicht jedes Gerät unterstützt das zuverlässig
    }
  }

  async function start() {
    const ok = await ensurePedometerPermission();
    if (!ok) return;

    await startWatchStepCount();

    // Polling startet zusätzlich (Watchdog + optionale System-Korrektur)
    if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
    pollingTimerRef.current = setInterval(() => {
      poll().catch(() => {});
    }, POLL_INTERVAL_MS);
  }

  useEffect(() => {
    (async () => {
      await loadTodayFromStorage();
      await start();
    })();

    return () => stopSensors();
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

      <TouchableOpacity style={styles.actionCard}>
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
