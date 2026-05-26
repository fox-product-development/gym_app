// app/(tabs)/log.tsx
// Body Composition Log screen
// Saves real entries to the database and displays real trend data.
// Tapping any field opens a modal with a numpad to enter/update that field only.

import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Colors } from "../../constants/theme";
import {
  logBodyComp,
  getBodyComp,
  extractBodyCompFromImage,
} from "../../services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BodyCompEntry {
  id: number;
  weight_kg: string | null;
  muscle_mass_kg: string | null;
  body_fat_pct: string | null;
  logged_at: string;
}

type ActiveField = "weight" | "muscle" | "bodyfat";

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
    <View style={{ marginTop: 16 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
        {keys.map((k, i) => (
          <Pressable
            key={i}
            onPress={() => onPress(k)}
            style={{
              width: "30%",
              paddingVertical: 14,
              alignItems: "center",
              backgroundColor: Colors.card2,
              borderRadius: 8,
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
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function LogScreen() {
  // Displayed values (from today's DB entry if it exists)
  const [weightValue, setWeightValue] = useState<string>("");
  const [muscleValue, setMuscleValue] = useState<string>("");
  const [bodyFatValue, setBodyFatValue] = useState<string>("");

  // Modal state
  const [modalField, setModalField] = useState<ActiveField | null>(null);
  const [modalInput, setModalInput] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Photo extraction
  const [extracting, setExtracting] = useState(false);

  // Chart data
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
      const data: BodyCompEntry[] = await getBodyComp(12);
      setEntries(data);
      prepopulateToday(data);
    } catch (err) {
      console.error("Failed to load body comp:", err);
    } finally {
      setLoading(false);
    }
  }

  // Check if the most recent entry is from today and prepopulate fields
  function prepopulateToday(data: BodyCompEntry[]) {
    const todayStr = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    const todayEntry = data.find((e) => e.logged_at.slice(0, 10) === todayStr);

    if (todayEntry) {
      setWeightValue(
        todayEntry.weight_kg ? String(parseFloat(todayEntry.weight_kg)) : "",
      );
      setMuscleValue(
        todayEntry.muscle_mass_kg
          ? String(parseFloat(todayEntry.muscle_mass_kg))
          : "",
      );
      setBodyFatValue(
        todayEntry.body_fat_pct
          ? String(parseFloat(todayEntry.body_fat_pct))
          : "",
      );
    } else {
      setWeightValue("");
      setMuscleValue("");
      setBodyFatValue("");
    }
  }

  // Open modal for a given field
  function openModal(field: ActiveField) {
    setModalField(field);
    setModalInput("");
    setSaveError("");
  }

  function closeModal() {
    setModalField(null);
    setModalInput("");
    setSaveError("");
  }

  function handleNumpad(key: string) {
    if (key === "⌫") {
      setModalInput((prev) => prev.slice(0, -1));
    } else if (key === "." && modalInput.includes(".")) {
      return;
    } else {
      setModalInput((prev) => prev + key);
    }
  }

  async function handleModalSave() {
    if (!modalInput) {
      setSaveError("Enter a value");
      return;
    }

    setSaveError("");
    setSaving(true);

    const value = parseFloat(modalInput);

    try {
      await logBodyComp({
        weight_kg: modalField === "weight" ? value : undefined,
        muscle_mass_kg: modalField === "muscle" ? value : undefined,
        body_fat_pct: modalField === "bodyfat" ? value : undefined,
      });

      setSaveSuccess(true);
      closeModal();
      await loadEntries();
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err: any) {
      setSaveError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoLog() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
    });

    if (result.canceled || !result.assets?.[0]?.base64) return;

    const asset = result.assets[0];
    const base64 = asset.base64!;
    const mediaType = asset.mimeType ?? "image/jpeg";

    setExtracting(true);

    try {
      const extracted = await extractBodyCompFromImage(base64, mediaType);

      // Save all extracted fields in one call
      await logBodyComp({
        weight_kg: extracted.weight_kg ?? undefined,
        muscle_mass_kg: extracted.muscle_mass_kg ?? undefined,
        body_fat_pct: extracted.body_fat_pct ?? undefined,
        source: "image",
      });

      setSaveSuccess(true);
      await loadEntries();
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err: any) {
      console.error("Photo log error:", err);
    } finally {
      setExtracting(false);
    }
  }

  // Chart data derived from entries
  const weightPoints = entries
    .filter((e) => e.weight_kg !== null)
    .map((e) => parseFloat(e.weight_kg!));

  const musclePoints = entries
    .filter((e) => e.muscle_mass_kg !== null)
    .map((e) => parseFloat(e.muscle_mass_kg!));

  const bodyFatPoints = entries
    .filter((e) => e.body_fat_pct !== null)
    .map((e) => parseFloat(e.body_fat_pct!));

  const latestWeight =
    weightPoints.length > 0 ? weightPoints[weightPoints.length - 1] : null;
  const latestMuscle =
    musclePoints.length > 0 ? musclePoints[musclePoints.length - 1] : null;
  const latestBodyFat =
    bodyFatPoints.length > 0 ? bodyFatPoints[bodyFatPoints.length - 1] : null;

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  // Label for the modal header
  const modalLabel =
    modalField === "weight"
      ? "Weight (kg)"
      : modalField === "muscle"
        ? "Muscle Mass (kg)"
        : "Body Fat (%)";

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      {/* ── Modal ─────────────────────────────────────────────────────────── */}
      <Modal
        visible={modalField !== null}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "flex-end",
          }}
          onPress={closeModal}
        >
          {/* Stop tap-through on the inner card */}
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View
              style={{
                backgroundColor: Colors.card,
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                padding: 20,
                paddingBottom: 36,
                borderTopWidth: 0.5,
                borderColor: Colors.line,
              }}
            >
              {/* Modal header */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}
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
                  {modalLabel}
                </Text>
                <Pressable onPress={closeModal}>
                  <Text
                    style={{
                      fontFamily: "Courier",
                      fontSize: 11,
                      color: Colors.sec,
                      letterSpacing: 0.6,
                      textTransform: "uppercase",
                    }}
                  >
                    Cancel
                  </Text>
                </Pressable>
              </View>

              {/* Value display */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-end",
                  gap: 6,
                  marginBottom: 4,
                }}
              >
                <Text
                  style={{
                    fontSize: 48,
                    fontWeight: "700",
                    color: modalInput ? Colors.text : Colors.ter,
                    letterSpacing: -1,
                  }}
                >
                  {modalInput || "—"}
                </Text>
                <Text
                  style={{ fontSize: 16, color: Colors.sec, marginBottom: 10 }}
                >
                  {modalField === "bodyfat" ? "%" : "kg"}
                </Text>
              </View>

              {saveError ? (
                <Text
                  style={{ fontSize: 12, color: Colors.warn, marginBottom: 8 }}
                >
                  {saveError}
                </Text>
              ) : null}

              {/* Numpad */}
              <Numpad onPress={handleNumpad} />

              {/* Save button */}
              <Pressable
                onPress={handleModalSave}
                disabled={saving}
                style={{
                  marginTop: 16,
                  backgroundColor: Colors.text,
                  borderRadius: 10,
                  padding: 14,
                  alignItems: "center",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text
                    style={{ fontSize: 15, fontWeight: "700", color: "#000" }}
                  >
                    Save
                  </Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Main scroll content ───────────────────────────────────────────── */}
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
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

        {/* Entry card */}
        <View style={{ marginHorizontal: 20, marginTop: 14 }}>
          <Card pad={16}>
            {/* Card header row */}
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
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                {saveSuccess && (
                  <Tag color={Colors.accent} bg={Colors.accentDim}>
                    ✓ Saved
                  </Tag>
                )}
                {/* Log from photo button */}
                <Pressable
                  onPress={handlePhotoLog}
                  disabled={extracting}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    backgroundColor: Colors.card2,
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    opacity: extracting ? 0.6 : 1,
                  }}
                >
                  {extracting ? (
                    <ActivityIndicator color={Colors.accent} size="small" />
                  ) : (
                    <Text
                      style={{
                        fontFamily: "Courier",
                        fontSize: 10,
                        color: Colors.accent,
                        letterSpacing: 0.6,
                        textTransform: "uppercase",
                      }}
                    >
                      📷 From Photo
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>

            {/* Input fields row — weight and muscle mass */}
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
              {/* Weight */}
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
                    style={{ fontSize: 12, color: Colors.sec, marginBottom: 4 }}
                  >
                    kg
                  </Text>
                </View>
              </Pressable>

              {/* Muscle mass */}
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
                    style={{ fontSize: 12, color: Colors.sec, marginBottom: 4 }}
                  >
                    kg
                  </Text>
                </View>
              </Pressable>
            </View>

            {/* Body fat — full width below */}
            <Pressable
              onPress={() => openModal("bodyfat")}
              style={{
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

        {/* Weight trend chart */}
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

        {/* Muscle mass trend chart */}
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

        {/* Body fat trend chart */}
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
                    style={{ fontSize: 10, color: Colors.ter, marginBottom: 2 }}
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
              <MiniChart
                points={bodyFatPoints}
                color={Colors.warn}
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
