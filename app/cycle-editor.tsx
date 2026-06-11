// app/cycle-editor.tsx
// Cycle editor screen — shown at three entry points:
//   1. End of onboarding (mode=onboarding)
//   2. After a star rating change (mode=redefine)
//   3. No active cycle detected on login (mode=recovery)
//
// The AI proposes a cycle, the user can adjust it (reorder, remove, add phases),
// then confirms. On confirm the cycle is saved and block generation fires.

import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Colors } from "../constants/theme";
import {
  proposeCycle,
  saveCycle,
  generateBlock,
  replanSessions,
} from "../services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PhaseRow {
  phase: string;
  reason: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<string, string> = {
  anatomical_adaptation: "Anatomical Adaptation",
  hypertrophy: "Hypertrophy",
  maximum_strength: "Maximum Strength",
  muscle_definition: "Muscle Definition",
};

const PHASE_DESCS: Record<string, string> = {
  anatomical_adaptation: "3 × 20 reps · Joint & tendon conditioning",
  hypertrophy: "4 × 10 reps · 75% 1RM · Muscle growth",
  maximum_strength: "5 × 5 reps · 85% 1RM · Neural strength",
  muscle_definition: "1 × 40 reps · Drop sets · Metabolic endurance",
};

const PHASE_KEYS = [
  "anatomical_adaptation",
  "hypertrophy",
  "maximum_strength",
  "muscle_definition",
];

const DURATION_OPTIONS = [4, 6, 8];

// ─── Phase card ───────────────────────────────────────────────────────────────

function PhaseCard({
  phase,
  reason,
  index,
  total,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  phase: string;
  reason: string;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  return (
    <View
      style={{
        backgroundColor: Colors.card,
        borderRadius: 14,
        borderWidth: 0.5,
        borderColor: Colors.line,
        marginBottom: 10,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 14,
          gap: 12,
        }}
      >
        {/* Order number */}
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            backgroundColor: Colors.accentDim,
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Text
            style={{
              fontFamily: "Courier",
              fontSize: 12,
              fontWeight: "700",
              color: Colors.accent,
            }}
          >
            {index + 1}
          </Text>
        </View>

        {/* Phase info */}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: Colors.text }}>
            {PHASE_LABELS[phase] || phase}
          </Text>
          <Text
            style={{
              fontFamily: "Courier",
              fontSize: 10,
              color: Colors.ter,
              marginTop: 2,
            }}
          >
            {PHASE_DESCS[phase]}
          </Text>
        </View>

        {/* Controls */}
        <View style={{ flexDirection: "row", gap: 4 }}>
          <Pressable
            onPress={onMoveUp}
            disabled={index === 0}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              backgroundColor: Colors.card2,
              alignItems: "center",
              justifyContent: "center",
              opacity: index === 0 ? 0.3 : 1,
            }}
          >
            <Text style={{ fontSize: 14, color: Colors.sec }}>↑</Text>
          </Pressable>
          <Pressable
            onPress={onMoveDown}
            disabled={index === total - 1}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              backgroundColor: Colors.card2,
              alignItems: "center",
              justifyContent: "center",
              opacity: index === total - 1 ? 0.3 : 1,
            }}
          >
            <Text style={{ fontSize: 14, color: Colors.sec }}>↓</Text>
          </Pressable>
          <Pressable
            onPress={onRemove}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              backgroundColor: "rgba(224,85,85,0.12)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 16, color: "#E05555" }}>−</Text>
          </Pressable>
        </View>
      </View>

      {/* AI reasoning */}
      {reason ? (
        <View
          style={{
            paddingHorizontal: 14,
            paddingBottom: 12,
            paddingTop: 0,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              color: Colors.sec,
              fontStyle: "italic",
              lineHeight: 17,
            }}
          >
            {reason}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CycleEditorScreen() {
  const { mode } = useLocalSearchParams<{
    mode?: "onboarding" | "redefine" | "recovery";
  }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [phases, setPhases] = useState<PhaseRow[]>([]);
  const [durationWeeks, setDurationWeeks] = useState(6);

  useEffect(() => {
    loadProposal();
  }, []);

  async function loadProposal() {
    setLoading(true);
    setError("");
    try {
      const proposal = await proposeCycle();
      setPhases(proposal.phases || []);
      setDurationWeeks(proposal.duration_weeks || 6);
    } catch (err: any) {
      setError("Failed to load proposal. You can build the cycle manually.");
      // Provide a sensible default so the user can still proceed
      setPhases([
        {
          phase: "anatomical_adaptation",
          reason: "Default starting phase",
        },
        { phase: "hypertrophy", reason: "Muscle growth phase" },
        { phase: "maximum_strength", reason: "Strength phase" },
        { phase: "muscle_definition", reason: "Definition phase" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleMoveUp(index: number) {
    if (index === 0) return;
    const next = [...phases];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setPhases(next);
  }

  function handleMoveDown(index: number) {
    if (index === phases.length - 1) return;
    const next = [...phases];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setPhases(next);
  }

  function handleRemove(index: number) {
    setPhases((prev) => prev.filter((_, i) => i !== index));
  }

  function handleAddPhase(phase: string) {
    setPhases((prev) => [...prev, { phase, reason: "" }]);
  }

  async function handleConfirm() {
    if (phases.length === 0) {
      setError("Add at least one phase before confirming.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      // Save the cycle — this also resets users.current_phase, current_block,
      // and phase_week to the start of the new cycle
      await saveCycle({
        phases: phases.map((p) => ({ phase: p.phase })),
        duration_weeks: durationWeeks,
      });

      // If this is a redefine (star rating change), clean up old planned sessions
      // before generating the new block
      if (mode === "redefine") {
        await replanSessions();
      }

      // Trigger block generation for the first phase
      await generateBlock();

      // Navigate to the appropriate destination
      if (mode === "onboarding") {
        router.replace("/(tabs)");
      } else {
        // redefine or recovery — go to dashboard
        router.replace("/(tabs)");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
      setSaving(false);
    }
  }

  const modeTitle: Record<string, string> = {
    onboarding: "Your training cycle",
    redefine: "New training cycle",
    recovery: "Set up your cycle",
  };

  const modeSubtitle: Record<string, string> = {
    onboarding:
      "Here's a cycle based on your goals. Adjust it or confirm to get started.",
    redefine:
      "Your goals have changed. Here's an updated cycle — adjust it before confirming.",
    recovery: "No active cycle found. Set up your phases to continue training.",
  };

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
            fontSize: 11,
            color: Colors.sec,
            letterSpacing: 0.5,
          }}
        >
          Building your cycle...
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          paddingTop: 60,
          paddingBottom: 120,
        }}
      >
        {/* Header */}
        <Text
          style={{
            fontFamily: "Courier",
            fontSize: 11,
            color: Colors.ter,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            marginBottom: 4,
          }}
        >
          {mode === "onboarding"
            ? "Onboarding"
            : mode === "redefine"
              ? "Updated goals"
              : "Setup"}
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
          {modeTitle[mode || "recovery"]}
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: Colors.sec,
            lineHeight: 20,
            marginBottom: 24,
          }}
        >
          {modeSubtitle[mode || "recovery"]}
        </Text>

        {error ? (
          <Text
            style={{
              fontSize: 13,
              color: Colors.warn,
              marginBottom: 16,
              lineHeight: 18,
            }}
          >
            {error}
          </Text>
        ) : null}

        {/* Duration picker */}
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
          Weeks per phase
        </Text>
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            marginBottom: 24,
          }}
        >
          {DURATION_OPTIONS.map((d) => (
            <Pressable
              key={d}
              onPress={() => setDurationWeeks(d)}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 10,
                alignItems: "center",
                backgroundColor:
                  durationWeeks === d ? Colors.accentDim : Colors.card,
                borderWidth: durationWeeks === d ? 1 : 0.5,
                borderColor: durationWeeks === d ? Colors.accent : Colors.line,
              }}
            >
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "700",
                  fontFamily: "Courier",
                  color: durationWeeks === d ? Colors.accent : Colors.sec,
                }}
              >
                {d}
              </Text>
              <Text
                style={{
                  fontFamily: "Courier",
                  fontSize: 9,
                  color: durationWeeks === d ? Colors.accent : Colors.ter,
                  marginTop: 2,
                  letterSpacing: 0.4,
                }}
              >
                {d === 4 ? "2+2 blocks" : d === 6 ? "3+3 blocks" : "4+4 blocks"}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Phase list */}
        <Text
          style={{
            fontFamily: "Courier",
            fontSize: 10,
            color: Colors.ter,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          Phase sequence — {phases.length} phase{phases.length !== 1 ? "s" : ""}
        </Text>

        {phases.length === 0 ? (
          <View
            style={{
              backgroundColor: Colors.card,
              borderRadius: 14,
              padding: 20,
              alignItems: "center",
              marginBottom: 16,
              borderWidth: 0.5,
              borderColor: Colors.line,
            }}
          >
            <Text style={{ fontSize: 13, color: Colors.ter }}>
              No phases added. Use the buttons below to build your cycle.
            </Text>
          </View>
        ) : (
          phases.map((p, i) => (
            <PhaseCard
              key={`${p.phase}-${i}`}
              phase={p.phase}
              reason={p.reason}
              index={i}
              total={phases.length}
              onMoveUp={() => handleMoveUp(i)}
              onMoveDown={() => handleMoveDown(i)}
              onRemove={() => handleRemove(i)}
            />
          ))
        )}

        {/* Add phase buttons */}
        <Text
          style={{
            fontFamily: "Courier",
            fontSize: 10,
            color: Colors.ter,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            marginTop: 8,
            marginBottom: 10,
          }}
        >
          Add a phase
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {PHASE_KEYS.map((phase) => (
            <Pressable
              key={phase}
              onPress={() => handleAddPhase(phase)}
              style={{
                backgroundColor: Colors.card,
                borderRadius: 10,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderWidth: 0.5,
                borderColor: Colors.line,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  color: Colors.accent,
                  lineHeight: 18,
                }}
              >
                +
              </Text>
              <Text style={{ fontSize: 13, color: Colors.sec }}>
                {PHASE_LABELS[phase]}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* Fixed confirm bar */}
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: Colors.bg,
          padding: 16,
          paddingBottom: 32,
          borderTopWidth: 0.5,
          borderTopColor: Colors.line,
          gap: 10,
        }}
      >
        <Pressable
          onPress={handleConfirm}
          disabled={saving || phases.length === 0}
          style={{
            backgroundColor: phases.length === 0 ? Colors.card2 : Colors.accent,
            borderRadius: 14,
            padding: 16,
            alignItems: "center",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? (
            <ActivityIndicator color={Colors.accentInk} />
          ) : (
            <Text
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: phases.length === 0 ? Colors.ter : Colors.accentInk,
              }}
            >
              Confirm cycle
            </Text>
          )}
        </Pressable>

        {mode === "recovery" ? null : (
          <Pressable
            onPress={() => router.back()}
            style={{ alignItems: "center", paddingTop: 4 }}
            disabled={saving}
          >
            <Text style={{ fontSize: 13, color: Colors.ter }}>Back</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
