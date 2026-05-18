// app/(tabs)/index.tsx
// Home / Dashboard screen

import { View, Text } from "react-native";
import { Colors } from "../../constants/theme";

export default function DashboardScreen() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: Colors.bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: Colors.text }}>Dashboard</Text>
    </View>
  );
}
