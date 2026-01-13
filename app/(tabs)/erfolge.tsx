import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";

import { getMyBest, getUser } from "../../src/services/db";
import { auth, db } from "../../src/services/firebase";

// --- KONFIGURATION: BELOHNUNGEN ---
// Mapping von Achievement-ID-Teilen zu den angezeigten Belohnungen.
// "Erste Schritte" ist hier NICHT dabei, also wird dort nichts angezeigt.
const UNLOCK_REWARDS: Record<string, string> = {
  "spaziergang": "Kopfbedeckung: Blaue Cap",
  "enthusiast": "Outfit: Blaues Shirt & Streifen",
  "unaufhaltsam": "Outfit: Schwarzer Tracksuit",
  "sohlenzerstoerer": "Effekt: Brennende Sohlen",
  "meister": "Accessoire: Goldkette (SQ)",
};

type Achievement = {
  id: string;
  title: string;
  stepsRequired: number;
  unlockItemIds: string[];
  order?: number;
};

type AchievementRow = Achievement & {
  isUnlocked: boolean;
  pct: number; // 0..1
  remaining: number;
};

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function formatInt(n: number) {
  return Math.max(0, Math.floor(Number.isFinite(n) ? n : 0)).toLocaleString("de-DE");
}

/**
 * Icon-Mapping für die Achievements
 */
function getIconNameForAchievement(id: string): keyof typeof Ionicons.glyphMap {
  const key = (id || "").toLowerCase();
  if (key.includes("erste") || key.includes("first")) return "walk-outline";
  if (key.includes("meister") || key.includes("10k")) return "trophy-outline";
  if (key.includes("woche") || key.includes("streak")) return "calendar-outline";
  if (key.includes("blitz") || key.includes("speed")) return "flash-outline";
  if (key.includes("stern") || key.includes("rank")) return "star-outline";
  return "medal-outline";
}

/**
 * Hilfsfunktion: Prüft, ob für die Achievement-ID eine Belohnung hinterlegt ist.
 */
function getRewardName(id: string): string | null {
  const lowerId = (id || "").toLowerCase();
  
  // Wir iterieren durch unsere Config und schauen, ob der Key in der ID vorkommt
  const foundKey = Object.keys(UNLOCK_REWARDS).find(k => lowerId.includes(k));
  
  return foundKey ? UNLOCK_REWARDS[foundKey] : null;
}

export default function Erfolge() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [myBest, setMyBest] = useState(0);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function load() {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    setErrorMsg(null);

    // 1) Achievement-Definitionen laden
    const q = query(collection(db, "achievements"), orderBy("stepsRequired", "asc"));
    const snap = await getDocs(q);
    const defs: Achievement[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    }));
    setAchievements(defs);

    // 2) User unlockedAchievementIds laden
    const user = await getUser(uid);
    const unlockedIds = (user as any)?.unlockedAchievementIds ?? [];
    setUnlocked(new Set<string>(unlockedIds));

    // 3) Fortschritt: Bestwert (Tag)
    const best = await getMyBest(uid);
    setMyBest(best);
  }

  async function initialLoad() {
    setLoading(true);
    try {
      await load();
    } catch (e) {
      console.log("Erfolge load() Fehler:", e);
      setErrorMsg("Konnte Erfolge nicht laden. Bitte erneut versuchen.");
    } finally {
      setLoading(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } catch (e) {
      console.log("Erfolge refresh Fehler:", e);
      setErrorMsg("Konnte Erfolge nicht aktualisieren.");
    } finally {
      setRefreshing(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      initialLoad();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const rows: AchievementRow[] = useMemo(() => {
    const best = myBest;

    const mapped = achievements.map((a) => {
      const needed = Math.max(1, Number(a.stepsRequired) || 0);
      const isUnlocked = unlocked.has(a.id) || best >= needed;
      const pct = isUnlocked ? 1 : clamp01(best / needed);
      const remaining = Math.max(0, needed - best);

      return { ...a, isUnlocked, pct, remaining };
    });

    // Sortierung: Erst freigeschaltet, dann pct, dann steps
    mapped.sort((x, y) => {
      if (x.isUnlocked !== y.isUnlocked) return x.isUnlocked ? -1 : 1;
      if (!x.isUnlocked && !y.isUnlocked && y.pct !== x.pct) return y.pct - x.pct;
      return (x.stepsRequired ?? 0) - (y.stepsRequired ?? 0);
    });

    return mapped;
  }, [achievements, unlocked, myBest]);

  const unlockedRows = useMemo(() => rows.filter((r) => r.isUnlocked), [rows]);
  const lockedRows = useMemo(() => rows.filter((r) => !r.isUnlocked), [rows]);

  const sections = useMemo(
    () => [
      { title: `Freigeschaltet (${unlockedRows.length})`, data: unlockedRows },
      { title: `Nicht freigeschaltet (${lockedRows.length})`, data: lockedRows },
    ],
    [unlockedRows, lockedRows]
  );

  const unlockedCount = unlockedRows.length;
  const totalCount = rows.length;
  const unlockedRatio = totalCount > 0 ? unlockedCount / totalCount : 0;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>Lade Erfolge…</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <View style={styles.headerSpacer} />
            <Text style={styles.appTitle}>StepQuest</Text>

            <LinearGradient
              colors={["#FDC700", "#FF6900"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroCard}
            >
              <View style={styles.heroTopRow}>
                <Text style={styles.heroTitle}>Erfolge</Text>
                <Ionicons name="ribbon-outline" size={22} color="white" style={{ opacity: 0.95 }} />
              </View>

              <Text style={styles.heroCount}>
                {unlockedCount}/{Math.max(0, totalCount)}
              </Text>
              <Text style={styles.heroSub}>Freigeschaltet</Text>

              <View style={styles.heroProgressTrack}>
                <View style={[styles.heroProgressFill, { width: `${Math.round(unlockedRatio * 100)}%` }]} />
              </View>
            </LinearGradient>
          </View>
        }
        renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
        renderItem={({ item }) => {
          const needed = Math.max(1, Number(item.stepsRequired) || 0);
          const iconName = getIconNameForAchievement(item.id);
          const rewardName = getRewardName(item.id); // Belohnung ermitteln

          return (
            <View style={styles.itemCard}>
              <View style={styles.iconBox}>
                <Ionicons name={iconName} size={18} color="white" />
              </View>

              <View style={styles.itemTextCol}>
                <Text style={styles.itemTitle} numberOfLines={1}>
                  {item.title}
                </Text>

                <Text style={styles.itemSub} numberOfLines={1}>
                  Erreiche {formatInt(needed)} Schritte an einem Tag
                </Text>

                {/* --- NEU: ANZEIGE DER BELOHNUNG --- */}
                {/* Nur anzeigen, wenn eine Belohnung existiert */}
                {rewardName && (
                  <View style={styles.rewardBadge}>
                    <Ionicons name="gift-outline" size={10} color="#3b82f6" style={{ marginRight: 4 }} />
                    <Text style={styles.rewardText}>{rewardName}</Text>
                  </View>
                )}

                {!item.isUnlocked ? (
                  <View style={styles.itemProgressRow}>
                    <View style={styles.itemProgressTrack}>
                      <View style={[styles.itemProgressFill, { width: `${Math.round(item.pct * 100)}%` }]} />
                    </View>
                    <Text style={styles.itemProgressText}>
                      {formatInt(myBest)}/{formatInt(needed)}
                    </Text>
                  </View>
                ) : null}
              </View>

              <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
            </View>
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fcfcfc" },

  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8, backgroundColor: "#fcfcfc" },
  loadingText: { color: "#64748b" },

  errorText: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 6,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#fecaca",
    color: "#b91c1c",
    padding: 10,
    borderRadius: 12,
  },

  listContent: {
    paddingBottom: 24,
    paddingHorizontal: 0,
    paddingTop: 0,
  },

  headerSpacer: { height: 60 },
  appTitle: { fontSize: 28, fontWeight: "900", color: "#1e293b", marginLeft: 22, marginBottom: 10 },

  heroCard: {
    marginHorizontal: 20,
    borderRadius: 28,
    padding: 25,
    marginBottom: 16,
    elevation: 10,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
  },

  heroTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heroTitle: { color: "rgba(255,255,255,0.95)", fontSize: 16, fontWeight: "800" },
  heroCount: { marginTop: 10, color: "white", fontSize: 44, fontWeight: "900" },
  heroSub: { marginTop: 2, color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: "800" },

  heroProgressTrack: {
    marginTop: 14,
    height: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.35)",
    overflow: "hidden",
  },
  heroProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "white",
  },

  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#64748b",
    marginBottom: 10,
    marginLeft: 22,
    marginTop: 6,
  },

  itemCard: {
    marginHorizontal: 20,
    // Variable Höhe für Reward-Badge zulassen
    minHeight: 82,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "white",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#eef2f7",

    flexDirection: "row",
    alignItems: "center",
    gap: 12,

    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },

  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#FF6900",
    justifyContent: "center",
    alignItems: "center",
  },

  itemTextCol: { flex: 1, justifyContent: "center" },
  itemTitle: { fontSize: 14, fontWeight: "900", color: "#0f172a" },
  itemSub: { marginTop: 2, fontSize: 12, color: "#64748b", fontWeight: "700" },

  // --- STYLES FÜR DEN BELOHNUNGS-BADGE ---
  rewardBadge: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eff6ff",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  rewardText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#3b82f6",
  },

  itemProgressRow: { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 10 },
  itemProgressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#e5e7eb",
    overflow: "hidden",
  },
  itemProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#3b82f6",
  },
  itemProgressText: { fontSize: 11, fontWeight: "800", color: "#94a3b8" },
});