// services/api.ts
// Central API service layer.
// All screens import from here to talk to the backend.
// Never make fetch() calls directly from screens — always use these functions.

// ─── Config ───────────────────────────────────────────────────────────────────
// Replace this with your Railway URL. Never commit real secrets to GitHub.

const BASE_URL = "https://gymapp-production-bdf6.up.railway.app";

// ─── Token storage ────────────────────────────────────────────────────────────
// In memory token store. Will be replaced with secure storage later.

let authToken: string | null = null;

export function setToken(token: string) {
  authToken = token;
}

export function getToken(): string | null {
  return authToken;
}

export function clearToken() {
  authToken = null;
}

// ─── Base fetch ───────────────────────────────────────────────────────────────
// All API calls go through this function.
// It adds the auth token header and handles errors consistently.

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

export async function updateGoal(goal: string) {
  return request("/user/goal", "PATCH", { goal });
}

export async function updateGym(gym: string) {
  return request("/user/gym", "PATCH", { gym });
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function getWeekSessions() {
  return request("/sessions/week");
}

export async function getSession(id: number) {
  return request(`/sessions/${id}`);
}

export async function createSession(data: {
  date: string;
  gym: string;
  day_focus: string;
  exercises: {
    exercise_name: string;
    target_sets: number;
    target_reps: number;
    target_weight: number;
    warmup_sets?: { weight: string; reps: number }[];
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
