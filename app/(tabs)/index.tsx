// app/(tabs)/index.tsx
// Home / Dashboard screen — fully wired to real data.

import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Colors } from "../../constants/theme";
import {
  getProfile,
  getBodyComp,
  getWeekSessions,
  getWeeklyFeedback,
} from "../../services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Profile {
  current_phase: string;
  current_block: number;
  phase_week: number;
  phase_start_date: string;
}

interface BodyCompEntry {
  weight_kg: string | null;
  muscle_mass_kg: string | null;
  logged_at: string;
}

interface Session {
  id: number;
  session_type: string;
  occurrence: number;
  status: string;
  gym: string;
  planned_exercises: any[];
}

interface WeeklyFeedback {
  ai_summary: string;
  week_start_date: string;
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

// ─── Mini bar chart ───────────────────────────────────────────────────────────

function MiniChart({
  points,
  color,
  height = 68,
}: {
  points: number[];
  color: string;
  height?: number;
}) {
  if (points.length === 0) {
    return (
      <View
        style={{
          height,
          alignItems: "center",
          justifyContent: "center",
          marginTop: 8,
        }}
      >
        <Text style={{ fontFamily: "Courier", fontSize: 9, color: Colors.ter }}>
          No data
        </Text>
      </View>
    );
  }

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

// ─── Phase badge ──────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<string, string> = {
  anatomical_adaptation: "Anatomical Adaptation",
  hypertrophy: "Hypertrophy",
  maximum_strength: "Maximum Strength",
  muscle_definition: "Muscle Definition",
  rest: "Rest Week",
};

function PhaseBadge({ profile }: { profile: Profile }) {
  const pct = Math.round((profile.phase_week / 6) * 100);
  const label = PHASE_LABELS[profile.current_phase] || profile.current_phase;

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
          Current Phase
        </Text>
        <Text
          style={{
            fontSize: 16,
            fontWeight: "600",
            color: Colors.text,
            marginTop: 2,
          }}
        >
          {label}{" "}
          <Text style={{ color: Colors.ter, fontWeight: "400", fontSize: 14 }}>
            · Week {profile.phase_week} of 6
          </Text>
        </Text>
      </View>

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

// ─── Start session button ─────────────────────────────────────────────────────

function StartSessionButton({ sessions }: { sessions: Session[] }) {
  const nextSession =
    sessions.find((s) => s.status === "in_progress") ||
    sessions.find((s) => s.status === "planned");

  if (!nextSession) {
    return (
      <View
        style={{
          marginHorizontal: 20,
          marginTop: 16,
          backgroundColor: Colors.card,
          borderRadius: 16,
          padding: 18,
          borderWidth: 0.5,
          borderColor: Colors.line,
        }}
      >
        <Text style={{ fontSize: 14, color: Colors.sec, textAlign: "center" }}>
          All sessions complete this week
        </Text>
      </View>
    );
  }

  const label =
    nextSession.session_type === "compound"
      ? `Compound · Session ${nextSession.occurrence}`
      : "Isolation Session";

  const isInProgress = nextSession.status === "in_progress";

  return (
    <Pressable
      onPress={() => router.push(`/session?id=${nextSession.id}`)}
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
          {isInProgress ? "In Progress" : "Next Up"} · {label}
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
          {isInProgress ? "Continue Session →" : "Start Today's Session →"}
        </Text>
      </View>
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

// ─── Body comp cards ──────────────────────────────────────────────────────────

function BodyCompCards({ entries }: { entries: BodyCompEntry[] }) {
  const weightPoints = entries
    .filter((e) => e.weight_kg !== null)
    .map((e) => parseFloat(e.weight_kg!));
  const musclePoints = entries
    .filter((e) => e.muscle_mass_kg !== null)
    .map((e) => parseFloat(e.muscle_mass_kg!));

  const latestWeight =
    weightPoints.length > 0 ? weightPoints[weightPoints.length - 1] : null;
  const latestMuscle =
    musclePoints.length > 0 ? musclePoints[musclePoints.length - 1] : null;

  const weightChange =
    weightPoints.length >= 2
      ? (weightPoints[weightPoints.length - 1] - weightPoints[0]).toFixed(1)
      : null;
  const muscleChange =
    musclePoints.length >= 2
      ? (musclePoints[musclePoints.length - 1] - musclePoints[0]).toFixed(1)
      : null;

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 10,
        marginHorizontal: 20,
        marginTop: 20,
      }}
    >
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
            {latestWeight !== null ? latestWeight.toFixed(1) : "—"}
          </Text>
          <Text style={{ fontSize: 11, color: Colors.sec, marginBottom: 2 }}>
            kg
          </Text>
          {weightChange !== null && (
            <Text
              style={{
                marginLeft: "auto",
                fontSize: 11,
                color:
                  parseFloat(weightChange) >= 0 ? Colors.accent : Colors.warn,
                fontFamily: "Courier",
                marginBottom: 2,
              }}
            >
              {parseFloat(weightChange) >= 0 ? "+" : ""}
              {weightChange}
            </Text>
          )}
        </View>
        <MiniChart points={weightPoints} color={Colors.text} height={68} />
      </Card>

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
            {latestMuscle !== null ? latestMuscle.toFixed(1) : "—"}
          </Text>
          <Text style={{ fontSize: 11, color: Colors.sec, marginBottom: 2 }}>
            kg
          </Text>
          {muscleChange !== null && (
            <Text
              style={{
                marginLeft: "auto",
                fontSize: 11,
                color:
                  parseFloat(muscleChange) >= 0 ? Colors.accent : Colors.warn,
                fontFamily: "Courier",
                marginBottom: 2,
              }}
            >
              {parseFloat(muscleChange) >= 0 ? "+" : ""}
              {muscleChange}
            </Text>
          )}
        </View>
        <MiniChart points={musclePoints} color={Colors.accent} height={68} />
      </Card>
    </View>
  );
}

// ─── AI report card ───────────────────────────────────────────────────────────

function AIReportCard({ feedback }: { feedback: WeeklyFeedback | null }) {
  if (!feedback) {
    return (
      <Card pad={14} style={{ marginHorizontal: 20, marginTop: 14 }}>
        <Text
          style={{
            fontFamily: "Courier",
            fontSize: 10,
            color: Colors.ter,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          Weekly AI Report
        </Text>
        <Text style={{ fontSize: 13, color: Colors.ter }}>
          Your first report will be generated this Sunday evening.
        </Text>
      </Card>
    );
  }

  // Show first 200 chars as preview
  const preview = feedback.ai_summary?.slice(0, 200).trim();
  const weekDate = new Date(feedback.week_start_date).toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "short" },
  );

  return (
    <Card pad={0} style={{ marginHorizontal: 20, marginTop: 14 }}>
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
            Weekly AI Report · {weekDate}
          </Text>
          <Text
            style={{
              fontSize: 14,
              fontWeight: "600",
              color: Colors.text,
              marginTop: 1,
            }}
          >
            Week in review
          </Text>
        </View>
        <Text style={{ color: Colors.sec, fontSize: 12 }}>›</Text>
      </View>

      <Divider />

      <Text
        style={{ fontSize: 13, color: Colors.sec, lineHeight: 20, padding: 14 }}
      >
        {preview}
        {feedback.ai_summary?.length > 200 ? "…" : ""}
      </Text>
    </Card>
  );
}

// ─── Recent sessions ──────────────────────────────────────────────────────────

function RecentSessions({ sessions }: { sessions: Session[] }) {
  const completed = sessions.filter((s) => s.status === "complete").slice(0, 3);

  if (completed.length === 0) {
    return (
      <View style={{ marginHorizontal: 20, marginTop: 20, marginBottom: 24 }}>
        <Text
          style={{
            fontSize: 13,
            fontWeight: "600",
            color: Colors.sec,
            marginBottom: 10,
          }}
        >
          Recent sessions
        </Text>
        <Text style={{ fontSize: 13, color: Colors.ter }}>
          No completed sessions yet.
        </Text>
      </View>
    );
  }

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
      </View>

      {completed.map((s, i) => {
        const label =
          s.session_type === "compound"
            ? `Compound · Session ${s.occurrence}`
            : "Isolation";
        const gymLabel = s.gym === "home" ? "Home Gym" : "Work Gym";
        const exCount = s.planned_exercises?.length || 0;

        return (
          <View
            key={s.id}
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
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                backgroundColor: Colors.card2,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: "Courier",
                  fontSize: 9,
                  color: Colors.ter,
                  textTransform: "uppercase",
                }}
              >
                {s.session_type === "isolation" ? "ISO" : "CPD"}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{ fontSize: 14, fontWeight: "600", color: Colors.text }}
              >
                {label}
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: Colors.ter,
                  fontFamily: "Courier",
                  marginTop: 2,
                }}
              >
                {exCount} exercises · {gymLabel}
              </Text>
            </View>
            <Text style={{ color: Colors.qua, fontSize: 14 }}>›</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Greeting helpers ─────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getDateLabel(): string {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [bodyComp, setBodyComp] = useState<BodyCompEntry[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [feedback, setFeedback] = useState<WeeklyFeedback | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, []),
  );

  async function loadData() {
    setLoading(true);
    try {
      const [profileData, bodyCompData, sessionData, feedbackData] =
        await Promise.all([
          getProfile(),
          getBodyComp(12),
          getWeekSessions(),
          getWeeklyFeedback(),
        ]);
      setProfile(profileData);
      setBodyComp(bodyCompData);
      setSessions(sessionData);
      setFeedback(feedbackData);
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: Colors.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

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
            {getDateLabel()}
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
            {getGreeting()}
          </Text>
        </View>

        {profile && <PhaseBadge profile={profile} />}
        <StartSessionButton sessions={sessions} />
        <BodyCompCards entries={bodyComp} />
        <AIReportCard feedback={feedback} />
        <RecentSessions sessions={sessions} />
      </ScrollView>
    </View>
  );
}
