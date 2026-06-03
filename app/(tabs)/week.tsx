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
import { Colors } from "../../constants/theme";
import {
  getWeekSessions,
  getProfile,
  startSession,
  generateHomeSession,
  generateExtraSession,
  logCardio,
  getCardio,
  deleteCardio,
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
  notes: string | null;
  logged_at: string;
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
// Step 1: Choose gym from user's gym list
// Step 2 (non-default gym): Confirm exercise regeneration

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
      await generateHomeSession(session.id);
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
                {session.session_type === "compound"
                  ? `Compound · Session ${session.occurrence}`
                  : "Isolation"}
              </Text>

              {/* Default gym — primary button */}
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

              {/* Other gyms — secondary buttons */}
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

// ─── Extra session modal ──────────────────────────────────────────────────────
// Step 1: Choose Work Gym or Home Gym
// Step 2: Confirm generation

type ExtraModalStep = "choose" | "confirm";

function ExtraSessionModal({
  visible,
  onClose,
  onGenerated,
}: {
  visible: boolean;
  onClose: () => void;
  onGenerated: (sessionId: number) => void;
}) {
  const [step, setStep] = useState<ExtraModalStep>("choose");
  const [selectedGym, setSelectedGym] = useState<"work" | "home">("work");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleOpen() {
    setStep("choose");
    setSelectedGym("work");
    setError("");
  }

  async function handleConfirm() {
    setLoading(true);
    setError("");
    try {
      const result = await generateExtraSession(selectedGym);
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
                Which gym?
              </Text>

              <Pressable
                onPress={() => {
                  setSelectedGym("work");
                  setStep("confirm");
                }}
                style={{
                  backgroundColor: Colors.text,
                  borderRadius: 14,
                  padding: 16,
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <Text
                  style={{ fontSize: 16, fontWeight: "700", color: "#000" }}
                >
                  🏋️ Work Gym
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: "rgba(0,0,0,0.5)",
                    marginTop: 2,
                  }}
                >
                  Full barbell and cable equipment
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setSelectedGym("home");
                  setStep("confirm");
                }}
                style={{
                  backgroundColor: "transparent",
                  borderRadius: 14,
                  padding: 16,
                  alignItems: "center",
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
                  🏠 Home Gym
                </Text>
                <Text style={{ fontSize: 12, color: Colors.ter, marginTop: 2 }}>
                  EZ bar and dumbbells
                </Text>
              </Pressable>

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
                {selectedGym === "work" ? "🏋️ Work Gym" : "🏠 Home Gym"} · AI
                will select the 6 best exercises for you based on your training
                history.
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
      : session.session_type === "isolation"
        ? "Isolation"
        : "Extra Session";

  const badgeLabel =
    session.session_type === "compound"
      ? "CPD"
      : session.session_type === "isolation"
        ? "ISO"
        : "XTR";

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
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [activityType, setActivityType] = useState("Running");
  const [customType, setCustomType] = useState("");
  const [duration, setDuration] = useState("");
  const [distance, setDistance] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handleClose() {
    setActivityType("Running");
    setCustomType("");
    setDuration("");
    setDistance("");
    setNotes("");
    setError("");
    onClose();
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
    setSaving(true);
    setError("");
    try {
      await logCardio({
        activity_type: type,
        duration_minutes: mins,
        distance_km: distance ? parseFloat(distance) : undefined,
        notes: notes.trim() || undefined,
      });
      onSaved();
      handleClose();
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

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
          }}
          onPress={() => {}}
        >
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
            Log Cardio
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
            What did you do?
          </Text>

          {/* Activity type picker */}
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

          <View style={{ marginBottom: 16 }}>
            <Text style={labelStyle}>Notes</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional"
              placeholderTextColor={Colors.ter}
              style={inputStyle}
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
                  Save
                </Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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
  const [extraModalVisible, setExtraModalVisible] = useState(false);
  const [cardioModalVisible, setCardioModalVisible] = useState(false);
  const [cardioEntries, setCardioEntries] = useState<CardioEntry[]>([]);
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

  function handleExtraGenerated(sessionId: number) {
    loadData();
    router.push(`/session?id=${sessionId}`);
  }

  const completedCount = sessions.filter((s) => s.status === "complete").length;
  const currentWeekSessions = sessions;

  const plannedSessions = [
    currentWeekSessions.find(
      (s) => s.session_type === "compound" && s.occurrence === 1,
    ),
    currentWeekSessions.find((s) => s.session_type === "isolation"),
    currentWeekSessions.find(
      (s) => s.session_type === "compound" && s.occurrence === 2,
    ),
  ].filter(Boolean) as Session[];

  const extraSessions = sessions.filter((s) => s.session_type === "extra");
  const orderedSessions = [...plannedSessions, ...extraSessions];

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

        {/* generate extra session button */}
        {!loading && (
          <Pressable
            onPress={() => setExtraModalVisible(true)}
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
              Generate Extra Session
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
        )}

        {/* cardio section */}
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
                    <View
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
                          {entry.duration_minutes} min
                          {entry.distance_km
                            ? ` · ${parseFloat(entry.distance_km).toFixed(1)}km`
                            : ""}
                        </Text>
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
                    </View>
                  </View>
                ))}
              </View>
            )}

            <Pressable
              onPress={() => setCardioModalVisible(true)}
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
        gyms={gyms}
      />

      {/* Extra session modal */}
      <ExtraSessionModal
        visible={extraModalVisible}
        onClose={() => setExtraModalVisible(false)}
        onGenerated={handleExtraGenerated}
      />

      {/* Cardio modal */}
      <CardioModal
        visible={cardioModalVisible}
        onClose={() => setCardioModalVisible(false)}
        onSaved={loadData}
      />
    </View>
  );
}
