import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function Impressum() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.appTitle}>StepQuest</Text>
        <Text style={styles.screenTitle}>Impressum</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Angaben gemäß § 5 TMG</Text>
          <View style={styles.iconBox}>
            <Ionicons name="information-circle" size={18} color="#f97316" />
          </View>
        </View>

        <Text style={styles.text}>StepQuest</Text>
        <Text style={styles.text}>Universitäres Projekt (nicht kommerziell)</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Verantwortlich für den Inhalt</Text>
        <Text style={styles.text}>Zwei Privatpersonen (Projektteam StepQuest)</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Kontakt</Text>
        <Text style={styles.text}>E-Mail: paul.dinkheller@stud.hs-ruhrwest.de</Text>
        <Text style={styles.text}>E-Mail: jonas.wilksch@stud.hs-ruhrwest.de</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Projektstatus</Text>
        <Text style={styles.text}>
          Diese App ist ein nicht-kommerzielles universitäres Projekt im Rahmen eines Studienvorhabens. Es erfolgt keine
          Gewinnerzielung, keine Werbung und kein Bezahlmodell.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Hinweis</Text>
        <Text style={styles.text}>
          Dieses Impressum dient derzeit ausschließlich als Platzhalter während der Entwicklungs- und Testphase. Im Falle
          einer öffentlichen Veröffentlichung wird das Impressum entsprechend den gesetzlichen Anforderungen angepasst.
        </Text>
      </View>

      <Text style={styles.footer}>Stand: {new Date().toLocaleDateString("de-DE")}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fcfcfc" },
  content: { paddingBottom: 32 },

  header: { paddingTop: 60, paddingHorizontal: 22, paddingBottom: 10 },
  appTitle: { fontSize: 28, fontWeight: "900", color: "#1e293b", marginBottom: 6 },
  screenTitle: { fontSize: 18, fontWeight: "800", color: "#334155" },

  card: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: "white",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },

  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  cardTitle: { fontSize: 14, fontWeight: "900", color: "#0f172a" },

  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
  },

  text: { fontSize: 14, color: "#334155", lineHeight: 20, marginTop: 4 },
  subText: { fontSize: 12, color: "#64748b", marginTop: 8, lineHeight: 16 },

  footer: { marginTop: 18, textAlign: "center", fontSize: 12, color: "#94a3b8" },
});
