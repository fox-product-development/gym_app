// app/login.tsx
// Login screen — shown when the user is not authenticated.
// Handles both login and first-time registration.

import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { Colors } from "../constants/theme";
import { login, register } from "../services/api";

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const [mode] = useState<"login">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!username || !password) {
      setError("Please enter a username and password");
      return;
    }

    setError("");
    setLoading(true);

    try {
      if (mode === "login") {
        await login(username, password);
      } else {
        await register(username, password);
      }

      // Navigate to the main app on success
      router.replace("/(tabs)");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: Colors.bg,
        paddingHorizontal: 24,
        justifyContent: "center",
      }}
    >
      {/* logo / title */}
      <View style={{ alignItems: "center", marginBottom: 48 }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            backgroundColor: Colors.accent,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          <Text style={{ fontSize: 32 }}>★</Text>
        </View>
        <Text
          style={{
            fontSize: 28,
            fontWeight: "700",
            color: Colors.text,
            letterSpacing: -0.6,
          }}
        >
          GymApp
        </Text>
        <Text
          style={{
            fontFamily: "Courier",
            fontSize: 11,
            color: Colors.ter,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            marginTop: 4,
          }}
        >
          {mode === "login" ? "Welcome back" : "Create account"}
        </Text>
      </View>

      {/* form */}
      <View style={{ gap: 10 }}>
        {/* username */}
        <View>
          <Text
            style={{
              fontFamily: "Courier",
              fontSize: 10,
              color: Colors.ter,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              marginBottom: 6,
              paddingLeft: 4,
            }}
          >
            Username
          </Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Enter username"
            placeholderTextColor={Colors.qua}
            style={{
              backgroundColor: Colors.card,
              borderRadius: 12,
              padding: 14,
              fontSize: 16,
              color: Colors.text,
              borderWidth: 0.5,
              borderColor: Colors.line,
            }}
          />
        </View>

        {/* password */}
        <View>
          <Text
            style={{
              fontFamily: "Courier",
              fontSize: 10,
              color: Colors.ter,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              marginBottom: 6,
              paddingLeft: 4,
            }}
          >
            Password
          </Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Enter password"
            placeholderTextColor={Colors.qua}
            style={{
              backgroundColor: Colors.card,
              borderRadius: 12,
              padding: 14,
              fontSize: 16,
              color: Colors.text,
              borderWidth: 0.5,
              borderColor: Colors.line,
            }}
          />
        </View>

        {/* error message */}
        {error ? (
          <Text
            style={{
              fontSize: 13,
              color: Colors.warn,
              textAlign: "center",
              paddingTop: 4,
            }}
          >
            {error}
          </Text>
        ) : null}

        {/* submit button */}
        <Pressable
          onPress={handleSubmit}
          disabled={loading}
          style={{
            backgroundColor: Colors.accent,
            borderRadius: 12,
            padding: 16,
            alignItems: "center",
            marginTop: 8,
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? (
            <ActivityIndicator color={Colors.accentInk} />
          ) : (
            <Text
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: Colors.accentInk,
              }}
            >
              {mode === "login" ? "Log In" : "Create Account"}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
