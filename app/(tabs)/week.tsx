// app/(tabs)/week.tsx
// This Week's Plan screen
// Shows the three sessions for the current week with their exercise lists.

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

// ─── Gym selector ─────────────────────────────────────────────────────────────

function GymSelector() {
  const gyms = [
    { name: "Work Gym", desc: "Full rack", active: true },
    { name: "Home Gym", desc: "DB + bands", active: false },
  ];

  return (
    <View style={{ marginHorizontal: 20, marginTop: 14 }}>
      <Text
        style={{
          fontFamily: "Courier",
          fontSize: 9,
          color: Colors.ter,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        Today's Gym
      </Text>
      <View
        style={{
          flexDirection: "row",
          backgroundColor: Colors.card,
          borderRadius: 12,
          padding: 4,
          borderWidth: 0.5,
          borderColor: Colors.line,
        }}
      >
        {gyms.map((gym, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              padding: 10,
              borderRadius: 9,
              backgroundColor: gym.active ? Colors.text : "transparent",
            }}
          >
            <Text
              style={{ fontSize: 16, color: gym.active ? "#000" : Colors.sec }}
            >
              🏋️
            </Text>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: gym.active ? "#000" : Colors.text,
                  letterSpacing: -0.1,
                }}
              >
                {gym.name}
              </Text>
              <Text
                style={{
                  fontFamily: "Courier",
                  fontSize: 10,
                  color: gym.active ? "rgba(0,0,0,0.5)" : Colors.ter,
                  marginTop: 1,
                }}
              >
                {gym.desc}
              </Text>
            </View>
            {gym.active && (
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  backgroundColor: Colors.accent,
                }}
              />
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Progress dots ────────────────────────────────────────────────────────────

function ProgressDots({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 6,
        marginHorizontal: 20,
        marginTop: 10,
        marginBottom: 16,
      }}
    >
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            backgroundColor: i < completed ? Colors.accent : Colors.line2,
          }}
        />
      ))}
    </View>
  );
}

// ─── Session card ─────────────────────────────────────────────────────────────

type SessionState = "done" | "today" | "upcoming";

interface Exercise {
  name: string;
  sets: string;
  weight: string;
}

interface Session {
  day: string;
  date: string;
  focus: string;
  state: SessionState;
  exercises: Exercise[];
}

function SessionCard({ session }: { session: Session }) {
  const isToday = session.state === "today";
  const isDone = session.state === "done";

  return (
    <View
      style={{
        backgroundColor: isToday ? Colors.card2 : Colors.card,
        borderRadius: 16,
        borderWidth: isToday ? 1 : 0.5,
        borderColor: isToday ? Colors.accent : Colors.line,
      }}
    >
      {/* header row */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          padding: 14,
        }}
      >
        {/* date badge */}
        <View
          style={{
            width: 50,
            alignItems: "center",
            paddingVertical: 6,
            borderRadius: 8,
            backgroundColor: isToday
              ? Colors.accent
              : isDone
                ? "transparent"
                : Colors.card2,
            borderWidth: isDone ? 0.5 : 0,
            borderColor: Colors.line2,
          }}
        >
          <Text
            style={{
              fontFamily: "Courier",
              fontSize: 9,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              color: isToday ? Colors.accentInk : Colors.ter,
              opacity: 0.7,
            }}
          >
            {session.day}
          </Text>
          <Text
            style={{
              fontSize: 16,
              fontWeight: "700",
              color: isToday
                ? Colors.accentInk
                : isDone
                  ? Colors.ter
                  : Colors.text,
              lineHeight: 20,
              marginTop: 2,
            }}
          >
            {session.date.split(" ")[1]}
          </Text>
        </View>

        {/* focus + tags */}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text
              style={{
                fontSize: 17,
                fontWeight: "600",
                color: Colors.text,
                letterSpacing: -0.3,
              }}
            >
              {session.focus}
            </Text>
            {isDone && <Tag color={Colors.ter}>✓ Logged</Tag>}
            {isToday && (
              <Tag color={Colors.accent} bg={Colors.accentDim}>
                Today
              </Tag>
            )}
          </View>
          <Text
            style={{
              fontFamily: "Courier",
              fontSize: 11,
              color: Colors.ter,
              marginTop: 2,
            }}
          >
            {session.exercises.length} exercises
          </Text>
        </View>

        {/* action button */}
        <Pressable
          style={{
            backgroundColor: isToday ? Colors.text : "transparent",
            borderWidth: isToday ? 0 : 0.5,
            borderColor: Colors.line2,
            borderRadius: 999,
            paddingVertical: 7,
            paddingHorizontal: 14,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: "600",
              color: isToday ? "#000" : Colors.sec,
              fontFamily: "System",
            }}
          >
            {isToday ? "Start →" : isDone ? "View" : "Open"}
          </Text>
        </Pressable>
      </View>

      <Divider inset={16} />

      {/* exercise list */}
      <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 }}>
        {session.exercises.map((ex, j) => (
          <View
            key={j}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingVertical: 7,
              opacity: isDone ? 0.45 : 1,
            }}
          >
            <Text
              style={{
                width: 14,
                fontFamily: "Courier",
                fontSize: 10,
                color: Colors.ter,
              }}
            >
              {j + 1}
            </Text>
            <Text style={{ flex: 1, fontSize: 13.5, color: Colors.text }}>
              {ex.name}
            </Text>
            <Text
              style={{
                fontFamily: "Courier",
                fontSize: 11,
                color: Colors.sec,
                width: 50,
                textAlign: "right",
              }}
            >
              {ex.sets}
            </Text>
            <Text
              style={{
                fontFamily: "Courier",
                fontSize: 11,
                fontWeight: "600",
                color: Colors.text,
                width: 64,
                textAlign: "right",
              }}
            >
              {ex.weight}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Session data ─────────────────────────────────────────────────────────────

const SESSIONS: Session[] = [
  {
    day: "Mon",
    date: "May 18",
    focus: "Push",
    state: "done",
    exercises: [
      { name: "Bench Press", sets: "4 × 6", weight: "82.5 kg" },
      { name: "Incline DB Press", sets: "3 × 8", weight: "30 kg" },
      { name: "Overhead Press", sets: "3 × 8", weight: "50 kg" },
      { name: "Cable Fly", sets: "3 × 12", weight: "15 kg" },
      { name: "Tricep Pushdown", sets: "3 × 10", weight: "32.5 kg" },
    ],
  },
  {
    day: "Tue",
    date: "May 19",
    focus: "Pull",
    state: "today",
    exercises: [
      { name: "Deadlift", sets: "3 × 5", weight: "140 kg" },
      { name: "Pull-up", sets: "4 × 8", weight: "BW + 5" },
      { name: "Barbell Row", sets: "3 × 8", weight: "70 kg" },
      { name: "Face Pull", sets: "3 × 15", weight: "20 kg" },
      { name: "Hammer Curl", sets: "3 × 10", weight: "14 kg" },
    ],
  },
  {
    day: "Wed",
    date: "May 20",
    focus: "Legs",
    state: "upcoming",
    exercises: [
      { name: "Back Squat", sets: "4 × 6", weight: "110 kg" },
      { name: "Romanian DL", sets: "3 × 8", weight: "90 kg" },
      { name: "Walking Lunge", sets: "3 × 10", weight: "20 kg" },
      { name: "Leg Curl", sets: "3 × 12", weight: "40 kg" },
      { name: "Standing Calf", sets: "4 × 12", weight: "60 kg" },
    ],
  },
];

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function WeekScreen() {
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
            Week 21 · May 18 – 24
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-end",
              marginTop: 4,
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
              This Week
            </Text>
            <Text
              style={{
                marginLeft: "auto",
                fontFamily: "Courier",
                fontSize: 11,
                color: Colors.sec,
                marginBottom: 4,
              }}
            >
              1/3
            </Text>
          </View>
        </View>

        <GymSelector />
        <ProgressDots completed={1} total={3} />

        {/* session cards */}
        <View style={{ paddingHorizontal: 20, gap: 12, paddingBottom: 24 }}>
          {SESSIONS.map((session, i) => (
            <SessionCard key={i} session={session} />
          ))}
        </View>

        {/* footer note */}
        <View style={{ paddingBottom: 24, alignItems: "center" }}>
          <Text
            style={{
              fontFamily: "Courier",
              fontSize: 10,
              color: Colors.ter,
              letterSpacing: 0.6,
              textTransform: "uppercase",
            }}
          >
            Next week generates Sun · 8 PM
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
