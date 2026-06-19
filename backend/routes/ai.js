// backend/routes/ai.js
// AI routes — phase generation, week generation, gym session swap, extra
// session, weekly feedback. The AI's role is exercise SELECTION and
// ORDERING. The server calculates all weights, reps, and sets from
// phaseConfig × 1RM data.
//
// No training levels. phaseConfig.js is keyed directly by userKey
// ('user1' / 'user2'), derived from the DB user id ('user' + id). There is
// no block concept — the AI selects exercises ONCE per phase, and every
// week within that phase reuses those exercises with that week's
// phaseConfig loading values.

const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const pool = require("../db");
const requireAuth = require("../middleware");
const { getValidWeightsForEquipment } = require("../weightCalc");
const { getWeekConfig, getMixedWeekConfig } = require("../phaseConfig");

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanJSON(text) {
  const stripped = text.replace(/```json|```/g, "").trim();
  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return stripped.substring(firstBrace, lastBrace + 1);
  }
  return stripped;
}

// Maps a DB user id to the phaseConfig.js user key. Mike (id 1) -> 'user1',
// his partner (id 2) -> 'user2'.
function getUserKey(userId) {
  return `user${userId}`;
}

// Per-phase session template definitions. Each entry describes how many
// sessions run per week, how many exercises each session needs, and the
// muscle/role slots the AI should fill. This replaces the old wildcard-slot
// compound/isolation model entirely — every phase has its own shape.
const PHASE_SESSION_TEMPLATES = {
  anatomical_adaptation: {
    sessionsPerWeek: 4,
    sessions: [
      {
        type: "full_body",
        exerciseCount: 9,
        slots:
          "9 exercises covering the full body: Quads, Hamstrings, Chest, Back, Shoulders, Calves, Lower Back, Core, plus 1 Wildcard. All 4 sessions in the week use the SAME 9 exercises.",
      },
    ],
  },
  hypertrophy: {
    sessionsPerWeek: 4,
    sessions: [
      {
        type: "lower",
        exerciseCount: 8,
        slots:
          "8 exercises for a Lower body session: Quads x2, Hamstrings x2, Calves x1, Lower Back x1, Core x2.",
      },
      {
        type: "upper",
        exerciseCount: 8,
        slots:
          "8 exercises for an Upper body session: Chest x2, Back x2, Shoulders x2, Biceps x1, Triceps x1.",
      },
    ],
    // Session order within the week: Lower, Upper, Lower, Upper. Both Lower
    // sessions use the same 8 exercises; both Upper sessions use the same 8
    // exercises. Only the loading (from phaseConfig) differs between the
    // first pair (Low) and second pair (High).
    sessionOrder: ["lower", "upper", "lower", "upper"],
  },
  mixed: {
    sessionsPerWeek: 4,
    sessions: [
      {
        type: "mixed_mxs",
        exerciseCount: 6,
        slots:
          "6 full-body compound exercises: Quads (squat variant), Hamstrings, Chest (press), Back (row), Shoulders (press), Calves.",
      },
      {
        type: "mixed_h_24",
        exerciseCount: 5,
        slots:
          "5 upper accessory exercises: Triceps, Back (pulldown variant), Shoulders (lateral), Shoulders (shrug/trap), Lower Back.",
      },
      {
        type: "mixed_h_6",
        exerciseCount: 6,
        slots:
          "6 exercises: Quads (lunge/unilateral), Core, Biceps, plus the SAME Triceps, Back (pulldown variant), and Shoulders (lateral) exercises selected for the mixed_h_24 session above. Do not select shoulder shrug or lower back exercises for this session.",
      },
    ],
    // Session order: MxS, H(2/4), MxS, H(6). Both MxS sessions use the same
    // 6 exercises (loading differs by week per phaseConfig.mixed.mxs).
    sessionOrder: ["mixed_mxs", "mixed_h_24", "mixed_mxs", "mixed_h_6"],
  },
  maximum_strength: {
    sessionsPerWeek: 3,
    sessions: [
      {
        type: "full_body",
        exerciseCount: 5,
        slots:
          "5 heavy compound exercises: Quads (squat variant), Hamstrings, Chest (press), Back (row), Calves. All 3 sessions in the week use the SAME 5 exercises.",
      },
    ],
  },
  muscle_definition: {
    sessionsPerWeek: 4,
    sessions: [
      {
        type: "full_body",
        exerciseCount: 8,
        slots:
          "8 exercises covering the full body: Quads x2, Hamstrings x1, Chest x1, Back x1, Core x1, Biceps x1, plus 1 Wildcard. All 4 sessions in the week use the SAME 8 exercises.",
      },
    ],
  },
};

async function getSessionHistory(userId) {
  const result = await pool.query(
    `SELECT
       s.id, s.session_type, s.week_number,
       g.gym_name AS gym,
       s.status, s.notes, s.completed_at,
       json_agg(
         json_build_object(
           'exercise_name', pe.exercise_name,
           'muscles_primary', pe.muscles_primary,
           'sub_component', pe.sub_component,
           'target_sets', pe.target_sets,
           'target_reps', pe.target_reps,
           'target_weight', pe.target_weight
         ) ORDER BY pe.order_index
       ) FILTER (WHERE pe.id IS NOT NULL) AS planned_exercises,
       json_agg(
         json_build_object(
           'exercise_name', ls.exercise_name,
           'set_number', ls.set_number,
           'weight', ls.weight,
           'reps', ls.reps,
           'notes', ls.notes
         ) ORDER BY ls.exercise_name, ls.set_number
       ) FILTER (WHERE ls.id IS NOT NULL) AS logged_sets
     FROM sessions s
     LEFT JOIN gyms g ON g.id = s.gym_id
     LEFT JOIN planned_exercises pe ON pe.session_id = s.id
     LEFT JOIN logged_sets ls ON ls.session_id = s.id
     WHERE s.user_id = $1
       AND s.completed_at >= NOW() - INTERVAL '4 weeks'
     GROUP BY s.id, g.gym_name
     ORDER BY s.completed_at DESC`,
    [userId],
  );
  return result.rows;
}

async function getOneRepMaxHistory(userId) {
  const result = await pool.query(
    `SELECT DISTINCT ON (exercise_name)
       exercise_name, estimated_1rm, weight_used, reps_performed, logged_at
     FROM one_rep_max_history
     WHERE user_id = $1
     ORDER BY exercise_name, logged_at DESC`,
    [userId],
  );
  return result.rows;
}

async function getBodyCompHistory(userId) {
  const result = await pool.query(
    `SELECT weight_kg, muscle_mass_kg, logged_at
     FROM body_composition
     WHERE user_id = $1
       AND logged_at >= NOW() - INTERVAL '4 weeks'
     ORDER BY logged_at ASC`,
    [userId],
  );
  return result.rows;
}

async function getDietHistory(userId) {
  const result = await pool.query(
    `SELECT logged_at, calories_kcal, protein_g, carbs_g, fat_g, sugar_g
     FROM diet_logs
     WHERE user_id = $1
       AND logged_at >= NOW() - INTERVAL '2 weeks'
     ORDER BY logged_at ASC`,
    [userId],
  );
  return result.rows;
}

async function getMoodHistory(userId) {
  const result = await pool.query(
    `SELECT logged_at, mood, energy, notes
     FROM mood_logs
     WHERE user_id = $1
       AND logged_at >= NOW() - INTERVAL '2 weeks'
     ORDER BY logged_at ASC`,
    [userId],
  );
  return result.rows;
}

async function getCardioHistory(userId) {
  const result = await pool.query(
    `SELECT logged_at, activity_type, duration_minutes, distance_km
     FROM cardio_logs
     WHERE user_id = $1
       AND logged_at >= NOW() - INTERVAL '2 weeks'
     ORDER BY logged_at ASC`,
    [userId],
  );
  return result.rows;
}

// Fetches exercises selected for the CURRENT phase's programme, grouped by
// session type. Used by generate-week (no AI call — reuse what generate-phase
// already selected) and by the Mixed/H session-sharing rules.
async function getCurrentPhaseExercises(userId, programmeId) {
  const result = await pool.query(
    `SELECT DISTINCT s.session_type, pe.exercise_name, pe.muscles_primary,
            pe.sub_component, pe.order_index
     FROM sessions s
     JOIN planned_exercises pe ON pe.session_id = s.id
     WHERE s.user_id = $1
       AND s.programme_id = $2
       AND s.week_number = 1
       AND pe.muscles_primary != 'Conditioning'
     ORDER BY s.session_type, pe.order_index`,
    [userId, programmeId],
  );

  const bySessionType = {};
  for (const row of result.rows) {
    if (!bySessionType[row.session_type]) bySessionType[row.session_type] = [];
    bySessionType[row.session_type].push({
      exercise: row.exercise_name,
      muscles_primary: row.muscles_primary,
      sub_component: row.sub_component,
    });
  }
  return bySessionType;
}

// Fetches conditioning exercises for a given gym and returns a lookup map:
// exercise name (lowercase) → { target, metric, sets, category }
async function getConditioningLookup(gymId) {
  const result = await pool.query(
    `SELECT exercise, category, metric, target, sets
     FROM conditioning
     WHERE gym_id IS NULL OR gym_id = $1
     ORDER BY category, exercise`,
    [gymId],
  );
  const lookup = {};
  for (const row of result.rows) {
    lookup[row.exercise.toLowerCase()] = {
      target: row.target,
      metric: row.metric,
      sets: row.sets,
      category: row.category,
    };
  }
  return lookup;
}

// ─── Weight calculation ───────────────────────────────────────────────────────

// Builds a lookup map of exercise → estimated_1rm for server-side weight
// calculation. 1RM is the SOLE source — there is no target_weight fallback.
async function buildWeightLookup(userId) {
  const ormResult = await pool.query(
    `SELECT DISTINCT ON (exercise_name)
       exercise_name, estimated_1rm
     FROM one_rep_max_history
     WHERE user_id = $1
     ORDER BY exercise_name, logged_at DESC`,
    [userId],
  );

  const lookup = {};
  for (const row of ormResult.rows) {
    lookup[row.exercise_name.toLowerCase()] = row.estimated_1rm
      ? parseFloat(row.estimated_1rm)
      : null;
  }
  return lookup;
}

// Calculates a target weight for an exercise at a given percentage of 1RM.
// No fallback — returns 0 if no 1RM exists (e.g. brand new exercise that
// hasn't been through a 1RM test session yet, or a bodyweight exercise).
function calculateExerciseWeight(exerciseName, percentage, weightLookup) {
  const key = exerciseName.toLowerCase();
  const oneRepMax = weightLookup[key];
  if (!oneRepMax) return 0;
  return oneRepMax * percentage;
}

// ─── Weight validation ────────────────────────────────────────────────────────

async function validateAndCorrectWeights(exercises, gymId, userId) {
  if (!exercises || exercises.length === 0) return exercises;

  try {
    const result = await pool.query(
      `SELECT e.exercise, eq.increment, eq.max_weight
       FROM exercises e
       LEFT JOIN equipment eq ON eq.id = e.equipment_id
       WHERE e.user_id = $1 AND e.gym_id = $2`,
      [userId, gymId],
    );

    const equipMap = {};
    for (const row of result.rows) {
      equipMap[row.exercise.toLowerCase()] = {
        increment: row.increment ? parseFloat(row.increment) : null,
        max_weight: row.max_weight ? parseFloat(row.max_weight) : null,
      };
    }

    for (const ex of exercises) {
      const lookup = equipMap[ex.exercise.toLowerCase()];
      if (!lookup) continue;

      let weight = parseFloat(ex.weight) || 0;
      if (weight <= 0) continue;

      if (lookup.increment && lookup.increment > 0) {
        weight = Math.round(weight / lookup.increment) * lookup.increment;
        if (weight <= 0) weight = lookup.increment;
      }

      if (lookup.max_weight && weight > lookup.max_weight) {
        weight = lookup.max_weight;
      }

      ex.weight = Math.round(weight * 10) / 10;
    }
  } catch (err) {
    console.error("validateAndCorrectWeights error:", err.message);
  }

  return exercises;
}

// Builds a plain-text CSV of the conditioning library for the AI prompt.
function buildConditioningCSV(conditioningLookup) {
  const entries = Object.entries(conditioningLookup);
  if (entries.length === 0) return "No conditioning exercises available.";
  const header = "exercise,category,metric,target,sets";
  const rows = entries.map(
    ([name, e]) => `${name},${e.category},${e.metric},${e.target},${e.sets}`,
  );
  return [header, ...rows].join("\n");
}

// Enriches AI-returned conditioning exercises with target_reps and metric from
// the DB lookup. Exercises not found in the lookup are skipped with a warning.
function enrichConditioningExercises(condExs, conditioningLookup) {
  const enriched = [];
  for (const ex of condExs) {
    const key = ex.exercise.toLowerCase();
    const dbRow = conditioningLookup[key];
    if (!dbRow) {
      console.warn(
        `Conditioning exercise not found in lookup, skipping: "${ex.exercise}"`,
      );
      continue;
    }
    enriched.push({
      exercise: ex.exercise,
      sets: ex.sets,
      target_reps: dbRow.target,
      metric: dbRow.metric,
    });
  }
  return enriched;
}

// Enriches an exercise array with server-calculated weight, reps, and sets
// from a SINGLE session config (one element from a phaseConfig week array),
// then validates weights against equipment constraints. If the session
// config has a `finisher` block, the finisher is attached to each exercise
// so the frontend can render the extra set(s) at the end.
async function enrichExercisesForSession(
  exercises,
  sessionConfig,
  weightLookup,
  gymId,
  userId,
) {
  const enriched = exercises.map((ex) => {
    const weight = calculateExerciseWeight(
      ex.exercise,
      sessionConfig.percentage,
      weightLookup,
    );

    const result = {
      exercise: ex.exercise,
      muscles_primary: ex.muscles_primary,
      sub_component: ex.sub_component,
      sets: sessionConfig.sets,
      target_reps: sessionConfig.reps,
      weight,
    };

    if (sessionConfig.finisher) {
      result.finisher_weight = calculateExerciseWeight(
        ex.exercise,
        sessionConfig.finisher.percentage,
        weightLookup,
      );
      result.finisher_reps = sessionConfig.finisher.reps;
      result.finisher_sets = sessionConfig.finisher.sets;
    }

    return result;
  });

  await validateAndCorrectWeights(enriched, gymId, userId);

  // Validate finisher weights separately (validateAndCorrectWeights only
  // touches the `weight` field).
  if (enriched.some((e) => e.finisher_weight !== undefined)) {
    const finisherProxies = enriched
      .filter((e) => e.finisher_weight !== undefined)
      .map((e) => ({ exercise: e.exercise, weight: e.finisher_weight }));
    await validateAndCorrectWeights(finisherProxies, gymId, userId);
    finisherProxies.forEach((proxy, i) => {
      const target = enriched.find((e) => e.exercise === proxy.exercise);
      if (target) target.finisher_weight = proxy.weight;
    });
  }

  return enriched;
}

// Inserts weight exercises and conditioning exercises into planned_exercises
// for a given session. groupIds, if provided, is an array the same length as
// weightExs assigning each exercise a group_id (used for MD weeks 4-6
// nonstop grouping). isOneRmTest flags the session as a 1RM testing session.
async function insertSessionExercises(
  client,
  sessionId,
  weightExs,
  condExs,
  groupIds = null,
) {
  for (let i = 0; i < weightExs.length; i++) {
    const ex = weightExs[i];
    const groupId = groupIds ? groupIds[i] : null;

    await client.query(
      `INSERT INTO planned_exercises
         (session_id, exercise_name, muscles_primary, sub_component,
          order_index, target_sets, target_reps, target_weight, set_style,
          group_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        sessionId,
        ex.exercise,
        ex.muscles_primary,
        ex.sub_component,
        i,
        ex.sets,
        ex.target_reps,
        ex.weight,
        "standard",
        groupId,
      ],
    );
  }

  for (let i = 0; i < condExs.length; i++) {
    const ex = condExs[i];
    await client.query(
      `INSERT INTO planned_exercises
         (session_id, exercise_name, muscles_primary, sub_component,
          order_index, target_sets, target_reps, target_weight, set_style, metric)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        sessionId,
        ex.exercise,
        "Conditioning",
        "Conditioning",
        weightExs.length + i,
        ex.sets,
        ex.target_reps,
        0,
        "standard",
        ex.metric,
      ],
    );
  }
}

// Returns the group_id assignment array for MD weeks 4-6 nonstop grouping.
// Week 4: 4 pairs (groups 1-4, 2 exercises each).
// Week 5: 2 groups of 4 (groups 1-2, 4 exercises each).
// Week 6: 1 group of 8 (group 1, all 8 exercises).
// Weeks 1-3: no grouping (returns null).
function getMdGroupIds(weekNumber, exerciseCount) {
  if (weekNumber === 4) {
    return Array.from(
      { length: exerciseCount },
      (_, i) => Math.floor(i / 2) + 1,
    );
  }
  if (weekNumber === 5) {
    return Array.from(
      { length: exerciseCount },
      (_, i) => Math.floor(i / 4) + 1,
    );
  }
  if (weekNumber === 6) {
    return Array.from({ length: exerciseCount }, () => 1);
  }
  return null;
}

// Per-phase, per-session 1RM test schedule. Returns an array of booleans,
// one per session in the week, indicating whether that session is a 1RM
// test session. Only week 1 of a phase ever has test sessions.
function getOneRmTestFlags(phase, weekNumber, sessionsPerWeek) {
  if (weekNumber !== 1) return Array(sessionsPerWeek).fill(false);

  if (phase === "maximum_strength") {
    // Second part of the week — sessions 2 and 3 (index 1, 2) of 3.
    return [false, true, true];
  }

  // AA, H, Mixed, MD — sessions 1 and 2 (index 0, 1) of the week.
  return Array.from({ length: sessionsPerWeek }, (_, i) => i < 2);
}

// ─── Gym CSV builder ──────────────────────────────────────────────────────────

async function buildGymCSV(gymId, userId) {
  if (!gymId) {
    return "exercise,muscles_primary,muscles_secondary,type,equipment_name,sub_component,emg_score\n(no gym selected)";
  }
  try {
    const result = await pool.query(
      `SELECT e.exercise, e.muscles_primary, e.muscles_secondary, e.type,
              e.sub_component, e.emg_score,
              eq.equipment_name
       FROM exercises e
       LEFT JOIN equipment eq ON eq.id = e.equipment_id
       WHERE e.user_id = $1 AND e.gym_id = $2 AND e.active = TRUE
       ORDER BY e.muscles_primary, e.emg_score DESC`,
      [userId, gymId],
    );

    const header =
      "exercise,muscles_primary,muscles_secondary,type,equipment_name,sub_component,emg_score";
    if (result.rows.length === 0)
      return header + "\n(no exercises configured for this gym)";

    const rows = result.rows.map(
      (e) =>
        `${e.exercise},${e.muscles_primary},${e.muscles_secondary},${e.type},${e.equipment_name ?? "none"},${e.sub_component},${e.emg_score}`,
    );
    return [header, ...rows].join("\n");
  } catch (err) {
    console.error("buildGymCSV DB error:", err.message);
    return "exercise,muscles_primary,muscles_secondary,type,equipment_name,sub_component,emg_score\n(error loading exercises)";
  }
}

// ─── Auth helper (shared by cron + JWT routes) ───────────────────────────────

function resolveUserId(req, res) {
  const cronSecret = req.headers["x-cron-secret"];
  if (cronSecret) {
    if (cronSecret !== process.env.CRON_SECRET) {
      res.status(401).json({ error: "Invalid cron secret" });
      return null;
    }
    return req.body.user_id;
  }

  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    res.status(401).json({ error: "No token provided" });
    return null;
  }
  try {
    const jwt = require("jsonwebtoken");
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.userId;
  } catch {
    res.status(401).json({ error: "Invalid token" });
    return null;
  }
}

// ─── Generate phase ───────────────────────────────────────────────────────────
// POST /ai/generate-phase
// Called ONCE when a new phase starts (triggered by cron.js). The AI selects
// exercises for the entire phase in a single call. The server then generates
// every week's sessions from those exercises using phaseConfig's per-week,
// per-session loading values. No block concept — a 6-week phase generates
// 6 weeks of sessions from one exercise selection.

router.post("/generate-phase", async (req, res) => {
  const userId = resolveUserId(req, res);
  if (!userId) return;

  const { phase, total_weeks, sessions_per_week, preselect_for_md } = req.body;
  if (!phase || !total_weeks || !sessions_per_week) {
    return res.status(400).json({
      error: "phase, total_weeks, and sessions_per_week are required",
    });
  }

  try {
    const userKey = getUserKey(userId);

    const userResult = await pool.query(
      `SELECT conditioning_exercises_per_session FROM users WHERE id = $1`,
      [userId],
    );
    if (userResult.rows.length === 0)
      return res.status(404).json({ error: "User not found" });
    const conditioningCount =
      userResult.rows[0].conditioning_exercises_per_session || 3;

    const gymResult = await pool.query(
      `SELECT id, gym_name FROM gyms WHERE user_id = $1 AND is_default = TRUE LIMIT 1`,
      [userId],
    );
    if (gymResult.rows.length === 0) {
      return res.status(400).json({
        error: "No default gym configured. Set a default gym in Gym Settings.",
      });
    }
    const gymId = gymResult.rows[0].id;
    const gymName = gymResult.rows[0].gym_name;

    // For a transition phase that's pre-selecting MD exercises, build the MD
    // template instead of the transition template (transition itself has no
    // dedicated exercise template — it inherits or pre-selects).
    const effectivePhaseForTemplate = preselect_for_md
      ? "muscle_definition"
      : phase;
    const template = PHASE_SESSION_TEMPLATES[effectivePhaseForTemplate];
    if (!template && phase !== "transition") {
      return res.status(400).json({ error: `Unknown phase: ${phase}` });
    }

    // Verify phaseConfig exists for this phase/user/week before calling the AI
    try {
      if (phase === "mixed") {
        getMixedWeekConfig(userKey, 1);
      } else {
        getWeekConfig(phase, userKey, 1);
      }
    } catch (configErr) {
      return res.status(400).json({
        error: `No training config available: ${configErr.message}`,
      });
    }

    // Transition phases that are NOT pre-selecting MD just inherit exercises
    // from the prior programme — no AI call needed.
    if (phase === "transition" && !preselect_for_md) {
      return await generateTransitionInheriting(
        req,
        res,
        userId,
        userKey,
        gymId,
        gymName,
        total_weeks,
        sessions_per_week,
        conditioningCount,
      );
    }

    const [
      sessionHistory,
      oneRepMaxHistory,
      bodyCompHistory,
      dietHistory,
      moodHistory,
      cardioHistory,
      conditioningLookup,
      weightLookup,
    ] = await Promise.all([
      getSessionHistory(userId),
      getOneRepMaxHistory(userId),
      getBodyCompHistory(userId),
      getDietHistory(userId),
      getMoodHistory(userId),
      getCardioHistory(userId),
      getConditioningLookup(gymId),
      buildWeightLookup(userId),
    ]);

    const gymCSV = await buildGymCSV(gymId, userId);
    const condCSV = buildConditioningCSV(conditioningLookup);

    const sessionSlotDescriptions = template.sessions
      .map((s) => `- ${s.type} (${s.exerciseCount} exercises): ${s.slots}`)
      .join("\n");

    const responseStructure = template.sessions
      .map(
        (s) => `  "${s.type}": {
    "exercises": [
      { "exercise": "<name>", "muscles_primary": "<primary muscle>", "sub_component": "<sub component>" }
    ],
    "conditioning": [
      { "exercise": "<name>", "sets": <number> }
    ]
  }`,
      )
      .join(",\n");

    const userPrompt = `Select exercises for a ${total_weeks}-week ${phase} training phase for this athlete.
The server will calculate all weights, reps, and sets — return exercise selections only.
These exercises will be used for EVERY week of this phase. Choose them to last the full ${total_weeks} weeks.

SESSION TEMPLATES FOR THIS PHASE
${sessionSlotDescriptions}

CURRENT STATE
- Phase: ${phase}
- Gym: ${gymName}
- Conditioning exercises per session: ${conditioningCount}

EXERCISE LIBRARY
${gymCSV}

CONDITIONING LIBRARY
${condCSV}

ESTIMATED 1RM HISTORY (for selection context — do not calculate weights)
${JSON.stringify(oneRepMaxHistory, null, 2)}

SESSION HISTORY — LAST 4 WEEKS
${JSON.stringify(sessionHistory, null, 2)}

BODY COMPOSITION — LAST 4 WEEKS
${JSON.stringify(bodyCompHistory, null, 2)}

DIET — LAST 2 WEEKS
${dietHistory.length > 0 ? JSON.stringify(dietHistory, null, 2) : "No diet data logged"}

MOOD AND ENERGY — LAST 2 WEEKS
${moodHistory.length > 0 ? JSON.stringify(moodHistory, null, 2) : "No mood data logged"}

CARDIO — LAST 2 WEEKS
${cardioHistory.length > 0 ? JSON.stringify(cardioHistory, null, 2) : "No cardio logged"}

For conditioning: select ${conditioningCount} exercises from the conditioning library per session template. Aim for at least 1 cardio movement and 1 core exercise. Exercise names must match the conditioning library exactly.

Return ONLY this exact JSON structure, nothing else:
{
${responseStructure}
}

No extra fields. No explanation. No markdown.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2500,
      system: PHASE_GENERATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const rawText = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const phasePlan = JSON.parse(cleanJSON(rawText));

    for (const sessionDef of template.sessions) {
      if (!phasePlan[sessionDef.type]) {
        throw new Error(
          `Invalid phase plan structure from Claude — missing "${sessionDef.type}"`,
        );
      }
    }

    // Enrich conditioning once per session template (phase-independent —
    // same conditioning exercises used across all weeks).
    const enrichedConditioning = {};
    for (const sessionDef of template.sessions) {
      enrichedConditioning[sessionDef.type] = enrichConditioningExercises(
        phasePlan[sessionDef.type].conditioning || [],
        conditioningLookup,
      );
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const progResult = await client.query(
        `INSERT INTO programmes (user_id, phase, week_start, total_weeks)
         VALUES ($1, $2, CURRENT_DATE, $3) RETURNING id`,
        [userId, phase, total_weeks],
      );
      const programmeId = progResult.rows[0].id;

      await generateAllWeeksForProgramme({
        client,
        userId,
        userKey,
        programmeId,
        phase,
        totalWeeks: total_weeks,
        sessionsPerWeek: sessions_per_week,
        sessionOrder:
          template.sessionOrder || template.sessions.map((s) => s.type),
        phasePlan,
        enrichedConditioning,
        gymId,
        weightLookup,
      });

      await client.query("COMMIT");
      res.status(201).json({
        message: "Phase generated successfully",
        programme_id: programmeId,
        phase,
        total_weeks,
        plan: phasePlan,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Generate phase error:", err.message);
    res.status(500).json({ error: "Server error", detail: err.message });
  }
});

// Handles transition phases that inherit exercises from the prior programme
// rather than calling the AI. Copies the most recent programme's week-1
// exercises and applies transition loading (phaseConfig.transition) across
// every week of the transition.
async function generateTransitionInheriting(
  req,
  res,
  userId,
  userKey,
  gymId,
  gymName,
  totalWeeks,
  sessionsPerWeek,
  conditioningCount,
) {
  try {
    const priorProgResult = await pool.query(
      `SELECT id FROM programmes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );
    if (priorProgResult.rows.length === 0) {
      return res.status(400).json({
        error:
          "No prior programme found to inherit exercises from for transition",
      });
    }
    const priorProgrammeId = priorProgResult.rows[0].id;
    const priorExercisesByType = await getCurrentPhaseExercises(
      userId,
      priorProgrammeId,
    );

    const weightLookup = await buildWeightLookup(userId);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const progResult = await client.query(
        `INSERT INTO programmes (user_id, phase, week_start, total_weeks)
         VALUES ($1, 'transition', CURRENT_DATE, $2) RETURNING id`,
        [userId, totalWeeks],
      );
      const programmeId = progResult.rows[0].id;

      const sessionTypes = Object.keys(priorExercisesByType);
      const phasePlan = {};
      const enrichedConditioning = {};
      for (const type of sessionTypes) {
        phasePlan[type] = { exercises: priorExercisesByType[type] };
        enrichedConditioning[type] = []; // transition skips conditioning
      }

      await generateAllWeeksForProgramme({
        client,
        userId,
        userKey,
        programmeId,
        phase: "transition",
        totalWeeks,
        sessionsPerWeek,
        sessionOrder: sessionTypes,
        phasePlan,
        enrichedConditioning,
        gymId,
        weightLookup,
      });

      await client.query("COMMIT");
      res.status(201).json({
        message: "Transition phase generated (inherited exercises)",
        programme_id: programmeId,
        total_weeks: totalWeeks,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Generate transition error:", err.message);
    res.status(500).json({ error: "Server error", detail: err.message });
  }
}

// Shared week-generation loop used by both /generate-phase (all weeks at
// once) and /generate-week (one week at a time, reusing exercises already
// in the database for this programme).
async function generateAllWeeksForProgramme({
  client,
  userId,
  userKey,
  programmeId,
  phase,
  totalWeeks,
  sessionsPerWeek,
  sessionOrder,
  phasePlan,
  enrichedConditioning,
  gymId,
  weightLookup,
}) {
  for (let week = 1; week <= totalWeeks; week++) {
    await generateOneWeek({
      client,
      userId,
      userKey,
      programmeId,
      phase,
      week,
      sessionsPerWeek,
      sessionOrder,
      phasePlan,
      enrichedConditioning,
      gymId,
      weightLookup,
    });
  }
}

// Generates the sessions for a single week of a phase. Reads the correct
// session config from phaseConfig (handling Mixed's dual mxs/h tracks
// separately), applies MD grouping where relevant, and flags 1RM test
// sessions per the testing schedule.
async function generateOneWeek({
  client,
  userId,
  userKey,
  programmeId,
  phase,
  week,
  sessionsPerWeek,
  sessionOrder,
  phasePlan,
  enrichedConditioning,
  gymId,
  weightLookup,
}) {
  const testFlags = getOneRmTestFlags(phase, week, sessionsPerWeek);

  for (let sessionIndex = 0; sessionIndex < sessionsPerWeek; sessionIndex++) {
    const sessionType = sessionOrder[sessionIndex];

    let sessionConfig;
    if (phase === "mixed") {
      const mixedWeek = getMixedWeekConfig(userKey, week);
      const track = sessionType === "mixed_mxs" ? "mxs" : "h";
      // For mxs sessions, index within the mxs sub-array by how many mxs
      // sessions have occurred so far this week (0 or 1). For h sessions,
      // h tracks only have one config per week shared by both h session
      // types (h_24 and h_6).
      if (track === "mxs") {
        const mxsOccurrence =
          sessionOrder
            .slice(0, sessionIndex + 1)
            .filter((t) => t === "mixed_mxs").length - 1;
        sessionConfig = mixedWeek.mxs[mxsOccurrence] || mixedWeek.mxs[0];
      } else {
        sessionConfig = mixedWeek.h[0];
      }
    } else if (phase === "transition") {
      sessionConfig = getWeekConfig("transition", userKey, 1)[0];
    } else {
      const weekArray = getWeekConfig(phase, userKey, week);
      sessionConfig = weekArray[sessionIndex] || weekArray[0];
    }

    const exercises = phasePlan[sessionType]?.exercises || [];
    const enrichedExercises = await enrichExercisesForSession(
      exercises,
      sessionConfig,
      weightLookup,
      gymId,
      userId,
    );

    let groupIds = null;
    if (phase === "muscle_definition") {
      groupIds = getMdGroupIds(week, enrichedExercises.length);
    }

    const sessionResult = await client.query(
      `INSERT INTO sessions
         (user_id, programme_id, session_type, week_number, gym_id, is_1rm_test)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        userId,
        programmeId,
        sessionType,
        week,
        gymId,
        testFlags[sessionIndex] || false,
      ],
    );

    await insertSessionExercises(
      client,
      sessionResult.rows[0].id,
      enrichedExercises,
      enrichedConditioning[sessionType] || [],
      groupIds,
    );
  }
}

// ─── Generate week ────────────────────────────────────────────────────────────
// POST /ai/generate-week
// Called for every week AFTER the first in an already-generated phase
// (triggered by cron.js). No AI call — reuses the exercises already
// selected for this programme and applies that week's phaseConfig loading.

router.post("/generate-week", async (req, res) => {
  const userId = resolveUserId(req, res);
  if (!userId) return;

  const { week_number } = req.body;
  if (!week_number) {
    return res.status(400).json({ error: "week_number is required" });
  }

  try {
    const userKey = getUserKey(userId);

    const userResult = await pool.query(
      `SELECT current_phase FROM users WHERE id = $1`,
      [userId],
    );
    if (userResult.rows.length === 0)
      return res.status(404).json({ error: "User not found" });
    const { current_phase } = userResult.rows[0];

    const progResult = await pool.query(
      `SELECT id, total_weeks FROM programmes
       WHERE user_id = $1 AND phase = $2
       ORDER BY created_at DESC LIMIT 1`,
      [userId, current_phase],
    );
    if (progResult.rows.length === 0) {
      return res.status(400).json({
        error: `No active programme found for phase ${current_phase}`,
      });
    }
    const programmeId = progResult.rows[0].id;

    const gymResult = await pool.query(
      `SELECT id FROM gyms WHERE user_id = $1 AND is_default = TRUE LIMIT 1`,
      [userId],
    );
    if (gymResult.rows.length === 0)
      return res.status(400).json({ error: "No default gym configured." });
    const gymId = gymResult.rows[0].id;

    const conditioningLookup = await getConditioningLookup(gymId);
    const exercisesByType = await getCurrentPhaseExercises(userId, programmeId);
    const weightLookup = await buildWeightLookup(userId);

    // Re-fetch conditioning already used for week 1 of this programme so it
    // stays consistent across the phase, rather than re-querying the AI.
    const week1CondResult = await pool.query(
      `SELECT s.session_type, pe.exercise_name, pe.target_sets, pe.target_reps,
              pe.metric
       FROM sessions s
       JOIN planned_exercises pe ON pe.session_id = s.id
       WHERE s.programme_id = $1 AND s.week_number = 1
         AND pe.muscles_primary = 'Conditioning'
       ORDER BY s.session_type, pe.order_index`,
      [programmeId],
    );
    const enrichedConditioning = {};
    for (const row of week1CondResult.rows) {
      if (!enrichedConditioning[row.session_type])
        enrichedConditioning[row.session_type] = [];
      enrichedConditioning[row.session_type].push({
        exercise: row.exercise_name,
        sets: row.target_sets,
        target_reps: row.target_reps,
        metric: row.metric,
      });
    }

    const template = PHASE_SESSION_TEMPLATES[current_phase];
    const sessionOrder =
      template?.sessionOrder ||
      (template
        ? template.sessions.map((s) => s.type)
        : Object.keys(exercisesByType));
    const sessionsPerWeek = sessionOrder.length;

    const phasePlan = {};
    for (const type of Object.keys(exercisesByType)) {
      phasePlan[type] = { exercises: exercisesByType[type] };
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await generateOneWeek({
        client,
        userId,
        userKey,
        programmeId,
        phase: current_phase,
        week: week_number,
        sessionsPerWeek,
        sessionOrder,
        phasePlan,
        enrichedConditioning,
        gymId,
        weightLookup,
      });

      await client.query("COMMIT");
      res.status(201).json({
        message: "Week generated successfully",
        programme_id: programmeId,
        week_number,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Generate week error:", err.message);
    res.status(500).json({ error: "Server error", detail: err.message });
  }
});

// ─── Generate gym session ─────────────────────────────────────────────────────
// POST /ai/generate-gym-session
// Swaps a single planned session to a different gym. Re-selects exercises
// for that one session only (since the exercise library differs per gym),
// using the same session template and that week's phaseConfig loading.

router.post("/generate-gym-session", requireAuth, async (req, res) => {
  const { session_id, gym_id } = req.body;
  if (!session_id)
    return res.status(400).json({ error: "session_id is required" });
  if (!gym_id) return res.status(400).json({ error: "gym_id is required" });

  try {
    const userKey = getUserKey(req.userId);

    const gymResult = await pool.query(
      `SELECT gym_name FROM gyms WHERE id = $1 AND user_id = $2`,
      [gym_id, req.userId],
    );
    if (gymResult.rows.length === 0)
      return res.status(404).json({ error: "Gym not found" });
    const gymName = gymResult.rows[0].gym_name;

    const sessionResult = await pool.query(
      `SELECT s.*, p.phase
       FROM sessions s
       JOIN programmes p ON p.id = s.programme_id
       WHERE s.id = $1 AND s.user_id = $2`,
      [session_id, req.userId],
    );
    if (sessionResult.rows.length === 0)
      return res.status(404).json({ error: "Session not found" });

    const session = sessionResult.rows[0];
    const { session_type, phase, week_number } = session;

    const userResult = await pool.query(
      `SELECT conditioning_exercises_per_session FROM users WHERE id = $1`,
      [req.userId],
    );
    const conditioningCount =
      userResult.rows[0].conditioning_exercises_per_session || 3;

    const [
      sessionHistory,
      oneRepMaxHistory,
      bodyCompHistory,
      conditioningLookup,
      weightLookup,
    ] = await Promise.all([
      getSessionHistory(req.userId),
      getOneRepMaxHistory(req.userId),
      getBodyCompHistory(req.userId),
      getConditioningLookup(gym_id),
      buildWeightLookup(req.userId),
    ]);

    const gymCSV = await buildGymCSV(gym_id, req.userId);
    const condCSV = buildConditioningCSV(conditioningLookup);

    const template = PHASE_SESSION_TEMPLATES[phase];
    const sessionDef = template?.sessions.find((s) => s.type === session_type);
    const slotsDescription = sessionDef
      ? sessionDef.slots
      : "Select exercises appropriate for this session type and phase.";

    const userPrompt = `Select exercises for a single ${session_type} session for the following athlete at ${gymName}.
The server will calculate all weights, reps, and sets — return exercise selections only.

This session replaces a planned session at a different gym.

SESSION TEMPLATE
${slotsDescription}

CURRENT STATE
- Phase: ${phase}
- Week: ${week_number}
- Gym: ${gymName}
- Conditioning exercises: ${conditioningCount}

EXERCISE LIBRARY (${gymName} only)
${gymCSV}

CONDITIONING LIBRARY
${condCSV}

ESTIMATED 1RM HISTORY (for selection context — do not calculate weights)
${JSON.stringify(oneRepMaxHistory, null, 2)}

SESSION HISTORY — LAST 4 WEEKS
${JSON.stringify(sessionHistory, null, 2)}

BODY COMPOSITION — LAST 4 WEEKS
${JSON.stringify(bodyCompHistory, null, 2)}

Return ONLY this exact JSON structure, nothing else:
{
  "exercises": [
    { "exercise": "<name>", "muscles_primary": "<primary muscle>", "sub_component": "<sub component>" }
  ],
  "conditioning": [
    { "exercise": "<name>", "sets": <number> }
  ]
}

Then ${conditioningCount} conditioning exercises.
No extra fields. No explanation. No markdown.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: PHASE_GENERATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const rawText = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const result = JSON.parse(cleanJSON(rawText));

    if (!result.exercises || result.exercises.length === 0)
      throw new Error("Invalid session structure from Claude");

    let sessionConfig;
    if (phase === "mixed") {
      const mixedWeek = getMixedWeekConfig(userKey, week_number);
      sessionConfig =
        session_type === "mixed_mxs" ? mixedWeek.mxs[0] : mixedWeek.h[0];
    } else if (phase === "transition") {
      sessionConfig = getWeekConfig("transition", userKey, 1)[0];
    } else {
      const weekArray = getWeekConfig(phase, userKey, week_number);
      sessionConfig = weekArray[0];
    }

    const enrichedExercises = await enrichExercisesForSession(
      result.exercises,
      sessionConfig,
      weightLookup,
      gym_id,
      req.userId,
    );
    const enrichedConditioning = enrichConditioningExercises(
      result.conditioning || [],
      conditioningLookup,
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM planned_exercises WHERE session_id = $1`,
        [session_id],
      );

      await insertSessionExercises(
        client,
        session_id,
        enrichedExercises,
        enrichedConditioning,
      );

      await client.query(
        `UPDATE sessions SET gym_id = $1, status = 'in_progress', started_at = NOW() WHERE id = $2`,
        [gym_id, session_id],
      );
      await client.query("COMMIT");

      res.status(200).json({
        message: "Gym session generated and started",
        session_id,
        exercises: enrichedExercises,
        conditioning: enrichedConditioning,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Generate gym session error:", err.message);
    res.status(500).json({ error: "Server error", detail: err.message });
  }
});

// ─── Extra session ────────────────────────────────────────────────────────────
// POST /ai/extra-session

router.post("/extra-session", requireAuth, async (req, res) => {
  const { gym_id, session_type } = req.body;
  if (!gym_id) return res.status(400).json({ error: "gym_id is required" });

  try {
    const userKey = getUserKey(req.userId);

    const gymCheck = await pool.query(
      `SELECT id, gym_name FROM gyms WHERE id = $1 AND user_id = $2`,
      [gym_id, req.userId],
    );
    if (gymCheck.rows.length === 0)
      return res.status(404).json({ error: "Gym not found" });
    const gymId = gymCheck.rows[0].id;
    const gymName = gymCheck.rows[0].gym_name;

    const userResult = await pool.query(
      `SELECT current_phase, phase_week, conditioning_exercises_per_session
       FROM users WHERE id = $1`,
      [req.userId],
    );
    if (userResult.rows.length === 0)
      return res.status(404).json({ error: "User not found" });

    const { current_phase, phase_week, conditioning_exercises_per_session } =
      userResult.rows[0];
    const conditioningCount = conditioning_exercises_per_session || 3;

    const template = PHASE_SESSION_TEMPLATES[current_phase];
    const effectiveSessionType =
      session_type || (template ? template.sessions[0].type : "full_body");
    const sessionDef = template?.sessions.find(
      (s) => s.type === effectiveSessionType,
    );
    const slotsDescription = sessionDef
      ? sessionDef.slots
      : "Select exercises appropriate for this phase, based on what has been undertrained recently.";

    let sessionConfig;
    if (current_phase === "mixed") {
      const mixedWeek = getMixedWeekConfig(userKey, phase_week);
      sessionConfig =
        effectiveSessionType === "mixed_mxs"
          ? mixedWeek.mxs[0]
          : mixedWeek.h[0];
    } else if (current_phase === "transition") {
      sessionConfig = getWeekConfig("transition", userKey, 1)[0];
    } else {
      const weekArray = getWeekConfig(current_phase, userKey, phase_week);
      sessionConfig = weekArray[0];
    }

    const [
      sessionHistory,
      oneRepMaxHistory,
      bodyCompHistory,
      dietHistory,
      moodHistory,
      cardioHistory,
      conditioningLookup,
      weightLookup,
    ] = await Promise.all([
      getSessionHistory(req.userId),
      getOneRepMaxHistory(req.userId),
      getBodyCompHistory(req.userId),
      getDietHistory(req.userId),
      getMoodHistory(req.userId),
      getCardioHistory(req.userId),
      getConditioningLookup(gymId),
      buildWeightLookup(req.userId),
    ]);

    const lastSession = sessionHistory[0];
    const daysSinceLast = lastSession
      ? Math.floor(
          (Date.now() - new Date(lastSession.completed_at).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : 7;

    const gymCSV = await buildGymCSV(gymId, req.userId);
    const condCSV = buildConditioningCSV(conditioningLookup);

    const userPrompt = `The athlete has arrived at the gym for an extra ${effectiveSessionType} session today. Select exercises based on what has been undertrained recently, recovery needs, and training history. Then select ${conditioningCount} conditioning exercises.
The server will calculate all weights, reps, and sets — return exercise selections only.

SESSION TEMPLATE
${slotsDescription}

CURRENT STATE
- Phase: ${current_phase}
- Phase week: ${phase_week}
- Gym: ${gymName}
- Days since last session: ${daysSinceLast}
- Conditioning exercises: ${conditioningCount}

EXERCISE LIBRARY
${gymCSV}

CONDITIONING LIBRARY
${condCSV}

ESTIMATED 1RM HISTORY (for selection context — do not calculate weights)
${JSON.stringify(oneRepMaxHistory, null, 2)}

SESSION HISTORY — LAST 4 WEEKS
${JSON.stringify(sessionHistory, null, 2)}

BODY COMPOSITION — LAST 4 WEEKS
${JSON.stringify(bodyCompHistory, null, 2)}

DIET — LAST 2 WEEKS
${dietHistory.length > 0 ? JSON.stringify(dietHistory, null, 2) : "No diet data logged"}

MOOD AND ENERGY — LAST 2 WEEKS
${moodHistory.length > 0 ? JSON.stringify(moodHistory, null, 2) : "No mood data logged"}

CARDIO — LAST 2 WEEKS
${cardioHistory.length > 0 ? JSON.stringify(cardioHistory, null, 2) : "No cardio logged"}

Use today's mood and energy scores to inform exercise selection. If energy is low, select exercises the athlete performs well at. If cardio load has been heavy this week, favour upper body movements to allow leg recovery.

Return ONLY this exact JSON structure, nothing else:
{
  "exercises": [
    { "exercise": "<name>", "muscles_primary": "<primary muscle>", "sub_component": "<sub component>" }
  ],
  "conditioning": [
    { "exercise": "<name>", "sets": <number> }
  ]
}

Then ${conditioningCount} conditioning exercises. No extra fields. No explanation. No markdown.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: PHASE_GENERATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const rawText = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const result = JSON.parse(cleanJSON(rawText));

    if (!result.exercises || result.exercises.length === 0)
      throw new Error("Invalid session structure from Claude");

    const enrichedExercises = await enrichExercisesForSession(
      result.exercises,
      sessionConfig,
      weightLookup,
      gymId,
      req.userId,
    );
    const enrichedConditioning = enrichConditioningExercises(
      result.conditioning || [],
      conditioningLookup,
    );

    const progResult = await pool.query(
      `SELECT p.id FROM programmes p JOIN sessions s ON s.programme_id = p.id WHERE s.user_id = $1 ORDER BY p.created_at DESC LIMIT 1`,
      [req.userId],
    );
    if (progResult.rows.length === 0)
      return res.status(400).json({ error: "No active programme found" });
    const programmeId = progResult.rows[0].id;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const sessionResult = await client.query(
        `INSERT INTO sessions (user_id, programme_id, session_type, week_number, gym_id, status, started_at)
         VALUES ($1, $2, 'extra', $3, $4, 'in_progress', NOW()) RETURNING id`,
        [req.userId, programmeId, phase_week, gymId],
      );

      const sessionId = sessionResult.rows[0].id;

      await insertSessionExercises(
        client,
        sessionId,
        enrichedExercises,
        enrichedConditioning,
      );

      await client.query("COMMIT");
      res.status(201).json({
        message: "Extra session generated and started",
        session_id: sessionId,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Extra session error:", err.message);
    res.status(500).json({ error: "Server error", detail: err.message });
  }
});

// ─── Exercise metadata lookup ─────────────────────────────────────────────────
// POST /ai/exercise-metadata
// Unchanged from previous version — no phase/level dependency.

router.post("/exercise-metadata", requireAuth, async (req, res) => {
  const { exercise_name } = req.body;
  if (!exercise_name)
    return res.status(400).json({ error: "exercise_name is required" });

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `Given the gym exercise "${exercise_name}", return metadata in JSON.

Return ONLY this exact JSON structure, nothing else:
{
  "muscles_primary": "<primary muscle group, e.g. Chest, Back, Biceps, Triceps, Shoulders, Quads, Hamstrings, Calves, Core, Forearms, Lower Back>",
  "muscles_secondary": "<secondary muscles or null>",
  "type": "<Compound or Isolation>",
  "sub_component": "<specific sub-component, e.g. Sternal head, Lower lat, Long head>",
  "emg_score": <integer 1-5 based on EMG activation data>
}

No explanation. No markdown. Valid JSON only.`,
        },
      ],
    });

    const rawText = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const metadata = JSON.parse(cleanJSON(rawText));
    res.json(metadata);
  } catch (err) {
    console.error("Exercise metadata error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Suggest exercises ────────────────────────────────────────────────────────
// POST /ai/suggest-exercises
// Unchanged from previous version — no phase/level dependency.

router.post("/suggest-exercises", requireAuth, async (req, res) => {
  const { gym_id } = req.body;
  if (!gym_id) return res.status(400).json({ error: "gym_id is required" });

  try {
    const gymResult = await pool.query(
      `SELECT gym_name FROM gyms WHERE id = $1 AND user_id = $2`,
      [gym_id, req.userId],
    );
    if (gymResult.rows.length === 0)
      return res.status(404).json({ error: "Gym not found" });
    const gymName = gymResult.rows[0].gym_name;

    const equipmentResult = await pool.query(
      `SELECT id, equipment_name, type, unladen_weight, increment FROM equipment WHERE gym_id = $1 AND user_id = $2 ORDER BY type ASC, equipment_name ASC`,
      [gym_id, req.userId],
    );
    const existingResult = await pool.query(
      `SELECT exercise FROM exercises WHERE gym_id = $1 AND user_id = $2`,
      [gym_id, req.userId],
    );
    const existingNames = existingResult.rows.map((e) => e.exercise);
    const equipmentList =
      equipmentResult.rows.length > 0
        ? equipmentResult.rows
            .map((e) => `${e.equipment_name} (${e.type})`)
            .join(", ")
        : "General gym equipment";

    const equipLookup = {};
    for (const eq of equipmentResult.rows) {
      equipLookup[eq.equipment_name.toLowerCase()] = eq.id;
    }

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      messages: [
        {
          role: "user",
          content: `Suggest gym exercises for a user setting up their exercise library for "${gymName}".

AVAILABLE EQUIPMENT
${equipmentList}

EXERCISES ALREADY IN THEIR LIBRARY (exclude these)
${existingNames.length > 0 ? existingNames.join(", ") : "None"}

Suggest 15 exercises appropriate for this equipment. Cover all major muscle groups. Do not suggest any exercise already in their library.
For each exercise, include the equipment_name exactly as it appears in the AVAILABLE EQUIPMENT list above. Use null for bodyweight exercises with no equipment.
Return ONLY this exact JSON structure, nothing else:
{
  "exercises": [
    {
      "exercise": "<name>",
      "muscles_primary": "<primary muscle group>",
      "muscles_secondary": "<secondary muscles or null>",
      "type": "<Compound or Isolation>",
      "sub_component": "<specific sub-component>",
      "emg_score": <integer 1-5>,
      "equipment_name": "<name from AVAILABLE EQUIPMENT list, or null>"
    }
  ]
}

Group logically but return as a flat array. No explanation. No markdown. Valid JSON only.`,
        },
      ],
    });

    const rawText = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const result = JSON.parse(cleanJSON(rawText));

    for (const ex of result.exercises || []) {
      if (ex.equipment_name) {
        ex.equipment_id = equipLookup[ex.equipment_name.toLowerCase()] || null;
      } else {
        ex.equipment_id = null;
      }
    }

    res.json(result);
  } catch (err) {
    console.error("Suggest exercises error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Get latest weekly feedback ───────────────────────────────────────────────
// GET /ai/weekly-feedback
// Unchanged from previous version.

router.get("/weekly-feedback", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM weekly_feedback WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.userId],
    );
    res.json(result.rows.length > 0 ? result.rows[0] : null);
  } catch (err) {
    console.error("Get weekly feedback error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── System prompt ────────────────────────────────────────────────────────────

const PHASE_GENERATION_SYSTEM_PROMPT = `You are a personal gym coach and exercise selector. You follow periodisation principles from Tudor Bompa's Serious Strength Training.

ROLE
You select and order exercises. The server calculates all weights, reps, and sets from periodised loading patterns (phaseConfig × 1RM). Do not include weights, reps, or sets in your response. Your focus is choosing the right exercises for the athlete's current phase, history, and goals.

EXERCISES PERSIST FOR THE FULL PHASE
Unlike older versions of this app, there is no mid-phase exercise rotation. The exercises you select will be used for every week of the phase (3 or 6 weeks). Choose exercises that are sustainable and appropriate across the full duration — do not pick exercises only suitable for a single week's intensity.

SESSION TEMPLATES
Each phase has its own session structure, provided in the user prompt as "SESSION TEMPLATES FOR THIS PHASE". Follow the muscle/role slots exactly as described. Where a template says two session types must share specific exercises (e.g. Mixed phase's H sessions), select those shared exercises once and reuse them as instructed.

EXERCISE SELECTION RULES
1. SUB-COMPONENT COVERAGE — avoid repeating the same sub-component used in the athlete's previous phase
2. PROGRESSIVE OVERLOAD — favour exercises with stronger historical performance
3. RECENCY — deprioritise exercises from the immediately preceding phase unless EMG gap is 2+ points
4. EMG SCORE — prefer higher scores when other factors are equal
5. TIEBREAKER — use table order

SUB-COMPONENT VALUES
sub_component must always be an anatomical term describing the specific part of the muscle being targeted. Examples: "Sternal head", "Clavicular head", "Anterior deltoid", "Long head", "Lower lat", "Vastus lateralis". Never use movement patterns like "Vertical Push", "Horizontal Pull", or "Pressing" as sub-components.

EXERCISE ORDERING
Do not place exercises targeting the same primary muscle group consecutively. Alternate between upper and lower body where possible to allow muscle group recovery between exercises.

PHASE CONTEXT
Each phase has a different training goal that should influence exercise selection:
- Anatomical Adaptation: Movement quality and connective tissue preparation. Favour exercises with good form accessibility and full range of motion.
- Hypertrophy: Muscle size and density. Favour exercises that maximise time under tension. Prefer equipment supporting controlled movement under moderate loads.
- Mixed: MxS-type sessions favour heavy compound movements (barbell, loadable equipment). H-type sessions favour controlled accessory work.
- Maximum Strength: Force production and neural adaptation. Favour heavy compound movements. Prefer barbell and loadable equipment that supports heavy loading.
- Muscle Definition: Metabolic conditioning at high reps. All equipment types permitted. Favour exercises suitable for sustained high-rep endurance work and, in later weeks, exercises that pair well together for nonstop execution.

HAMSTRING CAUTION
Favour controlled, lower-risk hamstring exercises. Bompa's tables consistently load hamstrings more conservatively than other muscle groups — prefer machine or supported variants over free-weight ballistic movements where the template allows a choice.

You must return ONLY valid JSON matching the exact structure specified. No explanation, no markdown, no extra fields.`;

module.exports = router;
