// app/onboarding.tsx
// Onboarding flow — shown once after registration, or when redefining goals from settings.
// Mode: "onboarding" (default) navigates to tabs on finish.
// Mode: "redefine" navigates back to settings on finish.

import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Colors } from "../constants/theme";
import { updateProfile, getProfile } from "../services/api";

const TOTAL_STEPS = 4;

// ─── Star rating component ────────────────────────────────────────────────────

function StarRating({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable key={i} onPress={() => onChange(i)}>
          <Text
            style={{
              fontSize: 28,
              color: i <= value ? Colors.accent : "rgba(255,255,255,0.12)",
            }}
          >
            ★
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── Stepper component ────────────────────────────────────────────────────────

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text
        style={{
          fontFamily: "Courier",
          fontSize: 10,
          color: Colors.ter,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          marginBottom: 12,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <Pressable
          onPress={() => onChange(Math.max(min, value - 1))}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: Colors.card2,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 20, color: Colors.accent }}>−</Text>
        </Pressable>
        <Text
          style={{
            fontSize: 36,
            fontWeight: "700",
            color: Colors.text,
            fontFamily: "Courier",
            minWidth: 40,
            textAlign: "center",
          }}
        >
          {value}
        </Text>
        <Pressable
          onPress={() => onChange(Math.min(max, value + 1))}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: Colors.card2,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 20, color: Colors.accent }}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: number }) {
  return (
    <View style={{ paddingHorizontal: 24, marginTop: 12 }}>
      <View
        style={{
          height: 3,
          backgroundColor: "rgba(255,255,255,0.08)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            height: "100%",
            width: `${(step / TOTAL_STEPS) * 100}%`,
            backgroundColor: Colors.accent,
            borderRadius: 2,
          }}
        />
      </View>
      <Text
        style={{
          fontFamily: "Courier",
          fontSize: 10,
          color: Colors.ter,
          textAlign: "center",
          marginTop: 6,
          letterSpacing: 0.5,
        }}
      >
        Step {step} of {TOTAL_STEPS}
      </Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isRedefine = mode === "redefine";

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [prefilling, setPrefilling] = useState(isRedefine);
  const [error, setError] = useState("");

  const [goalSize, setGoalSize] = useState(3);
  const [goalStrength, setGoalStrength] = useState(3);
  const [goalDefinition, setGoalDefinition] = useState(3);
  const [goalFitness, setGoalFitness] = useState(3);
  const [trainingLevel, setTrainingLevel] = useState("serious");
  const [weeklySessions, setWeeklySessions] = useState(4);
  const [weightExercises, setWeightExercises] = useState(7);
  const [conditioningExercises, setConditioningExercises] = useState(3);
  const [goalDescription, setGoalDescription] = useState("");

  // Default suggestions by training level
  const suggestedSessions: Record<string, number> = {
    new: 3,
    amateur: 3,
    serious: 4,
    professional: 5,
  };

  const suggestedWeightExercises: Record<string, number> = {
    new: 5,
    amateur: 6,
    serious: 7,
    professional: 8,
  };

  const suggestedConditioningExercises: Record<string, number> = {
    new: 3,
    amateur: 3,
    serious: 3,
    professional: 3,
  };

  // Prefill existing values when in redefine mode
  useEffect(() => {
    if (isRedefine) {
      loadExistingProfile();
    }
  }, []);

  async function loadExistingProfile() {
    try {
      const profile = await getProfile();
      if (profile.goal_size) setGoalSize(profile.goal_size);
      if (profile.goal_strength) setGoalStrength(profile.goal_strength);
      if (profile.goal_definition) setGoalDefinition(profile.goal_definition);
      if (profile.goal_fitness) setGoalFitness(profile.goal_fitness);
      if (profile.training_level) setTrainingLevel(profile.training_level);
      if (profile.weekly_sessions) setWeeklySessions(profile.weekly_sessions);
      if (profile.weight_exercises_per_session)
        setWeightExercises(profile.weight_exercises_per_session);
      if (profile.conditioning_exercises_per_session)
        setConditioningExercises(profile.conditioning_exercises_per_session);
      if (profile.goal_description)
        setGoalDescription(profile.goal_description);
    } catch (err) {
      console.error("Failed to prefill profile:", err);
    } finally {
      setPrefilling(false);
    }
  }

  function handleLevelSelect(level: string) {
    setTrainingLevel(level);
    setWeeklySessions(suggestedSessions[level]);
    setWeightExercises(suggestedWeightExercises[level]);
    setConditioningExercises(suggestedConditioningExercises[level]);
  }

  async function handleFinish() {
    setLoading(true);
    setError("");
    try {
      await updateProfile({
        goal_size: goalSize,
        goal_strength: goalStrength,
        goal_definition: goalDefinition,
        goal_fitness: goalFitness,
        training_level: trainingLevel,
        weekly_sessions: weeklySessions,
        weight_exercises_per_session: weightExercises,
        conditioning_exercises_per_session: conditioningExercises,
        goal_description: goalDescription || undefined,
      });
      if (isRedefine) {
        router.back();
      } else {
        router.replace("/(tabs)");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setLoading(false);
    }
  }

  const levels = [
    { key: "new", label: "New", desc: "Just getting started" },
    { key: "amateur", label: "Amateur", desc: "Training regularly" },
    { key: "serious", label: "Serious", desc: "Structured training" },
    { key: "professional", label: "Professional", desc: "Competing / coached" },
  ];

  if (prefilling) {
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
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      contentContainerStyle={{ paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={{ paddingHorizontal: 24, paddingTop: 64 }}>
        {isRedefine && (
          <Pressable onPress={() => router.back()} style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 16, color: Colors.accent }}>‹ Back</Text>
          </Pressable>
        )}
        {step === 1 && (
          <>
            <Text
              style={{
                fontSize: 24,
                fontWeight: "700",
                color: Colors.text,
                letterSpacing: -0.4,
              }}
            >
              {isRedefine ? "Update your goals" : "Your goals"}
            </Text>
            <Text style={{ fontSize: 14, color: Colors.sec, marginTop: 4 }}>
              Rate how important each goal is to you
            </Text>
          </>
        )}
        {step === 2 && (
          <>
            <Text
              style={{
                fontSize: 24,
                fontWeight: "700",
                color: Colors.text,
                letterSpacing: -0.4,
              }}
            >
              Training level
            </Text>
            <Text style={{ fontSize: 14, color: Colors.sec, marginTop: 4 }}>
              How would you describe yourself?
            </Text>
          </>
        )}
        {step === 3 && (
          <>
            <Text
              style={{
                fontSize: 24,
                fontWeight: "700",
                color: Colors.text,
                letterSpacing: -0.4,
              }}
            >
              Session structure
            </Text>
            <Text style={{ fontSize: 14, color: Colors.sec, marginTop: 4 }}>
              How many sessions and exercises per week?
            </Text>
          </>
        )}
        {step === 4 && (
          <>
            <Text
              style={{
                fontSize: 24,
                fontWeight: "700",
                color: Colors.text,
                letterSpacing: -0.4,
              }}
            >
              Anything else?
            </Text>
            <Text style={{ fontSize: 14, color: Colors.sec, marginTop: 4 }}>
              Optional notes to guide your programme
            </Text>
          </>
        )}
      </View>

      <ProgressBar step={step} />

      {/* Step 1 — Goals */}
      {step === 1 && (
        <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
          <View
            style={{
              backgroundColor: Colors.card,
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {[
              { label: "Size", value: goalSize, onChange: setGoalSize },
              {
                label: "Strength",
                value: goalStrength,
                onChange: setGoalStrength,
              },
              {
                label: "Definition",
                value: goalDefinition,
                onChange: setGoalDefinition,
              },
              {
                label: "General fitness",
                value: goalFitness,
                onChange: setGoalFitness,
              },
            ].map((goal, i, arr) => (
              <View
                key={goal.label}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 14,
                  borderBottomWidth: i < arr.length - 1 ? 0.5 : 0,
                  borderBottomColor: Colors.line,
                }}
              >
                <Text style={{ flex: 1, fontSize: 15, color: Colors.text }}>
                  {goal.label}
                </Text>
                <StarRating value={goal.value} onChange={goal.onChange} />
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Step 2 — Training level */}
      {step === 2 && (
        <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {levels.map((level) => (
              <Pressable
                key={level.key}
                onPress={() => handleLevelSelect(level.key)}
                style={{
                  width: "47%",
                  backgroundColor: Colors.card,
                  borderRadius: 12,
                  padding: 14,
                  borderWidth: 1.5,
                  borderColor:
                    trainingLevel === level.key ? Colors.accent : "transparent",
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "600",
                    color: Colors.text,
                  }}
                >
                  {level.label}
                </Text>
                <Text
                  style={{
                    fontFamily: "Courier",
                    fontSize: 11,
                    color: Colors.ter,
                    marginTop: 4,
                  }}
                >
                  {level.desc}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Step 3 — Session structure */}
      {step === 3 && (
        <View style={{ paddingHorizontal: 24, marginTop: 32 }}>
          {/* Sessions per week */}
          <View style={{ alignItems: "center", marginBottom: 32 }}>
            <Stepper
              label="Sessions per week"
              value={weeklySessions}
              min={1}
              max={14}
              onChange={setWeeklySessions}
            />
          </View>

          {/* Weight and conditioning side by side */}
          <View style={{ flexDirection: "row", gap: 16 }}>
            <Stepper
              label="Weight exercises"
              value={weightExercises}
              min={3}
              max={10}
              onChange={setWeightExercises}
            />
            <Stepper
              label="Conditioning"
              value={conditioningExercises}
              min={0}
              max={8}
              onChange={setConditioningExercises}
            />
          </View>

          <Text
            style={{
              fontFamily: "Courier",
              fontSize: 11,
              color: Colors.ter,
              marginTop: 20,
              textAlign: "center",
              letterSpacing: 0.4,
            }}
          >
            {weightExercises + conditioningExercises} exercises per session ·
            suggested for {trainingLevel} level
          </Text>
        </View>
      )}

      {/* Step 4 — Free text (was step 4, now step 4 of 5) */}
      {step === 4 && (
        <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
          <TextInput
            value={goalDescription}
            onChangeText={setGoalDescription}
            multiline
            numberOfLines={5}
            placeholder="e.g. preference for upper body, avoid heavy squats due to knee injury…"
            placeholderTextColor={Colors.ter}
            style={{
              backgroundColor: Colors.card,
              borderRadius: 12,
              padding: 14,
              fontSize: 15,
              color: Colors.text,
              borderWidth: 0.5,
              borderColor: Colors.line,
              minHeight: 120,
              textAlignVertical: "top",
            }}
          />
          {error ? (
            <Text
              style={{
                fontSize: 13,
                color: Colors.warn,
                textAlign: "center",
                marginTop: 12,
              }}
            >
              {error}
            </Text>
          ) : null}
        </View>
      )}

      {/* Navigation buttons */}
      <View style={{ paddingHorizontal: 24, marginTop: 32, gap: 10 }}>
        {step < TOTAL_STEPS ? (
          <Pressable
            onPress={() => setStep((s) => s + 1)}
            style={{
              backgroundColor: Colors.accent,
              borderRadius: 12,
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
              Continue
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={handleFinish}
            disabled={loading}
            style={{
              backgroundColor: Colors.accent,
              borderRadius: 12,
              padding: 16,
              alignItems: "center",
              opacity: loading ? 0.7 : 1,
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
                {isRedefine ? "Save changes" : "Finish setup"}
              </Text>
            )}
          </Pressable>
        )}

        {step === TOTAL_STEPS && !isRedefine && (
          <Pressable
            onPress={() => router.replace("/(tabs)")}
            style={{ alignItems: "center", paddingTop: 4 }}
          >
            <Text style={{ fontSize: 13, color: Colors.ter }}>
              Skip for now
            </Text>
          </Pressable>
        )}

        {step > 1 && (
          <Pressable
            onPress={() => setStep((s) => s - 1)}
            style={{ alignItems: "center", paddingTop: 4 }}
          >
            <Text style={{ fontSize: 13, color: Colors.ter }}>Back</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}
