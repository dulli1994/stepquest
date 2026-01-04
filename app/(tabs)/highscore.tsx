import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { auth } from "../../src/services/firebase";
import { getLeaderboard } from "../../src/services/db";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../src/services/firebase";

type Row = { uid: string; bestDailySteps?: number };

export default function Highscore() {
  const [rows, setRows] = useState<Row[]>([]);
  const [myBest, setMyBest] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const myUid = useMemo(() => auth.currentUser?.uid ?? null, []);

  async function load() {
    try {
      setRefreshing(true);

      // Leaderboard
      const top = await getLeaderboard(20);
      setRows(top);

      // Eigener Bestwert (aus scores/{uid})
      if (auth.currentUser?.uid) {
        const ref = doc(db, "scores", auth.currentUser.uid);
        const snap = await getDoc(ref);
        setMyBest((snap.data() as any)?.bestDailySteps ?? 0);
      } else {
        setMyBest(null);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.small}>Lade Highscores…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>HIGHSCORE</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Dein Bestwert</Text>
        <Text style={styles.big}>{myBest ?? "—"}</Text>
        <Text style={styles.small}>{auth.currentUser?.email ?? ""}</Text>
      </View>

      <View style={styles.rowBetween}>
        <Text style={styles.subtitle}>Leaderboard (Top 20)</Text>
        <Pressable style={styles.refreshBtn} onPress={load} disabled={refreshing}>
          <Text style={styles.refreshText}>{refreshing ? "…" : "Refresh"}</Text>
        </Pressable>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.uid}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item, index }) => {
          const isMe = myUid && item.uid === myUid;
          return (
            <View style={[styles.item, isMe && styles.itemMe]}>
              <Text style={styles.rank}>#{index + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.uid} numberOfLines={1}>
                  {isMe ? "DU" : item.uid}
                </Text>
              </View>
              <Text style={styles.score}>{item.bestDailySteps ?? 0}</Text>
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
  big: { fontSize: 36, fontWeight: "900", color: "#111" },
  small: { color: "#777" },

  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  subtitle: { fontSize: 16, fontWeight: "700", color: "#111" },
  refreshBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: "#111" },
  refreshText: { color: "#fff", fontWeight: "700" },

  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  itemMe: { borderColor: "#111" },
  rank: { width: 44, fontWeight: "800", color: "#111" },
  uid: { color: "#111" },
  score: { fontWeight: "900", color: "#111" },
});
