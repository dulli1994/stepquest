import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator, TextInput, Keyboard } from "react-native";
import { router } from "expo-router";

import { logout } from "../../src/services/auth";
import { auth } from "../../src/services/firebase";
import { getDailyGoal, setDailyGoal } from "../../src/services/db";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function Profil() {
  const uid = auth.currentUser?.uid ?? null;

  const MIN_GOAL = 100;
  const MAX_GOAL = 50000;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Persisted goal (number) + input string for TextInput
  const [goal, setGoal] = useState<number>(10000);
  const [goalInput, setGoalInput] = useState<string>("10000");

  const goalPretty = useMemo(() => goal.toLocaleString("de-DE"), [goal]);

  async function load() {
    if (!uid) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const g = await getDailyGoal(uid);
      const clamped = clamp(Math.round(g), MIN_GOAL, MAX_GOAL);
      setGoal(clamped);
      setGoalInput(String(clamped));
    } catch (e) {
      console.log("getDailyGoal error:", e);
      Alert.alert("Fehler", "Konnte dein Tagesziel nicht laden.");
    } finally {
      setLoading(false);
    }
  }

  function parseInputToGoal(input: string): number | null {
    const trimmed = input.trim();
    if (!trimmed) return null;

    // Only digits
    if (!/^\d+$/.test(trimmed)) return null;

    const n = Number(trimmed);
    if (!Number.isFinite(n)) return null;
    return n;
  }

  async function onSave() {
    if (!uid) return;

    const parsed = parseInputToGoal(goalInput);
    if (parsed === null) {
      Alert.alert("Ungültige Eingabe", `Bitte gib eine Zahl zwischen ${MIN_GOAL} und ${MAX_GOAL} ein.`);
      return;
    }

    const clamped = clamp(parsed, MIN_GOAL, MAX_GOAL);

    try {
      setSaving(true);
      Keyboard.dismiss();

      await setDailyGoal(uid, clamped);

      // UI state
      setGoal(clamped);
      setGoalInput(String(clamped));
    } catch (e: any) {
      console.log("setDailyGoal error:", e);
      Alert.alert("Fehler", e?.message ?? "Konnte das Tagesziel nicht speichern.");
    } finally {
      setSaving(false);
    }
  }

  async function onLogout() {
    try {
      await logout();
      router.replace("/login");
    } catch (e: any) {
      Alert.alert("Logout fehlgeschlagen", e?.message ?? "Unbekannter Fehler");
      console.log("Logout error:", e);
    }
  }

  useEffect(() => {
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>PROFIL</Text>

      <Text style={styles.small}>Eingeloggt als: {auth.currentUser?.email ?? "—"}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Tagesziel</Text>

        {loading ? (
          <View style={styles.rowCenter}>
            <ActivityIndicator />
            <Text style={styles.small}>Lade…</Text>
          </View>
        ) : (
          <>
            <Text style={styles.goalValue}>{goalPretty}</Text>
            <Text style={styles.goalSub}>Schritte pro Tag</Text>

            <TextInput
              value={goalInput}
              onChangeText={(t) => {
                // keep only digits
                const cleaned = t.replace(/[^\d]/g, "");
                setGoalInput(cleaned);
              }}
              placeholder="z.B. 10000"
              keyboardType="number-pad"
              returnKeyType="done"
              onSubmitEditing={() => onSave().catch(() => {})}
              editable={!saving}
              style={styles.input}
              maxLength={5} // 50000 => 5 digits
            />

            <Text style={styles.hint}>
              Erlaubt: {MIN_GOAL.toLocaleString("de-DE")} – {MAX_GOAL.toLocaleString("de-DE")}
            </Text>

            <Pressable
              style={({ pressed }) => [styles.saveBtn, pressed && styles.pressed, saving && styles.disabled]}
              onPress={() => onSave().catch(() => {})}
              disabled={saving}
            >
              <Text style={styles.saveText}>{saving ? "Speichere…" : "Speichern"}</Text>
            </Pressable>
          </>
        )}
      </View>

      <Pressable style={styles.logoutBtn} onPress={onLogout}>
        <Text style={styles.logoutText}>Logout</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, backgroundColor: "#fff", padding: 24 },
  title: { fontSize: 24, fontWeight: "800", color: "#111" },
  small: { color: "#333" },

  card: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 16,
    padding: 16,
    gap: 10,
    backgroundColor: "#fff",
  },
  cardTitle: { fontSize: 16, fontWeight: "800", color: "#111" },
  goalValue: { fontSize: 36, fontWeight: "900", color: "#111", textAlign: "center" },
  goalSub: { textAlign: "center", color: "#64748b" },

  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
    color: "#111",
  },

  hint: { color: "#94a3b8", fontSize: 12, textAlign: "center" },

  saveBtn: {
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#111",
    alignItems: "center",
  },
  saveText: { color: "#fff", fontWeight: "800", fontSize: 16 },

  rowCenter: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },

  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },

  logoutBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, backgroundColor: "#111" },
  logoutText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
