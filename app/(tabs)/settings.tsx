// app/(tabs)/settings.tsx
// Settings screen
// Goal selector, gym selector, and misc app settings.

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

function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontFamily: "Courier",
        fontSize: 10,
        color: Colors.ter,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        marginBottom: 10,
        paddingLeft: 4,
      }}
    >
      {children}
    </Text>
  );
}

// ─── Goal selector ────────────────────────────────────────────────────────────

interface Goal {
  name: string;
  description: string;
  active: boolean;
}

const GOALS: Goal[] = [
  {
    name: "Maintain",
    description: "Hold current bodyweight & strength",
    active: false,
  },
  { name: "Trim", description: "Lose fat, retain strength", active: false },
  { name: "Size", description: "Bulk — emphasize hypertrophy", active: true },
  { name: "Strength", description: "Focus on heavy compounds", active: false },
];

function GoalSelector() {
  return (
    <View style={{ marginHorizontal: 20, marginTop: 20 }}>
      <SectionLabel>Active Goal</SectionLabel>
      <Card pad={0}>
        {GOALS.map((goal, i) => (
          <View key={i}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                padding: 14,
                backgroundColor: goal.active ? Colors.accentDim : "transparent",
                borderRadius: i === 0 ? 16 : i === GOALS.length - 1 ? 16 : 0,
              }}
            >
              {/* radio circle */}
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  backgroundColor: goal.active ? Colors.accent : "transparent",
                  borderWidth: goal.active ? 0 : 1.5,
                  borderColor: Colors.line2,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {goal.active && (
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      backgroundColor: Colors.accentInk,
                    }}
                  />
                )}
              </View>

              {/* label */}
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "600",
                    color: goal.active ? Colors.accent : Colors.text,
                  }}
                >
                  {goal.name}
                </Text>
                <Text style={{ fontSize: 12, color: Colors.ter, marginTop: 2 }}>
                  {goal.description}
                </Text>
              </View>

              {goal.active && <Tag color={Colors.accent}>Active · Wk 3</Tag>}
            </View>
            {i < GOALS.length - 1 && <Divider />}
          </View>
        ))}
      </Card>
    </View>
  );
}

// ─── Gym selector ─────────────────────────────────────────────────────────────

interface Gym {
  name: string;
  description: string;
  active: boolean;
}

const GYMS: Gym[] = [
  { name: "Work Gym", description: "Full barbell + cable rack", active: true },
  { name: "Home Gym", description: "Dumbbells, bench, bands", active: false },
];

function GymSelector() {
  return (
    <View style={{ marginHorizontal: 20, marginTop: 24 }}>
      <SectionLabel>Current Gym</SectionLabel>
      <Card pad={0}>
        {GYMS.map((gym, i) => (
          <View key={i}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: 14,
              }}
            >
              {/* gym icon */}
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: gym.active ? Colors.text : Colors.card2,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 18 }}>🏋️</Text>
              </View>

              {/* label */}
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "600",
                    color: Colors.text,
                  }}
                >
                  {gym.name}
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    color: Colors.ter,
                    fontFamily: "Courier",
                    marginTop: 2,
                  }}
                >
                  {gym.description}
                </Text>
              </View>

              {gym.active ? (
                <Tag color={Colors.accent} bg={Colors.accentDim}>
                  ● Active
                </Tag>
              ) : (
                <Text style={{ color: Colors.qua, fontSize: 16 }}>›</Text>
              )}
            </View>
            {i < GYMS.length - 1 && <Divider />}
          </View>
        ))}
      </Card>
    </View>
  );
}

// ─── Misc settings ────────────────────────────────────────────────────────────

const MISC_SETTINGS = [
  { label: "Units", value: "Metric (kg)" },
  { label: "Weekly AI Report", value: "Sundays · 8 PM" },
  { label: "Rest Timer Sound", value: "On" },
  { label: "Apple Health", value: "Connected" },
];

function MiscSettings() {
  return (
    <View style={{ marginHorizontal: 20, marginTop: 24 }}>
      <Card pad={0}>
        {MISC_SETTINGS.map((row, i) => (
          <View key={i}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 14,
              }}
            >
              <Text style={{ flex: 1, fontSize: 15, color: Colors.text }}>
                {row.label}
              </Text>
              <Text style={{ fontSize: 13, color: Colors.sec, marginRight: 8 }}>
                {row.value}
              </Text>
              <Text style={{ color: Colors.qua, fontSize: 14 }}>›</Text>
            </View>
            {i < MISC_SETTINGS.length - 1 && <Divider />}
          </View>
        ))}
      </Card>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function SettingsScreen() {
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
            Profile
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
            Settings
          </Text>
        </View>

        <GoalSelector />
        <GymSelector />
        <MiscSettings />

        {/* version footer */}
        <View style={{ alignItems: "center", paddingVertical: 24 }}>
          <Text
            style={{
              fontFamily: "Courier",
              fontSize: 10,
              color: Colors.qua,
              letterSpacing: 0.6,
              textTransform: "uppercase",
            }}
          >
            GymApp · V0.1
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
