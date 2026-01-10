import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import { Pedometer } from "expo-sensors";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  AppStateStatus,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { unlockAchievementsIfNeeded } from "../../src/services/achievements";
import {
  getCurrentStreak,
  getDailyGoal,
  getWeeklySteps,
  upsertDailySteps,
  updateHighscoreIfBetter,
} from "../../src/services/db";
import { auth } from "../../src/services/firebase";
import { readTodayStepsFromHealthConnect } from "../../src/services/healthConnect";

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

function getLast7DaysLabels() {
  const days = ["S", "M", "D", "M", "D", "F", "S"];
  const labels: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    labels.push(days[d.getDay()]);
  }
  return labels;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function Home() {
  const [steps, setSteps] = useState(0);
  const [showBatteryHint, setShowBatteryHint] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [weeklyHeights, setWeeklyHeights] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [weekLabels, setWeekLabels] = useState<string[]>(getLast7DaysLabels());

  const [streakDays, setStreakDays] = useState(0);

  // ✅ Goal dynamisch
  const [goal, setGoal] = useState(10000);
  const goalRef = useRef(10000);
  const goalReadyRef = useRef(false);

  const stepsRef = useRef(0);
  const progress = Math.min(steps / goal, 1);

  const pedometerSubRef = useRef<{ remove: () => void } | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dayKeyRef = useRef<string>(getDayKey(new Date()));
  const startOfDayRef = useRef<Date>(getStartOfDay(new Date()));
  const lastSensorStepsRef = useRef<number | null>(null);
  const lastAnyUpdateMsRef = useRef<number>(Date.now());
  const lastSystemStepsRef = useRef<number | null>(null);
  const lastSystemChangedMsRef = useRef<number>(0);

  const lastSyncedStepsRef = useRef(0);
  const lastSyncAtMsRef = useRef(0);
  const SYNC_INTERVAL_MS = 30_000;
  const SYNC_MIN_STEP_DELTA = 300;
  const POLL_INTERVAL_MS = 2_000;
  const RESUBSCRIBE_AFTER_MS = 30_000;

  async function loadGoal(): Promise<number> {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      goalReadyRef.current = false;
      goalRef.current = 10000;
      setGoal(10000);
      return 10000;
    }

    try {
      const gRaw = await getDailyGoal(uid);
      const g = clamp(Math.round(gRaw), 100, 50000);

      goalRef.current = g;
      setGoal(g);
      goalReadyRef.current = true;

      return g;
    } catch (e) {
      console.log("Fehler beim Laden des Daily Goals:", e);
      goalReadyRef.current = false;
      return goalRef.current;
    }
  }

  async function loadStreak() {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setStreakDays(0);
      return;
    }
    try {
      const s = await getCurrentStreak(uid);
      setStreakDays(s);
    } catch (e) {
      console.log("Fehler beim Laden der Streak:", e);
    }
  }

  async function loadWeeklyData(goalForCalc = goalRef.current) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    try {
      const data = await getWeeklySteps(uid);

      const mappedHeights = data.map((s: number) => {
        const p = (s / goalForCalc) * 100;
        return p > 100 ? 100 : p;
      });

      setWeeklyHeights(mappedHeights);
      setWeekLabels(getLast7DaysLabels());
    } catch (e) {
      console.log("Fehler beim Laden der Wochendaten:", e);
    }
  }

  function setStepsAndPersist(nextSteps: number) {
    const prev = stepsRef.current;
    const g = goalRef.current;

    setSteps(nextSteps);
    stepsRef.current = nextSteps;

    Promise.all([
      AsyncStorage.setItem(STORAGE_DAY_KEY, dayKeyRef.current),
      AsyncStorage.setItem(STORAGE_STEPS_KEY, String(nextSteps)),
    ]).catch(() => {});

    // ✅ Sofortiger Goal-Reached Write (max 1x/Tag) — nur wenn Goal geladen ist
    const uid = auth.currentUser?.uid;
    if (uid && goalReadyRef.current && prev < g && nextSteps >= g) {
      upsertDailySteps(uid, nextSteps, g)
        .then(() => loadStreak())
        .catch(() => {});
    }

    syncBackendIfNeeded(nextSteps).catch(() => {});
  }

  async function onRefresh() {
    setRefreshing(true);
    const g = await loadGoal();
    await Promise.all([loadWeeklyData(g), loadStreak()]);
    setRefreshing(false);
  }

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

  async function checkMidnightResetIfNeeded() {
    const nowKey = getDayKey(new Date());
    if (nowKey === dayKeyRef.current) return;

    dayKeyRef.current = nowKey;
    startOfDayRef.current = getStartOfDay(new Date());
    lastSensorStepsRef.current = null;
    lastSystemStepsRef.current = null;
    lastSystemChangedMsRef.current = 0;

    setStepsAndPersist(0);

    const g = await loadGoal();
    loadWeeklyData(g);
    loadStreak();
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
      // ✅ dailySteps nur, wenn Goal geladen ist
      if (goalReadyRef.current) {
        await upsertDailySteps(uid, currentSteps, goalRef.current);
      }

      await updateHighscoreIfBetter(uid, currentSteps);

      const ach = await unlockAchievementsIfNeeded(uid, currentSteps);
      if (ach.unlocked.length > 0) {
        Alert.alert("Neuer Erfolg freigeschaltet", ach.unlocked.join(", "));
      }

      loadWeeklyData(goalRef.current);
      loadStreak();
    } catch (e) {
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

      if (lastSensorStepsRef.current === null) {
        lastSensorStepsRef.current = result.steps;
        return;
      }

      const delta = result.steps - lastSensorStepsRef.current;
      lastSensorStepsRef.current = result.steps;

      if (delta <= 0 || delta > 5000) return;

      const next = stepsRef.current + delta;
      setStepsAndPersist(next);
    });
  }

  async function restartPedometerSubscription() {
    lastAnyUpdateMsRef.current = Date.now();
    await startWatchStepCount();
  }

  async function ensurePedometerPermission() {
    const available = await Pedometer.isAvailableAsync();
    if (!available) {
      Alert.alert("Schrittzähler nicht verfügbar", "Dein Gerät unterstützt den Schrittzähler eventuell nicht.");
      return false;
    }
    const perm = await Pedometer.requestPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Berechtigung fehlt", "Bitte erlaube den Zugriff auf körperliche Aktivität.");
      return false;
    }
    return true;
  }

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

  async function poll() {
    await checkMidnightResetIfNeeded();

    const nowMs = Date.now();
    if (nowMs - lastAnyUpdateMsRef.current > RESUBSCRIBE_AFTER_MS) {
      lastAnyUpdateMsRef.current = nowMs;
      await startWatchStepCount();
    }

    if (Platform.OS === "ios") {
      try {
        const res = await Pedometer.getStepCountAsync(startOfDayRef.current, new Date());
        if (typeof res?.steps === "number" && shouldAcceptSystemValue(res.steps, nowMs)) {
          setStepsAndPersist(res.steps);
          lastAnyUpdateMsRef.current = nowMs;
        }
      } catch {}
    }
  }

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

  // ✅ Beim Öffnen des Tabs (z.B. zurück vom Profil): Goal neu laden und UI neu berechnen
  useFocusEffect(
    useCallback(() => {
      (async () => {
        const g = await loadGoal();
        await Promise.all([loadWeeklyData(g), loadStreak()]);
      })().catch(() => {});
    }, [])
  );

  useEffect(() => {
    (async () => {
      await loadTodayFromStorage();
      const g = await loadGoal();
      await Promise.all([loadWeeklyData(g), loadStreak()]);
      await start();
    })();

    return () => stopSensors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let prevState: AppStateStatus = AppState.currentState;

    const sub = AppState.addEventListener("change", (nextState) => {
      const wasBackground = prevState === "inactive" || prevState === "background";
      const isActive = nextState === "active";

      if (wasBackground && isActive) {
        restartPedometerSubscription().catch(() => {});

        loadGoal().then((g) => {
          loadWeeklyData(g);
          loadStreak();
        });

        if (Platform.OS === "android") {
          readTodayStepsFromHealthConnect()
            .then((hcSteps) => {
              if (typeof hcSteps === "number" && hcSteps > stepsRef.current) {
                setStepsAndPersist(hcSteps);
              }
            })
            .catch(() => {});
        }
      }

      prevState = nextState;
    });

    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
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
            Auf manchen Android-Geräten können Akkuoptimierung oder Stromsparmodus die Sensor-Updates drosseln.
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
          <Text style={styles.miniValue}>{streakDays} Tage</Text>
          <Text style={styles.miniLabel}>Serie</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Wochenübersicht</Text>
      <View style={styles.weeklyCard}>
        <View style={styles.chartContainer}>
          {weekLabels.map((day, i) => {
            const heightVal = Math.max(weeklyHeights[i] || 0, 5);
            const barColor = weeklyHeights[i] >= 80 ? "#10b981" : "#8b5cf6";

            return (
              <View key={i} style={styles.barColumn}>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { height: `${heightVal}%`, backgroundColor: barColor }]} />
                </View>
                <Text style={styles.dayLabel}>{day}</Text>
              </View>
            );
          })}
        </View>
      </View>

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
  hintText: { fontSize: 13, color: "#64748b", lineHeight: 18 },

  mainCard: { marginHorizontal: 20, borderRadius: 24, padding: 20, marginBottom: 20 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  cardLabel: { color: "rgba(255,255,255,0.9)", fontSize: 14, fontWeight: "600" },
  stepNumber: { fontSize: 42, fontWeight: "900", color: "white", marginBottom: 2, textAlign: "center" },
  goalText: { color: "rgba(255,255,255,0.8)", fontSize: 13, marginBottom: 18, textAlign: "center" },
  progressContainer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  progressBarBg: { flex: 1, height: 8, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 4, marginRight: 10 },
  progressBarFill: { height: 8, backgroundColor: "white", borderRadius: 4 },
  progressPercent: { color: "white", fontWeight: "700", fontSize: 12 },

  statsRow: { flexDirection: "row", justifyContent: "space-between", marginHorizontal: 20, marginBottom: 20 },
  miniCard: {
    flex: 0.48,
    backgroundColor: "white",
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    alignItems: "center",
  },
  miniIconBg: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  miniValue: { fontSize: 16, fontWeight: "800", color: "#1e293b", marginBottom: 2 },
  miniLabel: { fontSize: 12, color: "#64748b", fontWeight: "500" },

  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#1e293b", marginLeft: 22, marginBottom: 12 },

  weeklyCard: {
    marginHorizontal: 20,
    backgroundColor: "white",
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  chartContainer: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", height: 150 },
  barColumn: { alignItems: "center", flex: 1 },
  barTrack: {
    width: 8,
    height: "100%",
    backgroundColor: "#f1f5f9",
    borderRadius: 4,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  barFill: { width: "100%", borderRadius: 4 },
  dayLabel: { marginTop: 8, fontSize: 12, color: "#94a3b8", fontWeight: "600" },
});
