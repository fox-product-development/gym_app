// app/(tabs)/log.tsx
// Body Composition Log screen
// Saves real entries to the database and displays real trend data.

import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Colors } from "../../constants/theme";
import { logBodyComp, getBodyComp } from "../../services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BodyCompEntry {
  id: number;
  weight_kg: string | null;
  muscle_mass_kg: string | null;
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

// ─── Mini bar chart ───────────────────────────────────────────────────────────

function MiniChart({
  points,
  color,
  height = 88,
  label,
  yLabels,
}: {
  points: number[];
  color: string;
  height?: number;
  label?: string;
  yLabels?: [string, string];
}) {
  if (points.length === 0) {
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
          No data yet
        </Text>
      </View>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  return (
    <View style={{ marginTop: 8 }}>
      <View
        style={{ flexDirection: "row", alignItems: "flex-end", height, gap: 2 }}
      >
        {points.map((p, i) => {
          const barHeight = ((p - min) / range) * (height - 8) + 8;
          const isLast = i === points.length - 1;
          return (
            <View
              key={i}
              style={{
                flex: 1,
                height: barHeight,
                borderRadius: 2,
                backgroundColor: isLast ? color : color + "40",
              }}
            />
          );
        })}
      </View>
      {(label || yLabels) && (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginTop: 4,
          }}
        >
          <Text
            style={{ fontFamily: "Courier", fontSize: 9, color: Colors.ter }}
          >
            {yLabels ? yLabels[0] : ""}
          </Text>
          <Text
            style={{ fontFamily: "Courier", fontSize: 9, color: Colors.ter }}
          >
            {label || (yLabels ? yLabels[1] : "")}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Numpad ───────────────────────────────────────────────────────────────────

function Numpad({ onPress }: { onPress: (key: string) => void }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];
  return (
    <Card pad={10} style={{ marginHorizontal: 20, marginTop: 10 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
        {keys.map((k, i) => (
          <Pressable
            key={i}
            onPress={() => onPress(k)}
            style={{
              width: "30%",
              paddingVertical: 12,
              alignItems: "center",
              backgroundColor: Colors.card2,
              borderRadius: 8,
            }}
          >
            <Text
              style={{
                fontFamily: "Courier",
                fontSize: 18,
                fontWeight: "600",
                color: k === "⌫" ? Colors.sec : Colors.text,
              }}
            >
              {k}
            </Text>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function LogScreen() {
  const [activeField, setActiveField] = useState<"weight" | "muscle">("weight");
  const [weightInput, setWeightInput] = useState("");
  const [muscleInput, setMuscleInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [entries, setEntries] = useState<BodyCompEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Load data whenever screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadEntries();
    }, []),
  );

  async function loadEntries() {
    setLoading(true);
    try {
      const data = await getBodyComp(12);
      setEntries(data);
    } catch (err) {
      console.error("Failed to load body comp:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleNumpad(key: string) {
    const current = activeField === "weight" ? weightInput : muscleInput;
    const setter = activeField === "weight" ? setWeightInput : setMuscleInput;

    if (key === "⌫") {
      setter(current.slice(0, -1));
    } else if (key === "." && current.includes(".")) {
      return;
    } else {
      setter(current + key);
    }
  }

  async function handleSave() {
    if (!weightInput && !muscleInput) {
      setSaveError("Enter at least one value");
      return;
    }

    setSaveError("");
    setSaving(true);
    setSaveSuccess(false);

    try {
      await logBodyComp({
        weight_kg: weightInput ? parseFloat(weightInput) : undefined,
        muscle_mass_kg: muscleInput ? parseFloat(muscleInput) : undefined,
      });

      setSaveSuccess(true);
      setWeightInput("");
      setMuscleInput("");
      await loadEntries();

      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err: any) {
      setSaveError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const weightPoints = entries
    .filter((e) => e.weight_kg !== null)
    .map((e) => parseFloat(e.weight_kg!));

  const musclePoints = entries
    .filter((e) => e.muscle_mass_kg !== null)
    .map((e) => parseFloat(e.muscle_mass_kg!));

  const latestWeight =
    weightPoints.length > 0 ? weightPoints[weightPoints.length - 1] : null;
  const latestMuscle =
    musclePoints.length > 0 ? musclePoints[musclePoints.length - 1] : null;

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

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
            Progress · Body
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
            Body Comp
          </Text>
        </View>

        {/* entry card */}
        <View style={{ marginHorizontal: 20, marginTop: 14 }}>
          <Card pad={16}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
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
                Log · {today}
              </Text>
              {saveSuccess && (
                <Tag color={Colors.accent} bg={Colors.accentDim}>
                  ✓ Saved
                </Tag>
              )}
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              {/* weight */}
              <Pressable
                onPress={() => setActiveField("weight")}
                style={{
                  flex: 1,
                  backgroundColor: Colors.bg,
                  borderRadius: 12,
                  padding: 12,
                  borderWidth: 1,
                  borderColor:
                    activeField === "weight" ? Colors.accent : Colors.line2,
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
                      color: weightInput ? Colors.text : Colors.ter,
                      letterSpacing: -0.6,
                    }}
                  >
                    {weightInput || "—"}
                  </Text>
                  <Text
                    style={{ fontSize: 12, color: Colors.sec, marginBottom: 4 }}
                  >
                    kg
                  </Text>
                  {activeField === "weight" && (
                    <View
                      style={{
                        width: 1.5,
                        height: 24,
                        backgroundColor: Colors.accent,
                        marginLeft: 2,
                        marginBottom: 4,
                      }}
                    />
                  )}
                </View>
              </Pressable>

              {/* muscle mass */}
              <Pressable
                onPress={() => setActiveField("muscle")}
                style={{
                  flex: 1,
                  backgroundColor: Colors.bg,
                  borderRadius: 12,
                  padding: 12,
                  borderWidth: 1,
                  borderColor:
                    activeField === "muscle" ? Colors.accent : Colors.line2,
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
                      color: muscleInput ? Colors.text : Colors.ter,
                      letterSpacing: -0.6,
                    }}
                  >
                    {muscleInput || "—"}
                  </Text>
                  <Text
                    style={{ fontSize: 12, color: Colors.sec, marginBottom: 4 }}
                  >
                    kg
                  </Text>
                  {activeField === "muscle" && (
                    <View
                      style={{
                        width: 1.5,
                        height: 24,
                        backgroundColor: Colors.accent,
                        marginLeft: 2,
                        marginBottom: 4,
                      }}
                    />
                  )}
                </View>
              </Pressable>
            </View>

            {saveError ? (
              <Text style={{ fontSize: 12, color: Colors.warn, marginTop: 8 }}>
                {saveError}
              </Text>
            ) : null}

            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={{
                marginTop: 12,
                backgroundColor: Colors.text,
                borderRadius: 10,
                padding: 12,
                alignItems: "center",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text
                  style={{ fontSize: 14, fontWeight: "700", color: "#000" }}
                >
                  Save Entry
                </Text>
              )}
            </Pressable>
          </Card>
        </View>

        {/* numpad */}
        <Numpad onPress={handleNumpad} />

        {/* weight trend chart */}
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
                style={{ fontSize: 14, fontWeight: "600", color: Colors.text }}
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
                    style={{ fontSize: 10, color: Colors.ter, marginBottom: 2 }}
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
              <MiniChart
                points={weightPoints}
                color={Colors.text}
                height={88}
                label="12W"
              />
            )}
          </Card>
        </View>

        {/* muscle mass trend chart */}
        <View style={{ marginHorizontal: 20, marginTop: 10, marginBottom: 24 }}>
          <Card pad={14}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "flex-end",
              }}
            >
              <Text
                style={{ fontSize: 14, fontWeight: "600", color: Colors.text }}
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
                    style={{ fontSize: 10, color: Colors.ter, marginBottom: 2 }}
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
              <MiniChart
                points={musclePoints}
                color={Colors.accent}
                height={88}
                label="12W"
              />
            )}
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}
