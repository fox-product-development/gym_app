// app/session.tsx
// Active Session screen — loads real session data and handles set logging.

import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
  Modal,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Colors } from "../constants/theme";
import { getSession, logSet, completeSession } from "../services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlannedExercise {
  id: number;
  exercise_name: string;
  muscles_primary: string;
  sub_component: string;
  order_index: number;
  target_sets: number;
  target_reps: number;
  target_weight: number;
  range_exceeded: boolean;
  set_style: "standard" | "drop";
  metric: string | null;
}

interface LoggedSet {
  exercise_name: string;
  set_number: number;
  drop_number: number;
  weight: number;
  reps: number;
  notes?: string;
}

interface SessionData {
  id: number;
  session_type: string;
  occurrence: number;
  gym: string;
  status: string;
  notes: string | null;
  planned_exercises: PlannedExercise[];
  logged_sets: LoggedSet[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Divider() {
  return <View style={{ height: 0.5, backgroundColor: Colors.line }} />;
}

function isDumbbellExercise(exerciseName: string): boolean {
  return exerciseName.toLowerCase().includes("dumbbell");
}

function weightUnit(weight: number, exercise: PlannedExercise): string {
  if (exercise.metric === "time") return `${exercise.target_reps} secs`;
  if (exercise.metric === "reps") return `${exercise.target_reps} reps`;
  if (isDumbbellExercise(exercise.exercise_name))
    return `${weight} kg per dumbbell`;
  return `${weight} kg`;
}

// ─── Rep entry modal ──────────────────────────────────────────────────────────

function RepEntryModal({
  visible,
  targetReps,
  weight,
  exerciseName,
  musclesPrimary,
  metric,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  targetReps: number;
  weight: number;
  exerciseName: string;
  musclesPrimary: string;
  metric: string | null;
  onConfirm: (reps: number) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const [isFresh, setIsFresh] = useState(true);

  useEffect(() => {
    if (visible) {
      setValue(String(targetReps));
      setIsFresh(true);
    }
  }, [visible, targetReps]);

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

  function handleKey(key: string) {
    if (key === "⌫") {
      setIsFresh(false);
      setValue((v) => v.slice(0, -1));
    } else if (key === "") {
      return;
    } else {
      if (isFresh) {
        setValue(key);
        setIsFresh(false);
      } else {
        setValue((v) => (v.length < 3 ? v + key : v));
      }
    }
  }

  const weightLabel =
    metric === "time"
      ? `${targetReps} seconds`
      : metric === "reps"
        ? `${targetReps} reps`
        : isDumbbellExercise(exerciseName)
          ? `${weight} kg per dumbbell`
          : `${weight} kg`;

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
              marginBottom: 4,
            }}
          >
            Reps completed
          </Text>
          <Text
            style={{
              fontFamily: "Courier",
              fontSize: 11,
              color: Colors.sec,
              marginBottom: 16,
            }}
          >
            Target: {targetReps} reps @ {weightLabel}
          </Text>

          <View style={{ alignItems: "center", marginBottom: 20 }}>
            <Text
              style={{
                fontSize: 64,
                fontWeight: "700",
                color: Colors.text,
                fontFamily: "Courier",
                letterSpacing: -2,
              }}
            >
              {value || "—"}
            </Text>
          </View>

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 16,
            }}
          >
            {keys.map((k, i) => (
              <Pressable
                key={i}
                onPress={() => handleKey(k)}
                style={{
                  width: "30%",
                  paddingVertical: 14,
                  alignItems: "center",
                  backgroundColor: k === "" ? "transparent" : Colors.card2,
                  borderRadius: 10,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Courier",
                    fontSize: 20,
                    fontWeight: "600",
                    color: k === "⌫" ? Colors.sec : Colors.text,
                  }}
                >
                  {k}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={() => {
              const reps = parseInt(value);
              if (reps > 0) onConfirm(reps);
            }}
            style={{
              backgroundColor: Colors.accent,
              borderRadius: 14,
              padding: 16,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: Colors.accentInk,
              }}
            >
              Log Set
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Exercise block ───────────────────────────────────────────────────────────

// Drop set weight decrement — cable machines use 2.2kg increments
const DROP_DECREMENT = 2.2;

function ExerciseBlock({
  exercise,
  isOpen,
  onToggle,
  loggedSetsForExercise,
  onLogSet,
  sessionId,
}: {
  exercise: PlannedExercise;
  isOpen: boolean;
  onToggle: () => void;
  loggedSetsForExercise: LoggedSet[];
  onLogSet: (
    setNumber: number,
    dropNumber: number,
    weight: number,
    reps: number,
  ) => void;
  sessionId: number;
}) {
  const [repModalOpen, setRepModalOpen] = useState(false);
  const [activeSetNumber, setActiveSetNumber] = useState<number | null>(null);
  const [activeDropNumber, setActiveDropNumber] = useState<number>(0);
  const [activeWeight, setActiveWeight] = useState<number>(
    exercise.target_weight,
  );
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);

  const isDropSet = exercise.set_style === "drop";
  const isDumbbell = isDumbbellExercise(exercise.exercise_name);
  const rangeExceeded = exercise.range_exceeded === true;

  // For standard sets: done when logged rows >= target_sets
  // For drop sets: done when total logged reps >= target_reps, or next weight would be <= 0
  const totalLoggedReps = loggedSetsForExercise.reduce(
    (sum, s) => sum + s.reps,
    0,
  );
  const allDone = isDropSet
    ? totalLoggedReps >= exercise.target_reps ||
      (loggedSetsForExercise.length > 0 &&
        loggedSetsForExercise[loggedSetsForExercise.length - 1].weight -
          DROP_DECREMENT <=
          0)
    : loggedSetsForExercise.filter((s) => s.drop_number === 0).length >=
      exercise.target_sets;

  // For header subtitle
  const completedSets = isDropSet
    ? loggedSetsForExercise.filter((s) => s.drop_number === 0).length
    : loggedSetsForExercise.length;
  const totalSets = exercise.target_sets;

  // Next drop state — what set/drop/weight to log next
  const nextDropNumber = loggedSetsForExercise.length; // 0 = opening set, 1 = first drop, etc.
  const nextWeight = exercise.target_weight - nextDropNumber * DROP_DECREMENT;
  const remainingReps = exercise.target_reps - totalLoggedReps;

  function handleOpenSetPress() {
    if (allDone) return;
    if (isDropSet) {
      // Always opens the next drop in sequence
      setActiveSetNumber(1);
      setActiveDropNumber(nextDropNumber);
      setActiveWeight(Math.max(nextWeight, DROP_DECREMENT));
      setRepModalOpen(true);
    } else {
      // Standard: find which set to open
      const nextStandardSet =
        loggedSetsForExercise.filter((s) => s.drop_number === 0).length + 1;
      if (nextStandardSet <= exercise.target_sets) {
        setActiveSetNumber(nextStandardSet);
        setActiveDropNumber(0);
        setActiveWeight(exercise.target_weight);
        setRepModalOpen(true);
      }
    }
  }

  function handleSetPress(setNumber: number) {
    if (isDropSet) return; // drop sets use handleOpenSetPress
    const alreadyLogged = loggedSetsForExercise.find(
      (s) => s.set_number === setNumber && s.drop_number === 0,
    );
    if (alreadyLogged) return;
    setActiveSetNumber(setNumber);
    setActiveDropNumber(0);
    setActiveWeight(exercise.target_weight);
    setRepModalOpen(true);
  }

  function handleRepConfirm(reps: number) {
    if (activeSetNumber !== null) {
      onLogSet(activeSetNumber, activeDropNumber, activeWeight, reps);
    }
    setRepModalOpen(false);
    setActiveSetNumber(null);
  }

  // Label for each drop row shown in the UI
  function dropLabel(dropNumber: number): string {
    if (dropNumber === 0) return "SET 1";
    return `DROP ${dropNumber}`;
  }

  return (
    <View
      style={{
        borderBottomWidth: 0.5,
        borderBottomColor: Colors.line,
        backgroundColor: isOpen ? Colors.card : "transparent",
      }}
    >
      {/* header — always visible */}
      <Pressable
        onPress={onToggle}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          padding: 16,
          backgroundColor: rangeExceeded ? "#1F5C3A" : "transparent",
        }}
      >
        {/* index circle */}
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 999,
            backgroundColor: allDone ? Colors.accent : "transparent",
            borderWidth: allDone ? 0 : 1,
            borderColor: Colors.line2,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontFamily: "Courier",
              fontSize: 10,
              color: allDone ? Colors.accentInk : Colors.sec,
              fontWeight: "700",
            }}
          >
            {allDone ? "✓" : exercise.order_index + 1}
          </Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 16,
              fontWeight: "600",
              color: Colors.text,
              letterSpacing: -0.2,
            }}
          >
            {exercise.exercise_name}
          </Text>
          <Text
            style={{
              fontFamily: "Courier",
              fontSize: 11,
              color: Colors.ter,
              marginTop: 2,
            }}
          >
            {isDropSet
              ? `Drop set · ${exercise.target_reps} reps @ ${exercise.target_weight} kg${allDone ? "" : `  ·  ${totalLoggedReps}/${exercise.target_reps} reps`}`
              : `${exercise.target_sets} × ${exercise.target_reps} @ ${weightUnit(exercise.target_weight, exercise)}${completedSets > 0 && !allDone ? `  ·  ${completedSets}/${totalSets} done` : ""}`}
            {rangeExceeded ? "  ·  ↑ weight next session" : ""}
          </Text>
        </View>

        <Text style={{ color: Colors.sec, fontSize: 16 }}>
          {isOpen ? "∧" : "›"}
        </Text>
      </Pressable>

      {/* expanded content */}
      {isOpen && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          {isDropSet ? (
            // ── Drop set layout ──────────────────────────────────────────────
            <View>
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
                    fontSize: 9,
                    color: Colors.sec,
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                  }}
                >
                  Drop Set
                </Text>
                <Text
                  style={{
                    fontFamily: "Courier",
                    fontSize: 9,
                    color: allDone ? Colors.accent : Colors.warn,
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                  }}
                >
                  {totalLoggedReps} / {exercise.target_reps} reps
                </Text>
              </View>

              {/* logged drops so far */}
              <View style={{ gap: 6 }}>
                {loggedSetsForExercise.map((logged, i) => (
                  <View
                    key={i}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      borderWidth: 0.5,
                      borderColor: Colors.line,
                      borderRadius: 10,
                      padding: 10,
                    }}
                  >
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        backgroundColor: Colors.accent,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: Colors.accentInk,
                          fontSize: 12,
                          fontWeight: "700",
                        }}
                      >
                        ✓
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontFamily: "Courier",
                        fontSize: 11,
                        color: Colors.ter,
                        width: 52,
                      }}
                    >
                      {dropLabel(logged.drop_number)}
                    </Text>
                    <Text
                      style={{
                        fontFamily: "Courier",
                        fontSize: 18,
                        fontWeight: "700",
                        color: Colors.text,
                      }}
                    >
                      {logged.weight}
                    </Text>
                    <Text style={{ fontSize: 11, color: Colors.ter }}>kg</Text>
                    <View
                      style={{
                        marginLeft: "auto",
                        flexDirection: "row",
                        alignItems: "flex-end",
                        gap: 4,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Courier",
                          fontSize: 18,
                          fontWeight: "700",
                          color: Colors.text,
                        }}
                      >
                        {logged.reps}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: Colors.ter,
                          marginBottom: 2,
                        }}
                      >
                        reps
                      </Text>
                    </View>
                  </View>
                ))}

                {/* next drop row — shown when reps remain and weight > 0 */}
                {!allDone && (
                  <Pressable
                    onPress={handleOpenSetPress}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      backgroundColor: Colors.card2,
                      borderWidth: 1,
                      borderColor: Colors.accent,
                      borderRadius: 10,
                      padding: 10,
                    }}
                  >
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: Colors.line2,
                      }}
                    />
                    <Text
                      style={{
                        fontFamily: "Courier",
                        fontSize: 11,
                        color: Colors.ter,
                        width: 52,
                      }}
                    >
                      {dropLabel(nextDropNumber)}
                    </Text>
                    <Text
                      style={{
                        fontFamily: "Courier",
                        fontSize: 18,
                        fontWeight: "700",
                        color: Colors.accent,
                      }}
                    >
                      {Math.max(nextWeight, DROP_DECREMENT).toFixed(1)}
                    </Text>
                    <Text style={{ fontSize: 11, color: Colors.ter }}>kg</Text>
                    <View
                      style={{
                        marginLeft: "auto",
                        flexDirection: "row",
                        alignItems: "flex-end",
                        gap: 4,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Courier",
                          fontSize: 18,
                          fontWeight: "700",
                          color: Colors.ter,
                        }}
                      >
                        {remainingReps}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: Colors.ter,
                          marginBottom: 2,
                        }}
                      >
                        rem
                      </Text>
                    </View>
                  </Pressable>
                )}
              </View>
            </View>
          ) : (
            // ── Standard set layout ──────────────────────────────────────────
            <View>
              <Text
                style={{
                  fontFamily: "Courier",
                  fontSize: 9,
                  color: Colors.sec,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Working Sets
              </Text>
              <View style={{ gap: 6 }}>
                {Array.from({ length: totalSets }).map((_, i) => {
                  const setNumber = i + 1;
                  const logged = loggedSetsForExercise.find(
                    (s) => s.set_number === setNumber && s.drop_number === 0,
                  );
                  const isDone = !!logged;
                  const isNext =
                    !isDone &&
                    loggedSetsForExercise.filter((s) => s.drop_number === 0)
                      .length === i;

                  return (
                    <Pressable
                      key={i}
                      onPress={() => handleSetPress(setNumber)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        backgroundColor: isNext ? Colors.card2 : "transparent",
                        borderWidth: isNext ? 1 : 0.5,
                        borderColor: isNext ? Colors.accent : Colors.line,
                        borderRadius: 10,
                        padding: 10,
                      }}
                    >
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          backgroundColor: isDone
                            ? Colors.accent
                            : "transparent",
                          borderWidth: isDone ? 0 : 1,
                          borderColor: Colors.line2,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {isDone && (
                          <Text
                            style={{
                              color: Colors.accentInk,
                              fontSize: 12,
                              fontWeight: "700",
                            }}
                          >
                            ✓
                          </Text>
                        )}
                      </View>

                      <Text
                        style={{
                          fontFamily: "Courier",
                          fontSize: 11,
                          color: Colors.ter,
                          width: 40,
                        }}
                      >
                        SET {setNumber}
                      </Text>

                      <Text
                        style={{
                          fontFamily: "Courier",
                          fontSize: 18,
                          fontWeight: "700",
                          color: isNext ? Colors.accent : Colors.text,
                        }}
                      >
                        {exercise.target_weight}
                      </Text>
                      <Text style={{ fontSize: 11, color: Colors.ter }}>
                        {exercise.metric === "time"
                          ? "sec"
                          : exercise.metric === "reps"
                            ? "reps"
                            : isDumbbell
                              ? "kg ea"
                              : "kg"}
                      </Text>

                      <View
                        style={{
                          marginLeft: "auto",
                          flexDirection: "row",
                          alignItems: "flex-end",
                          gap: 4,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: "Courier",
                            fontSize: 18,
                            fontWeight: "700",
                            color: isDone ? Colors.text : Colors.qua,
                          }}
                        >
                          {isDone ? logged!.reps : "—"}
                        </Text>
                        <Text
                          style={{
                            fontSize: 11,
                            color: Colors.ter,
                            marginBottom: 2,
                          }}
                        >
                          reps
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* note section */}
          {showNote ? (
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Add a note for this exercise..."
              placeholderTextColor={Colors.qua}
              multiline
              style={{
                marginTop: 10,
                backgroundColor: Colors.card2,
                borderRadius: 8,
                padding: 10,
                fontSize: 13,
                color: Colors.text,
                borderLeftWidth: 2,
                borderLeftColor: Colors.accent,
                minHeight: 60,
              }}
            />
          ) : (
            <Pressable
              onPress={() => setShowNote(true)}
              style={{
                marginTop: 10,
                borderWidth: 0.5,
                borderColor: Colors.line2,
                borderStyle: "dashed",
                borderRadius: 8,
                padding: 8,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 12, color: Colors.sec }}>
                + Add note
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {/* rep entry modal */}
      <RepEntryModal
        visible={repModalOpen}
        targetReps={isDropSet ? remainingReps : exercise.target_reps}
        weight={activeWeight}
        exerciseName={exercise.exercise_name}
        musclesPrimary={exercise.muscles_primary}
        metric={exercise.metric}
        onConfirm={handleRepConfirm}
        onClose={() => {
          setRepModalOpen(false);
          setActiveSetNumber(null);
        }}
      />
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ActiveSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = parseInt(id || "0");

  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openExerciseId, setOpenExerciseId] = useState<number | null>(null);
  const [loggedSets, setLoggedSets] = useState<LoggedSet[]>([]);
  const [sessionNote, setSessionNote] = useState("");
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    loadSession();
  }, [sessionId]);

  async function loadSession() {
    setLoading(true);
    try {
      const data = await getSession(sessionId);
      setSession(data);
      setLoggedSets(data.logged_sets || []);
      if (data.planned_exercises?.length > 0) {
        setOpenExerciseId(data.planned_exercises[0].id);
      }
    } catch (err: any) {
      setError("Failed to load session");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogSet(
    exercise: PlannedExercise,
    setNumber: number,
    dropNumber: number,
    weight: number,
    reps: number,
  ) {
    try {
      await logSet(sessionId, {
        exercise_name: exercise.exercise_name,
        set_number: setNumber,
        drop_number: dropNumber,
        weight,
        reps,
      });

      const newEntry: LoggedSet = {
        exercise_name: exercise.exercise_name,
        set_number: setNumber,
        drop_number: dropNumber,
        weight,
        reps,
      };

      setLoggedSets((prev) => [
        ...prev.filter(
          (s) =>
            !(
              s.exercise_name === exercise.exercise_name &&
              s.set_number === setNumber &&
              s.drop_number === dropNumber
            ),
        ),
        newEntry,
      ]);

      // Auto-advance to next exercise when done
      // For drop sets: done when total reps hit target or next weight <= 0
      // For standard sets: done when all sets logged
      const exerciseLogs = [
        ...loggedSets.filter((s) => s.exercise_name === exercise.exercise_name),
        newEntry,
      ];

      let exerciseDone = false;
      if (exercise.set_style === "drop") {
        const totalReps = exerciseLogs.reduce((sum, s) => sum + s.reps, 0);
        const lastWeight = weight;
        exerciseDone =
          totalReps >= exercise.target_reps || lastWeight - 2.2 <= 0;
      } else {
        exerciseDone =
          exerciseLogs.filter((s) => s.drop_number === 0).length >=
          exercise.target_sets;
      }

      if (exerciseDone && session) {
        const exercises = session.planned_exercises;
        const currentIndex = exercises.findIndex((e) => e.id === exercise.id);
        if (currentIndex < exercises.length - 1) {
          setOpenExerciseId(exercises[currentIndex + 1].id);
        }
      }
    } catch (err) {
      console.error("Failed to log set:", err);
    }
  }

  async function handleComplete() {
    setCompleting(true);
    try {
      await completeSession(sessionId, sessionNote || undefined);
      router.back();
    } catch (err) {
      setCompleting(false);
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

  if (error || !session) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: Colors.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: Colors.warn, fontSize: 14 }}>
          {error || "Session not found"}
        </Text>
      </View>
    );
  }

  const exercises = session.planned_exercises || [];
  const totalSets = exercises.reduce((sum, ex) => sum + ex.target_sets, 0);
  const completedSets = loggedSets.length;
  const sessionLabel =
    session.session_type === "compound"
      ? `Compound · Session ${session.occurrence}`
      : "Isolation";
  const gymLabel = session.gym || "Gym";

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      {/* sticky header */}
      <View
        style={{
          paddingTop: 60,
          paddingHorizontal: 20,
          paddingBottom: 14,
          borderBottomWidth: 0.5,
          borderBottomColor: Colors.line,
        }}
      >
        {/* gym + back row */}
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text
            style={{
              fontFamily: "Courier",
              fontSize: 11,
              color: Colors.ter,
              letterSpacing: 0.6,
              textTransform: "uppercase",
            }}
          >
            {gymLabel}
          </Text>
          <Pressable
            onPress={() => router.back()}
            style={{ marginLeft: "auto" }}
          >
            <Text
              style={{ fontFamily: "Courier", fontSize: 11, color: Colors.sec }}
            >
              ✕ Exit
            </Text>
          </Pressable>
        </View>

        {/* session title */}
        <Text
          style={{
            fontSize: 26,
            fontWeight: "700",
            color: Colors.text,
            letterSpacing: -0.5,
            marginTop: 8,
          }}
        >
          {sessionLabel}
        </Text>

        {/* progress bar */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            marginTop: 6,
          }}
        >
          <Text
            style={{ fontFamily: "Courier", fontSize: 11, color: Colors.sec }}
          >
            {completedSets} / {totalSets} sets
          </Text>
          <View
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              backgroundColor: Colors.line2,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width:
                  totalSets > 0
                    ? `${(completedSets / totalSets) * 100}%`
                    : "0%",
                height: "100%",
                backgroundColor: Colors.accent,
              }}
            />
          </View>
        </View>
      </View>

      {/* exercise list */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {exercises.map((ex) => (
          <ExerciseBlock
            key={ex.id}
            exercise={ex}
            isOpen={openExerciseId === ex.id}
            onToggle={() =>
              setOpenExerciseId((prev) => (prev === ex.id ? null : ex.id))
            }
            loggedSetsForExercise={loggedSets.filter(
              (s) => s.exercise_name === ex.exercise_name,
            )}
            onLogSet={(setNumber, dropNumber, weight, reps) =>
              handleLogSet(ex, setNumber, dropNumber, weight, reps)
            }
            sessionId={sessionId}
          />
        ))}

        {/* session note */}
        <View style={{ margin: 16 }}>
          <View
            style={{
              backgroundColor: Colors.card,
              borderRadius: 16,
              padding: 14,
              borderWidth: 0.5,
              borderColor: Colors.line,
            }}
          >
            <Text
              style={{
                fontFamily: "Courier",
                fontSize: 10,
                color: Colors.ter,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Session Note
            </Text>
            <TextInput
              value={sessionNote}
              onChangeText={setSessionNote}
              placeholder="Add a note about today's session…"
              placeholderTextColor={Colors.qua}
              multiline
              style={{
                fontSize: 13,
                color: Colors.text,
                lineHeight: 20,
                borderLeftWidth: 2,
                borderLeftColor: Colors.line2,
                paddingLeft: 10,
                minHeight: 40,
              }}
            />
          </View>
        </View>

        {/* complete button */}
        <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
          <Pressable
            onPress={handleComplete}
            disabled={completing}
            style={{
              backgroundColor: Colors.accent,
              borderRadius: 14,
              padding: 16,
              alignItems: "center",
              opacity: completing ? 0.7 : 1,
            }}
          >
            {completing ? (
              <ActivityIndicator color={Colors.accentInk} />
            ) : (
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  color: Colors.accentInk,
                  letterSpacing: -0.2,
                }}
              >
                Complete Session
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
