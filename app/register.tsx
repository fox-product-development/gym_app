// app/register.tsx
// Registration screen — invite only, email must be on the approved list.

import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { Colors } from "../constants/theme";
import { register } from "../services/api";

export default function RegisterScreen() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (!username || !email || !password || !confirmPassword) {
      setError("All fields are required");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setError("");
    setLoading(true);

    try {
      await register(username, email.toLowerCase().trim(), password);
      router.replace("/(tabs)");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
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
    paddingLeft: 4,
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      contentContainerStyle={{
        paddingHorizontal: 24,
        paddingTop: 80,
        paddingBottom: 40,
      }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Logo / title */}
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
          Create account
        </Text>
      </View>

      {/* Form */}
      <View style={{ gap: 10 }}>
        <View>
          <Text style={labelStyle}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="Enter your email"
            placeholderTextColor={Colors.qua}
            style={inputStyle}
          />
        </View>

        <View>
          <Text style={labelStyle}>Username</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Choose a username"
            placeholderTextColor={Colors.qua}
            style={inputStyle}
          />
        </View>

        <View>
          <Text style={labelStyle}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="At least 8 characters"
            placeholderTextColor={Colors.qua}
            style={inputStyle}
          />
        </View>

        <View>
          <Text style={labelStyle}>Confirm password</Text>
          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            placeholder="Repeat your password"
            placeholderTextColor={Colors.qua}
            style={inputStyle}
          />
        </View>

        {/* Error message */}
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

        {/* Submit */}
        <Pressable
          onPress={handleRegister}
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
              Create account
            </Text>
          )}
        </Pressable>

        {/* Back to login */}
        <Pressable
          onPress={() => router.back()}
          style={{ alignItems: "center", paddingTop: 4 }}
        >
          <Text style={{ fontSize: 13, color: Colors.ter }}>
            Already have an account?{" "}
            <Text style={{ color: Colors.accent }}>Sign in</Text>
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
