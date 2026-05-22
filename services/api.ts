// services/api.ts
// Central API service layer.
// All screens import from here to talk to the backend.
// Never make fetch() calls directly from screens — always use these functions.

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE_URL = "https://gymapp-production-bdf6.up.railway.app";

// ─── Token storage ────────────────────────────────────────────────────────────
// Uses localStorage for web — token persists across browser sessions.
// Falls back to in-memory if localStorage is not available.

const TOKEN_KEY = "gymapp_auth_token";
let authToken: string | null = null;

export function setToken(token: string) {
  authToken = token;
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // localStorage not available — in-memory fallback
  }
}

export function loadToken(): string | null {
  try {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) authToken = stored;
  } catch {
    // localStorage not available
  }
  return authToken;
}

export function getToken(): string | null {
  return authToken;
}

export function clearToken() {
  authToken = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

// ─── Base fetch ───────────────────────────────────────────────────────────────

async function request(
  path: string,
  method: string = "GET",
  body?: object,
): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Something went wrong");
  }

  return data;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function login(username: string, password: string) {
  const data = await request("/auth/login", "POST", { username, password });
  setToken(data.token);
  return data;
}

export async function register(username: string, password: string) {
  const data = await request("/auth/register", "POST", { username, password });
  setToken(data.token);
  return data;
}

// ─── User ─────────────────────────────────────────────────────────────────────

export async function getProfile() {
  return request("/user/profile");
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function getWeekSessions() {
  return request("/sessions/week");
}

export async function getSession(id: number) {
  return request(`/sessions/${id}`);
}

export async function createSession(data: {
  programme_id?: number;
  session_type: "compound" | "isolation" | "extra";
  occurrence: number;
  week_number: number;
  gym: string;
  exercises: {
    exercise_name: string;
    muscles_primary?: string;
    sub_component?: string;
    order_index: number;
    target_sets: number;
    target_reps: number;
    target_weight: number;
  }[];
}) {
  return request("/sessions", "POST", data);
}

export async function startSession(id: number) {
  return request(`/sessions/${id}/start`, "PATCH");
}

export async function logSet(
  sessionId: number,
  data: {
    exercise_name: string;
    set_number: number;
    weight: number;
    reps: number;
    notes?: string;
  },
) {
  return request(`/sessions/${sessionId}/sets`, "POST", data);
}

export async function completeSession(id: number, notes?: string) {
  return request(`/sessions/${id}/complete`, "PATCH", { notes });
}

// ─── Body composition ─────────────────────────────────────────────────────────

export async function logBodyComp(data: {
  weight_kg?: number;
  muscle_mass_kg?: number;
  source?: string;
}) {
  return request("/bodycomp", "POST", data);
}

export async function getBodyComp(weeks: number = 12) {
  return request(`/bodycomp?weeks=${weeks}`);
}

// ─── 1RM history ─────────────────────────────────────────────────────────────

export async function getAllOneRepMax() {
  return request("/onerepmax");
}

export async function getOneRepMaxHistory(exercise: string) {
  return request(`/onerepmax/${encodeURIComponent(exercise)}`);
}

// ─── AI ───────────────────────────────────────────────────────────────────────

export async function generateBlock() {
  return request("/ai/generate-block", "POST", {});
}

export async function generateHomeSession(session_id: number) {
  return request("/ai/generate-home-session", "POST", { session_id });
}

export async function getExtraSession(gym: string) {
  return request("/ai/extra-session", "POST", { gym });
}

export async function getWeeklyFeedback() {
  return request("/ai/weekly-feedback");
}
