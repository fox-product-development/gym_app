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
  const [weeklySessions, setWeeklySessions] = useState(3);
  const [goalDescription, setGoalDescription] = useState("");

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
      if (profile.goal_description)
        setGoalDescription(profile.goal_description);
    } catch (err) {
      console.error("Failed to prefill profile:", err);
    } finally {
      setPrefilling(false);
    }
  }

  const suggestedSessions: Record<string, number> = {
    new: 3,
    amateur: 3,
    serious: 4,
    professional: 5,
  };

  function handleLevelSelect(level: string) {
    setTrainingLevel(level);
    setWeeklySessions(suggestedSessions[level]);
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

  const labelStyle = {
    fontFamily: "Courier",
    fontSize: 10,
    color: Colors.ter,
    letterSpacing: 0.8,
    textTransform: "uppercase" as const,
    marginBottom: 8,
  };

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
              Weekly sessions
            </Text>
            <Text style={{ fontSize: 14, color: Colors.sec, marginTop: 4 }}>
              How many sessions per week?
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
              Optional — helps the agent plan better for you
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

      {/* Step 3 — Weekly sessions */}
      {step === 3 && (
        <View
          style={{ paddingHorizontal: 24, marginTop: 32, alignItems: "center" }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 24 }}>
            <Pressable
              onPress={() => setWeeklySessions((s) => Math.max(1, s - 1))}
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: Colors.card2,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 22, color: Colors.accent }}>−</Text>
            </Pressable>
            <Text
              style={{
                fontSize: 48,
                fontWeight: "700",
                color: Colors.text,
                fontFamily: "Courier",
                minWidth: 60,
                textAlign: "center",
              }}
            >
              {weeklySessions}
            </Text>
            <Pressable
              onPress={() => setWeeklySessions((s) => Math.min(14, s + 1))}
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: Colors.card2,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 22, color: Colors.accent }}>+</Text>
            </Pressable>
          </View>
          <Text
            style={{
              fontFamily: "Courier",
              fontSize: 11,
              color: Colors.ter,
              marginTop: 12,
              letterSpacing: 0.4,
            }}
          >
            Suggested for {trainingLevel} level
          </Text>
        </View>
      )}

      {/* Step 4 — Free text */}
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
