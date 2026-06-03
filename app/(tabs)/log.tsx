// app/(tabs)/log.tsx
// Body Composition, Diet and Mood Log screen.
// Three tabs: Weight (existing), Diet (macros + image extraction), Mood (ratings).

import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
} from "react-native";
import { useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";
import { Colors } from "../../constants/theme";
import {
  logBodyComp,
  getBodyComp,
  extractBodyCompFromImage,
  logDiet,
  getDiet,
  extractDietFromImage,
  logMood,
  getMood,
} from "../../services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BodyCompEntry {
  id: number;
  weight_kg: string | null;
  muscle_mass_kg: string | null;
  body_fat_pct: string | null;
  logged_at: string;
}

interface DietEntry {
  id: number;
  logged_at: string;
  calories_kcal: string | null;
  fat_g: string | null;
  saturated_fat_g: string | null;
  carbs_g: string | null;
  sugar_g: string | null;
  fibre_g: string | null;
  protein_g: string | null;
  salt_g: string | null;
}

interface MoodEntry {
  id: number;
  logged_at: string;
  mood: number;
  energy: number;
  notes: string | null;
}

type ActiveField = "weight" | "muscle" | "bodyfat";
type ActiveTab = "weight" | "diet" | "mood";

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

// ─── Line chart ───────────────────────────────────────────────────────────────

function LineChart({
  points,
  dates,
  color,
  gradientId,
  height = 110,
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
        <Text
          style={{ fontFamily: "Courier", fontSize: 10, color: Colors.ter }}
        >
          Not enough data
        </Text>
      </View>
    );
  }

  const { yMin, yMax, yMid } = computeYAxis(points);
  const chartH = height - X_LABEL_HEIGHT;
  const W = 300;
  const H = chartH - CHART_PADDING * 2;

  const toX = (i: number) =>
    points.length === 1 ? W / 2 : (i / (points.length - 1)) * W;
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
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: "row" }}>
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
            <Path d={fillPath} fill={`url(#${gradientId})`} />
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

// ─── Star rating ──────────────────────────────────────────────────────────────

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

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function LogScreen() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("weight");

  // ── Weight state (existing) ───────────────────────────────────────────────
  const [history, setHistory] = useState<BodyCompEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeField, setActiveField] = useState<ActiveField>("weight");
  const [inputValue, setInputValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<{
    weight_kg?: number;
    muscle_mass_kg?: number;
    body_fat_pct?: number;
  } | null>(null);

  // ── Diet state ────────────────────────────────────────────────────────────
  const [dietHistory, setDietHistory] = useState<DietEntry[]>([]);
  const [dietLoading, setDietLoading] = useState(false);
  const [dietExtracting, setDietExtracting] = useState(false);
  const [dietExtracted, setDietExtracted] = useState<Partial<DietEntry> | null>(
    null,
  );
  const [dietSaving, setDietSaving] = useState(false);

  // ── Mood state ────────────────────────────────────────────────────────────
  const [moodHistory, setMoodHistory] = useState<MoodEntry[]>([]);
  const [moodLoading, setMoodLoading] = useState(false);
  const [moodValue, setMoodValue] = useState(3);
  const [energyValue, setEnergyValue] = useState(3);
  const [moodNotes, setMoodNotes] = useState("");
  const [moodSaving, setMoodSaving] = useState(false);
  const [moodSaved, setMoodSaved] = useState(false);

  // ── Load data on focus ────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      loadWeight();
      loadDiet();
      loadMood();
    }, []),
  );

  async function loadWeight() {
    setLoading(true);
    try {
      const data = await getBodyComp(12);
      setHistory(data);
    } catch (err) {
      console.error("Failed to load body comp:", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadDiet() {
    setDietLoading(true);
    try {
      const data = await getDiet(4);
      setDietHistory(data);
    } catch (err) {
      console.error("Failed to load diet:", err);
    } finally {
      setDietLoading(false);
    }
  }

  async function loadMood() {
    setMoodLoading(true);
    try {
      const data = await getMood(4);
      setMoodHistory(data);
      const today = data.find((e: MoodEntry) => {
        const d = new Date(e.logged_at);
        const t = new Date();
        return d.toDateString() === t.toDateString();
      });
      if (today) {
        setMoodValue(today.mood);
        setEnergyValue(today.energy);
        setMoodNotes(today.notes || "");
      }
    } catch (err) {
      console.error("Failed to load mood:", err);
    } finally {
      setMoodLoading(false);
    }
  }

  // ── Weight helpers (existing) ─────────────────────────────────────────────
  const today = history.find((e) => {
    const d = new Date(e.logged_at);
    const t = new Date();
    return d.toDateString() === t.toDateString();
  });

  const weightValue =
    extracted?.weight_kg?.toFixed(1) ?? today?.weight_kg ?? null;
  const muscleValue =
    extracted?.muscle_mass_kg?.toFixed(1) ?? today?.muscle_mass_kg ?? null;
  const bodyFatValue =
    extracted?.body_fat_pct?.toFixed(1) ?? today?.body_fat_pct ?? null;

  const weightPoints = history
    .filter((e) => e.weight_kg !== null)
    .map((e) => parseFloat(e.weight_kg!));
  const weightDates = history
    .filter((e) => e.weight_kg !== null)
    .map((e) => e.logged_at);
  const musclePoints = history
    .filter((e) => e.muscle_mass_kg !== null)
    .map((e) => parseFloat(e.muscle_mass_kg!));
  const muscleDates = history
    .filter((e) => e.muscle_mass_kg !== null)
    .map((e) => e.logged_at);
  const bodyFatPoints = history
    .filter((e) => e.body_fat_pct !== null)
    .map((e) => parseFloat(e.body_fat_pct!));
  const bodyFatDates = history
    .filter((e) => e.body_fat_pct !== null)
    .map((e) => e.logged_at);
  const latestWeight =
    weightPoints.length > 0 ? weightPoints[weightPoints.length - 1] : null;
  const latestMuscle =
    musclePoints.length > 0 ? musclePoints[musclePoints.length - 1] : null;
  const latestBodyFat =
    bodyFatPoints.length > 0 ? bodyFatPoints[bodyFatPoints.length - 1] : null;

  function openModal(field: ActiveField) {
    setActiveField(field);
    const current =
      field === "weight"
        ? weightValue
        : field === "muscle"
          ? muscleValue
          : bodyFatValue;
    setInputValue(current || "");
    setModalVisible(true);
  }

  function handleNumpad(key: string) {
    if (key === "⌫") {
      setInputValue((v) => v.slice(0, -1));
    } else if (key === ".") {
      if (!inputValue.includes(".")) setInputValue((v) => v + ".");
    } else {
      setInputValue((v) => (v.length < 6 ? v + key : v));
    }
  }

  async function handleSaveWeight() {
    const val = parseFloat(inputValue);
    if (isNaN(val) || val <= 0) return;
    setSaving(true);
    try {
      const payload =
        activeField === "weight"
          ? { weight_kg: val }
          : activeField === "muscle"
            ? { muscle_mass_kg: val }
            : { body_fat_pct: val };
      await logBodyComp({ ...payload, source: "manual" });
      await loadWeight();
      setExtracted(null);
      setModalVisible(false);
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleExtractFromImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0].base64) return;
    setExtracting(true);
    try {
      const ext = result.assets[0].mimeType || "image/jpeg";
      const data = await extractBodyCompFromImage(result.assets[0].base64, ext);
      setExtracted(data);
      if (data.weight_kg || data.muscle_mass_kg || data.body_fat_pct) {
        await logBodyComp({
          weight_kg: data.weight_kg,
          muscle_mass_kg: data.muscle_mass_kg,
          body_fat_pct: data.body_fat_pct,
          source: "image",
        });
        await loadWeight();
      }
    } catch (err) {
      console.error("Extract error:", err);
    } finally {
      setExtracting(false);
    }
  }

  // ── Diet helpers ──────────────────────────────────────────────────────────
  const todayDiet = dietHistory.find((e) => {
    const d = new Date(e.logged_at);
    const t = new Date();
    return d.toDateString() === t.toDateString();
  });

  const displayDiet = dietExtracted || todayDiet;

  async function handleExtractDietFromImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0].base64) return;
    setDietExtracting(true);
    try {
      const ext = result.assets[0].mimeType || "image/jpeg";
      const data = await extractDietFromImage(result.assets[0].base64, ext);
      setDietExtracted(data);
    } catch (err) {
      console.error("Diet extract error:", err);
    } finally {
      setDietExtracting(false);
    }
  }

  async function handleSaveDiet() {
    if (!dietExtracted) return;
    setDietSaving(true);
    try {
      await logDiet({
        calories_kcal: dietExtracted.calories_kcal
          ? parseFloat(dietExtracted.calories_kcal as string)
          : undefined,
        fat_g: dietExtracted.fat_g
          ? parseFloat(dietExtracted.fat_g as string)
          : undefined,
        saturated_fat_g: dietExtracted.saturated_fat_g
          ? parseFloat(dietExtracted.saturated_fat_g as string)
          : undefined,
        carbs_g: dietExtracted.carbs_g
          ? parseFloat(dietExtracted.carbs_g as string)
          : undefined,
        sugar_g: dietExtracted.sugar_g
          ? parseFloat(dietExtracted.sugar_g as string)
          : undefined,
        fibre_g: dietExtracted.fibre_g
          ? parseFloat(dietExtracted.fibre_g as string)
          : undefined,
        protein_g: dietExtracted.protein_g
          ? parseFloat(dietExtracted.protein_g as string)
          : undefined,
        salt_g: dietExtracted.salt_g
          ? parseFloat(dietExtracted.salt_g as string)
          : undefined,
        source: "image",
      });
      await loadDiet();
      setDietExtracted(null);
    } catch (err) {
      console.error("Diet save error:", err);
    } finally {
      setDietSaving(false);
    }
  }

  // ── Mood helpers ──────────────────────────────────────────────────────────
  async function handleSaveMood() {
    setMoodSaving(true);
    try {
      await logMood({
        mood: moodValue,
        energy: energyValue,
        notes: moodNotes || undefined,
      });
      await loadMood();
      setMoodSaved(true);
      setTimeout(() => setMoodSaved(false), 2000);
    } catch (err) {
      console.error("Mood save error:", err);
    } finally {
      setMoodSaving(false);
    }
  }

  const moodPoints = moodHistory.map((e) => e.mood);
  const moodDates = moodHistory.map((e) => e.logged_at);
  const energyPoints = moodHistory.map((e) => e.energy);

  // ── Tab bar ───────────────────────────────────────────────────────────────
  const tabs: { key: ActiveTab; label: string }[] = [
    { key: "weight", label: "Weight" },
    { key: "diet", label: "Diet" },
    { key: "mood", label: "Mood" },
  ];

  const sectionLabel = {
    fontFamily: "Courier",
    fontSize: 10,
    color: Colors.ter,
    letterSpacing: 0.8,
    textTransform: "uppercase" as const,
    marginBottom: 8,
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 56, paddingBottom: 8 }}>
        <Text
          style={{
            fontSize: 28,
            fontWeight: "700",
            color: Colors.text,
            letterSpacing: -0.6,
          }}
        >
          Body & Nutrition
        </Text>
      </View>

      {/* Tab bar */}
      <View
        style={{
          flexDirection: "row",
          marginHorizontal: 20,
          marginBottom: 4,
          backgroundColor: Colors.card,
          borderRadius: 10,
          padding: 3,
          gap: 3,
        }}
      >
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 8,
              alignItems: "center",
              backgroundColor:
                activeTab === tab.key ? Colors.card2 : "transparent",
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "500",
                color: activeTab === tab.key ? Colors.text : Colors.sec,
              }}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── Weight tab ────────────────────────────────────────────────────── */}
      {activeTab === "weight" && (
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          {/* Log from photo button */}
          <View style={{ marginHorizontal: 20, marginTop: 12 }}>
            <Pressable
              onPress={handleExtractFromImage}
              disabled={extracting}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                backgroundColor: Colors.card,
                borderRadius: 12,
                padding: 13,
                borderWidth: 0.5,
                borderColor: Colors.line,
                opacity: extracting ? 0.6 : 1,
              }}
            >
              {extracting ? (
                <ActivityIndicator color={Colors.accent} size="small" />
              ) : (
                <Text style={{ fontSize: 14, color: Colors.accent }}>📷</Text>
              )}
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: Colors.accent,
                }}
              >
                {extracting ? "Reading image…" : "Log from photo"}
              </Text>
            </Pressable>
          </View>

          {/* Today's readings */}
          <View style={{ marginHorizontal: 20, marginTop: 14 }}>
            <Card pad={14}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: Colors.text,
                  }}
                >
                  Today
                </Text>
                {extracted && (
                  <Tag color={Colors.accent} bg={Colors.accentDim}>
                    From photo
                  </Tag>
                )}
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={() => openModal("weight")}
                  style={{
                    flex: 1,
                    backgroundColor: Colors.bg,
                    borderRadius: 12,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: Colors.line2,
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
                    Weight
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-end",
                      gap: 4,
                      marginTop: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 30,
                        fontWeight: "700",
                        color: weightValue ? Colors.text : Colors.ter,
                        letterSpacing: -0.6,
                      }}
                    >
                      {weightValue || "—"}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: Colors.sec,
                        marginBottom: 4,
                      }}
                    >
                      kg
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => openModal("muscle")}
                  style={{
                    flex: 1,
                    backgroundColor: Colors.bg,
                    borderRadius: 12,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: Colors.line2,
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
                    Muscle Mass
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-end",
                      gap: 4,
                      marginTop: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 30,
                        fontWeight: "700",
                        color: muscleValue ? Colors.text : Colors.ter,
                        letterSpacing: -0.6,
                      }}
                    >
                      {muscleValue || "—"}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: Colors.sec,
                        marginBottom: 4,
                      }}
                    >
                      kg
                    </Text>
                  </View>
                </Pressable>
              </View>
              <Pressable
                onPress={() => openModal("bodyfat")}
                style={{
                  backgroundColor: Colors.bg,
                  borderRadius: 12,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: Colors.line2,
                  marginTop: 10,
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
                  Body Fat
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-end",
                    gap: 4,
                    marginTop: 8,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 30,
                      fontWeight: "700",
                      color: bodyFatValue ? Colors.text : Colors.ter,
                      letterSpacing: -0.6,
                    }}
                  >
                    {bodyFatValue || "—"}
                  </Text>
                  <Text
                    style={{ fontSize: 12, color: Colors.sec, marginBottom: 4 }}
                  >
                    %
                  </Text>
                </View>
              </Pressable>
            </Card>
          </View>

          {/* Charts */}
          <View style={{ marginHorizontal: 20, marginTop: 14 }}>
            <Card pad={14}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: Colors.text,
                  }}
                >
                  Weight
                </Text>
                {latestWeight !== null && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-end",
                      gap: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Courier",
                        fontSize: 14,
                        fontWeight: "700",
                        color: Colors.text,
                      }}
                    >
                      {latestWeight.toFixed(1)}
                    </Text>
                    <Text
                      style={{
                        fontSize: 10,
                        color: Colors.ter,
                        marginBottom: 2,
                      }}
                    >
                      kg
                    </Text>
                  </View>
                )}
              </View>
              {loading ? (
                <ActivityIndicator
                  color={Colors.accent}
                  style={{ marginTop: 20 }}
                />
              ) : (
                <LineChart
                  points={weightPoints}
                  dates={weightDates}
                  color={Colors.text}
                  gradientId="logWeightGrad"
                  height={110}
                />
              )}
            </Card>
          </View>

          <View style={{ marginHorizontal: 20, marginTop: 10 }}>
            <Card pad={14}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: Colors.text,
                  }}
                >
                  Muscle Mass
                </Text>
                {latestMuscle !== null && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-end",
                      gap: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Courier",
                        fontSize: 14,
                        fontWeight: "700",
                        color: Colors.text,
                      }}
                    >
                      {latestMuscle.toFixed(1)}
                    </Text>
                    <Text
                      style={{
                        fontSize: 10,
                        color: Colors.ter,
                        marginBottom: 2,
                      }}
                    >
                      kg
                    </Text>
                  </View>
                )}
              </View>
              {loading ? (
                <ActivityIndicator
                  color={Colors.accent}
                  style={{ marginTop: 20 }}
                />
              ) : (
                <LineChart
                  points={musclePoints}
                  dates={muscleDates}
                  color={Colors.green}
                  gradientId="logMuscleGrad"
                  height={110}
                />
              )}
            </Card>
          </View>

          <View
            style={{ marginHorizontal: 20, marginTop: 10, marginBottom: 24 }}
          >
            <Card pad={14}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: Colors.text,
                  }}
                >
                  Body Fat
                </Text>
                {latestBodyFat !== null && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-end",
                      gap: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Courier",
                        fontSize: 14,
                        fontWeight: "700",
                        color: Colors.text,
                      }}
                    >
                      {latestBodyFat.toFixed(1)}
                    </Text>
                    <Text
                      style={{
                        fontSize: 10,
                        color: Colors.ter,
                        marginBottom: 2,
                      }}
                    >
                      %
                    </Text>
                  </View>
                )}
              </View>
              {loading ? (
                <ActivityIndicator
                  color={Colors.accent}
                  style={{ marginTop: 20 }}
                />
              ) : (
                <LineChart
                  points={bodyFatPoints}
                  dates={bodyFatDates}
                  color={Colors.accent}
                  gradientId="logBodyFatGrad"
                  height={110}
                />
              )}
            </Card>
          </View>
        </ScrollView>
      )}

      {/* ── Diet tab ──────────────────────────────────────────────────────── */}
      {activeTab === "diet" && (
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          {/* Log from photo */}
          <View style={{ marginHorizontal: 20, marginTop: 12 }}>
            <Pressable
              onPress={handleExtractDietFromImage}
              disabled={dietExtracting}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                backgroundColor: Colors.card,
                borderRadius: 12,
                padding: 13,
                borderWidth: 0.5,
                borderColor: Colors.line,
                opacity: dietExtracting ? 0.6 : 1,
              }}
            >
              {dietExtracting ? (
                <ActivityIndicator color={Colors.accent} size="small" />
              ) : (
                <Text style={{ fontSize: 14, color: Colors.accent }}>📷</Text>
              )}
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: Colors.accent,
                }}
              >
                {dietExtracting ? "Reading image…" : "Log from photo"}
              </Text>
            </Pressable>
          </View>

          {/* Today's macros */}
          <View style={{ marginHorizontal: 20, marginTop: 14 }}>
            <Card pad={14}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: Colors.text,
                  }}
                >
                  Today
                </Text>
                {dietExtracted && (
                  <Tag color={Colors.accent} bg={Colors.accentDim}>
                    From photo
                  </Tag>
                )}
              </View>

              {/* Primary macros — 2 column grid */}
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
                {[
                  {
                    label: "Calories",
                    value: displayDiet?.calories_kcal,
                    unit: "kcal",
                  },
                  {
                    label: "Protein",
                    value: displayDiet?.protein_g,
                    unit: "g",
                  },
                ].map((m) => (
                  <View
                    key={m.label}
                    style={{
                      flex: 1,
                      backgroundColor: Colors.bg,
                      borderRadius: 12,
                      padding: 12,
                      borderWidth: 1,
                      borderColor: Colors.line2,
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
                      {m.label}
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "flex-end",
                        gap: 4,
                        marginTop: 8,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 26,
                          fontWeight: "700",
                          color: m.value ? Colors.text : Colors.ter,
                          letterSpacing: -0.6,
                        }}
                      >
                        {m.value
                          ? parseFloat(m.value as string).toFixed(0)
                          : "—"}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: Colors.sec,
                          marginBottom: 3,
                        }}
                      >
                        {m.unit}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Secondary macros */}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {[
                  { label: "Fat", value: displayDiet?.fat_g, unit: "g" },
                  {
                    label: "Sat fat",
                    value: displayDiet?.saturated_fat_g,
                    unit: "g",
                  },
                  { label: "Carbs", value: displayDiet?.carbs_g, unit: "g" },
                  { label: "Sugar", value: displayDiet?.sugar_g, unit: "g" },
                  { label: "Fibre", value: displayDiet?.fibre_g, unit: "g" },
                  { label: "Salt", value: displayDiet?.salt_g, unit: "g" },
                ].map((m) => (
                  <View
                    key={m.label}
                    style={{
                      width: "30%",
                      backgroundColor: Colors.bg,
                      borderRadius: 10,
                      padding: 10,
                      borderWidth: 1,
                      borderColor: Colors.line2,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Courier",
                        fontSize: 8,
                        color: Colors.ter,
                        letterSpacing: 0.5,
                        textTransform: "uppercase",
                      }}
                    >
                      {m.label}
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "flex-end",
                        gap: 2,
                        marginTop: 6,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 18,
                          fontWeight: "700",
                          color: m.value ? Colors.text : Colors.ter,
                        }}
                      >
                        {m.value
                          ? parseFloat(m.value as string).toFixed(0)
                          : "—"}
                      </Text>
                      <Text
                        style={{
                          fontSize: 10,
                          color: Colors.sec,
                          marginBottom: 2,
                        }}
                      >
                        {m.unit}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Save button — only shown when extracted data is pending */}
              {dietExtracted && (
                <Pressable
                  onPress={handleSaveDiet}
                  disabled={dietSaving}
                  style={{
                    backgroundColor: Colors.accent,
                    borderRadius: 12,
                    padding: 13,
                    alignItems: "center",
                    marginTop: 14,
                    opacity: dietSaving ? 0.7 : 1,
                  }}
                >
                  {dietSaving ? (
                    <ActivityIndicator color={Colors.accentInk} />
                  ) : (
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: "700",
                        color: Colors.accentInk,
                      }}
                    >
                      Save today's diet
                    </Text>
                  )}
                </Pressable>
              )}
            </Card>
          </View>

          {/* Calorie trend chart */}
          <View style={{ marginHorizontal: 20, marginTop: 14 }}>
            <Card pad={14}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: Colors.text,
                  marginBottom: 2,
                }}
              >
                Calories
              </Text>
              {dietLoading ? (
                <ActivityIndicator
                  color={Colors.accent}
                  style={{ marginTop: 20 }}
                />
              ) : (
                <LineChart
                  points={dietHistory
                    .filter((e) => e.calories_kcal !== null)
                    .map((e) => parseFloat(e.calories_kcal!))}
                  dates={dietHistory
                    .filter((e) => e.calories_kcal !== null)
                    .map((e) => e.logged_at)}
                  color={Colors.warn}
                  gradientId="dietCalGrad"
                  height={110}
                />
              )}
            </Card>
          </View>

          {/* Protein trend chart */}
          <View
            style={{ marginHorizontal: 20, marginTop: 10, marginBottom: 24 }}
          >
            <Card pad={14}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: Colors.text,
                  marginBottom: 2,
                }}
              >
                Protein
              </Text>
              {dietLoading ? (
                <ActivityIndicator
                  color={Colors.accent}
                  style={{ marginTop: 20 }}
                />
              ) : (
                <LineChart
                  points={dietHistory
                    .filter((e) => e.protein_g !== null)
                    .map((e) => parseFloat(e.protein_g!))}
                  dates={dietHistory
                    .filter((e) => e.protein_g !== null)
                    .map((e) => e.logged_at)}
                  color={Colors.accent}
                  gradientId="dietProteinGrad"
                  height={110}
                />
              )}
            </Card>
          </View>
        </ScrollView>
      )}

      {/* ── Mood tab ──────────────────────────────────────────────────────── */}
      {activeTab === "mood" && (
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          <View style={{ marginHorizontal: 20, marginTop: 12 }}>
            <Card pad={14}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: Colors.text,
                  marginBottom: 14,
                }}
              >
                Today
              </Text>

              {/* Mood rating */}
              <View style={{ marginBottom: 16 }}>
                <Text style={sectionLabel}>Mood</Text>
                <StarRating value={moodValue} onChange={setMoodValue} />
              </View>

              {/* Energy rating */}
              <View style={{ marginBottom: 16 }}>
                <Text style={sectionLabel}>Energy</Text>
                <StarRating value={energyValue} onChange={setEnergyValue} />
              </View>

              {/* Notes */}
              <View style={{ marginBottom: 14 }}>
                <Text style={sectionLabel}>Notes</Text>
                <TextInput
                  value={moodNotes}
                  onChangeText={setMoodNotes}
                  multiline
                  placeholder="How are you feeling today?"
                  placeholderTextColor={Colors.ter}
                  style={{
                    backgroundColor: Colors.bg,
                    borderRadius: 10,
                    padding: 12,
                    fontSize: 14,
                    color: Colors.text,
                    borderWidth: 0.5,
                    borderColor: Colors.line,
                    minHeight: 80,
                    textAlignVertical: "top",
                  }}
                />
              </View>

              <Pressable
                onPress={handleSaveMood}
                disabled={moodSaving}
                style={{
                  backgroundColor: moodSaved ? Colors.green : Colors.accent,
                  borderRadius: 12,
                  padding: 13,
                  alignItems: "center",
                  opacity: moodSaving ? 0.7 : 1,
                }}
              >
                {moodSaving ? (
                  <ActivityIndicator color={Colors.accentInk} />
                ) : (
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: Colors.accentInk,
                    }}
                  >
                    {moodSaved ? "Saved ✓" : "Save today"}
                  </Text>
                )}
              </Pressable>
            </Card>
          </View>

          {/* Mood trend chart */}
          <View style={{ marginHorizontal: 20, marginTop: 14 }}>
            <Card pad={14}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: Colors.text,
                  marginBottom: 2,
                }}
              >
                Mood
              </Text>
              {moodLoading ? (
                <ActivityIndicator
                  color={Colors.accent}
                  style={{ marginTop: 20 }}
                />
              ) : (
                <LineChart
                  points={moodPoints}
                  dates={moodDates}
                  color={Colors.accent}
                  gradientId="moodGrad"
                  height={110}
                />
              )}
            </Card>
          </View>

          {/* Energy trend chart */}
          <View
            style={{ marginHorizontal: 20, marginTop: 10, marginBottom: 24 }}
          >
            <Card pad={14}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: Colors.text,
                  marginBottom: 2,
                }}
              >
                Energy
              </Text>
              {moodLoading ? (
                <ActivityIndicator
                  color={Colors.accent}
                  style={{ marginTop: 20 }}
                />
              ) : (
                <LineChart
                  points={energyPoints}
                  dates={moodDates}
                  color={Colors.warn}
                  gradientId="energyGrad"
                  height={110}
                />
              )}
            </Card>
          </View>
        </ScrollView>
      )}

      {/* ── Weight entry modal (existing) ─────────────────────────────────── */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,0.6)",
          }}
        >
          <View
            style={{
              backgroundColor: Colors.card,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: 40,
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: Colors.text,
                marginBottom: 16,
                textAlign: "center",
              }}
            >
              {activeField === "weight"
                ? "Weight (kg)"
                : activeField === "muscle"
                  ? "Muscle Mass (kg)"
                  : "Body Fat (%)"}
            </Text>
            <View
              style={{
                backgroundColor: Colors.bg,
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 36,
                  fontWeight: "700",
                  color: inputValue ? Colors.text : Colors.ter,
                  fontFamily: "Courier",
                  letterSpacing: -1,
                }}
              >
                {inputValue || "0.0"}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 10,
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map(
                (key) => (
                  <Pressable
                    key={key}
                    onPress={() => handleNumpad(key)}
                    style={{
                      width: 72,
                      height: 52,
                      backgroundColor: Colors.card2,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 20,
                        fontWeight: "600",
                        color: Colors.text,
                      }}
                    >
                      {key}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => setModalVisible(false)}
                style={{
                  flex: 1,
                  backgroundColor: Colors.card2,
                  borderRadius: 12,
                  padding: 14,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 15, color: Colors.sec }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveWeight}
                disabled={saving}
                style={{
                  flex: 2,
                  backgroundColor: Colors.accent,
                  borderRadius: 12,
                  padding: 14,
                  alignItems: "center",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? (
                  <ActivityIndicator color={Colors.accentInk} />
                ) : (
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: Colors.accentInk,
                    }}
                  >
                    Save
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
