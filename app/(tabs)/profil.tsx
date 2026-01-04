import React from "react";
import { View, Text, Pressable, StyleSheet, Alert } from "react-native";
import { router } from "expo-router";

import { logout } from "../../src/services/auth";
import { auth } from "../../src/services/firebase";

export default function Profil() {
  async function onLogout() {
    try {
      await logout();

      //Hartes Redirect, um zum login screen zurück zu kommen
      router.replace("/login");
    } catch (e: any) {
      Alert.alert("Logout fehlgeschlagen", e?.message ?? "Unbekannter Fehler");
      console.log("Logout error:", e);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>PROFIL</Text>

      <Text style={styles.small}>
        Eingeloggt als: {auth.currentUser?.email ?? "—"}
      </Text>

      <Pressable style={styles.button} onPress={onLogout}>
        <Text style={styles.buttonText}>Logout</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, backgroundColor: "#fff" },
  title: { fontSize: 24, fontWeight: "700", color: "#111" },
  small: { color: "#333" },
  button: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, backgroundColor: "#111" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
