import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, Alert } from "react-native";
import { auth } from "../../src/services/firebase";
import { updateHighscoreIfBetter } from "../../src/services/db";
import { unlockAchievementsIfNeeded } from "../../src/services/achievements";

export default function Home() {
  const [steps, setSteps] = useState(0);
  const [status, setStatus] = useState("");

  async function addSteps(delta: number) {
    const newSteps = steps + delta;
    setSteps(newSteps);

    const uid = auth.currentUser?.uid;
    if (!uid) {
      Alert.alert("Nicht eingeloggt", "Bitte einloggen, um Highscore zu speichern.");
      return;
    }

    try {
      // 1) Highscore updaten
      const res = await updateHighscoreIfBetter(uid, newSteps);
      if (res.updated) {
        setStatus(`✅ Neuer Highscore: ${res.bestDailySteps}`);
      } else {
        setStatus(`ℹ️ Kein neuer Highscore (Best: ${res.bestDailySteps})`);
      }

      // 2) Achievements prüfen & freischalten
      const ach = await unlockAchievementsIfNeeded(uid, newSteps);
      if (ach.unlocked.length > 0) {
        Alert.alert(
          "Erfolg freigeschaltet 🎉",
          `Neu: ${ach.unlocked.join(", ")}\nItems: ${ach.unlockedItems.join(", ")}`
        );
      }
    } catch (e: any) {
      setStatus("❌ Fehler beim Speichern");
      Alert.alert("Firestore Fehler", e?.message ?? "Unbekannter Fehler");
      console.log("Home addSteps error:", e);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>HOME</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Heutige Schritte (Debug)</Text>
        <Text style={styles.big}>{steps}</Text>
        <Text style={styles.small}>User: {auth.currentUser?.email ?? "—"}</Text>
      </View>

      <Pressable style={styles.button} onPress={() => addSteps(500)}>
        <Text style={styles.buttonText}>+500 Schritte</Text>
      </Pressable>

      <Pressable style={styles.button} onPress={() => addSteps(1000)}>
        <Text style={styles.buttonText}>+1000 Schritte</Text>
      </Pressable>

      {!!status && <Text style={styles.status}>{status}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#fff",
  },
  title: { fontSize: 24, fontWeight: "700", color: "#111" },
  card: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 16,
    gap: 6,
    alignItems: "center",
  },
  label: { color: "#555" },
  big: { fontSize: 40, fontWeight: "800", color: "#111" },
  small: { color: "#777" },
  button: {
    width: "100%",
    backgroundColor: "#111",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "700" },
  status: { marginTop: 8, color: "#111", textAlign: "center" },
});
