import { Link, router } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { register } from "../../src/services/auth";

export default function RegisterScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onRegister() {
    try {
      setBusy(true);
      await register(email.trim(), password);
      router.replace("/home");
    } catch (e: any) {
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
