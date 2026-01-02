import { View, Text, Pressable, StyleSheet, Alert } from "react-native";
import { logout } from "../../src/services/auth";

export default function Profil() {
  async function onLogout() {
    try {
      await logout();
      // Kein Redirect nötig – RootLayout reagiert auf Auth-Änderung
    } catch (e: any) {
      Alert.alert("Logout fehlgeschlagen", e?.message ?? "Unbekannter Fehler");
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>PROFIL</Text>

      <Pressable style={styles.button} onPress={onLogout}>
        <Text style={styles.buttonText}>Logout</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111",
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#111",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
