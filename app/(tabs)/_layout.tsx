import React from "react";
import { Tabs } from "expo-router";

export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="home" options={{ title: "HOME" }} />
      <Tabs.Screen name="highscore" options={{ title: "HIGHSCORE" }} />
      <Tabs.Screen name="erfolge" options={{ title: "ERFOLGE" }} />
      <Tabs.Screen name="profil" options={{ title: "PROFIL" }} />
    </Tabs>
  );
}
