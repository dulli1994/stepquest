import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { subscribeToAuth } from "@/src/services/auth";
import { ensureUserAndScore } from "@/src/services/db";

export const unstable_settings = {
  anchor: "(auth)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
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
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      {/* ✅ Wichtig: key erzwingt Remount bei Login/Logout */}
      <Stack key={isSignedIn ? "app" : "auth"} screenOptions={{ headerShown: false }}>
        {isSignedIn ? <Stack.Screen name="(tabs)" /> : <Stack.Screen name="(auth)" />}
        <Stack.Screen name="modal" options={{ presentation: "modal", title: "Modal" }} />
      </Stack>

      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
