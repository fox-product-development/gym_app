// app/session.tsx
// Active Session screen — loads real session data and handles set logging.

import { useState, useEffect, useRef } from "react";
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
import {
  getSession,
  logSet,
  updateLoggedSet,
  updateSessionNote,
  completeSession,
} from "../services/api";

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
  set_style: "standard" | "drop";
  metric: string | null;
  equipment_unit: string | null;
  equipment_increment: number | null;
  group_id: number | null;
}

interface LoggedSet {
  id: number;
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
  gym_name: string;
  status: string;
  notes: string | null;
  is_1rm_test: boolean;
  rest_interval: string | null;
  tempo: string | null;
  planned_exercises: PlannedExercise[];
  logged_sets: LoggedSet[];
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

// ─── Phase format banner text ──────────────────────────────────────────────────
// Placeholder copy only — update with real per-phase session formats later.
// Keyed by session_type prefix since this screen doesn't receive phase
// directly, only session_type.

function getPhaseFormatText(sessionType: string): string | null {
  if (sessionType.startsWith("mixed")) {
    return "Mixed format — strength and hypertrophy days alternate.";
  }
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isDumbbellExercise(exerciseName: string): boolean {
  return exerciseName.toLowerCase().includes("dumbbell");
}

function weightUnit(weight: number, exercise: PlannedExercise): string {
  if (exercise.metric === "time") return `${exercise.target_reps} secs`;
  if (exercise.metric === "reps") return `${exercise.target_reps} reps`;
  const unit = exercise.equipment_unit ?? "kg";
  if (isDumbbellExercise(exercise.exercise_name))
    return `${weight} ${unit} per dumbbell`;
  return `${weight} ${unit}`;
}

// ─── Numpad (shared by rep entry and 1RM test entry) ──────────────────────────

function Numpad({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

  function handleKey(key: string) {
    if (key === "⌫") onChange(value.slice(0, -1));
    else if (key === "") return;
    else onChange(value.length < 3 ? value + key : value);
  }

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
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
  );
}

// ─── 1RM test block ───────────────────────────────────────────────────────────
// Single weight + reps entry for a 1RM test session. Logged as set_number 1,
// drop_number 0 — the same shape recalculateFromOneRmTest reads as the test
// value. One deliberate attempt, no multi-attempt loop.

function OneRmTestBlock({
  exercise,
  alreadyLogged,
  onLog,
}: {
  exercise: PlannedExercise;
  alreadyLogged: LoggedSet | undefined;
  onLog: (weight: number, reps: number) => void;
}) {
  const [weightInput, setWeightInput] = useState("");
  const [repInput, setRepInput] = useState("");
  const [activeField, setActiveField] = useState<"weight" | "reps">("weight");

  const unit = exercise.equipment_unit ?? "kg";
  const weightSuffix = isDumbbellExercise(exercise.exercise_name)
    ? `${unit} per dumbbell`
    : unit;

  const weightValid = parseFloat(weightInput) > 0;
  const repsValid = parseInt(repInput) > 0;
  const canLog = weightValid && repsValid;
  const activeValue = activeField === "weight" ? weightInput : repInput;

  function handleNumpad(val: string) {
    if (activeField === "weight") setWeightInput(val);
    else setRepInput(val);
  }

  function handleLog() {
    if (!canLog) return;
    onLog(parseFloat(weightInput), parseInt(repInput));
    setWeightInput("");
    setRepInput("");
    setActiveField("weight");
  }

  if (alreadyLogged) {
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: Colors.card2,
          borderRadius: 10,
          padding: 10,
          gap: 10,
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
            style={{ color: Colors.accentInk, fontSize: 12, fontWeight: "700" }}
          >
            ✓
          </Text>
        </View>
        <Text
          style={{ fontFamily: "Courier", fontSize: 13, color: Colors.text }}
        >
          {alreadyLogged.weight} {weightSuffix} × {alreadyLogged.reps} reps
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <View
        style={{
          backgroundColor: Colors.card2,
          borderRadius: 10,
          padding: 12,
          borderLeftWidth: 2,
          borderLeftColor: Colors.accent,
        }}
      >
        <Text style={{ fontSize: 13, color: Colors.sec, lineHeight: 19 }}>
          Pick a weight you're confident you can lift at least 4 times but not
          more than 8 times.
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={() => setActiveField("weight")}
          style={{
            flex: 1,
            backgroundColor:
              activeField === "weight" ? Colors.card2 : "transparent",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: activeField === "weight" ? Colors.accent : Colors.line,
            padding: 14,
            alignItems: "center",
            gap: 4,
          }}
        >
          <Text
            style={{
              fontFamily: "Courier",
              fontSize: 9,
              color: Colors.ter,
              letterSpacing: 0.6,
              textTransform: "uppercase",
            }}
          >
            Weight ({weightSuffix})
          </Text>
          <Text
            style={{
              fontFamily: "Courier",
              fontSize: 22,
              fontWeight: "700",
              color: weightInput ? Colors.text : Colors.ter,
            }}
          >
            {weightInput || "—"}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveField("reps")}
          style={{
            flex: 1,
            backgroundColor:
              activeField === "reps" ? Colors.card2 : "transparent",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: activeField === "reps" ? Colors.accent : Colors.line,
            padding: 14,
            alignItems: "center",
            gap: 4,
          }}
        >
          <Text
            style={{
              fontFamily: "Courier",
              fontSize: 9,
              color: Colors.ter,
              letterSpacing: 0.6,
              textTransform: "uppercase",
            }}
          >
            Reps
          </Text>
          <Text
            style={{
              fontFamily: "Courier",
              fontSize: 22,
              fontWeight: "700",
              color: repInput ? Colors.text : Colors.ter,
            }}
          >
            {repInput || "—"}
          </Text>
        </Pressable>
      </View>

      <Numpad value={activeValue} onChange={handleNumpad} />

      <Pressable
        onPress={handleLog}
        disabled={!canLog}
        style={{
          backgroundColor: canLog ? Colors.accent : Colors.card2,
          borderRadius: 12,
          padding: 14,
          alignItems: "center",
          opacity: canLog ? 1 : 0.5,
        }}
      >
        <Text
          style={{
            fontSize: 15,
            fontWeight: "700",
            color: canLog ? Colors.accentInk : Colors.ter,
          }}
        >
          Log Test
        </Text>
      </Pressable>
    </View>
  );
}

// ─── Rep entry modal ──────────────────────────────────────────────────────────
// Supports two modes: "log" (the original behaviour — enter reps for a new
// set, pre-filled with the target rep count) and "edit" (reselecting an
// already-logged set — pre-filled with the existing rep count, and the
// copy/button reflect that this corrects an existing entry rather than
// creating a new one).

function RepEntryModal({
  visible,
  mode = "log",
  targetReps,
  currentReps,
  weight,
  exerciseName,
  metric,
  equipmentUnit,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  mode?: "log" | "edit";
  targetReps: number;
  currentReps?: number;
  weight: number;
  exerciseName: string;
  metric: string | null;
  equipmentUnit: string | null;
  onConfirm: (reps: number) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const [isFresh, setIsFresh] = useState(true);

  useEffect(() => {
    if (visible) {
      setValue(
        mode === "edit" && currentReps !== undefined
          ? String(currentReps)
          : String(targetReps),
      );
      setIsFresh(true);
    }
  }, [visible, targetReps, currentReps, mode]);

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
  const unit = equipmentUnit ?? "kg";

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
          ? `${weight} ${unit} per dumbbell`
          : `${weight} ${unit}`;

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
            {mode === "edit" ? "Change rep count" : "Reps completed"}
          </Text>
          <Text
            style={{
              fontFamily: "Courier",
              fontSize: 11,
              color: Colors.sec,
              marginBottom: 16,
            }}
          >
            {mode === "edit"
              ? `Change rep count from ${currentReps} to ${value || "—"}`
              : `Target: ${targetReps} reps @ ${weightLabel}`}
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
              {mode === "edit" ? "Update Set" : "Log Set"}
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
  isOneRmTest,
  restInterval,
  tempo,
  onLogSet,
  onUpdateSet,
}: {
  exercise: PlannedExercise;
  isOpen: boolean;
  onToggle: () => void;
  loggedSetsForExercise: LoggedSet[];
  isOneRmTest: boolean;
  restInterval: string | null;
  tempo: string | null;
  onLogSet: (
    setNumber: number,
    dropNumber: number,
    weight: number,
    reps: number,
  ) => void;
  onUpdateSet: (setId: number, reps: number) => void;
}) {
  const [repModalOpen, setRepModalOpen] = useState(false);
  const [activeSetNumber, setActiveSetNumber] = useState<number | null>(null);
  const [activeDropNumber, setActiveDropNumber] = useState<number>(0);
  const [activeWeight, setActiveWeight] = useState<number>(
    exercise.target_weight,
  );
  // Set when reselecting an already-logged standard set to correct its rep
  // count. Drop sets never populate this — editing is not supported for
  // drop sets (no drop-set UI is pressable once logged, see below).
  const [editingSet, setEditingSet] = useState<LoggedSet | null>(null);

  const isDropSet = exercise.set_style === "drop";
  const isDumbbell = isDumbbellExercise(exercise.exercise_name);
  const unit = exercise.equipment_unit ?? "kg";
  const dropDecrement = exercise.equipment_increment
    ? parseFloat(String(exercise.equipment_increment))
    : 2.2;

  const oneRmLogged = loggedSetsForExercise[0];

  const totalLoggedReps = loggedSetsForExercise.reduce(
    (sum, s) => sum + s.reps,
    0,
  );

  const allDone = isOneRmTest
    ? !!oneRmLogged
    : isDropSet
      ? totalLoggedReps >= exercise.target_reps ||
        (loggedSetsForExercise.length > 0 &&
          loggedSetsForExercise[loggedSetsForExercise.length - 1].weight -
            dropDecrement <=
            0)
      : loggedSetsForExercise.filter((s) => s.drop_number === 0).length >=
        exercise.target_sets;

  const completedSets = isDropSet
    ? loggedSetsForExercise.filter((s) => s.drop_number === 0).length
    : loggedSetsForExercise.length;
  const totalSets = exercise.target_sets;

  const nextDropNumber = loggedSetsForExercise.length;
  const nextWeight = exercise.target_weight - nextDropNumber * dropDecrement;
  const remainingReps = exercise.target_reps - totalLoggedReps;

  function handleOpenSetPress() {
    if (allDone) return;
    if (isDropSet) {
      setActiveSetNumber(1);
      setActiveDropNumber(nextDropNumber);
      setActiveWeight(Math.max(nextWeight, dropDecrement));
      setRepModalOpen(true);
    } else {
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
    if (isDropSet) return;
    const alreadyLogged = loggedSetsForExercise.find(
      (s) => s.set_number === setNumber && s.drop_number === 0,
    );
    if (alreadyLogged) {
      // Reselecting a completed set corrects its rep count rather than
      // logging a new one.
      setEditingSet(alreadyLogged);
      setActiveSetNumber(setNumber);
      setActiveDropNumber(0);
      setActiveWeight(alreadyLogged.weight);
      setRepModalOpen(true);
      return;
    }
    setActiveSetNumber(setNumber);
    setActiveDropNumber(0);
    setActiveWeight(exercise.target_weight);
    setRepModalOpen(true);
  }

  function handleRepConfirm(reps: number) {
    if (editingSet) {
      onUpdateSet(editingSet.id, reps);
    } else if (activeSetNumber !== null) {
      onLogSet(activeSetNumber, activeDropNumber, activeWeight, reps);
    }
    setRepModalOpen(false);
    setActiveSetNumber(null);
    setEditingSet(null);
  }

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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
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
            {exercise.group_id !== null && (
              <View
                style={{
                  backgroundColor: Colors.card2,
                  borderRadius: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderWidth: 0.5,
                  borderColor: Colors.accent,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Courier",
                    fontSize: 11,
                    fontWeight: "700",
                    color: Colors.accent,
                    letterSpacing: 0.4,
                  }}
                >
                  GROUP {exercise.group_id}
                </Text>
              </View>
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
            {isOneRmTest
              ? "1RM Test · single attempt"
              : isDropSet
                ? `Drop set · ${exercise.target_reps} reps @ ${exercise.target_weight} ${unit}  -  Rest interval: ${restInterval} and Tempo ${tempo}${allDone ? "" : `  ·  ${totalLoggedReps}/${exercise.target_reps} reps`}`
                : `${exercise.target_sets} × ${exercise.target_reps} @ ${weightUnit(exercise.target_weight, exercise)}  -  Rest interval: ${restInterval} and Tempo ${tempo}${completedSets > 0 && !allDone ? `  ·  ${completedSets}/${totalSets} done` : ""}`}
          </Text>
        </View>

        <Text style={{ color: Colors.sec, fontSize: 16 }}>
          {isOpen ? "∧" : "›"}
        </Text>
      </Pressable>

      {/* expanded content */}
      {isOpen && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          {isOneRmTest ? (
            <OneRmTestBlock
              exercise={exercise}
              alreadyLogged={oneRmLogged}
              onLog={(weight, reps) => onLogSet(1, 0, weight, reps)}
            />
          ) : isDropSet ? (
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
                    <Text style={{ fontSize: 11, color: Colors.ter }}>
                      {unit}
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
                      {Math.max(nextWeight, dropDecrement).toFixed(1)}
                    </Text>
                    <Text style={{ fontSize: 11, color: Colors.ter }}>
                      {unit}
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
                              ? `${unit} ea`
                              : unit}
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
        </View>
      )}

      {/* rep entry modal — not used for 1RM test exercises */}
      {!isOneRmTest && (
        <RepEntryModal
          visible={repModalOpen}
          mode={editingSet ? "edit" : "log"}
          targetReps={isDropSet ? remainingReps : exercise.target_reps}
          currentReps={editingSet?.reps}
          weight={activeWeight}
          exerciseName={exercise.exercise_name}
          metric={exercise.metric}
          equipmentUnit={exercise.equipment_unit}
          onConfirm={handleRepConfirm}
          onClose={() => {
            setRepModalOpen(false);
            setActiveSetNumber(null);
            setEditingSet(null);
          }}
        />
      )}
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
  // Holds the pending 5-second auto-save timer for the notes box. A ref
  // (not state) because we only ever need to read/clear it imperatively —
  // storing it in state would trigger unnecessary re-renders on every
  // keystroke.
  const noteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadSession();
  }, [sessionId]);

  // Clears any pending auto-save if the screen is left before it fires, so
  // we never call the API after the component has unmounted.
  useEffect(() => {
    return () => {
      if (noteTimerRef.current) clearTimeout(noteTimerRef.current);
    };
  }, []);

  async function saveSessionNote(text: string) {
    try {
      await updateSessionNote(sessionId, text);
    } catch (err) {
      console.error("Failed to save session note:", err);
    }
  }

  // Called on every keystroke. Resets the 5-second timer each time, so the
  // save only fires 5 seconds after typing stops.
  function handleNoteChange(text: string) {
    setSessionNote(text);
    if (noteTimerRef.current) clearTimeout(noteTimerRef.current);
    noteTimerRef.current = setTimeout(() => {
      saveSessionNote(text);
      noteTimerRef.current = null;
    }, 5000);
  }

  // Called when the notes box loses focus. Cancels any pending 5-second
  // timer and saves immediately instead, so tapping away always saves
  // right away rather than waiting out the debounce.
  function handleNoteBlur() {
    if (noteTimerRef.current) {
      clearTimeout(noteTimerRef.current);
      noteTimerRef.current = null;
    }
    saveSessionNote(sessionNote);
  }

  async function loadSession() {
    setLoading(true);
    try {
      const data = await getSession(sessionId);
      setSession(data);
      setLoggedSets(data.logged_sets || []);
      setSessionNote(data.notes || "");
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
      const created = await logSet(sessionId, {
        exercise_name: exercise.exercise_name,
        set_number: setNumber,
        drop_number: dropNumber,
        weight,
        reps,
      });

      const newEntry: LoggedSet = {
        id: created.id,
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

      const exerciseLogs = [
        ...loggedSets.filter((s) => s.exercise_name === exercise.exercise_name),
        newEntry,
      ];

      let exerciseDone = false;
      if (session?.is_1rm_test) {
        exerciseDone = true;
      } else if (exercise.set_style === "drop") {
        const totalReps = exerciseLogs.reduce((sum, s) => sum + s.reps, 0);
        const lastWeight = weight;
        const decrement = exercise.equipment_increment
          ? parseFloat(String(exercise.equipment_increment))
          : 2.2;
        exerciseDone =
          totalReps >= exercise.target_reps || lastWeight - decrement <= 0;
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

  // Corrects the rep count on an already-logged set. Only reps change —
  // weight, set_number, and drop_number stay as originally logged.
  async function handleUpdateSet(setId: number, reps: number) {
    try {
      const updated = await updateLoggedSet(sessionId, setId, reps);
      setLoggedSets((prev) =>
        prev.map((s) => (s.id === setId ? { ...s, reps: updated.reps } : s)),
      );
    } catch (err) {
      console.error("Failed to update set:", err);
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
  const totalSets = session.is_1rm_test
    ? exercises.length
    : exercises.reduce((sum, ex) => sum + ex.target_sets, 0);
  const completedSets = loggedSets.length;
  const sessionLabel = getSessionTypeLabel(session.session_type);
  const gymLabel = session.gym_name || "Gym";
  const formatText = getPhaseFormatText(session.session_type);

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
          {session.is_1rm_test ? " · 1RM Test" : ""}
        </Text>

        {/* format banner — placeholder copy, shown only where text exists */}
        {formatText && (
          <Text
            style={{
              fontFamily: "Courier",
              fontSize: 11,
              color: Colors.ter,
              marginTop: 4,
            }}
          >
            {formatText}
          </Text>
        )}

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
            {completedSets} / {totalSets}{" "}
            {session.is_1rm_test ? "tests" : "sets"}
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
            isOneRmTest={session.is_1rm_test}
            restInterval={session.rest_interval}
            tempo={session.tempo}
            onLogSet={(setNumber, dropNumber, weight, reps) =>
              handleLogSet(ex, setNumber, dropNumber, weight, reps)
            }
            onUpdateSet={(setId, reps) => handleUpdateSet(setId, reps)}
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
              onChangeText={handleNoteChange}
              onBlur={handleNoteBlur}
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
