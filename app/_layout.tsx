import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import "react-native-reanimated";

import { subscribeToAuth } from "@/src/services/auth";
import { ensureUserAndScore } from "@/src/services/db";

export const unstable_settings = {
  anchor: "(auth)",
};

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    const unsub = subscribeToAuth(async (user) => {
      try {
        if (user) {
          await ensureUserAndScore(user.uid);
          setIsSignedIn(true);
        } else {
          setIsSignedIn(false);
        }
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
