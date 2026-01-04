import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { useFocusEffect } from "expo-router";

import { db, auth } from "../../src/services/firebase";
import { getMyBest, getUser } from "../../src/services/db";

type Achievement = {
  id: string;
  title: string;
  stepsRequired: number;
  unlockItemIds: string[];
  order?: number;
};

export default function Erfolge() {
  const [loading, setLoading] = useState(true);

  const [myBest, setMyBest] = useState(0);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [achievements, setAchievements] = useState<Achievement[]>([]);

  async function load() {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    try {
      setLoading(true);

      // 1) Achievements (global)
      const q = query(collection(db, "achievements"), orderBy("stepsRequired", "asc"));
      const snap = await getDocs(q);
      const defs: Achievement[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));
      setAchievements(defs);

      // 2) User unlockedAchievementIds
      const user = await getUser(uid);
      const unlockedIds = (user as any)?.unlockedAchievementIds ?? [];
      setUnlocked(new Set<string>(unlockedIds));

      // 3) Fortschritt: Bestwert aus scores
      const best = await getMyBest(uid);
      setMyBest(best);
    } finally {
      setLoading(false);
    }
  }

  // Auto-Refresh beim Öffnen des Tabs
  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.small}>Lade Erfolge…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ERFOLGE</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Dein Fortschritt (Bestwert)</Text>
        <Text style={styles.big}>{myBest}</Text>
      </View>

      <FlatList
        data={achievements}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => {
          const isUnlocked = unlocked.has(item.id);
          const needed = item.stepsRequired;
          const pct = Math.min(1, myBest / needed);
          const pctText = `${Math.round(pct * 100)}%`;

          return (
            <View style={[styles.item, isUnlocked && styles.itemUnlocked]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>
                  {isUnlocked ? "✅ " : "🔒 "}
                  {item.title}
                </Text>

                <Text style={styles.itemSub}>
                  Ziel: {needed} Schritte • Fortschritt: {isUnlocked ? "Fertig" : pctText}
                </Text>

                <Text style={styles.itemSub} numberOfLines={1}>
                  Unlock: {Array.isArray(item.unlockItemIds) ? item.unlockItemIds.join(", ") : "—"}
                </Text>

                {!isUnlocked && (
                  <View style={styles.progressOuter}>
                    <View style={[styles.progressInner, { width: `${pct * 100}%` }]} />
                  </View>
                )}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8, backgroundColor: "#fff" },
  title: { fontSize: 24, fontWeight: "800", color: "#111" },

  card: { borderWidth: 1, borderColor: "#ddd", borderRadius: 12, padding: 16, gap: 6 },
  label: { color: "#555" },
  big: { fontSize: 32, fontWeight: "900", color: "#111" },
  small: { color: "#777" },

  item: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  itemUnlocked: { borderColor: "#111" },
  itemTitle: { fontSize: 16, fontWeight: "800", color: "#111" },
  itemSub: { marginTop: 4, color: "#555" },

  progressOuter: {
    marginTop: 8,
    height: 10,
    width: "100%",
    borderRadius: 999,
    backgroundColor: "#eee",
    overflow: "hidden",
  },
  progressInner: {
    height: "100%",
    backgroundColor: "#111",
  },
});
