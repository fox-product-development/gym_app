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
import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAxisDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDate().toString().padStart(2, "0");
  const month = d.toLocaleDateString("en-GB", { month: "short" });
  return `${day}-${month}`;
}

function computeYAxis(points: number[]): {
  yMin: number;
  yMax: number;
  yMid: number;
} {
  const dataMin = Math.min(...points);
  const dataMax = Math.max(...points);
  const dataRange = dataMax - dataMin || 1;
  const buffer = dataRange * 0.4;
  const rawMin = dataMin - buffer;
  const rawMax = dataMax + buffer;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax - rawMin)) - 1);
  const yMin = Math.floor(rawMin / magnitude) * magnitude;
  const yMax = Math.ceil(rawMax / magnitude) * magnitude;
  const yMid = (yMin + yMax) / 2;
  return { yMin, yMax, yMid };
}

// ─── Progress chart ───────────────────────────────────────────────────────────

function ProgressChart({
  points,
  dates,
  color,
  height = 140,
}: {
  points: number[];
  dates: string[];
  color: string;
  height?: number;
}) {
  const Y_LABEL_WIDTH = 40;
  const X_LABEL_HEIGHT = 18;
  const CHART_PADDING = 8;

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

  if (points.length < 2) {
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
          Log more sessions to see your trend
        </Text>
      </View>
    );
  }

  const { yMin, yMax, yMid } = computeYAxis(points);

  const chartH = height - X_LABEL_HEIGHT;
  const W = 300;
  const H = chartH - CHART_PADDING * 2;

  const toX = (i: number) => (i / (points.length - 1)) * W;
  const toY = (v: number) => CHART_PADDING + ((yMax - v) / (yMax - yMin)) * H;

  const linePath = points
    .map((p, i) => {
      if (i === 0) return `M ${toX(i)} ${toY(p)}`;
      const x0 = toX(i - 1);
      const y0 = toY(points[i - 1]);
      const x1 = toX(i);
      const y1 = toY(p);
      const cpx = (x0 + x1) / 2;
      return `C ${cpx} ${y0}, ${cpx} ${y1}, ${x1} ${y1}`;
    })
    .join(" ");

  const fillPath =
    linePath +
    ` L ${toX(points.length - 1)} ${H + CHART_PADDING * 2}` +
    ` L ${toX(0)} ${H + CHART_PADDING * 2} Z`;

  const startDate = dates[0] ? formatAxisDate(dates[0]) : "";
  const endDate = dates[dates.length - 1]
    ? formatAxisDate(dates[dates.length - 1])
    : "";
  const midIdx = Math.floor((dates.length - 1) / 2);
  const midDate = dates[midIdx] ? formatAxisDate(dates[midIdx]) : "";

  const fmtY = (v: number) =>
    Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1);

  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: "row" }}>
        {/* Y axis labels */}
        <View
          style={{
            width: Y_LABEL_WIDTH,
            height: chartH,
            justifyContent: "space-between",
            alignItems: "flex-end",
            paddingRight: 6,
            paddingVertical: CHART_PADDING,
          }}
        >
          <Text
            style={{ fontFamily: "Courier", fontSize: 9, color: Colors.ter }}
          >
            {fmtY(yMax)}
          </Text>
          <Text
            style={{ fontFamily: "Courier", fontSize: 9, color: Colors.ter }}
          >
            {fmtY(yMid)}
          </Text>
          <Text
            style={{ fontFamily: "Courier", fontSize: 9, color: Colors.ter }}
          >
            {fmtY(yMin)}
          </Text>
        </View>

        {/* SVG chart area */}
        <View style={{ flex: 1, height: chartH }}>
          <Svg
            width="100%"
            height={chartH}
            viewBox={`0 0 ${W} ${chartH}`}
            preserveAspectRatio="none"
          >
            <Defs>
              <LinearGradient id="progressGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={color} stopOpacity="0.3" />
                <Stop offset="100%" stopColor={color} stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Path d={fillPath} fill="url(#progressGrad)" />
            <Path
              d={linePath}
              stroke={color}
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>
      </View>

      {/* X axis labels */}
      <View
        style={{
          flexDirection: "row",
          marginLeft: Y_LABEL_WIDTH,
          height: X_LABEL_HEIGHT,
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontFamily: "Courier",
            fontSize: 8,
            color: Colors.ter,
            flex: 1,
            textAlign: "left",
          }}
        >
          {startDate}
        </Text>
        <Text
          style={{
            fontFamily: "Courier",
            fontSize: 8,
            color: Colors.ter,
            flex: 1,
            textAlign: "center",
          }}
        >
          {midDate}
        </Text>
        <Text
          style={{
            fontFamily: "Courier",
            fontSize: 8,
            color: Colors.ter,
            flex: 1,
            textAlign: "right",
          }}
        >
          {endDate}
        </Text>
      </View>
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

  // Chart points and dates — one entry per logged session
  const chartPoints = history.map((h) => parseFloat(h.estimated_1rm));
  const chartDates = history.map((h) => h.logged_at);

  const bestEntry = history.reduce<OneRepMaxHistory | null>((best, entry) => {
    if (!best) return entry;
    return parseFloat(entry.weight_used) > parseFloat(best.weight_used)
      ? entry
      : best;
  }, null);

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
                  dates={chartDates}
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
