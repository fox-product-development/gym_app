// app/(tabs)/progress.tsx
// Exercise Log / History screen — wired to real logged set data.

import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Colors } from "../../constants/theme";
import { getAllOneRepMax, getOneRepMaxHistory } from "../../services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OneRepMax {
  exercise_name: string;
  estimated_1rm: string;
  weight_used: string;
  reps_performed: number;
  logged_at: string;
}

interface OneRepMaxHistory {
  exercise_name: string;
  estimated_1rm: string;
  weight_used: string;
  reps_performed: number;
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

function Card({
  children,
  style,
  pad = 16,
}: {
  children: React.ReactNode;
  style?: object;
  pad?: number;
}) {
  return (
    <View
      style={{
        backgroundColor: Colors.card,
        borderRadius: 16,
        padding: pad,
        borderWidth: 0.5,
        borderColor: Colors.line,
        ...style,
      }}
    >
      {children}
    </View>
  );
}

// ─── Progress chart ───────────────────────────────────────────────────────────

function ProgressChart({
  points,
  color,
  height = 140,
}: {
  points: number[];
  color: string;
  height?: number;
}) {
  if (points.length === 0) {
    return (
      <View
        style={{
          height,
          alignItems: "center",
          justifyContent: "center",
          marginTop: 12,
        }}
      >
        <Text
          style={{ fontFamily: "Courier", fontSize: 10, color: Colors.ter }}
        >
          No data yet
        </Text>
      </View>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  return (
    <View style={{ marginTop: 12 }}>
      <View
        style={{ flexDirection: "row", alignItems: "flex-end", height, gap: 3 }}
      >
        {points.map((p, i) => {
          const barHeight = ((p - min) / range) * (height - 12) + 12;
          const isLast = i === points.length - 1;
          return (
            <View
              key={i}
              style={{
                flex: 1,
                height: barHeight,
                borderRadius: 3,
                backgroundColor: isLast ? color : color + "35",
              }}
            />
          );
        })}
      </View>
      <Text
        style={{
          fontFamily: "Courier",
          fontSize: 9,
          color: Colors.ter,
          letterSpacing: 0.4,
          marginTop: 6,
          textAlign: "right",
        }}
      >
        ESTIMATED 1RM OVER TIME
      </Text>
    </View>
  );
}

// ─── Exercise picker ──────────────────────────────────────────────────────────

function ExercisePicker({
  exercises,
  selected,
  onSelect,
}: {
  exercises: string[];
  selected: string;
  onSelect: (ex: string) => void;
}) {
  if (exercises.length === 0) {
    return (
      <View style={{ marginTop: 12, paddingHorizontal: 20 }}>
        <Text
          style={{ fontFamily: "Courier", fontSize: 10, color: Colors.ter }}
        >
          Log some sets to see exercises here
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginTop: 12 }}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
    >
      {exercises.map((ex) => {
        const isSelected = ex === selected;
        return (
          <Pressable
            key={ex}
            onPress={() => onSelect(ex)}
            style={{
              paddingVertical: 7,
              paddingHorizontal: 14,
              borderRadius: 999,
              backgroundColor: isSelected ? Colors.text : "transparent",
              borderWidth: isSelected ? 0 : 0.5,
              borderColor: Colors.line2,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: isSelected ? "#000" : Colors.sec,
              }}
            >
              {ex}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ─── Stats row ────────────────────────────────────────────────────────────────

function StatsRow({
  latest1RM,
  historyCount,
  bestWeight,
  bestReps,
}: {
  latest1RM: number | null;
  historyCount: number;
  bestWeight: number | null;
  bestReps: number | null;
}) {
  const stats = [
    {
      label: "1RM est.",
      value: latest1RM !== null ? latest1RM.toFixed(1) : "—",
      unit: latest1RM !== null ? "kg" : "",
    },
    {
      label: "Best set",
      value:
        bestWeight !== null && bestReps !== null
          ? `${bestWeight}×${bestReps}`
          : "—",
      unit: "",
    },
    {
      label: "Logged",
      value: String(historyCount),
      unit: "times",
    },
  ];

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 8,
        marginHorizontal: 20,
        marginTop: 10,
      }}
    >
      {stats.map((s) => (
        <View
          key={s.label}
          style={{
            flex: 1,
            backgroundColor: Colors.card,
            borderRadius: 12,
            padding: 12,
            borderWidth: 0.5,
            borderColor: Colors.line,
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
            {s.label}
          </Text>
          <Text
            style={{
              fontSize: 17,
              fontWeight: "700",
              color: Colors.text,
              marginTop: 4,
              letterSpacing: -0.3,
            }}
          >
            {s.value}{" "}
            <Text
              style={{ fontSize: 10, color: Colors.ter, fontWeight: "400" }}
            >
              {s.unit}
            </Text>
          </Text>
        </View>
      ))}
    </View>
  );
}

// ─── History log ──────────────────────────────────────────────────────────────

function HistoryLog({ history }: { history: OneRepMaxHistory[] }) {
  if (history.length === 0) {
    return (
      <View style={{ marginHorizontal: 20, marginTop: 20, marginBottom: 24 }}>
        <Text
          style={{
            fontSize: 13,
            fontWeight: "600",
            color: Colors.sec,
            marginBottom: 10,
          }}
        >
          History
        </Text>
        <Text style={{ fontSize: 13, color: Colors.ter }}>
          No sets logged yet for this exercise.
        </Text>
      </View>
    );
  }

  // Group history entries by date
  const grouped: Record<string, OneRepMaxHistory[]> = {};
  for (const entry of history) {
    const date = new Date(entry.logged_at).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(entry);
  }

  const dates = Object.keys(grouped).reverse();

  // Find the best 1RM to mark as PR
  const best1RM = Math.max(...history.map((h) => parseFloat(h.estimated_1rm)));

  return (
    <View style={{ marginHorizontal: 20, marginTop: 20, marginBottom: 24 }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: Colors.sec,
          marginBottom: 10,
        }}
      >
        History
      </Text>
      {dates.map((date, i) => {
        const entries = grouped[date];
        const dateMax1RM = Math.max(
          ...entries.map((e) => parseFloat(e.estimated_1rm)),
        );
        const isPR = dateMax1RM === best1RM;

        return (
          <View
            key={date}
            style={{
              paddingVertical: 12,
              borderTopWidth: 0.5,
              borderTopColor: Colors.line,
              borderBottomWidth: 0.5,
              borderBottomColor: Colors.line,
              marginTop: i === 0 ? 0 : -0.5,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <Text
                style={{
                  fontFamily: "Courier",
                  fontSize: 11,
                  color: Colors.sec,
                  letterSpacing: 0.4,
                }}
              >
                {date}
              </Text>
              {isPR && (
                <Tag color={Colors.accent} bg={Colors.accentDim}>
                  ★ PR
                </Tag>
              )}
            </View>

            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              {entries.map((entry, j) => (
                <View
                  key={j}
                  style={{
                    backgroundColor: Colors.card,
                    borderRadius: 6,
                    paddingVertical: 4,
                    paddingHorizontal: 8,
                    borderWidth: 0.5,
                    borderColor: Colors.line,
                  }}
                >
                  <Text style={{ fontFamily: "Courier", fontSize: 12 }}>
                    <Text style={{ color: Colors.text, fontWeight: "600" }}>
                      {entry.weight_used} kg
                    </Text>
                    <Text style={{ color: Colors.ter }}> × </Text>
                    <Text style={{ color: Colors.text, fontWeight: "600" }}>
                      {entry.reps_performed}
                    </Text>
                    <Text style={{ color: Colors.ter }}> · 1RM </Text>
                    <Text style={{ color: Colors.accent, fontWeight: "600" }}>
                      {parseFloat(entry.estimated_1rm).toFixed(1)}
                    </Text>
                  </Text>
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ProgressScreen() {
  const [allExercises, setAllExercises] = useState<OneRepMax[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<string>("");
  const [history, setHistory] = useState<OneRepMaxHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadExercises();
    }, []),
  );

  async function loadExercises() {
    setLoading(true);
    try {
      const data = await getAllOneRepMax();
      setAllExercises(data);
      if (data.length > 0) {
        const first = data[0].exercise_name;
        setSelectedExercise(first);
        await loadHistory(first);
      }
    } catch (err) {
      console.error("Failed to load exercises:", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory(exercise: string) {
    setLoadingHistory(true);
    try {
      const data = await getOneRepMaxHistory(exercise);
      setHistory(data);
    } catch (err) {
      console.error("Failed to load history:", err);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleSelectExercise(exercise: string) {
    setSelectedExercise(exercise);
    await loadHistory(exercise);
  }

  const exerciseNames = allExercises.map((e) => e.exercise_name);
  const currentLatest = allExercises.find(
    (e) => e.exercise_name === selectedExercise,
  );
  const latest1RM = currentLatest
    ? parseFloat(currentLatest.estimated_1rm)
    : null;

  // Chart points — 1RM values over time
  const chartPoints = history.map((h) => parseFloat(h.estimated_1rm));

  // Best set — highest weight used
  const bestEntry = history.reduce<OneRepMaxHistory | null>((best, entry) => {
    if (!best) return entry;
    return parseFloat(entry.weight_used) > parseFloat(best.weight_used)
      ? entry
      : best;
  }, null);

  // Weight change
  const weightChange =
    chartPoints.length >= 2
      ? (chartPoints[chartPoints.length - 1] - chartPoints[0]).toFixed(1)
      : null;

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

  if (allExercises.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 60 }}>
          <Text
            style={{
              fontFamily: "Courier",
              fontSize: 11,
              color: Colors.ter,
              letterSpacing: 0.6,
              textTransform: "uppercase",
            }}
          >
            Exercise · History
          </Text>
          <Text
            style={{
              fontSize: 30,
              fontWeight: "700",
              color: Colors.text,
              letterSpacing: -0.6,
              marginTop: 4,
            }}
          >
            Progress
          </Text>
          <Text style={{ fontSize: 14, color: Colors.ter, marginTop: 20 }}>
            Complete some sessions to see your progress here. 1RM estimates are
            calculated automatically when you log sets with 3-10 reps.
          </Text>
        </View>
      </View>
    );
  }

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
              fontSize: 11,
              color: Colors.ter,
              letterSpacing: 0.6,
              textTransform: "uppercase",
            }}
          >
            Exercise · History
          </Text>
          <Text
            style={{
              fontSize: 30,
              fontWeight: "700",
              color: Colors.text,
              letterSpacing: -0.6,
              marginTop: 4,
            }}
          >
            {selectedExercise || "Progress"}
          </Text>
        </View>

        {/* exercise picker */}
        <ExercisePicker
          exercises={exerciseNames}
          selected={selectedExercise}
          onSelect={handleSelectExercise}
        />

        {loadingHistory ? (
          <ActivityIndicator color={Colors.accent} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* chart card */}
            <View style={{ marginHorizontal: 20, marginTop: 14 }}>
              <Card pad={16}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                  }}
                >
                  <View>
                    <Text
                      style={{
                        fontFamily: "Courier",
                        fontSize: 10,
                        color: Colors.ter,
                        letterSpacing: 0.6,
                        textTransform: "uppercase",
                      }}
                    >
                      Estimated 1RM
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "flex-end",
                        gap: 4,
                        marginTop: 4,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 32,
                          fontWeight: "700",
                          color: Colors.text,
                          letterSpacing: -0.6,
                        }}
                      >
                        {latest1RM !== null ? latest1RM.toFixed(1) : "—"}
                      </Text>
                      {latest1RM !== null && (
                        <Text
                          style={{
                            fontSize: 13,
                            color: Colors.sec,
                            marginBottom: 4,
                          }}
                        >
                          kg
                        </Text>
                      )}
                    </View>
                    {weightChange !== null && (
                      <Text
                        style={{
                          fontFamily: "Courier",
                          fontSize: 11,
                          color:
                            parseFloat(weightChange) >= 0
                              ? Colors.accent
                              : Colors.warn,
                          marginTop: 2,
                        }}
                      >
                        {parseFloat(weightChange) >= 0 ? "+" : ""}
                        {weightChange} kg overall
                      </Text>
                    )}
                  </View>
                </View>

                <ProgressChart
                  points={chartPoints}
                  color={Colors.accent}
                  height={140}
                />
              </Card>
            </View>

            {/* stats row */}
            <StatsRow
              latest1RM={latest1RM}
              historyCount={history.length}
              bestWeight={bestEntry ? parseFloat(bestEntry.weight_used) : null}
              bestReps={bestEntry ? bestEntry.reps_performed : null}
            />

            {/* history */}
            <HistoryLog history={history} />
          </>
        )}
      </ScrollView>
    </View>
  );
}
