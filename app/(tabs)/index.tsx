// app/(tabs)/index.tsx
// Home / Dashboard screen — fully wired to real data.

import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import Markdown from "react-native-markdown-display";
import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";
import { Colors } from "../../constants/theme";
import {
  getProfile,
  getBodyComp,
  getWeekSessions,
  getWeeklyFeedback,
  generateWeeklyReport,
  getGyms,
} from "../../services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Profile {
  current_phase: string;
  current_block: number;
  phase_week: number;
  phase_start_date: string;
}

interface BodyCompEntry {
  weight_kg: string | null;
  muscle_mass_kg: string | null;
  body_fat_pct: string | null;
  logged_at: string;
}

interface Session {
  id: number;
  session_type: string;
  occurrence: number;
  status: string;
  gym: string;
  planned_exercises: any[];
}

interface WeeklyFeedback {
  ai_summary: string;
  week_start_date: string;
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

function Divider({ inset = 0 }: { inset?: number }) {
  return (
    <View
      style={{ height: 0.5, backgroundColor: Colors.line, marginLeft: inset }}
    />
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

// ─── Line chart ───────────────────────────────────────────────────────────────

function LineChart({
  points,
  dates,
  color,
  gradientId,
  height = 100,
}: {
  points: number[];
  dates: string[];
  color: string;
  gradientId: string;
  height?: number;
}) {
  const Y_LABEL_WIDTH = 36;
  const X_LABEL_HEIGHT = 18;
  const CHART_PADDING = 8;

  if (points.length < 2) {
    return (
      <View
        style={{
          height,
          alignItems: "center",
          justifyContent: "center",
          marginTop: 8,
        }}
      >
        <Text style={{ fontFamily: "Courier", fontSize: 9, color: Colors.ter }}>
          Not enough data
        </Text>
      </View>
    );
  }

  const { yMin, yMax, yMid } = computeYAxis(points);

  const chartH = height - X_LABEL_HEIGHT;

  // Build path using a fixed internal width; we'll use viewBox to scale
  const W = 300;
  const H = chartH - CHART_PADDING * 2;

  const toX = (i: number) =>
    points.length === 1 ? W / 2 : (i / (points.length - 1)) * W;
  const toY = (v: number) => CHART_PADDING + ((yMax - v) / (yMax - yMin)) * H;

  // Smooth bezier path
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

  // Closed fill path
  const fillPath =
    linePath +
    ` L ${toX(points.length - 1)} ${H + CHART_PADDING * 2}` +
    ` L ${toX(0)} ${H + CHART_PADDING * 2} Z`;

  // X axis labels: start, mid, end
  const startDate = dates[0] ? formatAxisDate(dates[0]) : "";
  const endDate = dates[dates.length - 1]
    ? formatAxisDate(dates[dates.length - 1])
    : "";
  const midIdx = Math.floor((dates.length - 1) / 2);
  const midDate = dates[midIdx] ? formatAxisDate(dates[midIdx]) : "";

  // Y axis labels
  const fmtY = (v: number) =>
    Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1);

  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: "row" }}>
        {/* Y axis labels */}
        <View
          style={{
            width: Y_LABEL_WIDTH,
            height: chartH,
            justifyContent: "space-between",
            alignItems: "flex-end",
            paddingRight: 5,
            paddingVertical: CHART_PADDING,
          }}
        >
          <Text
            style={{ fontFamily: "Courier", fontSize: 8, color: Colors.ter }}
          >
            {fmtY(yMax)}
          </Text>
          <Text
            style={{ fontFamily: "Courier", fontSize: 8, color: Colors.ter }}
          >
            {fmtY(yMid)}
          </Text>
          <Text
            style={{ fontFamily: "Courier", fontSize: 8, color: Colors.ter }}
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
              <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={color} stopOpacity="0.25" />
                <Stop offset="100%" stopColor={color} stopOpacity="0" />
              </LinearGradient>
            </Defs>
            {/* Fill */}
            <Path d={fillPath} fill={`url(#${gradientId})`} />
            {/* Line */}
            <Path
              d={linePath}
              stroke={color}
              strokeWidth="1.5"
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

// ─── Phase badge ──────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<string, string> = {
  anatomical_adaptation: "Anatomical Adaptation",
  hypertrophy: "Hypertrophy",
  maximum_strength: "Maximum Strength",
  muscle_definition: "Muscle Definition",
  rest: "Rest Week",
};

function PhaseBadge({ profile }: { profile: Profile }) {
  const pct = Math.round((profile.phase_week / 6) * 100);
  const label = PHASE_LABELS[profile.current_phase] || profile.current_phase;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: Colors.accentDim,
        borderRadius: 14,
        padding: 14,
        borderWidth: 0.5,
        borderColor: Colors.accent,
        marginHorizontal: 20,
        marginTop: 16,
      }}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          backgroundColor: Colors.accent,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: 18 }}>★</Text>
      </View>

      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: "Courier",
            fontSize: 10,
            color: Colors.accent,
            letterSpacing: 0.6,
            textTransform: "uppercase",
          }}
        >
          Current Phase
        </Text>
        <Text
          style={{
            fontSize: 16,
            fontWeight: "600",
            color: Colors.text,
            marginTop: 2,
          }}
        >
          {label}{" "}
          <Text style={{ color: Colors.ter, fontWeight: "400", fontSize: 14 }}>
            · Week {profile.phase_week} of 6
          </Text>
        </Text>
      </View>

      <Text
        style={{
          fontFamily: "Courier",
          fontSize: 24,
          fontWeight: "600",
          color: Colors.text,
        }}
      >
        {pct}
        <Text style={{ color: Colors.ter, fontSize: 14 }}>%</Text>
      </Text>
    </View>
  );
}

// ─── Start session button ─────────────────────────────────────────────────────

function StartSessionButton({ sessions }: { sessions: Session[] }) {
  const nextSession =
    sessions.find((s) => s.status === "in_progress") ||
    sessions.find((s) => s.status === "planned");

  if (!nextSession) {
    return (
      <View
        style={{
          marginHorizontal: 20,
          marginTop: 16,
          backgroundColor: Colors.card,
          borderRadius: 16,
          padding: 18,
          borderWidth: 0.5,
          borderColor: Colors.line,
        }}
      >
        <Text style={{ fontSize: 14, color: Colors.sec, textAlign: "center" }}>
          All sessions complete this week
        </Text>
      </View>
    );
  }

  const label =
    nextSession.session_type === "compound"
      ? `Compound · Session ${nextSession.occurrence}`
      : "Isolation Session";

  const isInProgress = nextSession.status === "in_progress";

  return (
    <Pressable
      onPress={() => router.push(`/session?id=${nextSession.id}`)}
      style={{
        marginHorizontal: 20,
        marginTop: 16,
        backgroundColor: Colors.text,
        borderRadius: 16,
        padding: 18,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <View>
        <Text
          style={{
            fontFamily: "Courier",
            fontSize: 10,
            color: "rgba(0,0,0,0.5)",
            letterSpacing: 0.6,
            textTransform: "uppercase",
          }}
        >
          {isInProgress ? "In Progress" : "Next Up"} · {label}
        </Text>
        <Text
          style={{
            fontSize: 20,
            fontWeight: "700",
            color: "#000",
            marginTop: 2,
            letterSpacing: -0.4,
          }}
        >
          {isInProgress ? "Continue Session →" : "Start Today's Session →"}
        </Text>
      </View>
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 999,
          backgroundColor: "#000",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: Colors.text, fontSize: 14, marginLeft: 3 }}>
          ▶
        </Text>
      </View>
    </Pressable>
  );
}

// ─── Body comp cards ──────────────────────────────────────────────────────────

function BodyCompCards({ entries }: { entries: BodyCompEntry[] }) {
  const weightEntries = entries.filter((e) => e.weight_kg !== null);
  const muscleEntries = entries.filter((e) => e.muscle_mass_kg !== null);
  const fatEntries = entries.filter((e) => e.body_fat_pct !== null);

  const weightPoints = weightEntries.map((e) => parseFloat(e.weight_kg!));
  const musclePoints = muscleEntries.map((e) => parseFloat(e.muscle_mass_kg!));
  const fatPoints = fatEntries.map((e) => parseFloat(e.body_fat_pct!));

  const weightDates = weightEntries.map((e) => e.logged_at);
  const muscleDates = muscleEntries.map((e) => e.logged_at);
  const fatDates = fatEntries.map((e) => e.logged_at);

  const latestWeight =
    weightPoints.length > 0 ? weightPoints[weightPoints.length - 1] : null;
  const latestMuscle =
    musclePoints.length > 0 ? musclePoints[musclePoints.length - 1] : null;
  const latestFat =
    fatPoints.length > 0 ? fatPoints[fatPoints.length - 1] : null;

  const weightChange =
    weightPoints.length >= 2
      ? (weightPoints[weightPoints.length - 1] - weightPoints[0]).toFixed(1)
      : null;
  const muscleChange =
    musclePoints.length >= 2
      ? (musclePoints[musclePoints.length - 1] - musclePoints[0]).toFixed(1)
      : null;
  const fatChange =
    fatPoints.length >= 2
      ? (fatPoints[fatPoints.length - 1] - fatPoints[0]).toFixed(1)
      : null;

  return (
    <View style={{ marginHorizontal: 20, marginTop: 20, gap: 10 }}>
      {/* Weight — full width */}
      <Card pad={14}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-end",
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
              Bodyweight
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
                  fontSize: 24,
                  fontWeight: "700",
                  color: Colors.text,
                  letterSpacing: -0.5,
                }}
              >
                {latestWeight !== null ? latestWeight.toFixed(1) : "—"}
              </Text>
              <Text
                style={{ fontSize: 11, color: Colors.sec, marginBottom: 2 }}
              >
                kg
              </Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text
              style={{ fontFamily: "Courier", fontSize: 9, color: Colors.ter }}
            >
              4w
            </Text>
            {weightChange !== null && (
              <Text
                style={{
                  fontSize: 11,
                  color:
                    parseFloat(weightChange) >= 0 ? Colors.accent : Colors.warn,
                  fontFamily: "Courier",
                  marginTop: 2,
                }}
              >
                {parseFloat(weightChange) >= 0 ? "+" : ""}
                {weightChange} kg
              </Text>
            )}
          </View>
        </View>
        <LineChart
          points={weightPoints}
          dates={weightDates}
          color={Colors.text}
          gradientId="weightGrad"
          height={110}
        />
      </Card>

      {/* Muscle mass — full width */}
      <Card pad={14}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-end",
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
              Muscle Mass
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
                  fontSize: 24,
                  fontWeight: "700",
                  color: Colors.text,
                  letterSpacing: -0.5,
                }}
              >
                {latestMuscle !== null ? latestMuscle.toFixed(1) : "—"}
              </Text>
              <Text
                style={{ fontSize: 11, color: Colors.sec, marginBottom: 2 }}
              >
                kg
              </Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text
              style={{ fontFamily: "Courier", fontSize: 9, color: Colors.ter }}
            >
              4w
            </Text>
            {muscleChange !== null && (
              <Text
                style={{
                  fontSize: 11,
                  color:
                    parseFloat(muscleChange) >= 0 ? Colors.green : Colors.warn,
                  fontFamily: "Courier",
                  marginTop: 2,
                }}
              >
                {parseFloat(muscleChange) >= 0 ? "+" : ""}
                {muscleChange} kg
              </Text>
            )}
          </View>
        </View>
        <LineChart
          points={musclePoints}
          dates={muscleDates}
          color={Colors.green}
          gradientId="muscleGrad"
          height={110}
        />
      </Card>

      {/* Body fat — full width */}
      <Card pad={14}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-end",
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
              Body Fat
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
                  fontSize: 24,
                  fontWeight: "700",
                  color: Colors.text,
                  letterSpacing: -0.5,
                }}
              >
                {latestFat !== null ? latestFat.toFixed(1) : "—"}
              </Text>
              <Text
                style={{ fontSize: 11, color: Colors.sec, marginBottom: 2 }}
              >
                %
              </Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text
              style={{ fontFamily: "Courier", fontSize: 9, color: Colors.ter }}
            >
              4w
            </Text>
            {fatChange !== null && (
              <Text
                style={{
                  fontSize: 11,
                  // Inverted: body fat going down is good (coral), going up is bad (amber)
                  color:
                    parseFloat(fatChange) <= 0 ? Colors.accent : Colors.warn,
                  fontFamily: "Courier",
                  marginTop: 2,
                }}
              >
                {parseFloat(fatChange) >= 0 ? "+" : ""}
                {fatChange}%
              </Text>
            )}
          </View>
        </View>
        <LineChart
          points={fatPoints}
          dates={fatDates}
          color={Colors.warn}
          gradientId="fatGrad"
          height={110}
        />
      </Card>
    </View>
  );
}

// ─── Markdown styles ──────────────────────────────────────────────────────────

const markdownStyles = {
  body: {
    color: Colors.sec,
    fontSize: 13,
    lineHeight: 20,
  },
  heading1: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "700" as const,
    marginTop: 16,
    marginBottom: 4,
  },
  heading2: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700" as const,
    letterSpacing: 0.4,
    marginTop: 14,
    marginBottom: 4,
  },
  heading3: {
    color: Colors.sec,
    fontSize: 12,
    fontWeight: "600" as const,
    letterSpacing: 0.3,
    marginTop: 10,
    marginBottom: 2,
  },
  strong: {
    color: Colors.text,
    fontWeight: "600" as const,
  },
  em: {
    color: Colors.sec,
  },
  hr: {
    backgroundColor: Colors.line,
    height: 0.5,
    marginVertical: 10,
  },
  bullet_list: {
    marginTop: 4,
    marginBottom: 4,
  },
  ordered_list: {
    marginTop: 4,
    marginBottom: 4,
  },
  list_item: {
    color: Colors.sec,
    fontSize: 13,
    lineHeight: 20,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 8,
  },
};

// ─── AI report card ───────────────────────────────────────────────────────────

function AIReportCard({
  feedback,
  onReportGenerated,
}: {
  feedback: WeeklyFeedback | null;
  onReportGenerated: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");

  async function handleGenerateReport() {
    setGenerating(true);
    setGenerateError("");
    try {
      const result = await generateWeeklyReport();
      if (result.status === "up_to_date") {
        setGenerateError("Report already up to date");
      } else {
        onReportGenerated();
      }
    } catch (err: any) {
      setGenerateError("Failed to generate report — please try again");
    } finally {
      setGenerating(false);
    }
  }

  if (!feedback) {
    return (
      <Card pad={14} style={{ marginHorizontal: 20, marginTop: 14 }}>
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
          Weekly AI Report
        </Text>
        <Text style={{ fontSize: 13, color: Colors.ter, marginBottom: 14 }}>
          No report yet for this week.
        </Text>
        <Pressable
          onPress={handleGenerateReport}
          disabled={generating}
          style={{
            backgroundColor: Colors.card2,
            borderRadius: 12,
            padding: 14,
            alignItems: "center",
            borderWidth: 0.5,
            borderColor: Colors.line2,
            opacity: generating ? 0.6 : 1,
          }}
        >
          {generating ? (
            <ActivityIndicator color={Colors.accent} />
          ) : (
            <Text
              style={{ fontSize: 14, fontWeight: "600", color: Colors.accent }}
            >
              Generate Report
            </Text>
          )}
        </Pressable>
        {generateError ? (
          <Text
            style={{
              fontSize: 12,
              color: Colors.warn,
              marginTop: 8,
              textAlign: "center",
            }}
          >
            {generateError}
          </Text>
        ) : null}
      </Card>
    );
  }

  const preview = feedback.ai_summary?.slice(0, 200).trim();

  const weekDate = new Date(feedback.week_start_date).toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "short" },
  );

  // Check if the report is from a previous week
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const thisWeekMonday = monday.toISOString().split("T")[0];
  const isStale = feedback.week_start_date < thisWeekMonday;

  return (
    <Card pad={0} style={{ marginHorizontal: 20, marginTop: 14 }}>
      <Pressable
        onPress={() => setExpanded((prev) => !prev)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          padding: 14,
        }}
      >
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            backgroundColor: Colors.card2,
            borderWidth: 0.5,
            borderColor: Colors.line2,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: Colors.accent, fontSize: 12 }}>★</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: "Courier",
              fontSize: 10,
              color: Colors.ter,
              letterSpacing: 0.6,
              textTransform: "uppercase",
            }}
          >
            Weekly AI Report · {weekDate}
          </Text>
          <Text
            style={{
              fontSize: 14,
              fontWeight: "600",
              color: Colors.text,
              marginTop: 1,
            }}
          >
            Week in review
          </Text>
        </View>
        <Text
          style={{
            color: Colors.sec,
            fontSize: 16,
            transform: [{ rotate: expanded ? "90deg" : "0deg" }],
          }}
        >
          ›
        </Text>
      </Pressable>

      <Divider />

      {expanded ? (
        <View style={{ padding: 14 }}>
          <Markdown style={markdownStyles}>{feedback.ai_summary}</Markdown>
        </View>
      ) : (
        <View style={{ padding: 14 }}>
          <Markdown style={markdownStyles}>
            {(preview ?? "") + (feedback.ai_summary?.length > 200 ? "…" : "")}
          </Markdown>
        </View>
      )}

      {isStale && (
        <>
          <Divider />
          <View style={{ padding: 14 }}>
            <Pressable
              onPress={handleGenerateReport}
              disabled={generating}
              style={{
                backgroundColor: Colors.card2,
                borderRadius: 12,
                padding: 14,
                alignItems: "center",
                borderWidth: 0.5,
                borderColor: Colors.line2,
                opacity: generating ? 0.6 : 1,
              }}
            >
              {generating ? (
                <ActivityIndicator color={Colors.accent} />
              ) : (
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: Colors.accent,
                  }}
                >
                  Generate This Week's Report
                </Text>
              )}
            </Pressable>
            {generateError ? (
              <Text
                style={{
                  fontSize: 12,
                  color: Colors.warn,
                  marginTop: 8,
                  textAlign: "center",
                }}
              >
                {generateError}
              </Text>
            ) : null}
          </View>
        </>
      )}
    </Card>
  );
}

// ─── Recent sessions ──────────────────────────────────────────────────────────

function RecentSessions({ sessions }: { sessions: Session[] }) {
  const completed = sessions.filter((s) => s.status === "complete").slice(0, 3);

  if (completed.length === 0) {
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
          Recent sessions
        </Text>
        <Text style={{ fontSize: 13, color: Colors.ter }}>
          No completed sessions yet.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ marginHorizontal: 20, marginTop: 20, marginBottom: 24 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: 10,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.sec }}>
          Recent sessions
        </Text>
      </View>

      {completed.map((s, i) => {
        const label =
          s.session_type === "compound"
            ? `Compound · Session ${s.occurrence}`
            : "Isolation";
        const gymLabel = s.gym === "home" ? "Home Gym" : "Work Gym";
        const exCount = s.planned_exercises?.length || 0;

        return (
          <View
            key={s.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
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
                width: 36,
                height: 36,
                borderRadius: 8,
                backgroundColor: Colors.card2,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: "Courier",
                  fontSize: 9,
                  color: Colors.ter,
                  textTransform: "uppercase",
                }}
              >
                {s.session_type === "isolation" ? "ISO" : "CPD"}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{ fontSize: 14, fontWeight: "600", color: Colors.text }}
              >
                {label}
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: Colors.ter,
                  fontFamily: "Courier",
                  marginTop: 2,
                }}
              >
                {exCount} exercises · {gymLabel}
              </Text>
            </View>
            <Text style={{ color: Colors.qua, fontSize: 14 }}>›</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Greeting helpers ─────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getDateLabel(): string {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [bodyComp, setBodyComp] = useState<BodyCompEntry[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [feedback, setFeedback] = useState<WeeklyFeedback | null>(null);
  const [hasDefaultGym, setHasDefaultGym] = useState(true);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, []),
  );

  async function loadData() {
    setLoading(true);
    try {
      const [profileData, bodyCompData, sessionData, feedbackData, gymsData] =
        await Promise.all([
          getProfile(),
          getBodyComp(4),
          getWeekSessions(),
          getWeeklyFeedback(),
          getGyms(),
        ]);
      setProfile(profileData);
      setBodyComp(bodyCompData);
      setSessions(sessionData);
      setFeedback(feedbackData);
      setHasDefaultGym(
        Array.isArray(gymsData) && gymsData.some((g: any) => g.is_default),
      );
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoading(false);
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

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* greeting */}
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
            {getDateLabel()}
          </Text>
          <Text
            style={{
              fontSize: 30,
              fontWeight: "700",
              color: Colors.text,
              letterSpacing: -0.6,
              marginTop: 6,
            }}
          >
            {getGreeting()}
          </Text>
        </View>

        {!hasDefaultGym ? (
          <View
            style={{
              marginHorizontal: 20,
              marginTop: 32,
              alignItems: "center",
              gap: 16,
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 20,
                backgroundColor: Colors.accentDim,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 28 }}>🏋️</Text>
            </View>
            <Text
              style={{
                fontSize: 20,
                fontWeight: "700",
                color: Colors.text,
                textAlign: "center",
                letterSpacing: -0.3,
              }}
            >
              Set up your gym to get started
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: Colors.sec,
                textAlign: "center",
                lineHeight: 20,
                paddingHorizontal: 12,
              }}
            >
              Add your gym, equipment, and exercises so we can build your first
              training block.
            </Text>
            <Pressable
              onPress={() => router.push("/gym-settings")}
              style={{
                backgroundColor: Colors.accent,
                borderRadius: 14,
                paddingVertical: 16,
                paddingHorizontal: 32,
                marginTop: 8,
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  color: Colors.accentInk,
                }}
              >
                Go to Gym Settings
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            {profile && <PhaseBadge profile={profile} />}
            <StartSessionButton sessions={sessions} />
            <BodyCompCards entries={bodyComp} />
            <AIReportCard feedback={feedback} onReportGenerated={loadData} />
            <RecentSessions sessions={sessions} />
          </>
        )}
      </ScrollView>
    </View>
  );
}
