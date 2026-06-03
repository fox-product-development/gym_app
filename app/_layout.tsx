// app/_layout.tsx
// Root layout — loads stored auth token on startup then routes accordingly.

import { useEffect, useState } from "react";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { Colors } from "../constants/theme";
import { loadToken, getToken, getProfile } from "../services/api";

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function init() {
      loadToken();
      if (!getToken()) {
        router.replace("/login");
        setReady(true);
        return;
      }
      try {
        const profile = await getProfile();
        if (!profile.goal_size) {
          router.replace("/onboarding");
        }
      } catch {
        router.replace("/login");
      }
      setReady(true);
    }
    init();
  }, []);

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: Colors.bg }} />;
  }

  return (
    <>
      <StatusBar style="light" backgroundColor={Colors.bg} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bg },
        }}
      >
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="gym-settings" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="session" />
      </Stack>
    </>
  );
}
