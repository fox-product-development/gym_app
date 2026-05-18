// app/session.tsx
// Active Session screen
// Shows the live workout with exercises, warmup sets, working sets,
// notes, and a sticky Complete Session button.

import { View, Text, ScrollView, Pressable } from "react-native";
import { Colors } from "../constants/theme";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WarmupSet {
  weight: string;
  reps: number;
}

interface WorkingSet {
  weight: string | number;
  reps: number | null;
  done: boolean;
  active?: boolean;
}

interface Exercise {
  name: string;
  target: string;
  expanded: boolean;
  warmup?: WarmupSet[];
  working: WorkingSet[];
  note?: string;
}

// ─── Divider ──────────────────────────────────────────────────────────────────

function Divider() {
  return <View style={{ height: 0.5, backgroundColor: Colors.line }} />;
}

// ─── Warmup row ───────────────────────────────────────────────────────────────

function WarmupRow({ set, index }: { set: WarmupSet; index: number }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 6,
      }}
    >
      <Text
        style={{
          width: 18,
          fontFamily: "Courier",
          fontSize: 10,
          color: Colors.ter,
        }}
      >
        W{index + 1}
      </Text>
      {/* dashed line */}
      <View
        style={{
          flex: 1,
          height: 1,
          borderStyle: "dashed",
          borderWidth: 0.5,
          borderColor: Colors.ter,
        }}
      />
      <Text style={{ fontFamily: "Courier", fontSize: 12, color: Colors.ter }}>
        {set.weight} × {set.reps}
      </Text>
    </View>
  );
}

// ─── Working set row ──────────────────────────────────────────────────────────

function WorkingSetRow({ set, index }: { set: WorkingSet; index: number }) {
  const isActive = !!set.active;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: isActive ? Colors.card2 : "transparent",
        borderWidth: isActive ? 1 : 0.5,
        borderColor: isActive ? Colors.accent : Colors.line,
        borderRadius: 10,
        padding: 10,
      }}
    >
      {/* done checkbox */}
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          backgroundColor: set.done ? Colors.accent : "transparent",
          borderWidth: set.done ? 0 : 1,
          borderColor: Colors.line2,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {set.done && (
          <Text
            style={{ color: Colors.accentInk, fontSize: 12, fontWeight: "700" }}
          >
            ✓
          </Text>
        )}
      </View>

      {/* set label */}
      <Text
        style={{
          fontFamily: "Courier",
          fontSize: 11,
          color: Colors.ter,
          width: 36,
        }}
      >
        SET {index + 1}
      </Text>

      {/* weight */}
      <Text
        style={{
          fontFamily: "Courier",
          fontSize: 18,
          fontWeight: "700",
          color: isActive ? Colors.accent : Colors.text,
        }}
      >
        {set.weight}
      </Text>
      <Text style={{ fontSize: 11, color: Colors.ter }}>kg</Text>

      {/* reps */}
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
            color: set.reps == null ? Colors.qua : Colors.text,
          }}
        >
          {set.reps == null ? "—" : set.reps}
        </Text>
        <Text style={{ fontSize: 11, color: Colors.ter, marginBottom: 2 }}>
          reps
        </Text>
      </View>
    </View>
  );
}

// ─── Exercise block ───────────────────────────────────────────────────────────

function ExerciseBlock({
  exercise,
  index,
  total,
}: {
  exercise: Exercise;
  index: number;
  total: number;
}) {
  const isOpen = exercise.expanded;

  return (
    <View
      style={{
        borderBottomWidth: 0.5,
        borderBottomColor: Colors.line,
        backgroundColor: isOpen ? Colors.card : "transparent",
      }}
    >
      {/* collapsed header — always visible */}
      <View
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
            width: 22,
            height: 22,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: Colors.line2,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{ fontFamily: "Courier", fontSize: 10, color: Colors.sec }}
          >
            {index}
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
            {exercise.name}
          </Text>
          <Text
            style={{
              fontFamily: "Courier",
              fontSize: 11,
              color: Colors.ter,
              marginTop: 2,
            }}
          >
            {exercise.target}
          </Text>
        </View>

        {/* chevron */}
        <Text
          style={{
            color: Colors.sec,
            fontSize: 14,
            transform: [{ rotate: isOpen ? "180deg" : "0deg" }],
          }}
        >
          ›
        </Text>
      </View>

      {/* expanded content */}
      {isOpen && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          {/* warmup sets */}
          {exercise.warmup && exercise.warmup.length > 0 && (
            <View style={{ marginBottom: 12 }}>
              <Text
                style={{
                  fontFamily: "Courier",
                  fontSize: 9,
                  color: Colors.ter,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                Warmup · not logged
              </Text>
              {exercise.warmup.map((w, i) => (
                <WarmupRow key={i} set={w} index={i} />
              ))}
            </View>
          )}

          {/* working sets */}
          <Text
            style={{
              fontFamily: "Courier",
              fontSize: 9,
              color: Colors.sec,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Working sets
          </Text>
          <View style={{ gap: 6 }}>
            {exercise.working.map((s, i) => (
              <WorkingSetRow key={i} set={s} index={i} />
            ))}
          </View>

          {/* per-exercise note */}
          {exercise.note && (
            <View
              style={{
                marginTop: 10,
                padding: 10,
                backgroundColor: Colors.card2,
                borderRadius: 8,
                borderLeftWidth: 2,
                borderLeftColor: Colors.accent,
              }}
            >
              <Text
                style={{
                  fontFamily: "Courier",
                  fontSize: 10,
                  color: Colors.ter,
                  letterSpacing: 0.4,
                }}
              >
                NOTE ·{" "}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: Colors.sec,
                  lineHeight: 18,
                  marginTop: 2,
                }}
              >
                {exercise.note}
              </Text>
            </View>
          )}

          {/* add note button */}
          <Pressable
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
            <Text style={{ fontSize: 12, color: Colors.sec }}>+ Add note</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─── Session data ─────────────────────────────────────────────────────────────

const EXERCISES: Exercise[] = [
  {
    name: "Deadlift",
    target: "3 × 5 @ 140 kg",
    expanded: true,
    warmup: [
      { weight: "60 kg", reps: 8 },
      { weight: "100 kg", reps: 5 },
      { weight: "120 kg", reps: 3 },
    ],
    working: [
      { weight: 140, reps: 5, done: true },
      { weight: 140, reps: 5, done: true },
      { weight: 140, reps: null, done: false, active: true },
    ],
    note: "Felt heavy on set 2 — hook grip held up.",
  },
  {
    name: "Pull-up",
    target: "4 × 8 @ BW + 5 kg",
    expanded: false,
    warmup: [{ weight: "BW", reps: 5 }],
    working: [
      { weight: "BW+5", reps: null, done: false },
      { weight: "BW+5", reps: null, done: false },
      { weight: "BW+5", reps: null, done: false },
      { weight: "BW+5", reps: null, done: false },
    ],
  },
  {
    name: "Barbell Row",
    target: "3 × 8 @ 70 kg",
    expanded: false,
    working: [
      { weight: 70, reps: null, done: false },
      { weight: 70, reps: null, done: false },
      { weight: 70, reps: null, done: false },
    ],
  },
  {
    name: "Face Pull",
    target: "3 × 15 @ 20 kg",
    expanded: false,
    working: [
      { weight: 20, reps: null, done: false },
      { weight: 20, reps: null, done: false },
      { weight: 20, reps: null, done: false },
    ],
  },
  {
    name: "Hammer Curl",
    target: "3 × 10 @ 14 kg",
    expanded: false,
    working: [
      { weight: 14, reps: null, done: false },
      { weight: 14, reps: null, done: false },
      { weight: 14, reps: null, done: false },
    ],
  },
];

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ActiveSessionScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      {/* sticky session header */}
      <View
        style={{
          paddingTop: 60,
          paddingHorizontal: 20,
          paddingBottom: 14,
          borderBottomWidth: 0.5,
          borderBottomColor: Colors.line,
        }}
      >
        {/* gym + timer row */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text
            style={{
              fontSize: 11,
              fontFamily: "Courier",
              color: Colors.ter,
              letterSpacing: 0.6,
              textTransform: "uppercase",
            }}
          >
            🏋️ Work Gym
          </Text>
          <View
            style={{
              marginLeft: "auto",
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                backgroundColor: Colors.accent,
              }}
            />
            <Text
              style={{ fontFamily: "Courier", fontSize: 11, color: Colors.sec }}
            >
              24:18
            </Text>
          </View>
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
          Pull Day
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
            4 / 12 sets
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
                width: "33%",
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
        {EXERCISES.map((ex, i) => (
          <ExerciseBlock
            key={i}
            exercise={ex}
            index={i + 1}
            total={EXERCISES.length}
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
              }}
            >
              Session Note
            </Text>
            <Text
              style={{
                marginTop: 8,
                fontSize: 13,
                color: Colors.ter,
                lineHeight: 20,
                borderLeftWidth: 2,
                borderLeftColor: Colors.line2,
                paddingLeft: 10,
              }}
            >
              Add a note about today's session…
            </Text>
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
              letterSpacing: -0.2,
            }}
          >
            Complete Session
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
