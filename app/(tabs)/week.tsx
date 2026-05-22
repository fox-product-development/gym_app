// app/(tabs)/week.tsx
// This Week's Plan screen — shows real sessions from the database.
// Gym selection happens at session start time via a two-step modal.

import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import { Colors } from "../../constants/theme";
import {
  getWeekSessions,
  getProfile,
  startSession,
  generateHomeSession,
} from "../../services/api";

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

// ─── Start session modal ──────────────────────────────────────────────────────
// Step 1: Choose Work Gym or Home Gym
// Step 2 (Home Gym only): Confirm exercise regeneration

type ModalStep = "choose" | "confirm_home";

function StartSessionModal({
  session,
  visible,
  onClose,
  onStarted,
}: {
  session: Session | null;
  visible: boolean;
  onClose: () => void;
  onStarted: () => void;
}) {
  const [step, setStep] = useState<ModalStep>("choose");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Reset step when modal opens
  const handleOpen = () => {
    setStep("choose");
    setError("");
  };

  async function handleStartWorkGym() {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      await startSession(session.id);
      onClose();
      onStarted();
    } catch (err: any) {
      setError("Failed to start session");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmHomeGym() {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      await generateHomeSession(session.id);
      onClose();
      onStarted();
    } catch (err: any) {
      setError("Failed to generate Home Gym session");
    } finally {
      setLoading(false);
    }
  }

  if (!session) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onShow={handleOpen}
      onRequestClose={onClose}
    >
      {/* backdrop */}
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.7)",
          justifyContent: "flex-end",
        }}
        onPress={onClose}
      >
        {/* sheet — stops press propagation */}
        <Pressable
          style={{
            backgroundColor: Colors.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 24,
            paddingBottom: 40,
            borderTopWidth: 0.5,
            borderColor: Colors.line,
          }}
          onPress={() => {}}
        >
          {step === "choose" ? (
            <>
              {/* header */}
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
                Starting Session
              </Text>
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: "700",
                  color: Colors.text,
                  letterSpacing: -0.4,
                  marginBottom: 20,
                }}
              >
                {session.session_type === "compound"
                  ? `Compound · Session ${session.occurrence}`
                  : "Isolation"}
              </Text>

              {/* Work Gym button */}
              <Pressable
                onPress={handleStartWorkGym}
                disabled={loading}
                style={{
                  backgroundColor: Colors.text,
                  borderRadius: 14,
                  padding: 16,
                  alignItems: "center",
                  marginBottom: 10,
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <>
                    <Text
                      style={{ fontSize: 16, fontWeight: "700", color: "#000" }}
                    >
                      🏋️ Start — Work Gym
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: "rgba(0,0,0,0.5)",
                        marginTop: 2,
                      }}
                    >
                      Use the planned programme
                    </Text>
                  </>
                )}
              </Pressable>

              {/* Home Gym button */}
              <Pressable
                onPress={() => setStep("confirm_home")}
                disabled={loading}
                style={{
                  backgroundColor: "transparent",
                  borderRadius: 14,
                  padding: 16,
                  alignItems: "center",
                  borderWidth: 0.5,
                  borderColor: Colors.line2,
                  opacity: loading ? 0.6 : 1,
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "600",
                    color: Colors.text,
                  }}
                >
                  🏠 Switch to Home Gym
                </Text>
                <Text style={{ fontSize: 12, color: Colors.ter, marginTop: 2 }}>
                  Regenerate with home equipment
                </Text>
              </Pressable>

              {error ? (
                <Text
                  style={{
                    fontSize: 12,
                    color: Colors.warn,
                    marginTop: 12,
                    textAlign: "center",
                  }}
                >
                  {error}
                </Text>
              ) : null}

              {/* cancel */}
              <Pressable
                onPress={onClose}
                style={{ marginTop: 16, alignItems: "center" }}
              >
                <Text style={{ fontSize: 14, color: Colors.ter }}>Cancel</Text>
              </Pressable>
            </>
          ) : (
            <>
              {/* confirmation step */}
              <Text
                style={{
                  fontFamily: "Courier",
                  fontSize: 10,
                  color: Colors.warn,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                Confirm Switch
              </Text>
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: "700",
                  color: Colors.text,
                  letterSpacing: -0.4,
                  marginBottom: 10,
                }}
              >
                Switch to Home Gym?
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: Colors.sec,
                  lineHeight: 22,
                  marginBottom: 24,
                }}
              >
                This will replace all planned exercises with Home Gym
                alternatives using the same selection logic. This cannot be
                undone.
              </Text>

              {/* Confirm button */}
              <Pressable
                onPress={handleConfirmHomeGym}
                disabled={loading}
                style={{
                  backgroundColor: Colors.accent,
                  borderRadius: 14,
                  padding: 16,
                  alignItems: "center",
                  marginBottom: 10,
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? (
                  <ActivityIndicator color={Colors.accentInk} />
                ) : (
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "700",
                      color: Colors.accentInk,
                    }}
                  >
                    Confirm — Switch to Home Gym
                  </Text>
                )}
              </Pressable>

              {error ? (
                <Text
                  style={{
                    fontSize: 12,
                    color: Colors.warn,
                    marginTop: 4,
                    textAlign: "center",
                  }}
                >
                  {error}
                </Text>
              ) : null}

              {/* back */}
              <Pressable
                onPress={() => {
                  setStep("choose");
                  setError("");
                }}
                style={{ marginTop: 8, alignItems: "center" }}
              >
                <Text style={{ fontSize: 14, color: Colors.ter }}>← Back</Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
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
        marginTop: 14,
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
  onStartPress,
}: {
  session: Session;
  index: number;
  onStartPress: (session: Session) => void;
}) {
  const isActive = session.status === "in_progress";
  const isDone = session.status === "complete";
  const exercises = session.planned_exercises || [];

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
        {/* session badge */}
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
            {session.gym === "home" && isActive && (
              <Tag color={Colors.warn} bg="rgba(242,181,100,0.12)">
                🏠 Home
              </Tag>
            )}
            <Text
              style={{ fontFamily: "Courier", fontSize: 11, color: Colors.ter }}
            >
              {exercises.length} exercises
            </Text>
          </View>
        </View>

        {/* action button */}
        {!isDone && (
          <Pressable
            onPress={() => !isDone && onStartPress(session)}
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
              {isActive ? "Continue →" : "Start →"}
            </Text>
          </Pressable>
        )}
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
  anatomical_adaptation: "Anatomical Adaptation",
  hypertrophy: "Hypertrophy",
  maximum_strength: "Maximum Strength",
  muscle_definition: "Muscle Definition",
  rest: "Rest Week",
};

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function WeekScreen() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalSession, setModalSession] = useState<Session | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

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

  function handleStartPress(session: Session) {
    // If session is already in progress, go straight to active session
    // (navigation to active session screen will be wired up next)
    if (session.status === "in_progress") {
      router.push(`/session?id=${session.id}`);
      return;
    }
    // Otherwise show the gym choice modal
    setModalSession(session);
    setModalVisible(true);
  }

  function handleModalClose() {
    setModalVisible(false);
    setModalSession(null);
  }

  function handleSessionStarted() {
    // Reload sessions to reflect new status
    loadData();
  }

  const completedCount = sessions.filter((s) => s.status === "complete").length;
  const currentWeekSessions = sessions;

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
              fontSize: 13,
              color: Colors.text,
              letterSpacing: 0.5,
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
                onStartPress={handleStartPress}
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

      {/* Start session modal */}
      <StartSessionModal
        session={modalSession}
        visible={modalVisible}
        onClose={handleModalClose}
        onStarted={handleSessionStarted}
      />
    </View>
  );
}
