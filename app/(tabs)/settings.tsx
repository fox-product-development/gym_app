// app/(tabs)/settings.tsx
// Settings screen — phase info, agent tone, gym settings link, admin section.

import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
  TextInput,
  Modal,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import { Colors } from "../../constants/theme";
import {
  getProfile,
  clearToken,
  updateAgentTone,
  getApprovedEmails,
  addApprovedEmail,
  deleteApprovedEmail,
  replanSessions,
} from "../../services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserProfile {
  id: number;
  username: string;
  email: string;
  is_admin: boolean;
  current_phase: string;
  current_block: number;
  phase_week: number;
  phase_start_date: string;
  agent_tone: string;
  goal_size: number;
  goal_strength: number;
  goal_definition: number;
  goal_fitness: number;
  training_level: string;
  weekly_sessions: number;
  weight_exercises_per_session: number;
  conditioning_exercises_per_session: number;
}

interface ApprovedEmail {
  id: number;
  email: string;
  used: boolean;
  added_at: string;
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

function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontFamily: "Courier",
        fontSize: 10,
        color: Colors.ter,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        marginBottom: 10,
        paddingLeft: 4,
      }}
    >
      {children}
    </Text>
  );
}

function SettingRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", padding: 14 }}
    >
      <Text style={{ flex: 1, fontSize: 15, color: Colors.text }}>{label}</Text>
      {value && (
        <Text style={{ fontSize: 13, color: Colors.sec, marginRight: 8 }}>
          {value}
        </Text>
      )}
      {onPress && <Text style={{ color: Colors.qua, fontSize: 14 }}>›</Text>}
    </Pressable>
  );
}

// ─── Phase display ────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<string, string> = {
  anatomical_adaptation: "Anatomical Adaptation",
  hypertrophy: "Hypertrophy",
  maximum_strength: "Maximum Strength",
  muscle_definition: "Muscle Definition",
  rest: "Rest Week",
};

const PHASE_DESCRIPTIONS: Record<string, string> = {
  anatomical_adaptation: "Joint & tendon conditioning — 20 reps, 3 sets",
  hypertrophy: "Muscle growth — 12 reps, 4 sets, 70–80% 1RM",
  maximum_strength: "Neural strength — 6 reps, 4 sets, 85–95% 1RM",
  muscle_definition: "Metabolic endurance — 40 reps, 1 set",
  rest: "Active recovery — light compound work only",
};

const PHASE_ORDER = [
  "anatomical_adaptation",
  "hypertrophy",
  "maximum_strength",
  "muscle_definition",
];

function PhaseDisplay({ profile }: { profile: UserProfile }) {
  const currentIndex = PHASE_ORDER.indexOf(profile.current_phase);
  const nextPhase =
    profile.current_phase === "rest"
      ? null
      : PHASE_ORDER[(currentIndex + 1) % PHASE_ORDER.length];

  return (
    <View style={{ marginHorizontal: 20, marginTop: 20 }}>
      <SectionLabel>Current Phase</SectionLabel>
      <Card pad={0}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            padding: 14,
            backgroundColor: Colors.accentDim,
            borderRadius: 15,
          }}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              backgroundColor: Colors.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                backgroundColor: Colors.accentInk,
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{ fontSize: 15, fontWeight: "600", color: Colors.accent }}
            >
              {PHASE_LABELS[profile.current_phase] || profile.current_phase}
            </Text>
            <Text style={{ fontSize: 12, color: Colors.ter, marginTop: 2 }}>
              {PHASE_DESCRIPTIONS[profile.current_phase]}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <Tag color={Colors.accent}>Week {profile.phase_week}</Tag>
            <Tag color={Colors.ter}>Block {profile.current_block}</Tag>
          </View>
        </View>

        <Divider />

        <View style={{ padding: 14 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: 8,
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
              PHASE PROGRESS
            </Text>
            <Text
              style={{ fontFamily: "Courier", fontSize: 10, color: Colors.ter }}
            >
              {profile.phase_week} / 6
            </Text>
          </View>
          <View
            style={{
              height: 4,
              borderRadius: 2,
              backgroundColor: Colors.line2,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${(profile.phase_week / 6) * 100}%`,
                height: "100%",
                backgroundColor: Colors.accent,
                borderRadius: 2,
              }}
            />
          </View>
          {nextPhase && (
            <Text
              style={{
                fontFamily: "Courier",
                fontSize: 10,
                color: Colors.ter,
                marginTop: 8,
              }}
            >
              NEXT → {PHASE_LABELS[nextPhase]}
            </Text>
          )}
        </View>
      </Card>
    </View>
  );
}

// ─── Agent tone selector ──────────────────────────────────────────────────────

const TONES = [
  {
    key: "motivational",
    label: "Motivational",
    desc: "Encouraging, celebratory",
  },
  { key: "coaching", label: "Coaching", desc: "Explains the why" },
  { key: "neutral", label: "Neutral", desc: "Factual, no fluff" },
  {
    key: "drill_sergeant",
    label: "Drill Sergeant",
    desc: "Direct, high expectations",
  },
];

function AgentToneSelector({
  currentTone,
  onChange,
}: {
  currentTone: string;
  onChange: (tone: string) => void;
}) {
  return (
    <View style={{ marginHorizontal: 20, marginTop: 24 }}>
      <SectionLabel>Agent Tone</SectionLabel>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {TONES.map((tone) => (
          <Pressable
            key={tone.key}
            onPress={() => onChange(tone.key)}
            style={{
              width: "47%",
              backgroundColor: Colors.card,
              borderRadius: 12,
              padding: 14,
              borderWidth: 1.5,
              borderColor:
                currentTone === tone.key ? Colors.accent : "transparent",
            }}
          >
            <Text
              style={{ fontSize: 14, fontWeight: "500", color: Colors.text }}
            >
              {tone.label}
            </Text>
            <Text
              style={{
                fontFamily: "Courier",
                fontSize: 10,
                color: Colors.ter,
                marginTop: 4,
              }}
            >
              {tone.desc}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ─── Admin section ────────────────────────────────────────────────────────────

function AdminSection() {
  const [emails, setEmails] = useState<ApprovedEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useCallback(() => {
    loadEmails();
  }, []);

  useState(() => {
    loadEmails();
  });

  async function loadEmails() {
    try {
      const data = await getApprovedEmails();
      setEmails(data);
    } catch (err) {
      console.error("Failed to load approved emails:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (!newEmail.trim()) return;
    setSaving(true);
    setError("");
    try {
      const result = await addApprovedEmail(newEmail.trim());
      setEmails((prev) => [result, ...prev]);
      setNewEmail("");
      setModalVisible(false);
    } catch (err: any) {
      setError(err.message || "Failed to add email");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteApprovedEmail(id);
      setEmails((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      console.error("Failed to delete email:", err);
    }
  }

  return (
    <View style={{ marginHorizontal: 20, marginTop: 24 }}>
      <SectionLabel>Admin — Approved Emails</SectionLabel>
      <Card pad={0}>
        {loading ? (
          <ActivityIndicator color={Colors.accent} style={{ margin: 20 }} />
        ) : emails.length === 0 ? (
          <View style={{ padding: 14 }}>
            <Text style={{ fontSize: 13, color: Colors.ter }}>
              No approved emails yet
            </Text>
          </View>
        ) : (
          emails.map((email, i) => (
            <View key={email.id}>
              {i > 0 && <Divider />}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 14,
                  gap: 10,
                }}
              >
                <Text
                  style={{
                    flex: 1,
                    fontSize: 13,
                    color: Colors.sec,
                    fontFamily: "Courier",
                  }}
                >
                  {email.email}
                </Text>
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 6,
                    backgroundColor: email.used
                      ? "rgba(76,175,130,0.15)"
                      : "rgba(242,181,100,0.15)",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "600",
                      fontFamily: "Courier",
                      color: email.used ? "#4CAF82" : Colors.warn,
                    }}
                  >
                    {email.used ? "Registered" : "Pending"}
                  </Text>
                </View>
                {!email.used && (
                  <Pressable onPress={() => handleDelete(email.id)}>
                    <Text style={{ fontSize: 18, color: Colors.ter }}>×</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))
        )}
      </Card>

      <Pressable
        onPress={() => setModalVisible(true)}
        style={{
          marginTop: 10,
          backgroundColor: "transparent",
          borderWidth: 1,
          borderColor: "rgba(255,119,99,0.3)",
          borderRadius: 12,
          padding: 14,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.accent }}>
          + Add approved email
        </Text>
      </Pressable>

      <Modal visible={modalVisible} transparent animationType="slide">
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.7)",
            justifyContent: "flex-end",
          }}
          onPress={() => setModalVisible(false)}
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
              Add approved email
            </Text>
            <TextInput
              value={newEmail}
              onChangeText={setNewEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="email@example.com"
              placeholderTextColor={Colors.ter}
              style={{
                backgroundColor: Colors.bg,
                borderRadius: 10,
                padding: 14,
                fontSize: 15,
                color: Colors.text,
                borderWidth: 0.5,
                borderColor: Colors.line,
                marginBottom: 12,
              }}
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
                onPress={handleAdd}
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
                    Add
                  </Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [redefineWarningVisible, setRedefineWarningVisible] = useState(false);
  const [replanModalStep, setReplanModalStep] = useState<0 | 1 | 2>(0); // 0=closed, 1=warning, 2=confirm
  const [replanning, setReplanning] = useState(false);
  const [replanError, setReplanError] = useState("");
  const [replanSuccess, setReplanSuccess] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, []),
  );

  async function loadProfile() {
    setLoading(true);
    try {
      const data = await getProfile();
      setProfile(data);
    } catch (err: any) {
      setError("Failed to load profile");
    } finally {
      setLoading(false);
    }
  }

  async function handleToneChange(tone: string) {
    if (!profile) return;
    setProfile((prev) => (prev ? { ...prev, agent_tone: tone } : prev));
    try {
      await updateAgentTone(tone);
    } catch (err) {
      console.error("Failed to update tone:", err);
    }
  }

  async function handleReplan() {
    setReplanning(true);
    setReplanError("");
    setReplanSuccess(false);
    try {
      await replanSessions();
      setReplanModalStep(0);
      setReplanSuccess(true);
    } catch (err: any) {
      setReplanError(err.message || "Something went wrong");
    } finally {
      setReplanning(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView showsVerticalScrollIndicator={false}>
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
            Profile
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
            Settings
          </Text>
          {error ? (
            <Text style={{ fontSize: 12, color: Colors.warn, marginTop: 4 }}>
              {error}
            </Text>
          ) : null}
        </View>

        {loading ? (
          <ActivityIndicator color={Colors.accent} style={{ marginTop: 60 }} />
        ) : profile ? (
          <>
            <PhaseDisplay profile={profile} />

            {/* Training section */}
            <View style={{ marginHorizontal: 20, marginTop: 24 }}>
              <SectionLabel>Training</SectionLabel>
              <Card pad={0}>
                <SettingRow
                  label="Goals"
                  value={`Size ${profile.goal_size}★ · Def ${profile.goal_definition}★`}
                  onPress={() => setRedefineWarningVisible(true)}
                />
                <Divider />
                <SettingRow
                  label="Gym settings"
                  value="Equipment · Exercises"
                  onPress={() => router.push("/gym-settings")}
                />
                <Divider />
                <SettingRow
                  label="Replan sessions"
                  value="Regenerate upcoming"
                  onPress={() => {
                    setReplanError("");
                    setReplanSuccess(false);
                    setReplanModalStep(1);
                  }}
                />
              </Card>
              {replanSuccess && (
                <Text
                  style={{
                    fontSize: 12,
                    color: "#4CAF82",
                    marginTop: 8,
                    paddingLeft: 4,
                  }}
                >
                  Sessions replanned successfully.
                </Text>
              )}
            </View>

            <AgentToneSelector
              currentTone={profile.agent_tone || "neutral"}
              onChange={handleToneChange}
            />

            {profile.is_admin && <AdminSection />}
          </>
        ) : null}

        <View
          style={{
            alignItems: "center",
            paddingVertical: 24,
            gap: 16,
            marginTop: 8,
          }}
        >
          <Pressable
            onPress={() => {
              clearToken();
              router.replace("/login");
            }}
            style={{
              borderWidth: 0.5,
              borderColor: Colors.line2,
              borderRadius: 12,
              paddingVertical: 12,
              paddingHorizontal: 32,
            }}
          >
            <Text style={{ fontSize: 14, color: Colors.sec }}>Log Out</Text>
          </Pressable>
          <Text
            style={{
              fontFamily: "Courier",
              fontSize: 10,
              color: Colors.qua,
              letterSpacing: 0.6,
              textTransform: "uppercase",
            }}
          >
            GymApp · V0.2
          </Text>
        </View>
      </ScrollView>

      {/* Redefine goals warning modal */}
      <Modal visible={redefineWarningVisible} transparent animationType="fade">
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
                backgroundColor: "rgba(242,181,100,0.15)",
                alignItems: "center",
                justifyContent: "center",
                alignSelf: "center",
                marginBottom: 14,
              }}
            >
              <Text style={{ fontSize: 22 }}>⚠️</Text>
            </View>
            <Text
              style={{
                fontSize: 17,
                fontWeight: "700",
                color: Colors.text,
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              Redefine goals?
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
              Changing your goals will recalculate your training cycle. Your
              current block will complete as planned before any changes take
              effect.
            </Text>
            <View style={{ gap: 10 }}>
              <Pressable
                onPress={() => {
                  setRedefineWarningVisible(false);
                  router.push("/onboarding?mode=redefine");
                }}
                style={{
                  backgroundColor: Colors.accent,
                  borderRadius: 12,
                  padding: 14,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "700",
                    color: Colors.accentInk,
                  }}
                >
                  Continue
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setRedefineWarningVisible(false)}
                style={{
                  backgroundColor: "transparent",
                  borderRadius: 12,
                  padding: 12,
                  alignItems: "center",
                  borderWidth: 0.5,
                  borderColor: Colors.line,
                }}
              >
                <Text style={{ fontSize: 14, color: Colors.sec }}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Replan sessions modal — step 1: warning */}
      <Modal visible={replanModalStep === 1} transparent animationType="fade">
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
                backgroundColor: "rgba(242,181,100,0.15)",
                alignItems: "center",
                justifyContent: "center",
                alignSelf: "center",
                marginBottom: 14,
              }}
            >
              <Text style={{ fontSize: 22 }}>🔄</Text>
            </View>
            <Text
              style={{
                fontSize: 17,
                fontWeight: "700",
                color: Colors.text,
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              Replan sessions?
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
              This will regenerate all upcoming sessions in your current block
              using your latest settings and goal notes. Completed and
              in-progress sessions will not be affected.
            </Text>
            <View style={{ gap: 10 }}>
              <Pressable
                onPress={() => setReplanModalStep(2)}
                style={{
                  backgroundColor: Colors.accent,
                  borderRadius: 12,
                  padding: 14,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "700",
                    color: Colors.accentInk,
                  }}
                >
                  Continue
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setReplanModalStep(0)}
                style={{
                  backgroundColor: "transparent",
                  borderRadius: 12,
                  padding: 12,
                  alignItems: "center",
                  borderWidth: 0.5,
                  borderColor: Colors.line,
                }}
              >
                <Text style={{ fontSize: 14, color: Colors.sec }}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Replan sessions modal — step 2: confirm */}
      <Modal visible={replanModalStep === 2} transparent animationType="fade">
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
              Your upcoming planned sessions will be deleted and regenerated.
              This cannot be undone.
            </Text>
            {replanError ? (
              <Text
                style={{
                  fontSize: 13,
                  color: Colors.warn,
                  textAlign: "center",
                  marginBottom: 12,
                }}
              >
                {replanError}
              </Text>
            ) : null}
            <View style={{ gap: 10 }}>
              <Pressable
                onPress={handleReplan}
                disabled={replanning}
                style={{
                  backgroundColor: Colors.accent,
                  borderRadius: 12,
                  padding: 14,
                  alignItems: "center",
                  opacity: replanning ? 0.7 : 1,
                }}
              >
                {replanning ? (
                  <ActivityIndicator color={Colors.accentInk} />
                ) : (
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: Colors.accentInk,
                    }}
                  >
                    Replan Now
                  </Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => setReplanModalStep(0)}
                disabled={replanning}
                style={{
                  backgroundColor: "transparent",
                  borderRadius: 12,
                  padding: 12,
                  alignItems: "center",
                  borderWidth: 0.5,
                  borderColor: Colors.line,
                  opacity: replanning ? 0.5 : 1,
                }}
              >
                <Text style={{ fontSize: 14, color: Colors.sec }}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
