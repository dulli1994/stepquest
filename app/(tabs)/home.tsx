import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from "react";
import { Alert, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { unlockAchievementsIfNeeded } from "../../src/services/achievements";
import { updateHighscoreIfBetter } from "../../src/services/db";
import { auth } from "../../src/services/firebase";

const { width } = Dimensions.get('window');

export default function Home() {
  const [steps, setSteps] = useState(0);
  const [status, setStatus] = useState("");
  const goal = 10000;
  const progress = Math.min(steps / goal, 1);

  // DEINE LOGIK (Original übernommen & erweitert)
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
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Oberer Titel-Bereich */}
      <View style={styles.headerSpacer} />
      <Text style={styles.appTitle}>StepQuest</Text>

      {/* Haupt-Card: Schritte (Dein Fortschritt) */}
      <LinearGradient colors={['#5b72ff', '#8b5cf6']} style={styles.mainCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardLabel}>Heutige Schritte</Text>
          <Ionicons name="stats-chart" size={20} color="white" style={{opacity: 0.8}} />
        </View>
        
        {/* Hier werden deine "steps" angezeigt */}
        <Text style={styles.stepNumber}>{steps.toLocaleString('de-DE')}</Text>
        <Text style={styles.goalText}>von {goal.toLocaleString('de-DE')} Schritten</Text>

        <View style={styles.progressContainer}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.progressPercent}>{Math.round(progress * 100)}% erreicht</Text>
        </View>
      </LinearGradient>

      {/* Stats Row: Ziel & Serie */}
      <View style={styles.statsRow}>
        <View style={styles.miniCard}>
          <View style={[styles.miniIconBg, {backgroundColor: '#eff6ff'}]}>
            <Ionicons name="locate" size={18} color="#3b82f6" />
          </View>
          <Text style={styles.miniValue}>{Math.round(progress * 100)}%</Text>
          <Text style={styles.miniLabel}>Ziel Fortschritt</Text>
        </View>
        
        <View style={styles.miniCard}>
          <View style={[styles.miniIconBg, {backgroundColor: '#fff7ed'}]}>
            <Ionicons name="flame" size={18} color="#f97316" />
          </View>
          <Text style={styles.miniValue}>7 Tage</Text>
          <Text style={styles.miniLabel}>Serie am Stück</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Schnellzugriff</Text>
      
      {/* Deine Achievements/Erfolge Section */}
      <TouchableOpacity style={styles.actionCard}>
        <View style={styles.actionLeft}>
          <View style={[styles.iconBox, {backgroundColor: '#fef3c7'}]}>
             <FontAwesome5 name="medal" size={18} color="#fbbf24" />
          </View>
          <View>
            <Text style={styles.actionTitle}>Erfolge</Text>
            <Text style={styles.actionSub}>Tippen zum Ansehen</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#ccc" />
      </TouchableOpacity>

      {/* DEBUG SEKTION (Deine Buttons im schicken Look) */}
      <View style={styles.debugSection}>
        <Text style={styles.debugTitle}>TEST-STEUERUNG</Text>
        {status ? <Text style={styles.statusText}>{status}</Text> : null}
        <View style={styles.debugRow}>
          <TouchableOpacity style={styles.debugBtn} onPress={() => addSteps(500)}>
            <Text style={styles.debugBtnText}>+500</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.debugBtn} onPress={() => addSteps(1000)}>
            <Text style={styles.debugBtnText}>+1000</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.debugUser}>Eingeloggt als: {auth.currentUser?.email ?? "Gast"}</Text>
      </View>

      <View style={{height: 40}} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fcfcfc' },
  headerSpacer: { height: 60 },
  appTitle: { fontSize: 28, fontWeight: '900', color: '#1e293b', marginLeft: 22, marginBottom: 10 },
  mainCard: { margin: 20, borderRadius: 28, padding: 25, elevation: 10, shadowColor: '#8b5cf6', shadowOpacity: 0.3, shadowRadius: 15 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  cardLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 16, fontWeight: '600' },
  stepNumber: { color: 'white', fontSize: 60, fontWeight: 'bold', textAlign: 'center', marginVertical: 10 },
  goalText: { color: 'rgba(255,255,255,0.7)', textAlign: 'center', fontSize: 16, marginBottom: 25 },
  progressContainer: { marginTop: 5 },
  progressBarBg: { height: 12, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 6 },
  progressBarFill: { height: 12, backgroundColor: 'white', borderRadius: 6 },
  progressPercent: { color: 'white', textAlign: 'right', marginTop: 10, fontSize: 13, fontWeight: 'bold' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 25 },
  miniCard: { backgroundColor: 'white', width: width * 0.43, padding: 18, borderRadius: 24, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 },
  miniIconBg: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  miniValue: { fontSize: 24, fontWeight: 'bold', color: '#1e293b' },
  miniLabel: { color: '#94a3b8', fontSize: 13 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', marginLeft: 22, marginBottom: 15, color: '#1e293b' },
  actionCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'white', marginHorizontal: 20, padding: 16, borderRadius: 20, marginBottom: 12, elevation: 1 },
  actionLeft: { flexDirection: 'row', alignItems: 'center' },
  iconBox: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  actionTitle: { fontSize: 17, fontWeight: '700', color: '#1e293b' },
  actionSub: { fontSize: 13, color: '#94a3b8' },
  debugSection: { marginTop: 20, padding: 20, backgroundColor: '#f1f5f9', marginHorizontal: 20, borderRadius: 24 },
  debugTitle: { fontSize: 12, fontWeight: '900', color: '#94a3b8', marginBottom: 15, textAlign: 'center', letterSpacing: 1 },
  statusText: { textAlign: 'center', color: '#6366f1', marginBottom: 15, fontSize: 13, fontWeight: '600' },
  debugRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 15 },
  debugBtn: { backgroundColor: '#1e293b', paddingVertical: 12, paddingHorizontal: 25, borderRadius: 15 },
  debugBtnText: { color: 'white', fontWeight: 'bold' },
  debugUser: { fontSize: 11, color: '#94a3b8', textAlign: 'center' }
});