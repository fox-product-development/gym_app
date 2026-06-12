// app/calibration.tsx
// Calibration session screen — guides new users through a set of exercises
// to establish baseline strength. Results are used to populate 1RM estimates
// for the full exercise library before the first training block is generated.

import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { router } from "expo-router";
import { Colors } from "../constants/theme";
import {
  getGyms,
  getCalibrationExercises,
  completeCalibration,
} from "../services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalibrationExercise {
  exercise_id: number;
  exercise_name: string;
  muscles_primary: string;
  muscles_secondary: string | null;
  sub_component: string | null;
  equipment_name: string | null;
  equipment_unit: string;
}

interface CalibrationResult {
  exercise_name: string;
  muscles_primary: string;
  weight: number;
  reps: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isDumbbellExercise(name: string): boolean {
  return name.toLowerCase().includes("dumbbell");
}

function epley1RM(weight: number, reps: number): number {
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

// ─── Rep entry numpad ─────────────────────────────────────────────────────────

function Numpad({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

  function handleKey(key: string) {
    if (key === "⌫") {
      onChange(value.slice(0, -1));
    } else if (key === "") {
      return;
    } else {
      onChange(value.length < 3 ? value + key : value);
    }
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

// ─── Exercise card ────────────────────────────────────────────────────────────

function ExerciseCard({
  exercise,
  attemptNumber,
  attempts,
  onLogReps,
}: {
  exercise: CalibrationExercise;
  attemptNumber: number;
  attempts: { weight: number; reps: number }[];
  onLogReps: (weight: number, reps: number) => void;
}) {
  const [weightInput, setWeightInput] = useState("");
  const [repInput, setRepInput] = useState("");
  const [activeField, setActiveField] = useState<"weight" | "reps">("weight");

  const unit = exercise.equipment_unit || "kg";
  const maxAttempts = 4;
  const canAttemptMore = attempts.length < maxAttempts;
  const lastAttempt = attempts[attempts.length - 1] ?? null;
  const suggestHeavier =
    lastAttempt && lastAttempt.reps >= 10 && canAttemptMore;

  const weightValid = parseFloat(weightInput) > 0;
  const repsValid = parseInt(repInput) > 0;
  const canLog = weightValid && repsValid;

  function handleLog() {
    if (!canLog) return;
    onLogReps(parseFloat(weightInput), parseInt(repInput));
    setWeightInput("");
    setRepInput("");
    setActiveField("weight");
  }

  const activeValue = activeField === "weight" ? weightInput : repInput;

  function handleNumpad(val: string) {
    if (activeField === "weight") setWeightInput(val);
    else setRepInput(val);
  }

  const weightSuffix = isDumbbellExercise(exercise.exercise_name)
    ? `${unit} per dumbbell`
    : unit;

  return (
    <View
      style={{
        backgroundColor: Colors.card,
        borderRadius: 16,
        borderWidth: 0.5,
        borderColor: Colors.line,
        overflow: "hidden",
      }}
    >
      {/* Exercise header */}
      <View style={{ padding: 16, gap: 4 }}>
        <Text
          style={{
            fontFamily: "Courier",
            fontSize: 10,
            color: Colors.accent,
            letterSpacing: 0.6,
            textTransform: "uppercase",
          }}
        >
          {exercise.muscles_primary}
          {exercise.muscles_secondary ? ` · ${exercise.muscles_secondary}` : ""}
        </Text>
        <Text
          style={{
            fontSize: 20,
            fontWeight: "700",
            color: Colors.text,
            letterSpacing: -0.3,
          }}
        >
          {exercise.exercise_name}
        </Text>
        {exercise.sub_component ? (
          <Text
            style={{ fontSize: 12, color: Colors.ter, fontFamily: "Courier" }}
          >
            {exercise.sub_component}
          </Text>
        ) : null}
        {exercise.equipment_name ? (
          <Text
            style={{
              fontSize: 12,
              color: Colors.ter,
              fontFamily: "Courier",
              marginTop: 2,
            }}
          >
            {exercise.equipment_name}
          </Text>
        ) : null}
      </View>

      {/* Instructions */}
      <View
        style={{
          marginHorizontal: 16,
          marginBottom: 16,
          backgroundColor: Colors.card2,
          borderRadius: 10,
          padding: 12,
          borderLeftWidth: 2,
          borderLeftColor: Colors.accent,
        }}
      >
        <Text style={{ fontSize: 13, color: Colors.sec, lineHeight: 19 }}>
          Pick a weight you can manage for around 8–10 reps. If you complete 10
          reps comfortably, you'll be prompted to go heavier. Stop when the
          weight feels genuinely challenging.
        </Text>
      </View>

      {/* Previous attempts */}
      {attempts.length > 0 && (
        <View style={{ marginHorizontal: 16, marginBottom: 12, gap: 6 }}>
          {attempts.map((a, i) => {
            const orm = epley1RM(a.weight, a.reps);
            return (
              <View
                key={i}
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
                    backgroundColor: Colors.accentDim,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      color: Colors.accent,
                      fontSize: 11,
                      fontWeight: "700",
                    }}
                  >
                    ✓
                  </Text>
                </View>
                <Text
                  style={{
                    fontFamily: "Courier",
                    fontSize: 13,
                    color: Colors.text,
                    flex: 1,
                  }}
                >
                  {a.weight} {weightSuffix} × {a.reps} reps
                </Text>
                <Text
                  style={{
                    fontFamily: "Courier",
                    fontSize: 11,
                    color: Colors.ter,
                  }}
                >
                  ~{orm} 1RM
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Prompt to go heavier */}
      {suggestHeavier && (
        <View
          style={{
            marginHorizontal: 16,
            marginBottom: 12,
            backgroundColor: "rgba(255,119,99,0.08)",
            borderRadius: 10,
            padding: 12,
            borderWidth: 0.5,
            borderColor: Colors.accent,
          }}
        >
          <Text
            style={{ fontSize: 13, color: Colors.accent, fontWeight: "600" }}
          >
            Great effort — try a heavier weight for a better estimate.
          </Text>
        </View>
      )}

      {/* Weight and rep entry */}
      {canAttemptMore && (
        <View style={{ padding: 16, paddingTop: 0, gap: 12 }}>
          {/* Field selectors */}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={() => setActiveField("weight")}
              style={{
                flex: 1,
                backgroundColor:
                  activeField === "weight" ? Colors.card2 : "transparent",
                borderRadius: 12,
                borderWidth: 1,
                borderColor:
                  activeField === "weight" ? Colors.accent : Colors.line,
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
                borderColor:
                  activeField === "reps" ? Colors.accent : Colors.line,
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

          {/* Shared numpad */}
          <Numpad value={activeValue} onChange={handleNumpad} />

          {/* Log button */}
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
              Log attempt {attemptNumber}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CalibrationScreen() {
  const [exercises, setExercises] = useState<CalibrationExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [attempts, setAttempts] = useState<
    Record<number, { weight: number; reps: number }[]>
  >({});
  const [results, setResults] = useState<CalibrationResult[]>([]);
  const [completing, setCompleting] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    loadExercises();
  }, []);

  async function loadExercises() {
    setLoading(true);
    setError("");
    try {
      const gyms = await getGyms();
      const defaultGym = Array.isArray(gyms)
        ? gyms.find((g: any) => g.is_default)
        : null;
      if (!defaultGym) {
        setError("No default gym found. Please set up your gym first.");
        return;
      }
      const data = await getCalibrationExercises(defaultGym.id);
      setExercises(data.exercises || []);
    } catch (err: any) {
      setError(err.message || "Failed to load calibration exercises");
    } finally {
      setLoading(false);
    }
  }

  function handleLogReps(exerciseIndex: number, weight: number, reps: number) {
    const exercise = exercises[exerciseIndex];
    const exerciseAttempts = attempts[exerciseIndex] || [];
    const newAttempts = [...exerciseAttempts, { weight, reps }];

    setAttempts((prev) => ({ ...prev, [exerciseIndex]: newAttempts }));

    const isDone = reps < 10 || newAttempts.length >= 4;

    if (isDone) {
      // Pick the attempt with the highest estimated 1RM
      const best = newAttempts.reduce((best, a) =>
        epley1RM(a.weight, a.reps) > epley1RM(best.weight, best.reps)
          ? a
          : best,
      );

      setResults((prev) => [
        ...prev.filter((r) => r.exercise_name !== exercise.exercise_name),
        {
          exercise_name: exercise.exercise_name,
          muscles_primary: exercise.muscles_primary,
          weight: best.weight,
          reps: best.reps,
        },
      ]);

      if (exerciseIndex < exercises.length - 1) {
        setCurrentIndex(exerciseIndex + 1);
      } else {
        setShowSummary(true);
      }
    }
  }

  function handleDoneWithExercise() {
    const exerciseAttempts = attempts[currentIndex] || [];
    const exercise = exercises[currentIndex];

    if (exerciseAttempts.length > 0) {
      const best = exerciseAttempts.reduce((best, a) =>
        epley1RM(a.weight, a.reps) > epley1RM(best.weight, best.reps)
          ? a
          : best,
      );
      setResults((prev) => [
        ...prev.filter((r) => r.exercise_name !== exercise.exercise_name),
        {
          exercise_name: exercise.exercise_name,
          muscles_primary: exercise.muscles_primary,
          weight: best.weight,
          reps: best.reps,
        },
      ]);
    }

    if (currentIndex < exercises.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setShowSummary(true);
    }
  }

  async function handleComplete() {
    if (results.length === 0) return;
    setCompleting(true);
    try {
      await completeCalibration({ results });
      router.replace("/(tabs)");
    } catch (err: any) {
      setCompleting(false);
      setError(err.message || "Failed to save calibration results");
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: Colors.bg,
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <ActivityIndicator color={Colors.accent} size="large" />
        <Text
          style={{
            fontFamily: "Courier",
            fontSize: 12,
            color: Colors.sec,
            letterSpacing: 0.4,
          }}
        >
          Selecting calibration exercises...
        </Text>
      </View>
    );
  }

  if (error && exercises.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: Colors.bg,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          gap: 16,
        }}
      >
        <Text style={{ fontSize: 14, color: Colors.warn, textAlign: "center" }}>
          {error}
        </Text>
        <Pressable
          onPress={() => router.replace("/(tabs)")}
          style={{
            backgroundColor: Colors.card2,
            borderRadius: 12,
            padding: 14,
            paddingHorizontal: 24,
          }}
        >
          <Text style={{ fontSize: 14, color: Colors.sec }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  // ── Summary screen ───────────────────────────────────────────────────────

  if (showSummary) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg }}>
        <ScrollView
          contentContainerStyle={{
            padding: 24,
            paddingTop: 64,
            paddingBottom: 40,
          }}
        >
          <Text
            style={{
              fontFamily: "Courier",
              fontSize: 10,
              color: Colors.accent,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Calibration complete
          </Text>
          <Text
            style={{
              fontSize: 26,
              fontWeight: "700",
              color: Colors.text,
              letterSpacing: -0.5,
              marginBottom: 6,
            }}
          >
            Baseline established
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: Colors.sec,
              lineHeight: 20,
              marginBottom: 24,
            }}
          >
            Here are your estimated 1RM values from today's session. These will
            be used to set starting weights across your full exercise library.
          </Text>

          <View
            style={{
              backgroundColor: Colors.card,
              borderRadius: 16,
              borderWidth: 0.5,
              borderColor: Colors.line,
              overflow: "hidden",
              marginBottom: 24,
            }}
          >
            {results.map((r, i) => {
              const orm = epley1RM(r.weight, r.reps);
              return (
                <View key={r.exercise_name}>
                  {i > 0 && (
                    <View
                      style={{ height: 0.5, backgroundColor: Colors.line }}
                    />
                  )}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      padding: 14,
                      gap: 10,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "600",
                          color: Colors.text,
                        }}
                      >
                        {r.exercise_name}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: Colors.ter,
                          fontFamily: "Courier",
                          marginTop: 2,
                        }}
                      >
                        {r.muscles_primary} · {r.weight}kg × {r.reps} reps
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontFamily: "Courier",
                        fontSize: 16,
                        fontWeight: "700",
                        color: Colors.accent,
                      }}
                    >
                      ~{orm}
                      <Text
                        style={{
                          fontSize: 11,
                          color: Colors.ter,
                          fontWeight: "400",
                        }}
                      >
                        {" "}
                        1RM
                      </Text>
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          <Text
            style={{
              fontSize: 13,
              color: Colors.ter,
              textAlign: "center",
              lineHeight: 19,
              marginBottom: 24,
            }}
          >
            Weights for all other exercises will be estimated conservatively and
            adjusted upward as you train.
          </Text>

          {error ? (
            <Text
              style={{
                fontSize: 13,
                color: Colors.warn,
                textAlign: "center",
                marginBottom: 12,
              }}
            >
              {error}
            </Text>
          ) : null}

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
                }}
              >
                Build My Training Block →
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // ── Main calibration flow ────────────────────────────────────────────────

  const exercise = exercises[currentIndex];
  const exerciseAttempts = attempts[currentIndex] || [];
  const attemptNumber = exerciseAttempts.length + 1;
  const exerciseIsDone = results.some(
    (r) => r.exercise_name === exercise?.exercise_name,
  );

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      {/* Header */}
      <View
        style={{
          paddingTop: 60,
          paddingHorizontal: 20,
          paddingBottom: 16,
          borderBottomWidth: 0.5,
          borderBottomColor: Colors.line,
        }}
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
          Calibration · Exercise {currentIndex + 1} of {exercises.length}
        </Text>
        <Text
          style={{
            fontSize: 22,
            fontWeight: "700",
            color: Colors.text,
            letterSpacing: -0.4,
          }}
        >
          Strength Baseline
        </Text>

        {/* Progress bar */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            marginTop: 10,
          }}
        >
          <View
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              backgroundColor: Colors.line,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${((currentIndex + (exerciseIsDone ? 1 : 0)) / exercises.length) * 100}%`,
                height: "100%",
                backgroundColor: Colors.accent,
              }}
            />
          </View>
          <Text
            style={{ fontFamily: "Courier", fontSize: 11, color: Colors.sec }}
          >
            {results.length}/{exercises.length}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}
      >
        {exercise && (
          <ExerciseCard
            exercise={exercise}
            attemptNumber={attemptNumber}
            attempts={exerciseAttempts}
            onLogReps={(w, r) => handleLogReps(currentIndex, w, r)}
          />
        )}

        {/* Done with this exercise — only shown after at least one attempt */}
        {exerciseAttempts.length > 0 && (
          <Pressable
            onPress={handleDoneWithExercise}
            style={{
              borderWidth: 0.5,
              borderColor: Colors.line,
              borderRadius: 12,
              padding: 14,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 14, color: Colors.sec }}>
              Done with this exercise →
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}
