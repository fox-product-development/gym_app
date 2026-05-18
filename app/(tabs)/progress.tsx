// app/(tabs)/progress.tsx
// Progress screen

import { View, Text } from "react-native";
import { Colors } from "../../constants/theme";

export default function ProgressScreen() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: Colors.bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: Colors.text }}>Progress</Text>
    </View>
  );
}
