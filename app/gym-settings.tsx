// app/gym-settings.tsx
// Gym settings screen — manage gyms, equipment, plates, and exercises.

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
import { useFocusEffect, router } from "expo-router";
import { Colors } from "../constants/theme";
import {
  getGyms,
  createGym,
  updateGym,
  deleteGym,
  getEquipment,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  getPlates,
  createPlate,
  savePlates,
  deletePlate,
  getExercises,
  updateExercise,
  createExercise,
  deleteExercise,
  getExerciseMetadata,
  suggestExercises,
} from "../services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Gym {
  id: number;
  gym_name: string;
  is_default: boolean;
}

interface Equipment {
  id: number;
  equipment_name: string;
  type: string;
  unladen_weight_kg: string | null;
  increment_kg: string | null;
  max_weight_kg: string | null;
}

interface Plate {
  id: number;
  weight_kg: string;
  quantity: number;
}

// ─── Reusable primitives ─────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontFamily: "Courier",
        fontSize: 10,
        color: Colors.ter,
        letterSpacing: 0.8,
        textTransform: "uppercase",
        marginBottom: 8,
      }}
    >
      {children}
    </Text>
  );
}

function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <View
      style={{
        backgroundColor: Colors.card,
        borderRadius: 12,
        overflow: "hidden",
        borderWidth: 0.5,
        borderColor: Colors.line,
        ...style,
      }}
    >
      {children}
    </View>
  );
}

function AddButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        marginTop: 10,
        backgroundColor: "transparent",
        borderWidth: 1,
        borderColor: "rgba(255,119,99,0.3)",
        borderRadius: 12,
        padding: 13,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
      }}
    >
      <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.accent }}>
        + {label}
      </Text>
    </Pressable>
  );
}

// ─── Equipment type badge ─────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    loadable: { bg: Colors.accentDim, text: Colors.accent },
    fixed: { bg: "rgba(255,255,255,0.08)", text: Colors.sec },
    machine: { bg: "rgba(242,181,100,0.15)", text: Colors.warn },
    apparatus: { bg: "rgba(255,255,255,0.05)", text: Colors.ter },
  };
  const style = colors[type] || colors.apparatus;
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        backgroundColor: style.bg,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: "600",
          fontFamily: "Courier",
          color: style.text,
          textTransform: "capitalize",
        }}
      >
        {type}
      </Text>
    </View>
  );
}

// ─── Add equipment modal ──────────────────────────────────────────────────────

const EQUIPMENT_TYPES = ["loadable", "fixed", "machine", "apparatus"];

function AddEquipmentModal({
  visible,
  onClose,
  onSaved,
  gymId,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  gymId: number;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("loadable");
  const [unladenWeight, setUnladenWeight] = useState("");
  const [increment, setIncrement] = useState("");
  const [maxWeight, setMaxWeight] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handleClose() {
    setName("");
    setType("loadable");
    setUnladenWeight("");
    setIncrement("");
    setMaxWeight("");
    setError("");
    onClose();
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Equipment name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await createEquipment(gymId, {
        equipment_name: name.trim(),
        type,
        unladen_weight_kg: unladenWeight
          ? parseFloat(unladenWeight)
          : undefined,
        increment_kg: increment ? parseFloat(increment) : undefined,
        max_weight_kg: maxWeight ? parseFloat(maxWeight) : undefined,
      });
      onSaved();
      handleClose();
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    backgroundColor: Colors.bg,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 0.5,
    borderColor: Colors.line,
    marginBottom: 12,
  };

  const labelStyle = {
    fontFamily: "Courier",
    fontSize: 10,
    color: Colors.ter,
    letterSpacing: 0.6,
    textTransform: "uppercase" as const,
    marginBottom: 6,
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.7)",
          justifyContent: "flex-end",
        }}
        onPress={handleClose}
      >
        <Pressable
          style={{
            backgroundColor: Colors.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: "85%",
          }}
          onPress={() => {}}
        >
          <ScrollView
            contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                color: Colors.text,
                marginBottom: 20,
              }}
            >
              Add equipment
            </Text>

            <Text style={labelStyle}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Olympic barbell"
              placeholderTextColor={Colors.ter}
              style={inputStyle}
            />

            <Text style={labelStyle}>Type</Text>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                marginBottom: 12,
              }}
            >
              {EQUIPMENT_TYPES.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setType(t)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 8,
                    backgroundColor:
                      type === t ? Colors.accentDim : Colors.card2,
                    borderWidth: type === t ? 1 : 0,
                    borderColor: Colors.accent,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: type === t ? Colors.accent : Colors.sec,
                      fontWeight: type === t ? "600" : "400",
                      textTransform: "capitalize",
                    }}
                  >
                    {t}
                  </Text>
                </Pressable>
              ))}
            </View>

            {type === "loadable" && (
              <>
                <Text style={labelStyle}>Unladen weight (kg)</Text>
                <TextInput
                  value={unladenWeight}
                  onChangeText={setUnladenWeight}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 20"
                  placeholderTextColor={Colors.ter}
                  style={inputStyle}
                />
              </>
            )}

            {(type === "fixed" || type === "machine") && (
              <>
                <Text style={labelStyle}>Increment (kg)</Text>
                <TextInput
                  value={increment}
                  onChangeText={setIncrement}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 2.5"
                  placeholderTextColor={Colors.ter}
                  style={inputStyle}
                />
                <Text style={labelStyle}>Max weight (kg)</Text>
                <TextInput
                  value={maxWeight}
                  onChangeText={setMaxWeight}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 100"
                  placeholderTextColor={Colors.ter}
                  style={inputStyle}
                />
              </>
            )}

            {error ? (
              <Text
                style={{ fontSize: 13, color: Colors.warn, marginBottom: 12 }}
              >
                {error}
              </Text>
            ) : null}

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={handleClose}
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
                onPress={handleSave}
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
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Add plate modal ──────────────────────────────────────────────────────────

function AddPlateModal({
  visible,
  onClose,
  onSaved,
  gymId,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  gymId: number;
}) {
  const [weight, setWeight] = useState("");
  const [quantity, setQuantity] = useState("2");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handleClose() {
    setWeight("");
    setQuantity("2");
    setError("");
    onClose();
  }

  async function handleSave() {
    const w = parseFloat(weight);
    const q = parseInt(quantity);
    if (!w || w <= 0) {
      setError("Enter a valid plate weight");
      return;
    }
    if (!q || q < 0) {
      setError("Enter a valid quantity");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await createPlate(gymId, { weight_kg: w, quantity: q });
      onSaved();
      handleClose();
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    backgroundColor: Colors.bg,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 0.5,
    borderColor: Colors.line,
  };

  const labelStyle = {
    fontFamily: "Courier",
    fontSize: 10,
    color: Colors.ter,
    letterSpacing: 0.6,
    textTransform: "uppercase" as const,
    marginBottom: 6,
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.7)",
          justifyContent: "flex-end",
        }}
        onPress={handleClose}
      >
        <Pressable
          style={{
            backgroundColor: Colors.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 24,
            paddingBottom: 40,
          }}
          onPress={() => {}}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: "700",
              color: Colors.text,
              marginBottom: 20,
            }}
          >
            Add plate size
          </Text>
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={labelStyle}>Weight (kg)</Text>
              <TextInput
                value={weight}
                onChangeText={setWeight}
                keyboardType="decimal-pad"
                placeholder="e.g. 2.5"
                placeholderTextColor={Colors.ter}
                style={inputStyle}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={labelStyle}>Quantity</Text>
              <TextInput
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="numeric"
                placeholder="e.g. 4"
                placeholderTextColor={Colors.ter}
                style={inputStyle}
              />
            </View>
          </View>

          {error ? (
            <Text
              style={{ fontSize: 13, color: Colors.warn, marginBottom: 12 }}
            >
              {error}
            </Text>
          ) : null}

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={handleClose}
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
              onPress={handleSave}
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Add exercise modal ───────────────────────────────────────────────────────

function AddExerciseModal({
  visible,
  onClose,
  onSaved,
  gymId,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  gymId: number;
}) {
  const [step, setStep] = useState<"name" | "confirm">("name");
  const [exerciseName, setExerciseName] = useState("");
  const [metadata, setMetadata] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handleClose() {
    setStep("name");
    setExerciseName("");
    setMetadata(null);
    setError("");
    onClose();
  }

  async function handleLookup() {
    if (!exerciseName.trim()) {
      setError("Please enter an exercise name");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await getExerciseMetadata(exerciseName.trim());
      setMetadata(data);
      setStep("confirm");
    } catch (err: any) {
      setError(err.message || "Failed to look up exercise");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!metadata) return;
    setSaving(true);
    try {
      await createExercise(gymId, {
        exercise: exerciseName.trim(),
        muscles_primary: metadata.muscles_primary,
        muscles_secondary: metadata.muscles_secondary,
        type: metadata.type,
        sub_component: metadata.sub_component,
        emg_score: metadata.emg_score,
      });
      onSaved();
      handleClose();
    } catch (err: any) {
      setError(err.message || "Failed to save exercise");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    backgroundColor: Colors.bg,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 0.5,
    borderColor: Colors.line,
  };

  const labelStyle = {
    fontFamily: "Courier",
    fontSize: 10,
    color: Colors.ter,
    letterSpacing: 0.6,
    textTransform: "uppercase" as const,
    marginBottom: 6,
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.7)",
          justifyContent: "flex-end",
        }}
        onPress={handleClose}
      >
        <Pressable
          style={{
            backgroundColor: Colors.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 24,
            paddingBottom: 40,
          }}
          onPress={() => {}}
        >
          {step === "name" ? (
            <>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "700",
                  color: Colors.text,
                  marginBottom: 6,
                }}
              >
                Add exercise
              </Text>
              <Text
                style={{ fontSize: 13, color: Colors.sec, marginBottom: 20 }}
              >
                Enter the exercise name and the AI will fill in the details.
              </Text>

              <Text style={labelStyle}>Exercise name</Text>
              <TextInput
                value={exerciseName}
                onChangeText={setExerciseName}
                placeholder="e.g. Incline Dumbbell Press"
                placeholderTextColor={Colors.ter}
                style={{ ...inputStyle, marginBottom: 12 }}
                autoFocus
              />

              {error ? (
                <Text
                  style={{ fontSize: 13, color: Colors.warn, marginBottom: 12 }}
                >
                  {error}
                </Text>
              ) : null}

              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={handleClose}
                  style={{
                    flex: 1,
                    backgroundColor: Colors.card2,
                    borderRadius: 12,
                    padding: 14,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontSize: 15, color: Colors.sec }}>
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleLookup}
                  disabled={loading}
                  style={{
                    flex: 2,
                    backgroundColor: Colors.accent,
                    borderRadius: 12,
                    padding: 14,
                    alignItems: "center",
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  {loading ? (
                    <ActivityIndicator color={Colors.accentInk} />
                  ) : (
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: "700",
                        color: Colors.accentInk,
                      }}
                    >
                      Look up
                    </Text>
                  )}
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "700",
                  color: Colors.text,
                  marginBottom: 4,
                }}
              >
                {exerciseName}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: Colors.ter,
                  fontFamily: "Courier",
                  marginBottom: 20,
                }}
              >
                AI-generated metadata — review before saving
              </Text>

              <View
                style={{
                  backgroundColor: Colors.bg,
                  borderRadius: 12,
                  padding: 14,
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                {[
                  { label: "Primary muscle", value: metadata?.muscles_primary },
                  {
                    label: "Secondary",
                    value: metadata?.muscles_secondary || "None",
                  },
                  { label: "Type", value: metadata?.type },
                  { label: "Sub-component", value: metadata?.sub_component },
                ].map((row) => (
                  <View
                    key={row.label}
                    style={{ flexDirection: "row", alignItems: "center" }}
                  >
                    <Text
                      style={{
                        flex: 1,
                        fontSize: 12,
                        color: Colors.ter,
                        fontFamily: "Courier",
                        textTransform: "uppercase",
                        letterSpacing: 0.4,
                      }}
                    >
                      {row.label}
                    </Text>
                    <Text style={{ fontSize: 14, color: Colors.text }}>
                      {row.value}
                    </Text>
                  </View>
                ))}
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 12,
                      color: Colors.ter,
                      fontFamily: "Courier",
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                    }}
                  >
                    EMG score
                  </Text>
                  <EmgDots score={metadata?.emg_score || 0} />
                </View>
              </View>

              {error ? (
                <Text
                  style={{ fontSize: 13, color: Colors.warn, marginBottom: 12 }}
                >
                  {error}
                </Text>
              ) : null}

              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={() => setStep("name")}
                  style={{
                    flex: 1,
                    backgroundColor: Colors.card2,
                    borderRadius: 12,
                    padding: 14,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontSize: 15, color: Colors.sec }}>Back</Text>
                </Pressable>
                <Pressable
                  onPress={handleSave}
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
                      Save exercise
                    </Text>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Suggest exercises modal ──────────────────────────────────────────────────

interface SuggestedExercise {
  exercise: string;
  muscles_primary: string;
  muscles_secondary: string | null;
  type: string;
  sub_component: string | null;
  emg_score: number;
  equipment_type: string | null;
  selected: boolean;
}

function SuggestExercisesModal({
  visible,
  onClose,
  onSaved,
  gymId,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  gymId: number;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedExercise[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (visible) {
      loadSuggestions();
    }
  }, [visible]);

  async function loadSuggestions() {
    setLoading(true);
    setError("");
    setSuggestions([]);
    try {
      const data = await suggestExercises(gymId);
      setSuggestions(
        data.exercises.map((e: any) => ({ ...e, selected: true })),
      );
    } catch (err: any) {
      setError(err.message || "Failed to load suggestions");
    } finally {
      setLoading(false);
    }
  }

  function toggleSelected(index: number) {
    setSuggestions((prev) =>
      prev.map((e, i) => (i === index ? { ...e, selected: !e.selected } : e)),
    );
  }

  async function handleAddSelected() {
    const selected = suggestions.filter((e) => e.selected);
    if (selected.length === 0) return;
    setSaving(true);
    try {
      for (const ex of selected) {
        await createExercise(gymId, {
          exercise: ex.exercise,
          muscles_primary: ex.muscles_primary,
          muscles_secondary: ex.muscles_secondary || undefined,
          type: ex.type,
          sub_component: ex.sub_component || undefined,
          emg_score: ex.emg_score,
          equipment_type: ex.equipment_type || undefined,
        });
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save exercises");
    } finally {
      setSaving(false);
    }
  }

  // Group by type then muscle
  const compound = suggestions.filter((e) => e.type === "Compound");
  const isolation = suggestions.filter((e) => e.type === "Isolation");

  function renderGroup(
    title: string,
    list: SuggestedExercise[],
    offset: number,
  ) {
    const muscles = [...new Set(list.map((e) => e.muscles_primary))].sort();
    return (
      <View style={{ marginBottom: 16 }}>
        <Text
          style={{
            fontFamily: "Courier",
            fontSize: 10,
            color: Colors.accent,
            letterSpacing: 0.8,
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          {title}
        </Text>
        {muscles.map((muscle) => {
          const group = list.filter((e) => e.muscles_primary === muscle);
          return (
            <View key={muscle} style={{ marginBottom: 10 }}>
              <Text
                style={{
                  fontSize: 11,
                  color: Colors.ter,
                  fontFamily: "Courier",
                  marginBottom: 6,
                }}
              >
                {muscle}
              </Text>
              <View
                style={{
                  backgroundColor: Colors.card,
                  borderRadius: 12,
                  overflow: "hidden",
                  borderWidth: 0.5,
                  borderColor: Colors.line,
                }}
              >
                {group.map((ex, i) => {
                  const globalIndex = suggestions.indexOf(ex);
                  return (
                    <View key={ex.exercise}>
                      {i > 0 && (
                        <View
                          style={{ height: 0.5, backgroundColor: Colors.line }}
                        />
                      )}
                      <Pressable
                        onPress={() => toggleSelected(globalIndex)}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          padding: 12,
                          gap: 10,
                        }}
                      >
                        <View
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            backgroundColor: ex.selected
                              ? Colors.accentDim
                              : "transparent",
                            borderWidth: 1.5,
                            borderColor: ex.selected
                              ? Colors.accent
                              : "rgba(255,255,255,0.15)",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {ex.selected && (
                            <Text
                              style={{
                                fontSize: 12,
                                color: Colors.accent,
                                lineHeight: 14,
                              }}
                            >
                              ✓
                            </Text>
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              fontSize: 14,
                              color: ex.selected ? Colors.text : Colors.sec,
                              fontWeight: "500",
                            }}
                          >
                            {ex.exercise}
                          </Text>
                          {ex.sub_component && (
                            <Text
                              style={{
                                fontSize: 10,
                                color: Colors.ter,
                                fontFamily: "Courier",
                                marginTop: 2,
                              }}
                            >
                              {ex.sub_component}
                            </Text>
                          )}
                        </View>
                        <EmgDots score={ex.emg_score} />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>
    );
  }

  const selectedCount = suggestions.filter((e) => e.selected).length;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.7)",
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            backgroundColor: Colors.bg,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            height: "90%",
          }}
        >
          {/* Header */}
          <View
            style={{
              padding: 20,
              paddingBottom: 12,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{ fontSize: 18, fontWeight: "700", color: Colors.text }}
              >
                Suggested exercises
              </Text>
              <Text style={{ fontSize: 12, color: Colors.sec, marginTop: 2 }}>
                Based on your gym equipment
              </Text>
            </View>
            <Pressable onPress={onClose}>
              <Text style={{ fontSize: 22, color: Colors.ter }}>×</Text>
            </Pressable>
          </View>

          {/* Content */}
          {loading ? (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
              }}
            >
              <ActivityIndicator color={Colors.accent} size="large" />
              <Text
                style={{
                  fontSize: 13,
                  color: Colors.sec,
                  fontFamily: "Courier",
                }}
              >
                Generating suggestions...
              </Text>
            </View>
          ) : error ? (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                padding: 24,
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  color: Colors.warn,
                  textAlign: "center",
                }}
              >
                {error}
              </Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
            >
              {compound.length > 0 && renderGroup("Compound", compound, 0)}
              {isolation.length > 0 &&
                renderGroup("Isolation", isolation, compound.length)}
            </ScrollView>
          )}

          {/* Footer */}
          {!loading && suggestions.length > 0 && (
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
                gap: 8,
              }}
            >
              <Pressable
                onPress={handleAddSelected}
                disabled={saving || selectedCount === 0}
                style={{
                  backgroundColor:
                    selectedCount > 0 ? Colors.accent : Colors.card2,
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
                      color: selectedCount > 0 ? Colors.accentInk : Colors.ter,
                    }}
                  >
                    Add {selectedCount} exercise{selectedCount !== 1 ? "s" : ""}
                  </Text>
                )}
              </Pressable>
              <Pressable
                onPress={onClose}
                style={{ padding: 12, alignItems: "center" }}
              >
                <Text style={{ fontSize: 14, color: Colors.sec }}>Cancel</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Exercises tab ────────────────────────────────────────────────────────────
interface Exercise {
  id: number;
  exercise: string;
  muscles_primary: string;
  muscles_secondary: string | null;
  type: string;
  equipment_type: string | null;
  sub_component: string | null;
  emg_score: number;
  active: boolean;
}

function EmgDots({ score }: { score: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: 2,
            backgroundColor: i <= score ? Colors.accent : Colors.accentDim,
          }}
        />
      ))}
    </View>
  );
}

function DeleteExerciseModal({
  exercise,
  visible,
  step,
  onContinue,
  onConfirm,
  onCancel,
}: {
  exercise: Exercise | null;
  visible: boolean;
  step: 1 | 2;
  onContinue: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!exercise) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.7)",
          justifyContent: "flex-end",
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
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: "rgba(224,85,85,0.15)",
              alignItems: "center",
              justifyContent: "center",
              alignSelf: "center",
              marginBottom: 14,
            }}
          >
            <Text style={{ fontSize: 20 }}>🗑</Text>
          </View>

          {step === 1 ? (
            <>
              <Text
                style={{
                  fontSize: 17,
                  fontWeight: "700",
                  color: Colors.text,
                  textAlign: "center",
                  marginBottom: 8,
                }}
              >
                Remove exercise?
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: Colors.sec,
                  textAlign: "center",
                  lineHeight: 20,
                  marginBottom: 24,
                }}
              >
                This will permanently delete{" "}
                <Text style={{ color: Colors.text, fontWeight: "600" }}>
                  {exercise.exercise}
                </Text>{" "}
                and all its logged history. This cannot be undone.
              </Text>
              <View style={{ gap: 10 }}>
                <Pressable
                  onPress={onContinue}
                  style={{
                    backgroundColor: Colors.card2,
                    borderRadius: 12,
                    padding: 14,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "500",
                      color: Colors.text,
                    }}
                  >
                    Continue
                  </Text>
                </Pressable>
                <Pressable
                  onPress={onCancel}
                  style={{
                    backgroundColor: "transparent",
                    borderRadius: 12,
                    padding: 12,
                    alignItems: "center",
                    borderWidth: 0.5,
                    borderColor: Colors.line,
                  }}
                >
                  <Text style={{ fontSize: 14, color: Colors.sec }}>
                    Cancel
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text
                style={{
                  fontSize: 17,
                  fontWeight: "700",
                  color: Colors.text,
                  textAlign: "center",
                  marginBottom: 8,
                }}
              >
                Are you sure?
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: Colors.sec,
                  textAlign: "center",
                  lineHeight: 20,
                  marginBottom: 24,
                }}
              >
                This will delete{" "}
                <Text style={{ color: Colors.text, fontWeight: "600" }}>
                  {exercise.exercise}
                </Text>{" "}
                and all related data. Progress charts will no longer show any
                data for this exercise.
              </Text>
              <View style={{ gap: 10 }}>
                <Pressable
                  onPress={onConfirm}
                  style={{
                    backgroundColor: "#E05555",
                    borderRadius: 12,
                    padding: 14,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{ fontSize: 15, fontWeight: "700", color: "#fff" }}
                  >
                    Delete exercise and all data
                  </Text>
                </Pressable>
                <Pressable
                  onPress={onCancel}
                  style={{
                    backgroundColor: "transparent",
                    borderRadius: 12,
                    padding: 12,
                    alignItems: "center",
                    borderWidth: 0.5,
                    borderColor: Colors.line,
                  }}
                >
                  <Text style={{ fontSize: 14, color: Colors.sec }}>
                    Cancel
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function ExercisesTab({ gymId }: { gymId: number }) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [kebabOpen, setKebabOpen] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Exercise | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleting, setDeleting] = useState(false);
  const [addExerciseVisible, setAddExerciseVisible] = useState(false);
  const [suggestVisible, setSuggestVisible] = useState(false);

  useEffect(() => {
    loadExercises();
  }, [gymId]);

  async function loadExercises() {
    setLoading(true);
    try {
      const data = await getExercises(gymId);
      setExercises(data);
    } catch (err) {
      console.error("Failed to load exercises:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleActive(exercise: Exercise) {
    try {
      await updateExercise(gymId, exercise.id, { active: !exercise.active });
      setExercises((prev) =>
        prev.map((e) =>
          e.id === exercise.id ? { ...e, active: !e.active } : e,
        ),
      );
    } catch (err) {
      console.error("Failed to toggle active:", err);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteExercise(gymId, deleteTarget.id);
      setExercises((prev) => prev.filter((e) => e.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeleteStep(1);
    } catch (err) {
      console.error("Failed to delete exercise:", err);
    } finally {
      setDeleting(false);
    }
  }

  // Group by type then muscle
  const compound = exercises.filter((e) => e.type === "Compound");
  const isolation = exercises.filter((e) => e.type === "Isolation");

  function groupByMuscle(list: Exercise[]) {
    return list.reduce(
      (acc, ex) => {
        const key = ex.muscles_primary;
        if (!acc[key]) acc[key] = [];
        acc[key].push(ex);
        return acc;
      },
      {} as Record<string, Exercise[]>,
    );
  }

  function renderGroup(title: string, list: Exercise[]) {
    const grouped = groupByMuscle(list);
    const muscles = Object.keys(grouped).sort();

    return (
      <View style={{ marginBottom: 16 }}>
        <SectionLabel>{title}</SectionLabel>
        {muscles.map((muscle) => (
          <View key={muscle} style={{ marginBottom: 10 }}>
            <Text
              style={{
                fontSize: 11,
                color: Colors.ter,
                fontFamily: "Courier",
                marginBottom: 6,
                paddingLeft: 2,
              }}
            >
              {muscle}
            </Text>
            <View
              style={{
                backgroundColor: Colors.card,
                borderRadius: 12,
                borderWidth: 0.5,
                borderColor: Colors.line,
              }}
            >
              {grouped[muscle].map((ex, i) => (
                <View key={ex.id}>
                  {i > 0 && (
                    <View
                      style={{ height: 0.5, backgroundColor: Colors.line }}
                    />
                  )}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      padding: 12,
                      gap: 10,
                    }}
                  >
                    {/* Checkbox */}
                    <Pressable
                      onPress={() => handleToggleActive(ex)}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        backgroundColor: ex.active
                          ? Colors.accentDim
                          : "transparent",
                        borderWidth: 1.5,
                        borderColor: ex.active
                          ? Colors.accent
                          : "rgba(255,255,255,0.15)",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {ex.active && (
                        <Text
                          style={{
                            fontSize: 12,
                            color: Colors.accent,
                            lineHeight: 14,
                          }}
                        >
                          ✓
                        </Text>
                      )}
                    </Pressable>

                    {/* Name and meta */}
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 14,
                          color: ex.active ? Colors.text : Colors.sec,
                          fontWeight: "500",
                        }}
                      >
                        {ex.exercise}
                      </Text>
                      {ex.sub_component && (
                        <Text
                          style={{
                            fontSize: 10,
                            color: Colors.ter,
                            fontFamily: "Courier",
                            marginTop: 2,
                          }}
                        >
                          {ex.sub_component}
                        </Text>
                      )}
                    </View>

                    {/* EMG dots */}
                    <View style={{ alignItems: "flex-end", gap: 3 }}>
                      <Text
                        style={{
                          fontSize: 9,
                          color: Colors.ter,
                          fontFamily: "Courier",
                        }}
                      >
                        EMG
                      </Text>
                      <EmgDots score={ex.emg_score} />
                    </View>

                    {/* Kebab */}
                    <View style={{ position: "relative" }}>
                      <Pressable
                        onPress={() =>
                          setKebabOpen(kebabOpen === ex.id ? null : ex.id)
                        }
                        style={{ padding: 4 }}
                      >
                        <Text style={{ fontSize: 18, color: Colors.ter }}>
                          ⋮
                        </Text>
                      </Pressable>

                      {kebabOpen === ex.id && (
                        <View
                          style={{
                            position: "absolute",
                            right: 0,
                            top: 28,
                            backgroundColor: Colors.card2,
                            borderRadius: 10,
                            borderWidth: 0.5,
                            borderColor: Colors.line,
                            overflow: "hidden",
                            minWidth: 140,
                            zIndex: 20,
                          }}
                        >
                          <Pressable
                            onPress={() => {
                              setKebabOpen(null);
                            }}
                            style={{
                              padding: 13,
                              borderBottomWidth: 0.5,
                              borderBottomColor: Colors.line,
                            }}
                          >
                            <Text style={{ fontSize: 14, color: Colors.text }}>
                              Edit
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => {
                              setKebabOpen(null);
                              setDeleteTarget(ex);
                              setDeleteStep(1);
                            }}
                            style={{ padding: 13 }}
                          >
                            <Text style={{ fontSize: 14, color: "#E05555" }}>
                              Remove
                            </Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    );
  }

  if (loading) {
    return (
      <ActivityIndicator color={Colors.accent} style={{ marginTop: 40 }} />
    );
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        onScrollBeginDrag={() => setKebabOpen(null)}
      >
        {compound.length > 0 && renderGroup("Compound", compound)}
        {isolation.length > 0 && renderGroup("Isolation", isolation)}

        <AddButton
          label="Add exercise"
          onPress={() => setAddExerciseVisible(true)}
        />
        <AddButton
          label="Suggest exercises"
          onPress={() => setSuggestVisible(true)}
        />
      </ScrollView>

      <AddExerciseModal
        visible={addExerciseVisible}
        onClose={() => setAddExerciseVisible(false)}
        onSaved={loadExercises}
        gymId={gymId}
      />

      <SuggestExercisesModal
        visible={suggestVisible}
        onClose={() => setSuggestVisible(false)}
        onSaved={loadExercises}
        gymId={gymId}
      />

      <DeleteExerciseModal
        exercise={deleteTarget}
        visible={deleteTarget !== null}
        step={deleteStep}
        onContinue={() => setDeleteStep(2)}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteStep(1);
        }}
      />
    </>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
// ─── Edit equipment modal ─────────────────────────────────────────────────────

function EditEquipmentModal({
  visible,
  equipment,
  onClose,
  onSaved,
  gymId,
}: {
  visible: boolean;
  equipment: Equipment | null;
  onClose: () => void;
  onSaved: () => void;
  gymId: number;
}) {
  const [name, setName] = useState("");
  const [increment, setIncrement] = useState("");
  const [maxWeight, setMaxWeight] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (equipment) {
      setName(equipment.equipment_name);
      setIncrement(
        equipment.increment_kg
          ? String(parseFloat(equipment.increment_kg))
          : "",
      );
      setMaxWeight(
        equipment.max_weight_kg
          ? String(parseFloat(equipment.max_weight_kg))
          : "",
      );
      setError("");
    }
  }, [equipment]);

  function handleClose() {
    setError("");
    onClose();
  }

  async function handleSave() {
    if (!equipment) return;
    setSaving(true);
    setError("");
    try {
      await updateEquipment(gymId, equipment.id, {
        equipment_name: name.trim() || undefined,
        increment_kg: increment ? parseFloat(increment) : undefined,
        max_weight_kg: maxWeight ? parseFloat(maxWeight) : undefined,
      });
      onSaved();
      handleClose();
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    backgroundColor: Colors.bg,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 0.5,
    borderColor: Colors.line,
    marginBottom: 12,
  };

  const labelStyle = {
    fontFamily: "Courier",
    fontSize: 10,
    color: Colors.ter,
    letterSpacing: 0.6,
    textTransform: "uppercase" as const,
    marginBottom: 6,
  };

  const showIncrementFields =
    equipment?.type === "fixed" || equipment?.type === "machine";

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.7)",
          justifyContent: "flex-end",
        }}
        onPress={handleClose}
      >
        <Pressable
          style={{
            backgroundColor: Colors.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: "85%",
          }}
          onPress={() => {}}
        >
          <ScrollView
            contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                color: Colors.text,
                marginBottom: 4,
              }}
            >
              Edit equipment
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: Colors.ter,
                fontFamily: "Courier",
                marginBottom: 20,
              }}
            >
              {equipment?.type?.toUpperCase()}
            </Text>

            <Text style={labelStyle}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholderTextColor={Colors.ter}
              style={inputStyle}
            />

            {showIncrementFields && (
              <>
                <Text style={labelStyle}>Increment (kg)</Text>
                <TextInput
                  value={increment}
                  onChangeText={setIncrement}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 2.5"
                  placeholderTextColor={Colors.ter}
                  style={inputStyle}
                />
                <Text style={labelStyle}>Max weight (kg)</Text>
                <TextInput
                  value={maxWeight}
                  onChangeText={setMaxWeight}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 100"
                  placeholderTextColor={Colors.ter}
                  style={inputStyle}
                />
              </>
            )}

            {error ? (
              <Text
                style={{ fontSize: 13, color: Colors.warn, marginBottom: 12 }}
              >
                {error}
              </Text>
            ) : null}

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={handleClose}
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
                onPress={handleSave}
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
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function GymSettingsScreen() {
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [selectedGym, setSelectedGym] = useState<Gym | null>(null);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [plates, setPlates] = useState<Plate[]>([]);
  const [localPlates, setLocalPlates] = useState<Plate[]>([]);
  const [hasPlateChanges, setHasPlateChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<"equipment" | "exercises">(
    "equipment",
  );
  const [loading, setLoading] = useState(true);
  const [gymDropdownOpen, setGymDropdownOpen] = useState(false);
  const [addEquipmentVisible, setAddEquipmentVisible] = useState(false);
  const [addPlateVisible, setAddPlateVisible] = useState(false);
  const [savingPlates, setSavingPlates] = useState(false);
  const [addGymVisible, setAddGymVisible] = useState(false);
  const [newGymName, setNewGymName] = useState("");
  const [addGymSaving, setAddGymSaving] = useState(false);
  const [editEquipmentTarget, setEditEquipmentTarget] =
    useState<Equipment | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadGyms();
    }, []),
  );

  async function loadGyms() {
    setLoading(true);
    try {
      const data = await getGyms();
      setGyms(data);
      const defaultGym = data.find((g: Gym) => g.is_default) || data[0];
      if (defaultGym) {
        setSelectedGym(defaultGym);
        await loadGymData(defaultGym.id);
      }
    } catch (err) {
      console.error("Failed to load gyms:", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadGymData(gymId: number) {
    try {
      const [equipmentData, plateData] = await Promise.all([
        getEquipment(gymId),
        getPlates(gymId),
      ]);
      setEquipment(equipmentData);
      setPlates(plateData);
      setLocalPlates(plateData.map((p: Plate) => ({ ...p })));
      setHasPlateChanges(false);
    } catch (err) {
      console.error("Failed to load gym data:", err);
    }
  }

  async function handleGymSelect(gym: Gym) {
    setSelectedGym(gym);
    setGymDropdownOpen(false);
    setHasPlateChanges(false);
    await loadGymData(gym.id);
  }

  async function handleAddGym() {
    if (!newGymName.trim()) return;
    setAddGymSaving(true);
    try {
      const result = await createGym({ gym_name: newGymName.trim() });
      setGyms((prev) => [...prev, result]);
      setNewGymName("");
      setAddGymVisible(false);
    } catch (err) {
      console.error("Failed to create gym:", err);
    } finally {
      setAddGymSaving(false);
    }
  }

  function handlePlateQtyChange(id: number, delta: number) {
    setLocalPlates((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, quantity: Math.max(0, p.quantity + delta) } : p,
      ),
    );
    setHasPlateChanges(true);
  }

  async function handleSavePlates() {
    if (!selectedGym) return;
    setSavingPlates(true);
    try {
      await savePlates(
        selectedGym.id,
        localPlates.map((p) => ({ id: p.id, quantity: p.quantity })),
      );
      setPlates(localPlates.map((p) => ({ ...p })));
      setHasPlateChanges(false);
    } catch (err) {
      console.error("Failed to save plates:", err);
    } finally {
      setSavingPlates(false);
    }
  }

  function handleDiscardPlates() {
    setLocalPlates(plates.map((p) => ({ ...p })));
    setHasPlateChanges(false);
  }

  async function handleDeleteEquipment(id: number) {
    if (!selectedGym) return;
    try {
      await deleteEquipment(selectedGym.id, id);
      setEquipment((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      console.error("Failed to delete equipment:", err);
    }
  }

  async function handleDeletePlate(id: number) {
    if (!selectedGym) return;
    try {
      await deletePlate(selectedGym.id, id);
      setPlates((prev) => prev.filter((p) => p.id !== id));
      setLocalPlates((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error("Failed to delete plate:", err);
    }
  }

  const apparatus = equipment.filter((e) => e.type === "apparatus");
  const nonApparatus = equipment.filter((e) => e.type !== "apparatus");

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      {/* Header */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 56,
          paddingBottom: 8,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Pressable onPress={() => router.back()}>
          <Text style={{ fontSize: 16, color: Colors.accent }}>‹ Back</Text>
        </Pressable>
        <Text
          style={{
            fontSize: 22,
            fontWeight: "700",
            color: Colors.text,
            letterSpacing: -0.4,
            flex: 1,
          }}
        >
          Gym Settings
        </Text>
        <Pressable onPress={() => setAddGymVisible(true)}>
          <Text style={{ fontSize: 22, color: Colors.accent, lineHeight: 26 }}>
            +
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.accent} style={{ marginTop: 60 }} />
      ) : (
        <>
          {/* Gym dropdown */}
          <View
            style={{
              marginHorizontal: 20,
              marginTop: 4,
              position: "relative",
              zIndex: 10,
            }}
          >
            <Pressable
              onPress={() => setGymDropdownOpen((o) => !o)}
              style={{
                backgroundColor: Colors.card,
                borderRadius: 10,
                padding: 12,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                borderWidth: 0.5,
                borderColor: Colors.line,
              }}
            >
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "500",
                  color: Colors.accent,
                }}
              >
                {selectedGym?.gym_name || "Select gym"}
              </Text>
              <Text style={{ color: Colors.ter, fontSize: 12 }}>
                {gymDropdownOpen ? "▲" : "▼"}
              </Text>
            </Pressable>

            {gymDropdownOpen && (
              <View
                style={{
                  position: "absolute",
                  top: 48,
                  left: 0,
                  right: 0,
                  backgroundColor: Colors.card2,
                  borderRadius: 10,
                  borderWidth: 0.5,
                  borderColor: Colors.line,
                  overflow: "hidden",
                }}
              >
                {gyms.map((gym, i) => (
                  <View key={gym.id}>
                    {i > 0 && (
                      <View
                        style={{ height: 0.5, backgroundColor: Colors.line }}
                      />
                    )}
                    <Pressable
                      onPress={() => handleGymSelect(gym)}
                      style={{
                        padding: 14,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <Text
                        style={{
                          flex: 1,
                          fontSize: 14,
                          color:
                            selectedGym?.id === gym.id
                              ? Colors.accent
                              : Colors.text,
                        }}
                      >
                        {gym.gym_name}
                      </Text>
                      {gym.is_default && (
                        <Text
                          style={{
                            fontSize: 10,
                            fontFamily: "Courier",
                            color: Colors.ter,
                          }}
                        >
                          Default
                        </Text>
                      )}
                      {selectedGym?.id === gym.id && (
                        <Text style={{ color: Colors.accent }}>✓</Text>
                      )}
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Tabs */}
          <View
            style={{
              flexDirection: "row",
              marginHorizontal: 20,
              marginTop: 12,
              backgroundColor: Colors.card,
              borderRadius: 10,
              padding: 3,
              gap: 3,
            }}
          >
            {(["equipment", "exercises"] as const).map((tab) => (
              <Pressable
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 8,
                  alignItems: "center",
                  backgroundColor:
                    activeTab === tab ? Colors.card2 : "transparent",
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "500",
                    color: activeTab === tab ? Colors.text : Colors.sec,
                    textTransform: "capitalize",
                  }}
                >
                  {tab}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Equipment tab */}
          {activeTab === "equipment" && selectedGym && (
            <ScrollView
              contentContainerStyle={{
                padding: 20,
                paddingBottom: hasPlateChanges ? 120 : 40,
              }}
            >
              {/* Apparatus */}
              {apparatus.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <SectionLabel>Apparatus</SectionLabel>
                  <Card>
                    {apparatus.map((item, i) => (
                      <View key={item.id}>
                        {i > 0 && (
                          <View
                            style={{
                              height: 0.5,
                              backgroundColor: Colors.line,
                            }}
                          />
                        )}
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            padding: 12,
                            gap: 8,
                          }}
                        >
                          <Text
                            style={{
                              flex: 1,
                              fontSize: 14,
                              color: Colors.text,
                            }}
                          >
                            {item.equipment_name}
                          </Text>
                          <TypeBadge type={item.type} />
                          <Pressable
                            onPress={() => setEditEquipmentTarget(item)}
                          >
                            <Text
                              style={{
                                fontSize: 13,
                                color: Colors.accent,
                                paddingLeft: 8,
                              }}
                            >
                              Edit
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => handleDeleteEquipment(item.id)}
                          >
                            <Text
                              style={{
                                fontSize: 18,
                                color: Colors.ter,
                                paddingLeft: 8,
                              }}
                            >
                              ×
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </Card>
                </View>
              )}

              {/* Equipment */}
              {nonApparatus.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <SectionLabel>Equipment</SectionLabel>
                  <Card>
                    {nonApparatus.map((item, i) => (
                      <View key={item.id}>
                        {i > 0 && (
                          <View
                            style={{
                              height: 0.5,
                              backgroundColor: Colors.line,
                            }}
                          />
                        )}
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            padding: 12,
                            gap: 8,
                          }}
                        >
                          <Text
                            style={{
                              flex: 1,
                              fontSize: 14,
                              color: Colors.text,
                            }}
                          >
                            {item.equipment_name}
                          </Text>
                          <TypeBadge type={item.type} />
                          {item.unladen_weight_kg && (
                            <Text
                              style={{
                                fontSize: 12,
                                color: Colors.sec,
                                fontFamily: "Courier",
                              }}
                            >
                              {parseFloat(item.unladen_weight_kg)}kg
                            </Text>
                          )}
                          {item.increment_kg && (
                            <Text
                              style={{
                                fontSize: 12,
                                color: Colors.sec,
                                fontFamily: "Courier",
                              }}
                            >
                              +{parseFloat(item.increment_kg)}kg
                            </Text>
                          )}
                          <Pressable
                            onPress={() => setEditEquipmentTarget(item)}
                          >
                            <Text
                              style={{
                                fontSize: 13,
                                color: Colors.accent,
                                paddingLeft: 8,
                              }}
                            >
                              Edit
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => handleDeleteEquipment(item.id)}
                          >
                            <Text
                              style={{
                                fontSize: 18,
                                color: Colors.ter,
                                paddingLeft: 8,
                              }}
                            >
                              ×
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </Card>
                </View>
              )}

              <AddButton
                label="Add equipment"
                onPress={() => setAddEquipmentVisible(true)}
              />

              {/* Plates */}
              <View style={{ marginTop: 20 }}>
                <SectionLabel>Plates</SectionLabel>
                {localPlates.length > 0 ? (
                  <Card>
                    {localPlates.map((plate, i) => (
                      <View key={plate.id}>
                        {i > 0 && (
                          <View
                            style={{
                              height: 0.5,
                              backgroundColor: Colors.line,
                            }}
                          />
                        )}
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            padding: 12,
                            gap: 12,
                          }}
                        >
                          <Text
                            style={{
                              flex: 1,
                              fontSize: 14,
                              fontWeight: "500",
                              color: Colors.text,
                              fontFamily: "Courier",
                            }}
                          >
                            {parseFloat(plate.weight_kg)}kg
                          </Text>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 12,
                            }}
                          >
                            <Pressable
                              onPress={() => handlePlateQtyChange(plate.id, -1)}
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 8,
                                backgroundColor: Colors.card2,
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Text
                                style={{ fontSize: 16, color: Colors.accent }}
                              >
                                −
                              </Text>
                            </Pressable>
                            <Text
                              style={{
                                fontSize: 14,
                                color: Colors.text,
                                fontFamily: "Courier",
                                minWidth: 20,
                                textAlign: "center",
                              }}
                            >
                              {plate.quantity}
                            </Text>
                            <Pressable
                              onPress={() => handlePlateQtyChange(plate.id, 1)}
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 8,
                                backgroundColor: Colors.card2,
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Text
                                style={{ fontSize: 16, color: Colors.accent }}
                              >
                                +
                              </Text>
                            </Pressable>
                          </View>
                          <Pressable
                            onPress={() => handleDeletePlate(plate.id)}
                          >
                            <Text style={{ fontSize: 18, color: Colors.ter }}>
                              ×
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </Card>
                ) : (
                  <Text
                    style={{ fontSize: 13, color: Colors.ter, marginBottom: 8 }}
                  >
                    No plates added yet
                  </Text>
                )}
                <AddButton
                  label="Add plate size"
                  onPress={() => setAddPlateVisible(true)}
                />
              </View>
            </ScrollView>
          )}

          {/* Exercises tab */}
          {activeTab === "exercises" && selectedGym && (
            <ExercisesTab gymId={selectedGym.id} />
          )}

          {/* Save bar for plates */}
          {hasPlateChanges && (
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
                gap: 8,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 4,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Courier",
                    fontSize: 11,
                    color: Colors.warn,
                  }}
                >
                  Unsaved changes
                </Text>
              </View>
              <Pressable
                onPress={handleSavePlates}
                disabled={savingPlates}
                style={{
                  backgroundColor: Colors.accent,
                  borderRadius: 12,
                  padding: 14,
                  alignItems: "center",
                  opacity: savingPlates ? 0.7 : 1,
                }}
              >
                {savingPlates ? (
                  <ActivityIndicator color={Colors.accentInk} />
                ) : (
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: Colors.accentInk,
                    }}
                  >
                    Save changes
                  </Text>
                )}
              </Pressable>
              <Pressable
                onPress={handleDiscardPlates}
                style={{
                  backgroundColor: "transparent",
                  borderRadius: 12,
                  padding: 12,
                  alignItems: "center",
                  borderWidth: 0.5,
                  borderColor: Colors.line,
                }}
              >
                <Text style={{ fontSize: 14, color: Colors.sec }}>Discard</Text>
              </Pressable>
            </View>
          )}
        </>
      )}

      {/* Add gym modal */}
      <Modal visible={addGymVisible} transparent animationType="slide">
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.7)",
            justifyContent: "flex-end",
          }}
          onPress={() => setAddGymVisible(false)}
        >
          <Pressable
            style={{
              backgroundColor: Colors.card,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: 40,
            }}
            onPress={() => {}}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                color: Colors.text,
                marginBottom: 16,
              }}
            >
              Add gym
            </Text>
            <TextInput
              value={newGymName}
              onChangeText={setNewGymName}
              placeholder="e.g. Home Gym"
              placeholderTextColor={Colors.ter}
              style={{
                backgroundColor: Colors.bg,
                borderRadius: 10,
                padding: 14,
                fontSize: 15,
                color: Colors.text,
                borderWidth: 0.5,
                borderColor: Colors.line,
                marginBottom: 16,
              }}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => setAddGymVisible(false)}
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
                onPress={handleAddGym}
                disabled={addGymSaving}
                style={{
                  flex: 2,
                  backgroundColor: Colors.accent,
                  borderRadius: 12,
                  padding: 14,
                  alignItems: "center",
                  opacity: addGymSaving ? 0.7 : 1,
                }}
              >
                {addGymSaving ? (
                  <ActivityIndicator color={Colors.accentInk} />
                ) : (
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: Colors.accentInk,
                    }}
                  >
                    Add gym
                  </Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add equipment modal */}
      {selectedGym && (
        <AddEquipmentModal
          visible={addEquipmentVisible}
          onClose={() => setAddEquipmentVisible(false)}
          onSaved={() => loadGymData(selectedGym.id)}
          gymId={selectedGym.id}
        />
      )}

      {/* Edit equipment modal */}
      {selectedGym && (
        <EditEquipmentModal
          visible={editEquipmentTarget !== null}
          equipment={editEquipmentTarget}
          onClose={() => setEditEquipmentTarget(null)}
          onSaved={() => {
            loadGymData(selectedGym.id);
            setEditEquipmentTarget(null);
          }}
          gymId={selectedGym.id}
        />
      )}

      {/* Add plate modal */}
      {selectedGym && (
        <AddPlateModal
          visible={addPlateVisible}
          onClose={() => setAddPlateVisible(false)}
          onSaved={() => loadGymData(selectedGym.id)}
          gymId={selectedGym.id}
        />
      )}
    </View>
  );
}
