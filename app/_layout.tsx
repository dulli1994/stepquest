import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import "react-native-reanimated";

// Statischer Import: sorgt dafür, dass TaskManager.defineTask(...) beim Bundle-Load registriert ist
import "../src/tasks/stepsBackgroundTask";
import { registerStepsBackgroundTask } from "../src/tasks/stepsBackgroundTask";

import { subscribeToAuth } from "../src/services/auth";
import { ensureUserAndScore } from "../src/services/db";

export const unstable_settings = {
  anchor: "(auth)",
};

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);

  /**
   * Registrierung für Background Task.
   * Wird einmalig beim App-Start versucht zu registrieren.
   * Hinweis: Android entscheidet, wann der Task tatsächlich läuft (best effort).
   */
  useEffect(() => {
    registerStepsBackgroundTask().catch((e) => {
      console.log("Background task registration failed", e);
    });
  }, []);

  /**
   * Auth State Listener:
   * - wenn eingeloggt: Basis-Dokumente anlegen (users/scores)
   * - dann Routing zwischen (auth) und (tabs)
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
      } catch (e) {
        console.log("ensureUserAndScore failed", e);
        setIsSignedIn(!!user);
      } finally {
        setIsReady(true);
      }
    });

    return unsub;
  }, []);

  if (!isReady) return null;

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        {isSignedIn ? <Stack.Screen name="(tabs)" /> : <Stack.Screen name="(auth)" />}
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}
