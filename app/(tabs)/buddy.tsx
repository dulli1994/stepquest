import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from "react-native-svg";

import { getUser } from "../../src/services/db"; // Pfad ggf. anpassen
import { auth } from "../../src/services/firebase"; // Pfad ggf. anpassen

// --- KONFIGURATION ---

const STORAGE_AVATAR_KEY = "stepquest.avatar.config";

// Hautfarben (Frei wählbar)
const SKIN_COLORS = [
  "#FCD5B5", // Hell
  "#E8CCA5", // Mittel-Hell
  "#E0AC69", // Mittel
  "#C68642", // Gebräunt
  "#8D5524", // Dunkel
  "#543828", // Sehr Dunkel
];

// Outfits & Accessoires (Gekoppelt an Erfolge)
// WICHTIG: 'reqId' muss ein Teil deiner Firebase-Achievement-ID sein!
const OUTFITS = [
  { id: "default", name: "Start Look", reqId: null, icon: "shirt", color: "#ec4899" }, // Pink/Weiß Standard
  { id: "cap", name: "Coole Cap", reqId: "spaziergang", icon: "happy", color: "#3b82f6" },
  { id: "stripes", name: "Enthusiast", reqId: "enthusiast", icon: "body", color: "#10b981" },
  { id: "tracksuit", name: "Unaufhaltsam", reqId: "unaufhaltsam", icon: "walk", color: "#1e293b" },
  { id: "fire", name: "Sohlenzerstörer", reqId: "sohlenzerstoerer", icon: "flame", color: "#f97316" },
  { id: "gold", name: "Meister", reqId: "meister", icon: "trophy", color: "#fbbf24" },
];

// --- STEP BUDDY SVG KOMPONENTE ---
// Dies ist der runde, detaillierte Avatar (kein Pixelart)
function StepBuddy({ skinColor, outfitId }: { skinColor: string; outfitId: string }) {
  const flameAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (outfitId === "fire") {
      Animated.loop(
        Animated.sequence([
          Animated.timing(flameAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(flameAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [outfitId]);

  const isTracksuit = outfitId === "tracksuit";
  const isStripes = outfitId === "stripes";
  const isCap = outfitId === "cap";
  const isFire = outfitId === "fire";
  const isGold = outfitId === "gold";

  // Farben Logik
  const shirtColor = isTracksuit ? "#1a1a1a" : isStripes ? "#3b82f6" : isCap ? "#60a5fa" : "#ec4899";
  const pantsColor = isTracksuit ? "#1a1a1a" : isStripes ? "#2563eb" : "#db2777";
  const shoeColor = isFire ? "#1a1a1a" : isTracksuit ? "#333" : "#ffffff";

  return (
    <View style={{ width: 200, height: 280, alignItems: "center", justifyContent: "center" }}>
      <Svg width="100%" height="100%" viewBox="0 0 100 150">
        <Defs>
          <ClipPath id="bodyClip">
            <Rect x="25" y="45" width="50" height="60" rx="10" />
          </ClipPath>
        </Defs>

        {/* Schatten am Boden */}
        <Circle cx="50" cy="145" r="30" fill="rgba(0,0,0,0.1)" scaleX={1.5} />

        {/* Hintergund-Effekt für Gold */}
        {isGold && <Circle cx="50" cy="50" r="45" fill="rgba(255, 215, 0, 0.15)" />}

        {/* --- KÖRPER --- */}
        {/* Kopf */}
        <Circle cx="50" cy="35" r="20" fill={skinColor} />
        <Rect x="42" y="50" width="16" height="10" fill={skinColor} />

        {/* Shirt */}
        <Rect x="25" y="55" width="50" height="50" rx="10" fill={shirtColor} />
        
        {/* Detail: Streifen */}
        {isStripes && (
          <G>
            <Rect x="35" y="55" width="4" height="50" fill="white" opacity={0.6} />
            <Rect x="48" y="55" width="4" height="50" fill="white" opacity={0.6} />
            <Rect x="61" y="55" width="4" height="50" fill="white" opacity={0.6} />
          </G>
        )}
        
        {/* Detail: Tracksuit Zipper */}
        {isTracksuit && <Path d="M50 55 L50 75" stroke="#333" strokeWidth="1" />}

        {/* Hose */}
        <Rect x="25" y="90" width="50" height="20" rx="4" fill={pantsColor} />

        {/* Beine */}
        <Rect x="30" y="105" width="14" height="28" fill={isTracksuit ? "#1a1a1a" : skinColor} />
        <Rect x="56" y="105" width="14" height="28" fill={isTracksuit ? "#1a1a1a" : skinColor} />

        {/* Arme */}
        <G rotation="-10" origin="25, 60">
           <Rect x="12" y="58" width="14" height="38" rx="6" fill={isTracksuit ? "#1a1a1a" : skinColor} />
        </G>
        <G rotation="10" origin="75, 60">
           <Rect x="74" y="58" width="14" height="38" rx="6" fill={isTracksuit ? "#1a1a1a" : skinColor} />
        </G>

        {/* Schuhe */}
        <Path d="M28 133 h18 v8 a4 4 0 0 1 -4 4 h-10 a4 4 0 0 1 -4 -4 z" fill={shoeColor} />
        <Path d="M54 133 h18 v8 a4 4 0 0 1 -4 4 h-10 a4 4 0 0 1 -4 -4 z" fill={shoeColor} />

        {/* --- ITEMS & EFFEKTE --- */}
        
        {/* Cap */}
        {isCap && (
          <G>
            <Path d="M28 32 Q50 12 72 32" fill="#2563eb" />
            <Rect x="26" y="32" width="48" height="5" fill="#1d4ed8" />
            <Rect x="68" y="32" width="14" height="4" fill="#1d4ed8" rx="2" />
          </G>
        )}

        {/* Goldkette */}
        {isGold && (
          <G>
            <Path d="M38 55 Q50 75 62 55" stroke="#FFD700" strokeWidth="2.5" fill="none" />
            <Circle cx="50" cy="72" r="5" fill="#FFD700" />
            <Rect x="48" y="70" width="4" height="4" fill="#B8860B" />
          </G>
        )}

        {/* Feuer-Effekt */}
        {isFire && (
          <G>
            <Path d="M28 145 l5 -10 l5 10" stroke="#f97316" strokeWidth="2" fill="none" opacity={0.8} />
            <Path d="M54 145 l5 -12 l5 12" stroke="#f97316" strokeWidth="2" fill="none" opacity={0.8} />
          </G>
        )}

        {/* Gesicht (Neutral / Freundlich) */}
        <Circle cx="43" cy="32" r="2" fill="#1e293b" />
        <Circle cx="57" cy="32" r="2" fill="#1e293b" />
        <Path d="M46 38 Q50 41 54 38" stroke="#1e293b" strokeWidth="1.5" fill="none" strokeLinecap="round" />

      </Svg>
    </View>
  );
}

// --- MAIN PAGE COMPONENT ---

export default function Buddy() {
  const [avatarSkin, setAvatarSkin] = useState(SKIN_COLORS[0]);
  const [avatarOutfit, setAvatarOutfit] = useState("default");
  
  // Welche Items hat der User freigeschaltet?
  const [unlockedOutfits, setUnlockedOutfits] = useState<string[]>(["default"]);
  const [loading, setLoading] = useState(false);
  
  // Initial Laden
  useEffect(() => {
    loadAvatarConfig();
  }, []);

  // Jedes Mal beim Öffnen der Seite prüfen, ob neue Erfolge da sind
  useFocusEffect(
    useCallback(() => {
      checkUnlockedOutfits();
    }, [])
  );

  async function loadAvatarConfig() {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_AVATAR_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.skin) setAvatarSkin(parsed.skin);
        if (parsed.outfit) setAvatarOutfit(parsed.outfit);
      }
    } catch (e) {
      console.log("Fehler beim Laden des Avatars", e);
    }
  }

  async function saveAvatar(skin: string, outfit: string) {
    setAvatarSkin(skin);
    setAvatarOutfit(outfit);
    // Speichern
    await AsyncStorage.setItem(STORAGE_AVATAR_KEY, JSON.stringify({ skin, outfit }));
  }

  async function checkUnlockedOutfits() {
    setLoading(true);
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }

    try {
      const user = await getUser(uid);
      // Hier holen wir die IDs der Achievements aus Firestore
      const unlockedIds = (user as any)?.unlockedAchievementIds || [];

      // Wir prüfen für jedes Outfit in unserer Liste, ob die 'reqId' in den unlockedIds enthalten ist
      const validIds = ["default"];
      OUTFITS.forEach((o) => {
        if (o.id === "default") return;
        // Check: Ist der Teilstring (z.B. "meister") in einer der IDs enthalten?
        const isUnlocked = unlockedIds.some((uid: string) => 
            uid.toLowerCase().includes(o.reqId?.toLowerCase() || "###")
        );
        if (isUnlocked) validIds.push(o.id);
      });

      setUnlockedOutfits(validIds);
    } catch (e) {
      console.log("Fehler beim Checken der Unlocks:", e);
    } finally {
      setLoading(false);
    }
  }

  // Ermittle den Namen des aktuellen Outfits für die Anzeige
  const currentOutfitName = OUTFITS.find(o => o.id === avatarOutfit)?.name || "Unbekannt";

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.headerSpacer} />
      
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.title}>Avatar anpassen</Text>
        <Text style={styles.subtitle}>Personalisiere deinen StepBuddy</Text>
      </View>

      {/* AVATAR PREVIEW CARD */}
      <View style={styles.previewCard}>
        <LinearGradient
          colors={["#f0f5ff", "#e0e7ff"]}
          style={styles.previewGradient}
        >
          <StepBuddy skinColor={avatarSkin} outfitId={avatarOutfit} />
        </LinearGradient>
      </View>

      {/* CONTROLS */}
      <View style={styles.controlsContainer}>
        
        {/* SEKTION 1: HAUTFARBE */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="person-outline" size={18} color="#64748b" />
            <Text style={styles.sectionTitle}>Hautfarbe</Text>
          </View>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {SKIN_COLORS.map((color) => {
              const isSelected = avatarSkin === color;
              return (
                <TouchableOpacity
                  key={color}
                  onPress={() => saveAvatar(color, avatarOutfit)}
                  activeOpacity={0.8}
                  style={[
                    styles.colorOption,
                    { backgroundColor: color },
                    isSelected && styles.optionSelected,
                  ]}
                >
                  {isSelected && <Ionicons name="checkmark" size={20} color="rgba(0,0,0,0.5)" />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* SEKTION 2: OUTFIT & STIL (Zusammengefasst wie im Prototyp 'Outfit-Farbe' + 'Accessoires') */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
             <Ionicons name="shirt-outline" size={18} color="#64748b" />
             <Text style={styles.sectionTitle}>Stil & Ausrüstung</Text>
             <Text style={styles.selectedLabel}>{currentOutfitName}</Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {OUTFITS.map((item) => {
              const isUnlocked = unlockedOutfits.includes(item.id);
              const isSelected = avatarOutfit === item.id;

              return (
                <TouchableOpacity
                  key={item.id}
                  disabled={!isUnlocked}
                  onPress={() => saveAvatar(avatarSkin, item.id)}
                  activeOpacity={0.7}
                  style={[
                    styles.outfitOption,
                    isSelected && styles.outfitSelectedBox,
                    !isUnlocked && styles.outfitLockedBox
                  ]}
                >
                  {/* Das Icon-Quadrat */}
                  <View style={[styles.iconBox, { backgroundColor: isUnlocked ? item.color : "#cbd5e1" }]}>
                    {isUnlocked ? (
                        <Ionicons name={item.icon as any} size={20} color="white" />
                    ) : (
                        <Ionicons name="lock-closed" size={18} color="#64748b" />
                    )}
                  </View>
                  
                  {/* Kleiner Auswahl-Indikator darunter */}
                  {isSelected && <View style={styles.dotIndicator} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

      </View>

      {/* Lade-Indikator falls Unlocks geprüft werden */}
      {loading && (
        <View style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color="#5b72ff" />
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fcfcfc" },
  headerSpacer: { height: 60 },
  
  header: { alignItems: "center", marginBottom: 20 },
  title: { fontSize: 20, fontWeight: "700", color: "#1e293b", marginBottom: 4 },
  subtitle: { fontSize: 13, color: "#64748b" },

  // Preview Card (Das große Bild in der Mitte)
  previewCard: {
    marginHorizontal: 20,
    height: 320,
    borderRadius: 24,
    overflow: "hidden",
    marginBottom: 25,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  previewGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  // Controls Container (Die weiße Box unten im Screenshot)
  controlsContainer: {
    marginHorizontal: 20,
    backgroundColor: "white",
    borderRadius: 24,
    paddingVertical: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },

  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
    marginLeft: 8,
    flex: 1,
  },
  selectedLabel: {
    fontSize: 12,
    color: "#5b72ff",
    fontWeight: "600",
  },

  scrollContent: {
    paddingHorizontal: 20,
    gap: 12, // Abstand zwischen Items
  },

  // Hautfarbe Buttons
  colorOption: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  optionSelected: {
    borderWidth: 3,
    borderColor: "#3b82f6",
  },

  // Outfit Buttons
  outfitOption: {
    alignItems: "center",
    justifyContent: "center",
    width: 52,
  },
  outfitSelectedBox: {
      // Styling für aktives Outfit
  },
  outfitLockedBox: {
      opacity: 0.6
  },
  iconBox: {
      width: 48,
      height: 48,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOpacity: 0.1,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
  },
  dotIndicator: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: "#3b82f6",
      marginTop: 8,
  },

  loadingOverlay: {
      position: 'absolute',
      top: 20, right: 20,
  }
});