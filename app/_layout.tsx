import { Stack, router, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import "react-native-reanimated";

// Statischer Import: sorgt dafür, dass TaskManager.defineTask(...) beim Bundle-Load registriert ist
import "../src/tasks/stepsBackgroundTask";

import { registerStepsBackgroundTask } from "../src/tasks/stepsBackgroundTask";
import { subscribeToAuth } from "../src/services/auth";
import { ensureUserAndScore } from "../src/services/db";

// ✅ Sound/Haptik init (Audio Mode)
import { initAudioModeOnce } from "../src/services/feedback";

// ✅ Toast Provider
import { ToastProvider } from "../src/components/ToastProvider";

export const unstable_settings = {
  anchor: "(auth)",
};

export default function RootLayout() {
  const segments = useSegments();

  const [authReady, setAuthReady] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);

  /**
   * ✅ Audio-Mode einmal beim App-Start setzen
   */
  useEffect(() => {
    initAudioModeOnce().catch(() => {});
  }, []);

  /**
   * Registrierung für Background Task.
   */
  useEffect(() => {
    registerStepsBackgroundTask().catch(() => {});
  }, []);

  /**
   * Auth Listener (entscheidet nur "signed in" vs "signed out").
   */
  useEffect(() => {
    const unsub = subscribeToAuth(async (user) => {
      try {
        if (user) {
          await ensureUserAndScore(user.uid);
          setIsSignedIn(true);
        } else {
          setIsSignedIn(false);
        }
      } catch {
        setIsSignedIn(!!user);
      } finally {
        setAuthReady(true);
      }
    });

    return unsub;
  }, []);

  /**
   * Router-Gate: sobald Auth-Status bekannt ist, in die richtige Gruppe navigieren.
   */
  useEffect(() => {
    if (!authReady) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!isSignedIn && !inAuthGroup) {
      router.replace("/(auth)/login");
      return;
    }

    if (isSignedIn && inAuthGroup) {
      router.replace("/(tabs)/home");
    }
  }, [authReady, isSignedIn, segments]);

  if (!authReady) return null;

  return (
    <ToastProvider>
      <>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
        </Stack>
        <StatusBar style="auto" />
      </>
    </ToastProvider>
  );
}
