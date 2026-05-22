// app/(tabs)/week.tsx
// This Week's Plan screen — shows real sessions from the database.

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
import { getWeekSessions, getProfile, updateGym } from "../../services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlannedExercise {
  id: number;
  exercise_name: string;
  muscles_primary: string;
  order_index: number;
  target_sets: number;
  target_reps: number;
  target_weight: number;
}

interface Session {
  id: number;
  session_type: "compound" | "isolation" | "extra";
  occurrence: number;
  week_number: number;
  gym: string;
  status: "planned" | "in_progress" | "complete";
  notes: string | null;
  planned_exercises: PlannedExercise[] | null;
}

interface UserProfile {
  current_phase: string;
  current_block: number;
  phase_week: number;
  current_gym: string;
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

function Divider({ inset = 0 }: { inset?: number }) {
  return (
    <View
      style={{ height: 0.5, backgroundColor: Colors.line, marginLeft: inset }}
    />
  );
}

// ─── Gym selector ─────────────────────────────────────────────────────────────

function GymSelector({
  currentGym,
  onSelect,
  saving,
}: {
  currentGym: string;
  onSelect: (gym: string) => void;
  saving: boolean;
}) {
  const gyms = [
    { id: "work", name: "Work Gym", desc: "Full rack" },
    { id: "home", name: "Home Gym", desc: "DB + bands" },
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
          opacity: saving ? 0.6 : 1,
        }}
      >
        {gyms.map((gym) => {
          const isActive = gym.id === currentGym;
          return (
            <Pressable
              key={gym.id}
              onPress={() => !saving && onSelect(gym.id)}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                padding: 10,
                borderRadius: 9,
                backgroundColor: isActive ? Colors.text : "transparent",
              }}
            >
              <Text
                style={{ fontSize: 16, color: isActive ? "#000" : Colors.sec }}
              >
                🏋️
              </Text>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: isActive ? "#000" : Colors.text,
                    letterSpacing: -0.1,
                  }}
                >
                  {gym.name}
                </Text>
                <Text
                  style={{
                    fontFamily: "Courier",
                    fontSize: 10,
                    color: isActive ? "rgba(0,0,0,0.5)" : Colors.ter,
                    marginTop: 1,
                  }}
                >
                  {gym.desc}
                </Text>
              </View>
              {isActive && (
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    backgroundColor: Colors.accent,
                  }}
                />
              )}
            </Pressable>
          );
        })}
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

function SessionCard({
  session,
  index,
  totalSessions,
}: {
  session: Session;
  index: number;
  totalSessions: number;
}) {
  const isActive = session.status === "in_progress";
  const isDone = session.status === "complete";
  const exercises = session.planned_exercises || [];

  // Human readable session label
  const sessionLabel =
    session.session_type === "compound"
      ? `Compound · Session ${session.occurrence}`
      : "Isolation";

  const statusColor = isDone
    ? Colors.ter
    : isActive
      ? Colors.accent
      : Colors.sec;
  const statusLabel = isDone
    ? "✓ Complete"
    : isActive
      ? "In Progress"
      : "Planned";

  return (
    <View
      style={{
        backgroundColor: isActive ? Colors.card2 : Colors.card,
        borderRadius: 16,
        borderWidth: isActive ? 1 : 0.5,
        borderColor: isActive ? Colors.accent : Colors.line,
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
        {/* session number badge */}
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            backgroundColor: isActive
              ? Colors.accent
              : isDone
                ? "transparent"
                : Colors.card2,
            borderWidth: isDone ? 0.5 : 0,
            borderColor: Colors.line2,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontFamily: "Courier",
              fontSize: 9,
              color: isActive ? Colors.accentInk : Colors.ter,
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            {session.session_type === "isolation" ? "ISO" : "CPD"}
          </Text>
          <Text
            style={{
              fontSize: 14,
              fontWeight: "700",
              color: isActive
                ? Colors.accentInk
                : isDone
                  ? Colors.ter
                  : Colors.text,
              lineHeight: 18,
            }}
          >
            {index + 1}
          </Text>
        </View>

        {/* label + status */}
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 17,
              fontWeight: "600",
              color: Colors.text,
              letterSpacing: -0.3,
            }}
          >
            {sessionLabel}
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginTop: 3,
            }}
          >
            <Tag color={statusColor}>{statusLabel}</Tag>
            <Text
              style={{ fontFamily: "Courier", fontSize: 11, color: Colors.ter }}
            >
              {exercises.length} exercises
            </Text>
          </View>
        </View>

        {/* action button */}
        <Pressable
          style={{
            backgroundColor: isActive ? Colors.text : "transparent",
            borderWidth: isActive ? 0 : 0.5,
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
              color: isActive ? "#000" : Colors.sec,
            }}
          >
            {isActive ? "Continue →" : isDone ? "View" : "Start →"}
          </Text>
        </Pressable>
      </View>

      <Divider inset={16} />

      {/* exercise list */}
      <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 }}>
        {exercises.map((ex, j) => (
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
              {ex.exercise_name}
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
              {ex.target_sets} × {ex.target_reps}
            </Text>
            <Text
              style={{
                fontFamily: "Courier",
                fontSize: 11,
                fontWeight: "600",
                color: Colors.text,
                width: 56,
                textAlign: "right",
              }}
            >
              {ex.target_weight} kg
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Phase label helper ───────────────────────────────────────────────────────

const PHASE_LABELS: Record<string, string> = {
  anatomical_adaptation: "AA",
  hypertrophy: "Hypertrophy",
  maximum_strength: "Max Strength",
  muscle_definition: "Muscle Def",
  rest: "Rest",
};

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function WeekScreen() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingGym, setSavingGym] = useState(false);
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, []),
  );

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [sessionData, profileData] = await Promise.all([
        getWeekSessions(),
        getProfile(),
      ]);
      setSessions(sessionData);
      setProfile(profileData);
    } catch (err: any) {
      setError("Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }

  async function handleGymChange(gym: string) {
    if (!profile || gym === profile.current_gym) return;
    setSavingGym(true);
    try {
      await updateGym(gym);
      setProfile((prev) => (prev ? { ...prev, current_gym: gym } : prev));
    } catch (err) {
      setError("Failed to update gym");
    } finally {
      setSavingGym(false);
    }
  }

  // Count completed sessions this week
  const completedCount = sessions.filter((s) => s.status === "complete").length;

  // Filter to just week 1 sessions for display (the current week)
  // Sessions are ordered: compound occ1, compound occ2, isolation occ1 per week
  const currentWeekSessions = sessions.filter((s) => s.week_number === 1);

  // Reorder to match training pattern: compound occ1, isolation, compound occ2
  const orderedSessions = [
    currentWeekSessions.find(
      (s) => s.session_type === "compound" && s.occurrence === 1,
    ),
    currentWeekSessions.find((s) => s.session_type === "isolation"),
    currentWeekSessions.find(
      (s) => s.session_type === "compound" && s.occurrence === 2,
    ),
  ].filter(Boolean) as Session[];

  const phaseLabel = profile
    ? PHASE_LABELS[profile.current_phase] || profile.current_phase
    : "";

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
            {profile
              ? `${phaseLabel} · Block ${profile.current_block} · Week ${profile.phase_week}`
              : "Loading..."}
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
            {!loading && (
              <Text
                style={{
                  marginLeft: "auto",
                  fontFamily: "Courier",
                  fontSize: 11,
                  color: Colors.sec,
                  marginBottom: 4,
                }}
              >
                {completedCount}/{orderedSessions.length}
              </Text>
            )}
          </View>
          {error ? (
            <Text style={{ fontSize: 12, color: Colors.warn, marginTop: 4 }}>
              {error}
            </Text>
          ) : null}
        </View>

        {profile && (
          <GymSelector
            currentGym={profile.current_gym}
            onSelect={handleGymChange}
            saving={savingGym}
          />
        )}

        <ProgressDots
          completed={completedCount}
          total={orderedSessions.length || 3}
        />

        {/* session cards */}
        {loading ? (
          <ActivityIndicator color={Colors.accent} style={{ marginTop: 40 }} />
        ) : orderedSessions.length === 0 ? (
          <View
            style={{
              marginHorizontal: 20,
              marginTop: 20,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: Colors.ter,
                fontFamily: "Courier",
                fontSize: 11,
                textAlign: "center",
              }}
            >
              NO PLAN GENERATED YET
            </Text>
            <Text
              style={{
                color: Colors.sec,
                fontSize: 13,
                marginTop: 8,
                textAlign: "center",
              }}
            >
              Your first training block will be generated automatically.
            </Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20, gap: 12, paddingBottom: 24 }}>
            {orderedSessions.map((session, i) => (
              <SessionCard
                key={session.id}
                session={session}
                index={i}
                totalSessions={orderedSessions.length}
              />
            ))}
          </View>
        )}

        {/* footer */}
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
            Next block generates Sun · 8 PM
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
