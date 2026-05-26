// app/(tabs)/_layout.tsx
// Defines the bottom tab bar and which screens are tabs.

import { Tabs } from "expo-router";
import { Colors } from "../../constants/theme";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.tabBg,
          borderTopColor: Colors.line,
          borderTopWidth: 0.5,
          height: 75,
          paddingBottom: 10,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
        },
        tabBarActiveTintColor: Colors.text,
        tabBarInactiveTintColor: Colors.ter,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="week" options={{ title: "This Week" }} />
      <Tabs.Screen name="log" options={{ title: "Log" }} />
      <Tabs.Screen name="progress" options={{ title: "Progress" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
