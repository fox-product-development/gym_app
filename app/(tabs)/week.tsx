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
  TextInput,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Colors } from "../../constants/theme";
import {
  getWeekSessions,
  getProfile,
  startSession,
  generateGymSession,
  generateExtraSession,
  reopenSession,
  logCardio,
  getCardio,
  updateCardio,
  deleteCardio,
  extractCardioFromImage,
  getGyms,
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
  metric: string | null;
  equipment_unit: string | null;
}

interface Session {
  id: number;
  session_type: string;
  week_number: number;
  gym_name: string;
  status: "planned" | "in_progress" | "complete";
  notes: string | null;
  planned_exercises: PlannedExercise[] | null;
}

interface UserProfile {
  current_phase: string;
  phase_week: number;
}

interface Gym {
  id: number;
  gym_name: string;
  is_default: boolean;
}

interface CardioEntry {
  id: number;
  activity_type: string;
  duration_minutes: number;
  distance_km: string | null;
  avg_heart_rate: number | null;
  calories: number | null;
  avg_pace_seconds: number | null;
  notes: string | null;
  logged_at: string;
}

// ─── Session type display labels ──────────────────────────────────────────────

const SESSION_TYPE_LABELS: Record<string, string> = {
  full_body: "Full Body",
  upper: "Upper",
  lower: "Lower",
  mixed_mxs: "Mixed - Strength",
  mixed_h_24: "Mixed - Hypertrophy",
  mixed_h_6: "Mixed - Hypertrophy",
  extra: "Extra Session",
};

function getSessionTypeLabel(sessionType: string): string {
  return SESSION_TYPE_LABELS[sessionType] || sessionType;
}

// ─── Extra session type options, by phase ─────────────────────────────────────
// Only the session types that exist in each phase's template are offered.
// Mixed phase has two H-track variants (mixed_h_24, mixed_h_6) that share
// the same exercises — only mixed_h_24 is offered, since an extra session
// would follow the day-6 session, and the 4-day week makes this an edge case.

const EXTRA_SESSION_OPTIONS: Record<string, string[]> = {
  anatomical_adaptation: ["full_body"],
  hypertrophy: ["upper", "lower"],
  mixed: ["mixed_mxs", "mixed_h_24"],
  maximum_strength: ["full_body"],
  muscle_definition: ["full_body"],
};

function getExtraSessionOptions(phase: string): string[] {
  return EXTRA_SESSION_OPTIONS[phase] || ["full_body"];
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

type ModalStep = "choose" | "confirm_swap";

function StartSessionModal({
  session,
  visible,
  onClose,
  onStarted,
  gyms,
}: {
  session: Session | null;
  visible: boolean;
  onClose: () => void;
  onStarted: () => void;
  gyms: Gym[];
}) {
  const [step, setStep] = useState<ModalStep>("choose");
  const [selectedGym, setSelectedGym] = useState<Gym | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleOpen = () => {
    setStep("choose");
    setSelectedGym(null);
    setError("");
  };

  const defaultGym = gyms.find((g) => g.is_default) || gyms[0];
  const otherGyms = gyms.filter((g) => !g.is_default);

  async function handleStartDefault() {
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

  async function handleConfirmSwap() {
    if (!session || !selectedGym) return;
    setLoading(true);
    setError("");
    try {
      await generateGymSession(session.id, selectedGym.id);
      onClose();
      onStarted();
    } catch (err: any) {
      setError("Failed to generate session for this gym");
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
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.7)",
          justifyContent: "flex-end",
        }}
        onPress={onClose}
      >
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
                {getSessionTypeLabel(session.session_type)}
              </Text>

              {defaultGym && (
                <Pressable
                  onPress={handleStartDefault}
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
                  {loading && !selectedGym ? (
                    <ActivityIndicator color="#000" />
                  ) : (
                    <>
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "700",
                          color: "#000",
                        }}
                      >
                        Start — {defaultGym.gym_name}
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
              )}

              {otherGyms.map((gym) => (
                <Pressable
                  key={gym.id}
                  onPress={() => {
                    setSelectedGym(gym);
                    setStep("confirm_swap");
                  }}
                  disabled={loading}
                  style={{
                    backgroundColor: "transparent",
                    borderRadius: 14,
                    padding: 16,
                    alignItems: "center",
                    borderWidth: 0.5,
                    borderColor: Colors.line2,
                    marginBottom: 10,
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
                    Switch to {gym.gym_name}
                  </Text>
                  <Text
                    style={{ fontSize: 12, color: Colors.ter, marginTop: 2 }}
                  >
                    Regenerate with {gym.gym_name.toLowerCase()} equipment
                  </Text>
                </Pressable>
              ))}

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

              <Pressable
                onPress={onClose}
                style={{ marginTop: 16, alignItems: "center" }}
              >
                <Text style={{ fontSize: 14, color: Colors.ter }}>Cancel</Text>
              </Pressable>
            </>
          ) : (
            <>
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
                Switch to {selectedGym?.gym_name}?
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: Colors.sec,
                  lineHeight: 22,
                  marginBottom: 24,
                }}
              >
                This will replace all planned exercises with alternatives for{" "}
                {selectedGym?.gym_name} using the same selection logic. This
                cannot be undone.
              </Text>

              <Pressable
                onPress={handleConfirmSwap}
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
                    Confirm — Switch to {selectedGym?.gym_name}
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

// ─── Reopen session modal ─────────────────────────────────────────────────────

function ReopenSessionModal({
  session,
  visible,
  onClose,
  onReopened,
}: {
  session: Session | null;
  visible: boolean;
  onClose: () => void;
  onReopened: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleReopen() {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      await reopenSession(session.id);
      onClose();
      onReopened();
    } catch (err: any) {
      setError("Failed to reopen session");
    } finally {
      setLoading(false);
    }
  }

  if (!session) return null;

  const sessionLabel = getSessionTypeLabel(session.session_type);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.7)",
          justifyContent: "flex-end",
        }}
        onPress={onClose}
      >
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
            Reopen Session
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
            {sessionLabel}
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: Colors.sec,
              lineHeight: 22,
              marginBottom: 24,
            }}
          >
            This session has been marked as complete. Do you want to reopen it
            and continue where you left off?
          </Text>

          <Pressable
            onPress={handleReopen}
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
                Reopen Session
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

          <Pressable
            onPress={onClose}
            style={{ marginTop: 8, alignItems: "center" }}
          >
            <Text style={{ fontSize: 14, color: Colors.ter }}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Extra session modal ──────────────────────────────────────────────────────

type ExtraModalStep = "session_type" | "gym" | "confirm";

function ExtraSessionModal({
  visible,
  onClose,
  onGenerated,
  gyms,
  currentPhase,
}: {
  visible: boolean;
  onClose: () => void;
  onGenerated: (sessionId: number) => void;
  gyms: Gym[];
  currentPhase: string;
}) {
  const sessionTypeOptions = getExtraSessionOptions(currentPhase);
  const skipTypeStep = sessionTypeOptions.length <= 1;

  const [step, setStep] = useState<ExtraModalStep>(
    skipTypeStep ? "gym" : "session_type",
  );
  const [selectedSessionType, setSelectedSessionType] = useState<string | null>(
    skipTypeStep ? sessionTypeOptions[0] : null,
  );
  const [selectedGym, setSelectedGym] = useState<Gym | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleOpen() {
    const skip = sessionTypeOptions.length <= 1;
    setStep(skip ? "gym" : "session_type");
    setSelectedSessionType(skip ? sessionTypeOptions[0] : null);
    setSelectedGym(gyms.find((g) => g.is_default) || gyms[0] || null);
    setError("");
  }

  async function handleConfirm() {
    if (!selectedGym || !selectedSessionType) return;
    setLoading(true);
    setError("");
    try {
      const result = await generateExtraSession(
        selectedGym.id,
        selectedSessionType,
      );
      onClose();
      onGenerated(result.session_id);
    } catch (err: any) {
      setError("Failed to generate session — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onShow={handleOpen}
      onRequestClose={onClose}
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.7)",
          justifyContent: "flex-end",
        }}
        onPress={onClose}
      >
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
          {step === "session_type" && (
            <>
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
                Extra Session
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
                What type of session?
              </Text>

              {sessionTypeOptions.map((type) => (
                <Pressable
                  key={type}
                  onPress={() => {
                    setSelectedSessionType(type);
                    setStep("gym");
                  }}
                  style={{
                    backgroundColor: Colors.card2,
                    borderRadius: 14,
                    padding: 16,
                    alignItems: "center",
                    marginBottom: 10,
                    borderWidth: 0.5,
                    borderColor: Colors.line2,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "600",
                      color: Colors.text,
                    }}
                  >
                    {getSessionTypeLabel(type)}
                  </Text>
                </Pressable>
              ))}

              <Pressable
                onPress={onClose}
                style={{ marginTop: 16, alignItems: "center" }}
              >
                <Text style={{ fontSize: 14, color: Colors.ter }}>Cancel</Text>
              </Pressable>
            </>
          )}

          {step === "gym" && (
            <>
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
                Extra Session
                {selectedSessionType
                  ? ` · ${getSessionTypeLabel(selectedSessionType)}`
                  : ""}
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
                Which gym?
              </Text>

              {gyms.map((gym) => {
                const isDefault = gym.is_default;
                return (
                  <Pressable
                    key={gym.id}
                    onPress={() => {
                      setSelectedGym(gym);
                      setStep("confirm");
                    }}
                    style={{
                      backgroundColor: isDefault ? Colors.text : "transparent",
                      borderRadius: 14,
                      padding: 16,
                      alignItems: "center",
                      marginBottom: 10,
                      borderWidth: isDefault ? 0 : 0.5,
                      borderColor: Colors.line2,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: isDefault ? "700" : "600",
                        color: isDefault ? "#000" : Colors.text,
                      }}
                    >
                      {gym.gym_name}
                    </Text>
                    {isDefault && (
                      <Text
                        style={{
                          fontSize: 12,
                          color: "rgba(0,0,0,0.5)",
                          marginTop: 2,
                        }}
                      >
                        Default
                      </Text>
                    )}
                  </Pressable>
                );
              })}

              {!skipTypeStep && (
                <Pressable
                  onPress={() => {
                    setStep("session_type");
                    setError("");
                  }}
                  style={{ marginTop: 8, alignItems: "center" }}
                >
                  <Text style={{ fontSize: 14, color: Colors.ter }}>
                    ← Back
                  </Text>
                </Pressable>
              )}
            </>
          )}

          {step === "confirm" && (
            <>
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
                Confirm
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
                Generate and start new session?
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: Colors.sec,
                  lineHeight: 22,
                  marginBottom: 24,
                }}
              >
                {selectedSessionType
                  ? getSessionTypeLabel(selectedSessionType)
                  : ""}{" "}
                · {selectedGym?.gym_name} · AI will select the best exercises
                based on your training history.
              </Text>

              <Pressable
                onPress={handleConfirm}
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
                    Generate Session →
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

              <Pressable
                onPress={() => {
                  setStep("gym");
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
  onReopenPress,
}: {
  session: Session;
  index: number;
  onStartPress: (session: Session) => void;
  onReopenPress: (session: Session) => void;
}) {
  const isActive = session.status === "in_progress";
  const isDone = session.status === "complete";
  const exercises = session.planned_exercises || [];

  const sessionLabel = getSessionTypeLabel(session.session_type);
  const badgeLabel = session.session_type.slice(0, 3).toUpperCase();

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
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          padding: 14,
        }}
      >
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
            {badgeLabel}
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

        {!isDone && (
          <Pressable
            onPress={() => onStartPress(session)}
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

        {isDone && (
          <Pressable
            onPress={() => onReopenPress(session)}
            style={{
              backgroundColor: "transparent",
              borderWidth: 0.5,
              borderColor: Colors.line2,
              borderRadius: 999,
              paddingVertical: 7,
              paddingHorizontal: 14,
            }}
          >
            <Text
              style={{ fontSize: 12, fontWeight: "600", color: Colors.sec }}
            >
              Reopen
            </Text>
          </Pressable>
        )}
      </View>

      <Divider inset={16} />

      <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 }}>
        {exercises.map((ex, j) => {
          const unit = ex.equipment_unit ?? "kg";
          return (
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
                {ex.metric === "time"
                  ? `${ex.target_reps}s`
                  : ex.metric === "reps"
                    ? `${ex.target_reps} reps`
                    : `${ex.target_weight} ${unit}`}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Pace conversion helpers ──────────────────────────────────────────────────

function secondsToPaceString(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function paceStringToSeconds(pace: string): number | null {
  const parts = pace.split(":");
  if (parts.length !== 2) return null;
  const mins = parseInt(parts[0]);
  const secs = parseInt(parts[1]);
  if (isNaN(mins) || isNaN(secs)) return null;
  return mins * 60 + secs;
}

function secondsToKmh(seconds: number): string {
  return (3600 / seconds).toFixed(1);
}

function kmhToSeconds(kmh: number): number {
  return Math.round(3600 / kmh);
}

// ─── Cardio log modal ─────────────────────────────────────────────────────────

const CARDIO_TYPES = [
  "Running",
  "Cycling",
  "Swimming",
  "Walking",
  "Rowing",
  "Skipping",
  "Other",
];

function CardioModal({
  visible,
  onClose,
  onSaved,
  editEntry,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  editEntry?: CardioEntry | null;
}) {
  const isEditing = !!editEntry;
  const [activityType, setActivityType] = useState("Running");
  const [customType, setCustomType] = useState("");
  const [duration, setDuration] = useState("");
  const [distance, setDistance] = useState("");
  const [heartRate, setHeartRate] = useState("");
  const [calories, setCalories] = useState("");
  const [paceInput, setPaceInput] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");

  function populateFromEntry(entry: CardioEntry) {
    const type = CARDIO_TYPES.includes(entry.activity_type)
      ? entry.activity_type
      : "Other";
    setActivityType(type);
    if (type === "Other") setCustomType(entry.activity_type);
    setDuration(String(entry.duration_minutes));
    setDistance(
      entry.distance_km ? parseFloat(entry.distance_km).toString() : "",
    );
    setHeartRate(entry.avg_heart_rate ? String(entry.avg_heart_rate) : "");
    setCalories(entry.calories ? String(entry.calories) : "");
    if (entry.avg_pace_seconds) {
      setPaceInput(
        entry.activity_type === "Cycling"
          ? secondsToKmh(entry.avg_pace_seconds)
          : secondsToPaceString(entry.avg_pace_seconds),
      );
    } else {
      setPaceInput("");
    }
    setNotes(entry.notes || "");
  }

  function handleOpen() {
    if (isEditing && editEntry) {
      populateFromEntry(editEntry);
    } else {
      setActivityType("Running");
      setCustomType("");
      setDuration("");
      setDistance("");
      setHeartRate("");
      setCalories("");
      setPaceInput("");
      setNotes("");
    }
    setError("");
  }

  function handleClose() {
    setActivityType("Running");
    setCustomType("");
    setDuration("");
    setDistance("");
    setHeartRate("");
    setCalories("");
    setPaceInput("");
    setNotes("");
    setError("");
    onClose();
  }

  async function handleStravaUpload() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) {
      setError("Could not read image");
      return;
    }
    const mediaType = (asset.mimeType as any) || "image/jpeg";
    setExtracting(true);
    setError("");
    try {
      const extracted = await extractCardioFromImage(asset.base64, mediaType);
      const type = CARDIO_TYPES.includes(extracted.activity_type)
        ? extracted.activity_type
        : "Other";
      setActivityType(type);
      if (type === "Other") setCustomType(extracted.activity_type || "");
      if (extracted.duration_minutes)
        setDuration(String(extracted.duration_minutes));
      if (extracted.distance_km) setDistance(String(extracted.distance_km));
      if (extracted.avg_heart_rate)
        setHeartRate(String(extracted.avg_heart_rate));
      if (extracted.calories) setCalories(String(extracted.calories));
      if (extracted.avg_pace_seconds) {
        setPaceInput(
          extracted.activity_type === "Cycling"
            ? secondsToKmh(extracted.avg_pace_seconds)
            : secondsToPaceString(extracted.avg_pace_seconds),
        );
      }
      if (extracted.notes) setNotes(extracted.notes);
    } catch (err: any) {
      setError("Could not extract data — please fill in manually");
    } finally {
      setExtracting(false);
    }
  }

  function buildAvgPaceSeconds(): number | null {
    if (!paceInput.trim()) return null;
    if (activityType === "Cycling") {
      const kmh = parseFloat(paceInput);
      if (isNaN(kmh) || kmh <= 0) return null;
      return kmhToSeconds(kmh);
    }
    return paceStringToSeconds(paceInput);
  }

  async function handleSave() {
    const mins = parseInt(duration);
    if (!mins || mins < 1) {
      setError("Please enter a duration");
      return;
    }
    const type = activityType === "Other" ? customType.trim() : activityType;
    if (!type) {
      setError("Please enter an activity type");
      return;
    }
    const payload = {
      activity_type: type,
      duration_minutes: mins,
      distance_km: distance ? parseFloat(distance) : undefined,
      avg_heart_rate: heartRate ? parseInt(heartRate) : undefined,
      calories: calories ? parseInt(calories) : undefined,
      avg_pace_seconds: buildAvgPaceSeconds() ?? undefined,
      notes: notes.trim() || undefined,
    };
    setSaving(true);
    setError("");
    try {
      if (isEditing && editEntry) {
        await updateCardio(editEntry.id, payload);
      } else {
        await logCardio(payload);
      }
      onSaved();
      handleClose();
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const isCycling = activityType === "Cycling";
  const showPace = ["Running", "Cycling", "Walking"].includes(activityType);

  const inputStyle = {
    backgroundColor: Colors.bg,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 0.5,
    borderColor: Colors.line,
  };
  const labelStyle = {
    fontFamily: "Courier",
    fontSize: 10,
    color: Colors.ter,
    letterSpacing: 0.6,
    textTransform: "uppercase" as const,
    marginBottom: 6,
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onShow={handleOpen}
      onRequestClose={handleClose}
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.7)",
          justifyContent: "flex-end",
        }}
        onPress={handleClose}
      >
        <Pressable
          style={{
            backgroundColor: Colors.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 24,
            paddingBottom: 40,
            borderTopWidth: 0.5,
            borderColor: Colors.line,
            maxHeight: "92%",
          }}
          onPress={() => {}}
        >
          <ScrollView showsVerticalScrollIndicator={false}>
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
              {isEditing ? "Edit Cardio" : "Log Cardio"}
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
              {isEditing ? "Edit activity" : "What did you do?"}
            </Text>

            {!isEditing && (
              <Pressable
                onPress={handleStravaUpload}
                disabled={extracting}
                style={{
                  backgroundColor: Colors.card2,
                  borderRadius: 12,
                  padding: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  marginBottom: 20,
                  borderWidth: 0.5,
                  borderColor: Colors.line,
                  opacity: extracting ? 0.6 : 1,
                }}
              >
                {extracting ? (
                  <ActivityIndicator color={Colors.accent} />
                ) : (
                  <Text style={{ fontSize: 18 }}>📸</Text>
                )}
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: extracting ? Colors.ter : Colors.text,
                  }}
                >
                  {extracting
                    ? "Reading screenshot…"
                    : "Log from Strava Screenshot"}
                </Text>
              </Pressable>
            )}

            <Text style={labelStyle}>Activity</Text>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                marginBottom: 16,
              }}
            >
              {CARDIO_TYPES.map((type) => (
                <Pressable
                  key={type}
                  onPress={() => setActivityType(type)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 8,
                    backgroundColor:
                      activityType === type ? Colors.accentDim : Colors.card2,
                    borderWidth: activityType === type ? 1 : 0,
                    borderColor: Colors.accent,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: activityType === type ? Colors.accent : Colors.sec,
                      fontWeight: activityType === type ? "600" : "400",
                    }}
                  >
                    {type}
                  </Text>
                </Pressable>
              ))}
            </View>

            {activityType === "Other" && (
              <View style={{ marginBottom: 16 }}>
                <Text style={labelStyle}>Activity name</Text>
                <TextInput
                  value={customType}
                  onChangeText={setCustomType}
                  placeholder="e.g. Kickboxing"
                  placeholderTextColor={Colors.ter}
                  style={inputStyle}
                />
              </View>
            )}

            <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={labelStyle}>Duration (mins)</Text>
                <TextInput
                  value={duration}
                  onChangeText={setDuration}
                  keyboardType="numeric"
                  placeholder="30"
                  placeholderTextColor={Colors.ter}
                  style={inputStyle}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={labelStyle}>Distance (km)</Text>
                <TextInput
                  value={distance}
                  onChangeText={setDistance}
                  keyboardType="decimal-pad"
                  placeholder="Optional"
                  placeholderTextColor={Colors.ter}
                  style={inputStyle}
                />
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={labelStyle}>Avg Heart Rate</Text>
                <TextInput
                  value={heartRate}
                  onChangeText={setHeartRate}
                  keyboardType="numeric"
                  placeholder="bpm"
                  placeholderTextColor={Colors.ter}
                  style={inputStyle}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={labelStyle}>Calories</Text>
                <TextInput
                  value={calories}
                  onChangeText={setCalories}
                  keyboardType="numeric"
                  placeholder="kcal"
                  placeholderTextColor={Colors.ter}
                  style={inputStyle}
                />
              </View>
            </View>

            {showPace && (
              <View style={{ marginBottom: 16 }}>
                <Text style={labelStyle}>
                  {isCycling ? "Avg Speed (km/h)" : "Avg Pace (min:sec /km)"}
                </Text>
                <TextInput
                  value={paceInput}
                  onChangeText={setPaceInput}
                  keyboardType={isCycling ? "decimal-pad" : "default"}
                  placeholder={isCycling ? "e.g. 24.5" : "e.g. 6:38"}
                  placeholderTextColor={Colors.ter}
                  style={inputStyle}
                />
              </View>
            )}

            <View style={{ marginBottom: 16 }}>
              <Text style={labelStyle}>Notes</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional"
                placeholderTextColor={Colors.ter}
                multiline
                numberOfLines={3}
                style={[
                  inputStyle,
                  { minHeight: 72, textAlignVertical: "top" },
                ]}
              />
            </View>

            {error ? (
              <Text
                style={{ fontSize: 13, color: Colors.warn, marginBottom: 12 }}
              >
                {error}
              </Text>
            ) : null}

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={handleClose}
                style={{
                  flex: 1,
                  backgroundColor: Colors.card2,
                  borderRadius: 12,
                  padding: 14,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 15, color: Colors.sec }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                disabled={saving}
                style={{
                  flex: 2,
                  backgroundColor: Colors.accent,
                  borderRadius: 12,
                  padding: 14,
                  alignItems: "center",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? (
                  <ActivityIndicator color={Colors.accentInk} />
                ) : (
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: Colors.accentInk,
                    }}
                  >
                    {isEditing ? "Save Changes" : "Save"}
                  </Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Phase label helper ───────────────────────────────────────────────────────

const PHASE_LABELS: Record<string, string> = {
  anatomical_adaptation: "Anatomical Adaptation",
  hypertrophy: "Hypertrophy",
  mixed: "Mixed",
  maximum_strength: "Maximum Strength",
  muscle_definition: "Muscle Definition",
};

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function WeekScreen() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalSession, setModalSession] = useState<Session | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [reopenSession_modal, setReopenSession_modal] =
    useState<Session | null>(null);
  const [reopenVisible, setReopenVisible] = useState(false);
  const [extraModalVisible, setExtraModalVisible] = useState(false);
  const [cardioModalVisible, setCardioModalVisible] = useState(false);
  const [cardioEntries, setCardioEntries] = useState<CardioEntry[]>([]);
  const [editCardioEntry, setEditCardioEntry] = useState<CardioEntry | null>(
    null,
  );
  const [gyms, setGyms] = useState<Gym[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, []),
  );

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [sessionData, profileData, cardioData, gymData] = await Promise.all(
        [getWeekSessions(), getProfile(), getCardio(1), getGyms()],
      );
      setSessions(sessionData);
      setProfile(profileData);
      setCardioEntries(cardioData);
      setGyms(gymData);
    } catch (err: any) {
      setError("Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }

  function handleStartPress(session: Session) {
    if (session.status === "in_progress") {
      router.push(`/session?id=${session.id}`);
      return;
    }
    setModalSession(session);
    setModalVisible(true);
  }

  function handleModalClose() {
    setModalVisible(false);
    setModalSession(null);
  }

  function handleSessionStarted() {
    const sessionId = modalSession?.id;
    loadData();
    if (sessionId) {
      router.push(`/session?id=${sessionId}`);
    }
  }

  function handleReopenPress(session: Session) {
    setReopenSession_modal(session);
    setReopenVisible(true);
  }

  function handleReopened() {
    const sessionId = reopenSession_modal?.id;
    loadData();
    if (sessionId) {
      router.push(`/session?id=${sessionId}`);
    }
  }

  function handleExtraGenerated(sessionId: number) {
    loadData();
    router.push(`/session?id=${sessionId}`);
  }

  const completedCount = sessions.filter((s) => s.status === "complete").length;

  const plannedSessions = sessions.filter((s) => s.session_type !== "extra");
  const extraSessions = sessions.filter((s) => s.session_type === "extra");
  const orderedSessions = [...plannedSessions, ...extraSessions];
  const phaseLabel = profile
    ? PHASE_LABELS[profile.current_phase] || profile.current_phase
    : "";

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView showsVerticalScrollIndicator={false}>
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
              ? `${phaseLabel} · Week ${profile.phase_week}`
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
                onReopenPress={handleReopenPress}
              />
            ))}
          </View>
        )}

        {!loading && (
          <Pressable
            onPress={() => {
              if (profile?.current_phase !== "transition") {
                setExtraModalVisible(true);
              }
            }}
            disabled={profile?.current_phase === "transition"}
            style={{
              marginHorizontal: 20,
              marginTop: 4,
              backgroundColor: Colors.card,
              borderRadius: 16,
              borderWidth: 0.5,
              borderColor: Colors.line,
              padding: 18,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              opacity: profile?.current_phase === "transition" ? 0.5 : 1,
            }}
          >
            <View>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: Colors.text,
                  letterSpacing: -0.2,
                }}
              >
                Generate Extra Session
              </Text>
              {profile?.current_phase === "transition" && (
                <Text
                  style={{
                    fontSize: 12,
                    color: Colors.ter,
                    marginTop: 2,
                  }}
                >
                  Not available during transition — it's your week off
                </Text>
              )}
            </View>
            {profile?.current_phase !== "transition" && (
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  borderWidth: 1.5,
                  borderColor: Colors.accent,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: Colors.accent,
                    fontSize: 20,
                    lineHeight: 22,
                    fontWeight: "300",
                  }}
                >
                  +
                </Text>
              </View>
            )}
          </Pressable>
        )}

        {!loading && (
          <View style={{ marginHorizontal: 20, marginTop: 10 }}>
            {cardioEntries.length > 0 && (
              <View
                style={{
                  backgroundColor: Colors.card,
                  borderRadius: 16,
                  borderWidth: 0.5,
                  borderColor: Colors.line,
                  marginBottom: 10,
                  overflow: "hidden",
                }}
              >
                <View style={{ padding: 14, paddingBottom: 8 }}>
                  <Text
                    style={{
                      fontFamily: "Courier",
                      fontSize: 10,
                      color: Colors.ter,
                      letterSpacing: 0.6,
                      textTransform: "uppercase",
                    }}
                  >
                    Cardio this week
                  </Text>
                </View>
                {cardioEntries.map((entry, i) => (
                  <View key={entry.id}>
                    {i > 0 && (
                      <View
                        style={{
                          height: 0.5,
                          backgroundColor: Colors.line,
                          marginLeft: 14,
                        }}
                      />
                    )}
                    <Pressable
                      onPress={() => {
                        setEditCardioEntry(entry);
                        setCardioModalVisible(true);
                      }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        padding: 14,
                        gap: 12,
                      }}
                    >
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          backgroundColor: Colors.accentDim,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ fontSize: 16 }}>
                          {entry.activity_type === "Running"
                            ? "🏃"
                            : entry.activity_type === "Cycling"
                              ? "🚴"
                              : entry.activity_type === "Swimming"
                                ? "🏊"
                                : entry.activity_type === "Walking"
                                  ? "🚶"
                                  : entry.activity_type === "Rowing"
                                    ? "🚣"
                                    : "❤️"}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 14,
                            color: Colors.text,
                            fontWeight: "500",
                          }}
                        >
                          {entry.activity_type}
                        </Text>
                        <Text
                          style={{
                            fontSize: 11,
                            color: Colors.ter,
                            marginTop: 2,
                            fontFamily: "Courier",
                          }}
                        >
                          {[
                            `${entry.duration_minutes} min`,
                            entry.distance_km
                              ? `${parseFloat(entry.distance_km).toFixed(1)}km`
                              : null,
                            entry.avg_pace_seconds
                              ? entry.activity_type === "Cycling"
                                ? `${(3600 / entry.avg_pace_seconds).toFixed(1)} km/h`
                                : `${Math.floor(entry.avg_pace_seconds / 60)}:${String(entry.avg_pace_seconds % 60).padStart(2, "0")} /km`
                              : null,
                            entry.avg_heart_rate
                              ? `${entry.avg_heart_rate} bpm`
                              : null,
                            entry.calories ? `${entry.calories} kcal` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                        {entry.notes ? (
                          <Text
                            numberOfLines={1}
                            style={{
                              fontSize: 11,
                              color: Colors.sec,
                              marginTop: 3,
                              fontStyle: "italic",
                            }}
                          >
                            {entry.notes}
                          </Text>
                        ) : null}
                      </View>
                      <Pressable
                        onPress={async () => {
                          await deleteCardio(entry.id);
                          setCardioEntries((prev) =>
                            prev.filter((e) => e.id !== entry.id),
                          );
                        }}
                      >
                        <Text style={{ fontSize: 18, color: Colors.ter }}>
                          ×
                        </Text>
                      </Pressable>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            <Pressable
              onPress={() => {
                setEditCardioEntry(null);
                setCardioModalVisible(true);
              }}
              style={{
                backgroundColor: Colors.card,
                borderRadius: 16,
                borderWidth: 0.5,
                borderColor: Colors.line,
                padding: 18,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: Colors.text,
                  letterSpacing: -0.2,
                }}
              >
                Log Cardio
              </Text>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  borderWidth: 1.5,
                  borderColor: Colors.accent,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: Colors.accent,
                    fontSize: 20,
                    lineHeight: 22,
                    fontWeight: "300",
                  }}
                >
                  +
                </Text>
              </View>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <StartSessionModal
        session={modalSession}
        visible={modalVisible}
        onClose={handleModalClose}
        onStarted={handleSessionStarted}
        gyms={gyms}
      />

      <ReopenSessionModal
        session={reopenSession_modal}
        visible={reopenVisible}
        onClose={() => {
          setReopenVisible(false);
          setReopenSession_modal(null);
        }}
        onReopened={handleReopened}
      />

      <ExtraSessionModal
        visible={extraModalVisible}
        onClose={() => setExtraModalVisible(false)}
        onGenerated={handleExtraGenerated}
        gyms={gyms}
        currentPhase={profile?.current_phase || ""}
      />

      <CardioModal
        visible={cardioModalVisible}
        onClose={() => {
          setCardioModalVisible(false);
          setEditCardioEntry(null);
        }}
        onSaved={loadData}
        editEntry={editCardioEntry}
      />
    </View>
  );
}
