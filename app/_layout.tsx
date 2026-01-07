import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import "react-native-reanimated";

import { subscribeToAuth } from "../src/services/auth";
import { ensureUserAndScore } from "../src/services/db";


export const unstable_settings = {
  anchor: "(auth)",
};

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);

  /**
   * Registrierung für Background Fetch / Task Manager.
   * Wird einmalig beim App-Start versucht zu registrieren.
   * Hinweis: Android entscheidet, wann der Task tatsächlich läuft.
   */
useEffect(() => {
  (async () => {
    try {
      const mod = await import("../src/tasks/stepsBackgroundTask");
      await mod.registerStepsBackgroundTask();
    } catch (e) {
      console.log("Background task not available in this build", e);
    }
  })();
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
