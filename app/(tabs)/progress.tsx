// app/(tabs)/progress.tsx
// Exercise Log / History screen
// Shows progress chart, stats, and session history for a selected exercise.

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

// ─── Bar chart (simplified, will be replaced with real chart library later) ──

function ProgressChart({
  points,
  color,
  height = 140,
  yLabels,
}: {
  points: number[];
  color: string;
  height?: number;
  yLabels: [string, string];
}) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  return (
    <View style={{ marginTop: 12 }}>
      {/* y labels */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <Text style={{ fontFamily: "Courier", fontSize: 9, color: Colors.ter }}>
          {yLabels[1]}
        </Text>
        <Text style={{ fontFamily: "Courier", fontSize: 9, color: Colors.ter }}>
          {yLabels[0]}
        </Text>
      </View>

      {/* bars */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          height,
          gap: 3,
        }}
      >
        {points.map((p, i) => {
          const barHeight = ((p - min) / range) * (height - 12) + 12;
          const isLast = i === points.length - 1;
          return (
            <View
              key={i}
              style={{
                flex: 1,
                height: barHeight,
                borderRadius: 3,
                backgroundColor: isLast ? color : color + "35",
              }}
            />
          );
        })}
      </View>

      {/* chart label */}
      <Text
        style={{
          fontFamily: "Courier",
          fontSize: 9,
          color: Colors.ter,
          letterSpacing: 0.4,
          marginTop: 6,
          textAlign: "right",
        }}
      >
        WEIGHT × 12 WEEKS
      </Text>
    </View>
  );
}

// ─── Exercise picker ──────────────────────────────────────────────────────────

const EXERCISES = ["Bench Press", "Squat", "Deadlift", "OHP", "Row"];

function ExercisePicker({ selected }: { selected: string }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginTop: 12 }}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
    >
      {EXERCISES.map((ex) => {
        const isSelected = ex === selected;
        return (
          <Pressable
            key={ex}
            style={{
              paddingVertical: 7,
              paddingHorizontal: 14,
              borderRadius: 999,
              backgroundColor: isSelected ? Colors.text : "transparent",
              borderWidth: isSelected ? 0 : 0.5,
              borderColor: Colors.line2,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: isSelected ? "#000" : Colors.sec,
              }}
            >
              {ex}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ─── Stats row ────────────────────────────────────────────────────────────────

function StatsRow() {
  const stats = [
    { label: "1RM est.", value: "95.2", unit: "kg" },
    { label: "Best set", value: "82.5×6", unit: "" },
    { label: "Sessions", value: "14", unit: "logged" },
  ];

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 8,
        marginHorizontal: 20,
        marginTop: 10,
      }}
    >
      {stats.map((s) => (
        <View
          key={s.label}
          style={{
            flex: 1,
            backgroundColor: Colors.card,
            borderRadius: 12,
            padding: 12,
            borderWidth: 0.5,
            borderColor: Colors.line,
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
            {s.label}
          </Text>
          <Text
            style={{
              fontSize: 17,
              fontWeight: "700",
              color: Colors.text,
              marginTop: 4,
              letterSpacing: -0.3,
            }}
          >
            {s.value}{" "}
            <Text
              style={{ fontSize: 10, color: Colors.ter, fontWeight: "400" }}
            >
              {s.unit}
            </Text>
          </Text>
        </View>
      ))}
    </View>
  );
}

// ─── History log ──────────────────────────────────────────────────────────────

interface HistorySession {
  date: string;
  sets: [string, number][];
  pr?: boolean;
}

const HISTORY: HistorySession[] = [
  {
    date: "May 16",
    sets: [
      ["82.5 kg", 6],
      ["82.5 kg", 6],
      ["82.5 kg", 5],
      ["82.5 kg", 5],
    ],
    pr: true,
  },
  {
    date: "May 09",
    sets: [
      ["80 kg", 6],
      ["80 kg", 6],
      ["80 kg", 6],
      ["80 kg", 5],
    ],
  },
  {
    date: "May 02",
    sets: [
      ["80 kg", 5],
      ["80 kg", 5],
      ["80 kg", 5],
      ["77.5 kg", 6],
    ],
  },
  {
    date: "Apr 25",
    sets: [
      ["77.5 kg", 6],
      ["77.5 kg", 6],
      ["77.5 kg", 6],
    ],
  },
  {
    date: "Apr 18",
    sets: [
      ["77.5 kg", 5],
      ["77.5 kg", 5],
      ["75 kg", 6],
    ],
  },
];

function HistoryLog() {
  return (
    <View style={{ marginHorizontal: 20, marginTop: 20 }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: Colors.sec,
          marginBottom: 10,
        }}
      >
        History
      </Text>
      {HISTORY.map((s, i) => (
        <View
          key={i}
          style={{
            paddingVertical: 12,
            borderTopWidth: 0.5,
            borderTopColor: Colors.line,
            borderBottomWidth: 0.5,
            borderBottomColor: Colors.line,
            marginTop: i === 0 ? 0 : -0.5,
          }}
        >
          {/* date + PR tag */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <Text
              style={{
                fontFamily: "Courier",
                fontSize: 11,
                color: Colors.sec,
                letterSpacing: 0.4,
              }}
            >
              {s.date}
            </Text>
            {s.pr && (
              <Tag color={Colors.accent} bg={Colors.accentDim}>
                ★ PR
              </Tag>
            )}
          </View>

          {/* set chips */}
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {s.sets.map((set, j) => (
              <View
                key={j}
                style={{
                  backgroundColor: Colors.card,
                  borderRadius: 6,
                  paddingVertical: 4,
                  paddingHorizontal: 8,
                  borderWidth: 0.5,
                  borderColor: Colors.line,
                }}
              >
                <Text style={{ fontFamily: "Courier", fontSize: 12 }}>
                  <Text style={{ color: Colors.text, fontWeight: "600" }}>
                    {set[0]}
                  </Text>
                  <Text style={{ color: Colors.ter }}> × </Text>
                  <Text style={{ color: Colors.text, fontWeight: "600" }}>
                    {set[1]}
                  </Text>
                </Text>
              </View>
            ))}
          </View>
        </View>
      ))}
      <View style={{ height: 24 }} />
    </View>
  );
}

// ─── Time range selector ──────────────────────────────────────────────────────

function TimeRangeSelector({ selected }: { selected: string }) {
  const ranges = ["4w", "12w", "1y", "All"];
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {ranges.map((r) => {
        const isSelected = r === selected;
        return (
          <View
            key={r}
            style={{
              paddingVertical: 4,
              paddingHorizontal: 8,
              borderRadius: 6,
              backgroundColor: isSelected ? Colors.card2 : "transparent",
              borderWidth: isSelected ? 0.5 : 0,
              borderColor: Colors.line2,
            }}
          >
            <Text
              style={{
                fontFamily: "Courier",
                fontSize: 10,
                color: isSelected ? Colors.text : Colors.ter,
              }}
            >
              {r}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Chart data ───────────────────────────────────────────────────────────────

const CHART_POINTS = [
  72.5, 72.5, 75, 75, 77.5, 77.5, 77.5, 80, 80, 80, 82.5, 82.5,
];

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ProgressScreen() {
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
            Exercise · History
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
            Bench Press
          </Text>
        </View>

        {/* exercise picker */}
        <ExercisePicker selected="Bench Press" />

        {/* chart card */}
        <View style={{ marginHorizontal: 20, marginTop: 14 }}>
          <Card pad={16}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                justifyContent: "space-between",
              }}
            >
              <View>
                <Text
                  style={{
                    fontFamily: "Courier",
                    fontSize: 10,
                    color: Colors.ter,
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                  }}
                >
                  Top Working Set
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-end",
                    gap: 4,
                    marginTop: 4,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 32,
                      fontWeight: "700",
                      color: Colors.text,
                      letterSpacing: -0.6,
                    }}
                  >
                    82.5
                  </Text>
                  <Text
                    style={{ fontSize: 13, color: Colors.sec, marginBottom: 4 }}
                  >
                    kg
                  </Text>
                </View>
                <Text
                  style={{
                    fontFamily: "Courier",
                    fontSize: 11,
                    color: Colors.accent,
                    marginTop: 2,
                  }}
                >
                  +10 kg · 12w
                </Text>
              </View>
              <TimeRangeSelector selected="12w" />
            </View>

            <ProgressChart
              points={CHART_POINTS}
              color={Colors.accent}
              height={140}
              yLabels={["70 kg", "85 kg"]}
            />
          </Card>
        </View>

        {/* stats row */}
        <StatsRow />

        {/* history */}
        <HistoryLog />
      </ScrollView>
    </View>
  );
}
