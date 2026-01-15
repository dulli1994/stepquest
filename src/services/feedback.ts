import * as Haptics from "expo-haptics";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { AppState } from "react-native";

const audioSource = require("../../assets/sounds/achievement.mp3");

// Singleton-Player (für kurze UI-Sounds)
let player: ReturnType<typeof createAudioPlayer> | null = null;

function ensurePlayer() {
  if (!player) {
    player = createAudioPlayer(audioSource);
  }
  return player;
}

export async function initAudioModeOnce() {
  // iOS: auch im Silent Mode hörbar
  await setAudioModeAsync({
    playsInSilentMode: true,
  });
}

async function playSuccessSoundAndHaptics() {
  // Kein Feedback aus Background Tasks
  if (AppState.currentState !== "active") return;

  // Haptik
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {}

  // Sound (expo-audio spult NICHT automatisch zurück -> seekTo(0)!)
  try {
    const p = ensurePlayer();
    p.seekTo(0);
    p.play();
  } catch (e) {
    console.log("[feedback] sound failed:", e);
  }
}

// ✅ Für Achievements
export async function playAchievementUnlockedFeedback() {
  await playSuccessSoundAndHaptics();
}

// ✅ Für Tagesziel erreicht
export async function playDailyGoalReachedFeedback() {
  await playSuccessSoundAndHaptics();
}

// Optional: wenn du später sauber “unloaden” willst (z.B. beim Logout)
export function releaseFeedbackAudio() {
  try {
    player?.release();
  } catch {}
  player = null;
}
