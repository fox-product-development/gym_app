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
}

interface LoggedSet {
  exercise_name: string;
  set_number: number;
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

// ─── Rep entry modal ──────────────────────────────────────────────────────────

function RepEntryModal({
  visible,
  targetReps,
  weight,
  exerciseName,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  targetReps: number;
  weight: number;
  exerciseName: string;
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

  const weightLabel = isDumbbellExercise(exerciseName)
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
  onLogSet: (setNumber: number, reps: number) => void;
  sessionId: number;
}) {
  const [repModalOpen, setRepModalOpen] = useState(false);
  const [activeSetNumber, setActiveSetNumber] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);

  const totalSets = exercise.target_sets;
  const completedSets = loggedSetsForExercise.length;
  const allDone = completedSets >= totalSets;
  const isDumbbell = isDumbbellExercise(exercise.exercise_name);
  const rangeExceeded = exercise.range_exceeded === true;

  function handleSetPress(setNumber: number) {
    const alreadyLogged = loggedSetsForExercise.find(
      (s) => s.set_number === setNumber,
    );
    if (alreadyLogged) return;
    setActiveSetNumber(setNumber);
    setRepModalOpen(true);
  }

  function handleRepConfirm(reps: number) {
    if (activeSetNumber !== null) {
      onLogSet(activeSetNumber, reps);
    }
    setRepModalOpen(false);
    setActiveSetNumber(null);
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
            {exercise.target_sets} × {exercise.target_reps} @{" "}
            {exercise.target_weight} kg{isDumbbell ? " per dumbbell" : ""}
            {completedSets > 0 && !allDone
              ? `  ·  ${completedSets}/${totalSets} done`
              : ""}
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
          {/* working sets */}
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
                (s) => s.set_number === setNumber,
              );
              const isDone = !!logged;
              const isNext = !isDone && loggedSetsForExercise.length === i;

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
                  {/* checkbox */}
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      backgroundColor: isDone ? Colors.accent : "transparent",
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
                    {isDumbbell ? "kg ea" : "kg"}
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
        targetReps={exercise.target_reps}
        weight={exercise.target_weight}
        exerciseName={exercise.exercise_name}
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
    reps: number,
  ) {
    try {
      await logSet(sessionId, {
        exercise_name: exercise.exercise_name,
        set_number: setNumber,
        weight: exercise.target_weight,
        reps,
      });

      setLoggedSets((prev) => [
        ...prev.filter(
          (s) =>
            !(
              s.exercise_name === exercise.exercise_name &&
              s.set_number === setNumber
            ),
        ),
        {
          exercise_name: exercise.exercise_name,
          set_number: setNumber,
          weight: exercise.target_weight,
          reps,
        },
      ]);

      // Auto-advance to next exercise if all sets done
      const newLogged =
        loggedSets.filter((s) => s.exercise_name === exercise.exercise_name)
          .length + 1;
      if (newLogged >= exercise.target_sets && session) {
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
  const gymLabel = session.gym === "home" ? "🏠 Home Gym" : "🏋️ Work Gym";

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
        contentContainerStyle={{ paddingBottom: 120 }}
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
            onLogSet={(setNumber, reps) => handleLogSet(ex, setNumber, reps)}
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
      </ScrollView>

      {/* sticky complete button */}
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: 20,
          paddingBottom: 36,
          backgroundColor: Colors.bg,
        }}
      >
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
    </View>
  );
}
