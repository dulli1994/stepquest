import { Link, router } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { register } from "../../src/services/auth";
import { setUsername } from "../../src/services/db";

function normalizeUsername(raw: string) {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  return { display: trimmed, lower };
}

export default function RegisterScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsernameInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function onRegister() {
    const cleanEmail = email.trim();
    const { display, lower } = normalizeUsername(username);

    // ✅ Basic Validierung (damit setUsername überhaupt Sinn macht)
    if (!display) {
      Alert.alert("Fehlt", "Bitte gib einen Benutzernamen ein.");
      return;
    }
    if (display.length < 3) {
      Alert.alert("Zu kurz", "Benutzername muss mindestens 3 Zeichen haben.");
      return;
    }
    if (lower.length > 20) {
      Alert.alert("Zu lang", "Benutzername darf maximal 20 Zeichen haben.");
      return;
    }
    // Erlaubt: Buchstaben/Zahlen . _ -
    if (!/^[a-z0-9._-]+$/i.test(display)) {
      Alert.alert("Ungültig", "Bitte nur Buchstaben/Zahlen sowie . _ - verwenden (keine Leerzeichen).");
      return;
    }

    if (!cleanEmail) {
      Alert.alert("Fehlt", "Bitte gib eine E-Mail ein.");
      return;
    }
    if (!password || password.length < 6) {
      Alert.alert("Fehlt", "Passwort muss mindestens 6 Zeichen haben.");
      return;
    }

    try {
      setBusy(true);

      // 1) Firebase Auth User erstellen
      const user = await register(cleanEmail, password);
      console.log("[register] created user:", user.uid);

      // 2) Username in Firestore reservieren + im users/{uid} speichern
      await setUsername(user.uid, display);
      console.log("[register] setUsername OK");

      router.replace("/home");
    } catch (e: any) {
      console.log("[register] ERROR:", e);
      Alert.alert("Registrierung fehlgeschlagen", e?.message ?? "Unbekannter Fehler");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Account erstellen</Text>

      <TextInput
        placeholderTextColor="#777"
        style={styles.input}
        placeholder="Benutzername"
        autoCapitalize="none"
        value={username}
        onChangeText={(t) => setUsernameInput(t.replace(/\s+/g, ""))} // keine Leerzeichen
      />

      <TextInput
        placeholderTextColor="#777"
        style={styles.input}
        placeholder="E-Mail"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      <TextInput
        placeholderTextColor="#777"
        style={styles.input}
        placeholder="Passwort (mind. 6 Zeichen)"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={onRegister} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? "..." : "Registrieren"}</Text>
      </Pressable>

      <Link href="/login" style={styles.link}>
        Schon einen Account? Zum Login
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
    color: "#111",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 12,
    color: "#111",
    backgroundColor: "#fff",
  },
  button: {
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    backgroundColor: "#111",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: 16, fontWeight: "600", color: "#fff" },
  link: { textAlign: "center", marginTop: 8, color: "#111" },
});
