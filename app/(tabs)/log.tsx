// app/(tabs)/log.tsx
// Body Composition Log screen
// Manual entry for weight and muscle mass, with trend charts.

import { View, Text, ScrollView, Pressable } from "react-native";
import { Colors } from "../../constants/theme";

// ─── Reusable primitives ─────────────────────────────────────────────────────

function Tag({
  children,
  color = Colors.sec,
  bg,
}: {
  children: React.ReactNode;
  color?: string;
  bg?: string;
}) {
  return (
    <View
      style={{
        alignSelf: "flex-start",
        borderRadius: 4,
        paddingHorizontal: 7,
        paddingVertical: 3,
        backgroundColor: bg || "transparent",
        borderWidth: bg ? 0 : 0.5,
        borderColor: Colors.line2,
      }}
    >
      <Text
        style={{
          fontFamily: "Courier",
          fontSize: 10,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

function Card({
  children,
  style,
  pad = 16,
}: {
  children: React.ReactNode;
  style?: object;
  pad?: number;
}) {
  return (
    <View
      style={{
        backgroundColor: Colors.card,
        borderRadius: 16,
        padding: pad,
        borderWidth: 0.5,
        borderColor: Colors.line,
        ...style,
      }}
    >
      {children}
    </View>
  );
}

// ─── Mini bar chart ───────────────────────────────────────────────────────────

function MiniChart({
  points,
  color,
  height = 88,
  label,
  yLabels,
}: {
  points: number[];
  color: string;
  height?: number;
  label?: string;
  yLabels?: [string, string];
}) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  return (
    <View style={{ marginTop: 8 }}>
      <View
        style={{ flexDirection: "row", alignItems: "flex-end", height, gap: 2 }}
      >
        {points.map((p, i) => {
          const barHeight = ((p - min) / range) * (height - 8) + 8;
          const isLast = i === points.length - 1;
          return (
            <View
              key={i}
              style={{
                flex: 1,
                height: barHeight,
                borderRadius: 2,
                backgroundColor: isLast ? color : color + "40",
              }}
            />
          );
        })}
      </View>
      {(label || yLabels) && (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginTop: 4,
          }}
        >
          <Text
            style={{ fontFamily: "Courier", fontSize: 9, color: Colors.ter }}
          >
            {yLabels ? yLabels[0] : ""}
          </Text>
          <Text
            style={{ fontFamily: "Courier", fontSize: 9, color: Colors.ter }}
          >
            {label || (yLabels ? yLabels[1] : "")}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Numpad ───────────────────────────────────────────────────────────────────

function Numpad() {
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, ".", 0, "⌫"];
  return (
    <Card pad={10} style={{ marginHorizontal: 20, marginTop: 10 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
        {keys.map((k, i) => (
          <Pressable
            key={i}
            style={{
              width: "30%",
              paddingVertical: 12,
              alignItems: "center",
              backgroundColor: Colors.card2,
              borderRadius: 8,
              // account for gap
              marginBottom: 0,
            }}
          >
            <Text
              style={{
                fontFamily: "Courier",
                fontSize: 18,
                fontWeight: "600",
                color: typeof k === "number" ? Colors.text : Colors.sec,
              }}
            >
              {k}
            </Text>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

// ─── Chart data ───────────────────────────────────────────────────────────────

const WEIGHT_POINTS = [
  77.2, 77.0, 77.4, 77.1, 77.5, 77.6, 77.8, 77.7, 78.0, 78.2, 78.1, 78.4,
];
const MUSCLE_POINTS = [
  36.0, 36.1, 36.0, 36.2, 36.3, 36.3, 36.4, 36.5, 36.5, 36.6, 36.7, 36.8,
];

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function LogScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* header */}
        <View
          style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 4 }}
        >
          <Text
            style={{
              fontFamily: "Courier",
              fontSize: 11,
              color: Colors.ter,
              letterSpacing: 0.6,
              textTransform: "uppercase",
            }}
          >
            Progress · Body
          </Text>
          <Text
            style={{
              fontSize: 30,
              fontWeight: "700",
              color: Colors.text,
              letterSpacing: -0.6,
              marginTop: 4,
            }}
          >
            Body Comp
          </Text>
        </View>

        {/* entry card */}
        <View style={{ marginHorizontal: 20, marginTop: 14 }}>
          <Card pad={16}>
            {/* card header */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  fontFamily: "Courier",
                  fontSize: 10,
                  color: Colors.ter,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                }}
              >
                Log · Today, May 18
              </Text>
              <Tag color={Colors.accent}>2-day streak</Tag>
            </View>

            {/* input fields */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              {/* weight — active */}
              <View
                style={{
                  flex: 1,
                  backgroundColor: Colors.bg,
                  borderRadius: 12,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: Colors.accent,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Courier",
                    fontSize: 9,
                    color: Colors.ter,
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                  }}
                >
                  Weight
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-end",
                    gap: 4,
                    marginTop: 8,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 30,
                      fontWeight: "700",
                      color: Colors.text,
                      letterSpacing: -0.6,
                    }}
                  >
                    78.4
                  </Text>
                  <Text
                    style={{ fontSize: 12, color: Colors.sec, marginBottom: 4 }}
                  >
                    kg
                  </Text>
                  {/* cursor blink */}
                  <View
                    style={{
                      width: 1.5,
                      height: 24,
                      backgroundColor: Colors.accent,
                      marginLeft: 2,
                      marginBottom: 4,
                    }}
                  />
                </View>
              </View>

              {/* muscle mass — inactive */}
              <View
                style={{
                  flex: 1,
                  backgroundColor: Colors.bg,
                  borderRadius: 12,
                  padding: 12,
                  borderWidth: 0.5,
                  borderColor: Colors.line2,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Courier",
                    fontSize: 9,
                    color: Colors.ter,
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                  }}
                >
                  Muscle Mass
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-end",
                    gap: 4,
                    marginTop: 8,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 30,
                      fontWeight: "700",
                      color: Colors.ter,
                      letterSpacing: -0.6,
                    }}
                  >
                    —
                  </Text>
                  <Text
                    style={{ fontSize: 12, color: Colors.ter, marginBottom: 4 }}
                  >
                    kg
                  </Text>
                </View>
              </View>
            </View>

            {/* save button */}
            <Pressable
              style={{
                marginTop: 12,
                backgroundColor: Colors.text,
                borderRadius: 10,
                padding: 12,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#000" }}>
                Save Entry
              </Text>
            </Pressable>
          </Card>
        </View>

        {/* numpad */}
        <Numpad />

        {/* weight trend chart */}
        <View style={{ marginHorizontal: 20, marginTop: 14 }}>
          <Card pad={14}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "flex-end",
              }}
            >
              <Text
                style={{ fontSize: 14, fontWeight: "600", color: Colors.text }}
              >
                Weight
              </Text>
              <View
                style={{ flexDirection: "row", alignItems: "flex-end", gap: 4 }}
              >
                <Text
                  style={{
                    fontFamily: "Courier",
                    fontSize: 14,
                    fontWeight: "700",
                    color: Colors.text,
                  }}
                >
                  78.4
                </Text>
                <Text
                  style={{ fontSize: 10, color: Colors.ter, marginBottom: 2 }}
                >
                  kg
                </Text>
                <Text
                  style={{
                    fontFamily: "Courier",
                    fontSize: 10,
                    color: Colors.accent,
                    marginLeft: 6,
                    marginBottom: 2,
                  }}
                >
                  +1.2
                </Text>
              </View>
            </View>
            <MiniChart
              points={WEIGHT_POINTS}
              color={Colors.text}
              height={88}
              label="12W"
              yLabels={["77 kg", "79 kg"]}
            />
          </Card>
        </View>

        {/* muscle mass trend chart */}
        <View style={{ marginHorizontal: 20, marginTop: 10, marginBottom: 24 }}>
          <Card pad={14}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "flex-end",
              }}
            >
              <Text
                style={{ fontSize: 14, fontWeight: "600", color: Colors.text }}
              >
                Muscle Mass
              </Text>
              <View
                style={{ flexDirection: "row", alignItems: "flex-end", gap: 4 }}
              >
                <Text
                  style={{
                    fontFamily: "Courier",
                    fontSize: 14,
                    fontWeight: "700",
                    color: Colors.text,
                  }}
                >
                  36.8
                </Text>
                <Text
                  style={{ fontSize: 10, color: Colors.ter, marginBottom: 2 }}
                >
                  kg
                </Text>
                <Text
                  style={{
                    fontFamily: "Courier",
                    fontSize: 10,
                    color: Colors.accent,
                    marginLeft: 6,
                    marginBottom: 2,
                  }}
                >
                  +0.6
                </Text>
              </View>
            </View>
            <MiniChart
              points={MUSCLE_POINTS}
              color={Colors.accent}
              height={88}
              label="12W"
              yLabels={["36 kg", "37 kg"]}
            />
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}
