// app/(tabs)/index.tsx
// Home / Dashboard screen
// Sections: greeting, current goal badge, start session CTA,
//           body comp mini-charts, AI weekly report, recent sessions

import { View, Text, ScrollView, Pressable } from "react-native";
import { Colors } from "../../constants/theme";

// ─── Reusable primitives ────────────────────────────────────────────────────

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

function Divider({ inset = 0 }: { inset?: number }) {
  return (
    <View
      style={{
        height: 0.5,
        backgroundColor: Colors.line,
        marginLeft: inset,
      }}
    />
  );
}

// ─── Sparkline chart (SVG-free, using View bars as approximation) ────────────
// React Native web doesn't need SVG — we use a simple bar approximation
// that will be replaced with a real chart library later.

function MiniChart({
  points,
  color,
  height = 68,
}: {
  points: number[];
  color: string;
  height?: number;
}) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        height,
        gap: 2,
        marginTop: 8,
      }}
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
  );
}

// ─── Goal badge ─────────────────────────────────────────────────────────────

function GoalBadge({
  goalType,
  goalWeek,
  totalWeeks = 8,
}: {
  goalType: string;
  goalWeek: number;
  totalWeeks?: number;
}) {
  const pct = Math.round((goalWeek / totalWeeks) * 100);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: Colors.accentDim,
        borderRadius: 14,
        padding: 14,
        borderWidth: 0.5,
        borderColor: Colors.accent,
        marginHorizontal: 20,
        marginTop: 16,
      }}
    >
      {/* icon */}
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          backgroundColor: Colors.accent,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: 18 }}>★</Text>
      </View>

      {/* label */}
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: "Courier",
            fontSize: 10,
            color: Colors.accent,
            letterSpacing: 0.6,
            textTransform: "uppercase",
          }}
        >
          Current Goal
        </Text>
        <Text
          style={{
            fontSize: 18,
            fontWeight: "600",
            color: Colors.text,
            marginTop: 2,
          }}
        >
          {goalType} · Week {goalWeek}{" "}
          <Text style={{ color: Colors.ter, fontWeight: "400" }}>
            of {totalWeeks}
          </Text>
        </Text>
      </View>

      {/* percentage */}
      <Text
        style={{
          fontFamily: "Courier",
          fontSize: 24,
          fontWeight: "600",
          color: Colors.text,
        }}
      >
        {pct}
        <Text style={{ color: Colors.ter, fontSize: 14 }}>%</Text>
      </Text>
    </View>
  );
}

// ─── Start session CTA ───────────────────────────────────────────────────────

function StartSessionButton() {
  return (
    <Pressable
      style={{
        marginHorizontal: 20,
        marginTop: 16,
        backgroundColor: Colors.text,
        borderRadius: 16,
        padding: 18,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <View>
        <Text
          style={{
            fontFamily: "Courier",
            fontSize: 10,
            color: "rgba(0,0,0,0.5)",
            letterSpacing: 0.6,
            textTransform: "uppercase",
          }}
        >
          Today · Push Day
        </Text>
        <Text
          style={{
            fontSize: 20,
            fontWeight: "700",
            color: "#000",
            marginTop: 2,
            letterSpacing: -0.4,
          }}
        >
          Start Today's Session →
        </Text>
      </View>

      {/* play button circle */}
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 999,
          backgroundColor: "#000",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: Colors.accent, fontSize: 16 }}>▶</Text>
      </View>
    </Pressable>
  );
}

// ─── Body comp mini cards ────────────────────────────────────────────────────

function BodyCompCards() {
  const weightPoints = [
    77.2, 77.0, 77.4, 77.1, 77.5, 77.6, 77.8, 77.7, 78.0, 78.2, 78.1, 78.4,
  ];
  const musclePoints = [
    36.0, 36.1, 36.0, 36.2, 36.3, 36.3, 36.4, 36.5, 36.5, 36.6, 36.7, 36.8,
  ];

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 10,
        marginHorizontal: 20,
        marginTop: 20,
      }}
    >
      {/* Bodyweight */}
      <Card style={{ flex: 1 }} pad={14}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-end",
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
            Bodyweight
          </Text>
          <Text
            style={{ fontFamily: "Courier", fontSize: 9, color: Colors.ter }}
          >
            12w
          </Text>
        </View>
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
              fontSize: 24,
              fontWeight: "700",
              color: Colors.text,
              letterSpacing: -0.5,
            }}
          >
            78.4
          </Text>
          <Text style={{ fontSize: 11, color: Colors.sec, marginBottom: 2 }}>
            kg
          </Text>
          <Text
            style={{
              marginLeft: "auto",
              fontSize: 11,
              color: Colors.accent,
              fontFamily: "Courier",
              marginBottom: 2,
            }}
          >
            +1.2
          </Text>
        </View>
        <MiniChart points={weightPoints} color={Colors.text} height={68} />
      </Card>

      {/* Muscle mass */}
      <Card style={{ flex: 1 }} pad={14}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-end",
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
            Muscle
          </Text>
          <Text
            style={{ fontFamily: "Courier", fontSize: 9, color: Colors.ter }}
          >
            12w
          </Text>
        </View>
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
              fontSize: 24,
              fontWeight: "700",
              color: Colors.text,
              letterSpacing: -0.5,
            }}
          >
            36.8
          </Text>
          <Text style={{ fontSize: 11, color: Colors.sec, marginBottom: 2 }}>
            kg
          </Text>
          <Text
            style={{
              marginLeft: "auto",
              fontSize: 11,
              color: Colors.accent,
              fontFamily: "Courier",
              marginBottom: 2,
            }}
          >
            +0.6
          </Text>
        </View>
        <MiniChart points={musclePoints} color={Colors.accent} height={68} />
      </Card>
    </View>
  );
}

// ─── AI weekly report card ───────────────────────────────────────────────────

function AIReportCard() {
  return (
    <Card pad={0} style={{ marginHorizontal: 20, marginTop: 14 }}>
      {/* header row */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          padding: 14,
        }}
      >
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            backgroundColor: Colors.card2,
            borderWidth: 0.5,
            borderColor: Colors.line2,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: Colors.accent, fontSize: 12 }}>★</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: "Courier",
              fontSize: 10,
              color: Colors.ter,
              letterSpacing: 0.6,
              textTransform: "uppercase",
            }}
          >
            Weekly AI Report
          </Text>
          <Text
            style={{
              fontSize: 14,
              fontWeight: "600",
              color: Colors.text,
              marginTop: 1,
            }}
          >
            Strong week — keep pushing chest volume
          </Text>
        </View>
        <Text style={{ color: Colors.sec, fontSize: 12 }}>›</Text>
      </View>

      <Divider />

      {/* body */}
      <Text
        style={{
          fontSize: 13,
          color: Colors.sec,
          lineHeight: 20,
          padding: 14,
        }}
      >
        Bench press progressed +5 kg this week. Volume on back work dropped 12%
        — consider adding a row variation Wednesday. Bodyweight trending on
        target.
      </Text>

      {/* tags */}
      <View
        style={{
          flexDirection: "row",
          gap: 6,
          paddingHorizontal: 14,
          paddingBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <Tag color={Colors.accent} bg={Colors.accentDim}>
          ↑ Bench +5kg
        </Tag>
        <Tag color={Colors.warn} bg="rgba(242,181,100,0.12)">
          ↓ Back vol −12%
        </Tag>
        <Tag>Weight on track</Tag>
      </View>
    </Card>
  );
}

// ─── Recent sessions ─────────────────────────────────────────────────────────

const RECENT_SESSIONS = [
  { day: "Fri", name: "Pull Day", meta: "7 ex · 52m", gym: "Work Gym" },
  { day: "Wed", name: "Legs", meta: "6 ex · 48m", gym: "Home Gym" },
  { day: "Mon", name: "Push Day", meta: "7 ex · 55m", gym: "Work Gym" },
];

function RecentSessions() {
  return (
    <View style={{ marginHorizontal: 20, marginTop: 20, marginBottom: 24 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: 10,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.sec }}>
          Recent sessions
        </Text>
        <Text
          style={{ fontFamily: "Courier", fontSize: 10, color: Colors.ter }}
        >
          SEE ALL
        </Text>
      </View>

      {RECENT_SESSIONS.map((s, i) => (
        <View
          key={i}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingVertical: 12,
            borderTopWidth: 0.5,
            borderTopColor: Colors.line,
            borderBottomWidth: 0.5,
            borderBottomColor: Colors.line,
            marginTop: i === 0 ? 0 : -0.5,
          }}
        >
          <Text
            style={{
              width: 36,
              fontFamily: "Courier",
              fontSize: 10,
              color: Colors.ter,
              textTransform: "uppercase",
              letterSpacing: 0.6,
            }}
          >
            {s.day}
          </Text>
          <View style={{ flex: 1 }}>
            <Text
              style={{ fontSize: 14, fontWeight: "600", color: Colors.text }}
            >
              {s.name}
            </Text>
            <Text
              style={{
                fontSize: 11,
                color: Colors.ter,
                fontFamily: "Courier",
                marginTop: 2,
              }}
            >
              {s.meta} · {s.gym}
            </Text>
          </View>
          <Text style={{ color: Colors.qua, fontSize: 14 }}>›</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* greeting */}
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
            Sunday · May 18
          </Text>
          <Text
            style={{
              fontSize: 30,
              fontWeight: "700",
              color: Colors.text,
              letterSpacing: -0.6,
              marginTop: 6,
            }}
          >
            Good evening
          </Text>
        </View>

        <GoalBadge goalType="Size" goalWeek={3} />
        <StartSessionButton />
        <BodyCompCards />
        <AIReportCard />
        <RecentSessions />
      </ScrollView>
    </View>
  );
}
