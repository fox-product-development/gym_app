// services/api.ts
// Central API service layer.
// All screens import from here to talk to the backend.
// Never make fetch() calls directly from screens — always use these functions.

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE_URL = "https://gymapp-production-bdf6.up.railway.app";

// ─── Token storage ────────────────────────────────────────────────────────────

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

export async function register(
  username: string,
  email: string,
  password: string,
) {
  const data = await request("/auth/register", "POST", {
    username,
    email,
    password,
  });
  setToken(data.token);
  return data;
}

// ─── User ─────────────────────────────────────────────────────────────────────

export async function getProfile() {
  return request("/user/profile");
}

export async function updateProfile(data: {
  agent_tone?: string;
  goal_size?: number;
  goal_strength?: number;
  goal_definition?: number;
  goal_fitness?: number;
  training_level?: string;
  weekly_sessions?: number;
  goal_description?: string;
  weight_exercises_per_session?: number;
  conditioning_exercises_per_session?: number;
}) {
  return request("/user/profile", "PATCH", data);
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
  gym_id?: number;
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
    drop_number?: number;
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

export async function replanSessions() {
  return request("/sessions/replan", "POST", {});
}

// ─── Body composition ─────────────────────────────────────────────────────────

export async function logBodyComp(data: {
  weight_kg?: number;
  muscle_mass_kg?: number;
  body_fat_pct?: number;
  source?: string;
}) {
  return request("/bodycomp", "POST", data);
}

export async function getBodyComp(weeks: number = 12) {
  return request(`/bodycomp?weeks=${weeks}`);
}

export async function extractBodyCompFromImage(
  image_base64: string,
  media_type: string,
) {
  return request("/bodycomp/extract-from-image", "POST", {
    image_base64,
    media_type,
  });
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

export async function generateGymSession(session_id: number, gym_id: number) {
  return request("/ai/generate-gym-session", "POST", { session_id, gym_id });
}

export async function generateExtraSession(gym_id: number) {
  return request("/ai/extra-session", "POST", { gym_id });
}

export async function getWeeklyFeedback() {
  return request("/ai/weekly-feedback");
}

// ─── Calibration ──────────────────────────────────────────────────────────────

export async function getCalibrationExercises(gym_id: number) {
  return request(`/calibration/exercises?gym_id=${gym_id}`);
}

export async function completeCalibration(data: {
  results: {
    exercise_name: string;
    muscles_primary: string;
    weight: number;
    reps: number;
  }[];
}) {
  return request("/calibration/complete", "POST", data);
}

export async function generateWeeklyReport() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  let reportDate: string;
  if (dayOfWeek === 0) {
    reportDate = today.toISOString().split("T")[0];
  } else {
    const lastSunday = new Date(today);
    lastSunday.setDate(today.getDate() - dayOfWeek);
    reportDate = lastSunday.toISOString().split("T")[0];
  }
  return request("/report/generate", "POST", { week_start_date: reportDate });
}

// ─── Cycles ───────────────────────────────────────────────────────────────────

export async function getCycles() {
  return request("/cycles");
}

export async function saveCycle(data: {
  phases: { phase: string }[];
  duration_weeks: number;
}) {
  return request("/cycles", "POST", data);
}

export async function deleteCycle() {
  return request("/cycles", "DELETE");
}

export async function proposeCycle() {
  return request("/ai/propose-cycle", "POST", {});
}

// ─── Diet ─────────────────────────────────────────────────────────────────────

export async function logDiet(data: {
  calories_kcal?: number;
  fat_g?: number;
  saturated_fat_g?: number;
  carbs_g?: number;
  sugar_g?: number;
  fibre_g?: number;
  protein_g?: number;
  salt_g?: number;
  source?: string;
}) {
  return request("/diet", "POST", data);
}

export async function getDiet(weeks: number = 4) {
  return request(`/diet?weeks=${weeks}`);
}

export async function extractDietFromImage(
  image_base64: string,
  media_type: string,
) {
  return request("/diet/extract-from-image", "POST", {
    image_base64,
    media_type,
  });
}

// ─── Mood ─────────────────────────────────────────────────────────────────────

export async function logMood(data: {
  mood: number;
  energy: number;
  notes?: string;
}) {
  return request("/mood", "POST", data);
}

export async function getMood(weeks: number = 4) {
  return request(`/mood?weeks=${weeks}`);
}

// ─── Cardio ───────────────────────────────────────────────────────────────────

export async function logCardio(data: {
  activity_type: string;
  duration_minutes: number;
  distance_km?: number;
  avg_heart_rate?: number;
  calories?: number;
  avg_pace_seconds?: number;
  notes?: string;
  logged_at?: string;
}) {
  return request("/cardio", "POST", data);
}

export async function getCardio(weeks: number = 4) {
  return request(`/cardio?weeks=${weeks}`);
}

export async function updateCardio(
  id: number,
  data: {
    activity_type: string;
    duration_minutes: number;
    distance_km?: number;
    avg_heart_rate?: number;
    calories?: number;
    avg_pace_seconds?: number;
    notes?: string;
  },
) {
  return request(`/cardio/${id}`, "PUT", data);
}

export async function deleteCardio(id: number) {
  return request(`/cardio/${id}`, "DELETE");
}

export async function extractCardioFromImage(
  image_base64: string,
  media_type: string,
) {
  return request("/cardio/extract-from-image", "POST", {
    image_base64,
    media_type,
  });
}

// ─── Gyms ─────────────────────────────────────────────────────────────────────

export async function getGyms() {
  return request("/gyms");
}

export async function createGym(data: {
  gym_name: string;
  is_default?: boolean;
}) {
  return request("/gyms", "POST", data);
}

export async function updateGym(
  id: number,
  data: { gym_name?: string; is_default?: boolean },
) {
  return request(`/gyms/${id}`, "PATCH", data);
}

export async function deleteGym(id: number) {
  return request(`/gyms/${id}`, "DELETE");
}

// ─── Equipment ────────────────────────────────────────────────────────────────

export async function getEquipment(gymId: number) {
  return request(`/gyms/${gymId}/equipment`);
}

export async function createEquipment(
  gymId: number,
  data: {
    equipment_name: string;
    type: string;
    unladen_weight?: number;
    increment?: number;
    max_weight?: number;
    unit?: string;
  },
) {
  return request(`/gyms/${gymId}/equipment`, "POST", data);
}

export async function updateEquipment(
  gymId: number,
  id: number,
  data: {
    equipment_name?: string;
    type?: string;
    unladen_weight?: number;
    increment?: number;
    max_weight?: number;
    unit?: string;
  },
) {
  return request(`/gyms/${gymId}/equipment/${id}`, "PATCH", data);
}

export async function deleteEquipment(gymId: number, id: number) {
  return request(`/gyms/${gymId}/equipment/${id}`, "DELETE");
}

// ─── Plates ───────────────────────────────────────────────────────────────────

export async function getPlates(gymId: number) {
  return request(`/gyms/${gymId}/plates`);
}

export async function createPlate(
  gymId: number,
  data: { weight: number; quantity: number },
) {
  return request(`/gyms/${gymId}/plates`, "POST", data);
}

export async function savePlates(
  gymId: number,
  plates: { id: number; quantity: number }[],
) {
  return request(`/gyms/${gymId}/plates`, "PATCH", { plates });
}

export async function deletePlate(gymId: number, id: number) {
  return request(`/gyms/${gymId}/plates/${id}`, "DELETE");
}

// ─── Approved emails (admin) ──────────────────────────────────────────────────

export async function getApprovedEmails() {
  return request("/gyms/admin/approved-emails");
}

export async function addApprovedEmail(email: string) {
  return request("/gyms/admin/approved-emails", "POST", { email });
}

export async function deleteApprovedEmail(id: number) {
  return request(`/gyms/admin/approved-emails/${id}`, "DELETE");
}

// ─── User profile update ──────────────────────────────────────────────────────

export async function updateAgentTone(agent_tone: string) {
  return request("/user/profile", "PATCH", { agent_tone });
}

// ─── Exercises ────────────────────────────────────────────────────────────────

export async function getExercises(gymId: number) {
  return request(`/gyms/${gymId}/exercises`);
}

export async function updateExercise(
  gymId: number,
  id: number,
  data: {
    active?: boolean;
    exercise?: string;
    muscles_primary?: string;
    sub_component?: string;
    type?: string;
    emg_score?: number;
    equipment_id?: number;
  },
) {
  return request(`/gyms/${gymId}/exercises/${id}`, "PATCH", data);
}

export async function createExercise(
  gymId: number,
  data: {
    exercise: string;
    muscles_primary: string;
    muscles_secondary?: string;
    type: string;
    sub_component?: string;
    emg_score?: number;
    equipment_id?: number;
  },
) {
  return request(`/gyms/${gymId}/exercises`, "POST", data);
}

export async function deleteExercise(gymId: number, id: number) {
  return request(`/gyms/${gymId}/exercises/${id}`, "DELETE");
}

export async function getExerciseMetadata(exercise_name: string) {
  return request("/ai/exercise-metadata", "POST", { exercise_name });
}

export async function suggestExercises(gym_id: number) {
  return request("/ai/suggest-exercises", "POST", { gym_id });
}
