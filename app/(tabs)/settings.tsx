// app/(tabs)/settings.tsx
// Settings screen — displays current phase info and allows gym selection.
// Phase progression is automatic — no manual goal selection.

import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Colors } from "../../constants/theme";
import { getProfile, updateGym } from "../../services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserProfile {
  id: number;
  username: string;
  current_phase: string;
  current_block: number;
  phase_week: number;
  current_gym: string;
  phase_start_date: string;
}

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
      style={{ height: 0.5, backgroundColor: Colors.line, marginLeft: inset }}
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

// ─── Phase display ────────────────────────────────────────────────────────────
// Read-only — shows current phase, block, and week. Phase advances automatically.

const PHASE_LABELS: Record<string, string> = {
  anatomical_adaptation: "Anatomical Adaptation",
  hypertrophy: "Hypertrophy",
  maximum_strength: "Maximum Strength",
  muscle_definition: "Muscle Definition",
  rest: "Rest Week",
};

const PHASE_DESCRIPTIONS: Record<string, string> = {
  anatomical_adaptation: "Joint & tendon conditioning — 20 reps, 3 sets",
  hypertrophy: "Muscle growth — 12 reps, 4 sets, 70–80% 1RM",
  maximum_strength: "Neural strength — 6 reps, 4 sets, 85–95% 1RM",
  muscle_definition: "Metabolic endurance — 40 reps, 1 set",
  rest: "Active recovery — light compound work only",
};

const PHASE_ORDER = [
  "anatomical_adaptation",
  "hypertrophy",
  "maximum_strength",
  "muscle_definition",
];

function PhaseDisplay({ profile }: { profile: UserProfile }) {
  const currentIndex = PHASE_ORDER.indexOf(profile.current_phase);
  const nextPhase =
    profile.current_phase === "rest"
      ? null
      : PHASE_ORDER[(currentIndex + 1) % PHASE_ORDER.length];

  return (
    <View style={{ marginHorizontal: 20, marginTop: 20 }}>
      <SectionLabel>Current Phase</SectionLabel>
      <Card pad={0}>
        {/* current phase row */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            padding: 14,
            backgroundColor: Colors.accentDim,
            borderRadius: 15,
          }}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              backgroundColor: Colors.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                backgroundColor: Colors.accentInk,
              }}
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text
              style={{ fontSize: 15, fontWeight: "600", color: Colors.accent }}
            >
              {PHASE_LABELS[profile.current_phase] || profile.current_phase}
            </Text>
            <Text style={{ fontSize: 12, color: Colors.ter, marginTop: 2 }}>
              {PHASE_DESCRIPTIONS[profile.current_phase]}
            </Text>
          </View>

          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <Tag color={Colors.accent}>Week {profile.phase_week}</Tag>
            <Tag color={Colors.ter}>Block {profile.current_block}</Tag>
          </View>
        </View>

        <Divider />

        {/* phase progress */}
        <View style={{ padding: 14 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <Text
              style={{
                fontFamily: "Courier",
                fontSize: 10,
                color: Colors.ter,
                letterSpacing: 0.4,
              }}
            >
              PHASE PROGRESS
            </Text>
            <Text
              style={{ fontFamily: "Courier", fontSize: 10, color: Colors.ter }}
            >
              {profile.phase_week} / 6
            </Text>
          </View>

          {/* progress bar */}
          <View
            style={{
              height: 4,
              borderRadius: 2,
              backgroundColor: Colors.line2,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${(profile.phase_week / 6) * 100}%`,
                height: "100%",
                backgroundColor: Colors.accent,
                borderRadius: 2,
              }}
            />
          </View>

          {nextPhase && (
            <Text
              style={{
                fontFamily: "Courier",
                fontSize: 10,
                color: Colors.ter,
                marginTop: 8,
              }}
            >
              NEXT → {PHASE_LABELS[nextPhase]}
            </Text>
          )}
        </View>
      </Card>
    </View>
  );
}

// ─── Gym selector ─────────────────────────────────────────────────────────────

const GYMS = [
  { id: "work", name: "Work Gym", description: "Full barbell + cable rack" },
  { id: "home", name: "Home Gym", description: "Dumbbells, bench, bands" },
];

function GymSelector({
  currentGym,
  onSelect,
  saving,
}: {
  currentGym: string;
  onSelect: (gym: string) => void;
  saving: boolean;
}) {
  return (
    <View style={{ marginHorizontal: 20, marginTop: 24 }}>
      <SectionLabel>Current Gym</SectionLabel>
      <Card pad={0}>
        {GYMS.map((gym, i) => {
          const isActive = gym.id === currentGym;
          return (
            <View key={gym.id}>
              <Pressable
                onPress={() => !saving && onSelect(gym.id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  padding: 14,
                  opacity: saving ? 0.6 : 1,
                }}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    backgroundColor: isActive ? Colors.text : Colors.card2,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 18 }}>🏋️</Text>
                </View>

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

                {isActive ? (
                  <Tag color={Colors.accent} bg={Colors.accentDim}>
                    ● Active
                  </Tag>
                ) : (
                  <Text style={{ color: Colors.qua, fontSize: 16 }}>›</Text>
                )}
              </Pressable>
              {i < GYMS.length - 1 && <Divider />}
            </View>
          );
        })}
      </Card>
    </View>
  );
}

// ─── Misc settings ────────────────────────────────────────────────────────────

const MISC_SETTINGS = [
  { label: "Units", value: "Metric (kg)" },
  { label: "Weekly AI Report", value: "Sundays · 8 PM" },
  { label: "Rest Timer Sound", value: "On" },
  { label: "Apple Health", value: "Not connected" },
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
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, []),
  );

  async function loadProfile() {
    setLoading(true);
    try {
      const data = await getProfile();
      setProfile(data);
    } catch (err: any) {
      setError("Failed to load profile");
    } finally {
      setLoading(false);
    }
  }

  async function handleGymChange(gym: string) {
    if (!profile || gym === profile.current_gym) return;
    setSaving(true);
    try {
      const updated = await updateGym(gym);
      setProfile((prev) => (prev ? { ...prev, ...updated } : prev));
    } catch (err: any) {
      setError("Failed to update gym");
    } finally {
      setSaving(false);
    }
  }

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
              Settings
            </Text>
            {saving && (
              <ActivityIndicator
                color={Colors.accent}
                style={{ marginLeft: 12, marginBottom: 6 }}
              />
            )}
          </View>
          {error ? (
            <Text style={{ fontSize: 12, color: Colors.warn, marginTop: 4 }}>
              {error}
            </Text>
          ) : null}
        </View>

        {loading ? (
          <ActivityIndicator color={Colors.accent} style={{ marginTop: 60 }} />
        ) : profile ? (
          <>
            <PhaseDisplay profile={profile} />
            <GymSelector
              currentGym={profile.current_gym}
              onSelect={handleGymChange}
              saving={saving}
            />
          </>
        ) : null}

        <MiscSettings />

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
