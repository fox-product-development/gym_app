// backend/routes/ai.js
// AI routes — block generation, gym session swap, extra session, weekly feedback.
// The AI's role is exercise SELECTION and ORDERING. The server calculates all
// weights, reps, and sets from phaseConfig × 1RM data.

const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const pool = require("../db");
const requireAuth = require("../middleware");
const { getValidWeightsForEquipment } = require("../weightCalc");
const { getWeekConfig, BASELINE_TEST_CONFIG } = require("../phaseConfig");

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

// Normalises training_level to handle the 'amateur' → 'recreational' rename
// that hasn't been migrated yet. Falls back to 'recreational' if null.
function normaliseTrainingLevel(raw) {
  if (!raw) return "recreational";
  if (raw === "amateur") return "recreational";
  return raw;
}

async function getSessionHistory(userId) {
  const result = await pool.query(
    `SELECT
       s.id, s.session_type, s.occurrence, s.week_number,
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

async function getPreviousBlockExercises(userId, phase, blockNumber) {
  const previousBlock = blockNumber === 2 ? 1 : null;
  if (!previousBlock) return [];

  const result = await pool.query(
    `SELECT DISTINCT pe.exercise_name
     FROM planned_exercises pe
     JOIN sessions s ON s.id = pe.session_id
     JOIN programmes p ON p.id = s.programme_id
     WHERE s.user_id = $1
       AND p.phase = $2
       AND p.block_number = $3`,
    [userId, phase, previousBlock],
  );
  return result.rows.map((r) => r.exercise_name);
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

// Builds a lookup map of exercise → { estimated_1rm, target_weight } for
// server-side weight calculation. 1RM is preferred; target_weight is the
// fallback until a baseline testing session establishes a proper 1RM.
async function buildWeightLookup(userId, gymId) {
  const ormResult = await pool.query(
    `SELECT DISTINCT ON (exercise_name)
       exercise_name, estimated_1rm
     FROM one_rep_max_history
     WHERE user_id = $1
     ORDER BY exercise_name, logged_at DESC`,
    [userId],
  );

  const twResult = await pool.query(
    `SELECT exercise, target_weight
     FROM exercises
     WHERE user_id = $1 AND gym_id = $2 AND active = TRUE`,
    [userId, gymId],
  );

  const lookup = {};

  for (const row of twResult.rows) {
    lookup[row.exercise.toLowerCase()] = {
      estimated_1rm: null,
      target_weight: row.target_weight ? parseFloat(row.target_weight) : null,
    };
  }

  for (const row of ormResult.rows) {
    const key = row.exercise_name.toLowerCase();
    if (!lookup[key])
      lookup[key] = { estimated_1rm: null, target_weight: null };
    lookup[key].estimated_1rm = row.estimated_1rm
      ? parseFloat(row.estimated_1rm)
      : null;
  }

  return lookup;
}

// Calculates a target weight for an exercise at a given percentage of 1RM.
// Falls back to target_weight from the exercises table if no 1RM exists.
// Returns 0 for exercises with no weight data (e.g. bodyweight exercises).
function calculateExerciseWeight(exerciseName, percentage, weightLookup) {
  const key = exerciseName.toLowerCase();
  const data = weightLookup[key];
  if (!data) return 0;

  if (data.estimated_1rm) {
    return data.estimated_1rm * percentage;
  }

  // Fallback: target_weight is a working weight maintained by the PO system.
  // This is a rough proxy until a baseline testing session establishes a
  // proper 1RM for this exercise.
  if (data.target_weight) {
    return data.target_weight;
  }

  return 0;
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

// ─── Equipment summary for AI prompt ─────────────────────────────────────────
// Retained for potential future use but no longer included in AI prompts.
// The server now calculates all weights from phaseConfig × 1RM.

async function buildEquipmentSummary(gymId, userId) {
  const sections = [];

  try {
    const result = await pool.query(
      `SELECT id, equipment_name, type, increment, max_weight, unladen_weight
       FROM equipment
       WHERE gym_id = $1 AND user_id = $2
         AND type != 'apparatus'
       ORDER BY type, equipment_name`,
      [gymId, userId],
    );

    for (const eq of result.rows) {
      const validWeights = await getValidWeightsForEquipment(
        eq.id,
        gymId,
        userId,
      );

      if (eq.type === "loadable" && validWeights.length > 0) {
        const isDumbbell = eq.equipment_name.toLowerCase().includes("dumbbell");
        const convention = isDumbbell
          ? " (weight shown is per dumbbell)"
          : " (total weight including bar)";
        sections.push(
          `${eq.equipment_name}${convention}:\n${validWeights.join(", ")}`,
        );
      } else if (
        (eq.type === "fixed" || eq.type === "machine") &&
        eq.increment
      ) {
        const max = eq.max_weight ? ` — max ${eq.max_weight}` : "";
        sections.push(
          `${eq.equipment_name} (${eq.type}): increments of ${eq.increment}${max}`,
        );
      }
    }
  } catch (err) {
    console.error("buildEquipmentSummary DB error:", err.message);
  }

  const equipmentSection =
    sections.length > 0
      ? sections.join("\n\n")
      : "(no equipment data available)";

  return `WEIGHT GUIDANCE PER EQUIPMENT
You must only suggest weights that are achievable on the specified equipment. For loadable equipment, use exact values from the lists below. For fixed/machine equipment, use multiples of the increment that do not exceed the max.

${equipmentSection}

DUMBBELL CONVENTION
All dumbbell weights are stored and displayed as the weight of ONE dumbbell. For example, weight: 10 means 10kg in each hand for a pair exercise, or 10kg in one hand for a single dumbbell exercise. Never double the weight for pair exercises.

BODYWEIGHT EXERCISES
Exercises with no linked equipment always have weight: 0.`;
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

// Builds the wildcard slot instruction based on how many weight exercises are requested.
function buildWildcardInstruction(
  weightExercises,
  sessionType,
  goalDescription,
) {
  const base = 6;
  const wildcardCount = Math.max(0, weightExercises - base + 1);
  const goalHint = goalDescription
    ? ` Use the athlete's goal notes to guide wildcard selection: "${goalDescription}"`
    : "";

  if (sessionType === "compound") {
    if (weightExercises <= 4) {
      const slots = ["Back", "Chest", "Lower Back", "Quads", "Shoulders"].slice(
        0,
        weightExercises,
      );
      return `${weightExercises} exercises: 1 each from ${slots.join(", ")}.`;
    }
    if (wildcardCount === 1) {
      return `${weightExercises} exercises: 1 each from Back, Chest, Lower Back, Quads, Shoulders, plus ${wildcardCount} Wildcard compound.${goalHint}`;
    }
    return `${weightExercises} exercises: 1 each from Back, Chest, Lower Back, Quads, Shoulders, plus ${wildcardCount} Wildcard compounds.${goalHint}`;
  } else {
    if (weightExercises <= 5) {
      const slots = [
        "Core (always first)",
        "Biceps",
        "Triceps",
        "Shoulders",
        "Forearms",
      ].slice(0, weightExercises);
      return `${weightExercises} exercises: ${slots.join(", ")}.`;
    }
    const extraWildcards = weightExercises - 6;
    const wildcardPool =
      extraWildcards > 0
        ? `{Core, Calves, Hamstrings} for the first wildcard, then any undertrained muscle for additional wildcards`
        : `{Core, Calves, Hamstrings}`;
    return `${weightExercises} exercises: Core (always first), Biceps, Triceps, Shoulders, Forearms, plus ${wildcardCount} Wildcard(s) from ${wildcardPool}.${goalHint}`;
  }
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

// Enriches an AI-returned exercise array with server-calculated weights, reps,
// and sets from phaseConfig for a specific week, then validates weights against
// equipment constraints.
async function enrichExercisesForWeek(
  exercises,
  weekConfig,
  weightLookup,
  gymId,
  userId,
) {
  const enriched = exercises.map((ex) => ({
    exercise: ex.exercise,
    muscles_primary: ex.muscles_primary,
    sub_component: ex.sub_component,
    sets: weekConfig.sets,
    target_reps: weekConfig.reps,
    weight: calculateExerciseWeight(
      ex.exercise,
      weekConfig.percentage,
      weightLookup,
    ),
  }));

  await validateAndCorrectWeights(enriched, gymId, userId);
  return enriched;
}

// Inserts weight exercises and conditioning exercises into planned_exercises
// for a given session.
async function insertSessionExercises(client, sessionId, weightExs, condExs) {
  for (let i = 0; i < weightExs.length; i++) {
    const ex = weightExs[i];
    await client.query(
      `INSERT INTO planned_exercises
         (session_id, exercise_name, muscles_primary, sub_component,
          order_index, target_sets, target_reps, target_weight, set_style)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
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

// ─── Generate block ───────────────────────────────────────────────────────────
// POST /ai/generate-block

router.post("/generate-block", async (req, res) => {
  const cronSecret = req.headers["x-cron-secret"];
  if (cronSecret) {
    if (cronSecret !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: "Invalid cron secret" });
    }
    req.userId = req.body.user_id;
  } else {
    const authHeader = req.headers["authorization"];
    if (!authHeader)
      return res.status(401).json({ error: "No token provided" });
    try {
      const jwt = require("jsonwebtoken");
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = decoded.userId;
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }
  }

  try {
    const userResult = await pool.query(
      `SELECT current_phase, current_block, phase_week,
              weight_exercises_per_session, conditioning_exercises_per_session,
              goal_description, training_level
       FROM users WHERE id = $1`,
      [req.userId],
    );

    if (userResult.rows.length === 0)
      return res.status(404).json({ error: "User not found" });

    const {
      current_phase,
      current_block,
      phase_week,
      weight_exercises_per_session,
      conditioning_exercises_per_session,
      goal_description,
    } = userResult.rows[0];
    const trainingLevel = normaliseTrainingLevel(
      userResult.rows[0].training_level,
    );
    const weightExercises = weight_exercises_per_session || 6;
    const conditioningCount = conditioning_exercises_per_session || 3;

    const gymResult = await pool.query(
      `SELECT id, gym_name FROM gyms WHERE user_id = $1 AND is_default = TRUE LIMIT 1`,
      [req.userId],
    );
    if (gymResult.rows.length === 0) {
      return res.status(400).json({
        error: "No default gym configured. Set a default gym in Gym Settings.",
      });
    }
    const gymId = gymResult.rows[0].id;
    const gymName = gymResult.rows[0].gym_name;

    // Verify phaseConfig exists for this phase/level/block before calling the AI
    try {
      getWeekConfig(current_phase, trainingLevel, current_block, 1);
    } catch (configErr) {
      return res.status(400).json({
        error: `No training config available: ${configErr.message}`,
      });
    }

    const [
      sessionHistory,
      oneRepMaxHistory,
      bodyCompHistory,
      previousBlockExercises,
      dietHistory,
      moodHistory,
      cardioHistory,
      conditioningLookup,
      weightLookup,
    ] = await Promise.all([
      getSessionHistory(req.userId),
      getOneRepMaxHistory(req.userId),
      getBodyCompHistory(req.userId),
      getPreviousBlockExercises(req.userId, current_phase, current_block),
      getDietHistory(req.userId),
      getMoodHistory(req.userId),
      getCardioHistory(req.userId),
      getConditioningLookup(gymId),
      buildWeightLookup(req.userId, gymId),
    ]);

    const gymCSV = await buildGymCSV(gymId, req.userId);
    const condCSV = buildConditioningCSV(conditioningLookup);
    const compoundInstruction = buildWildcardInstruction(
      weightExercises,
      "compound",
      goal_description,
    );
    const isolationInstruction = buildWildcardInstruction(
      weightExercises,
      "isolation",
      goal_description,
    );

    const userPrompt = `Select exercises for a training block for the following athlete.
The server will calculate all weights, reps, and sets — return exercise selections only.

CURRENT STATE
- Phase: ${current_phase}
- Block: ${current_block}
- Phase week: ${phase_week} of 6
- Training level: ${trainingLevel}
- Gym: ${gymName}
- Weight exercises per session: ${weightExercises}
- Conditioning exercises per session: ${conditioningCount}
- Athlete notes: ${goal_description || "None"}

EXERCISE LIBRARY
${gymCSV}

CONDITIONING LIBRARY
${condCSV}

ESTIMATED 1RM HISTORY (for selection context — do not calculate weights)
${JSON.stringify(oneRepMaxHistory, null, 2)}

SESSION HISTORY — LAST 4 WEEKS
${JSON.stringify(sessionHistory, null, 2)}

PREVIOUS BLOCK EXERCISES
${previousBlockExercises.length > 0 ? previousBlockExercises.join(", ") : "None — this is the first block"}

BODY COMPOSITION — LAST 4 WEEKS
${JSON.stringify(bodyCompHistory, null, 2)}

DIET — LAST 2 WEEKS
${dietHistory.length > 0 ? JSON.stringify(dietHistory, null, 2) : "No diet data logged"}

MOOD AND ENERGY — LAST 2 WEEKS
${moodHistory.length > 0 ? JSON.stringify(moodHistory, null, 2) : "No mood data logged"}

CARDIO — LAST 2 WEEKS
${cardioHistory.length > 0 ? JSON.stringify(cardioHistory, null, 2) : "No cardio logged"}

Use diet, mood, energy and cardio data to inform exercise selection and ordering. If energy has been consistently low, favour exercises the athlete performs well at. If cardio load has been high, consider recovery when selecting compound movements.

For conditioning: select ${conditioningCount} exercises from the conditioning library. Aim for at least 1 cardio movement and 1 core exercise. Use remaining slots to match the athlete's goal description and phase. Return only the exercise name and sets — targets and metrics are looked up server-side. Exercise names must match the conditioning library exactly.

Return ONLY this exact JSON structure, nothing else:
{
  "compound_session": {
    "exercises": [
      {
        "exercise": "<name>",
        "muscles_primary": "<primary muscle>",
        "sub_component": "<sub component>"
      }
    ],
    "conditioning": [
      {
        "exercise": "<name>",
        "sets": <number>
      }
    ]
  },
  "isolation_session": {
    "exercises": [
      {
        "exercise": "<name>",
        "muscles_primary": "<primary muscle>",
        "sub_component": "<sub component>"
      }
    ],
    "conditioning": [
      {
        "exercise": "<name>",
        "sets": <number>
      }
    ]
  }
}

Compound: ${compoundInstruction} Then ${conditioningCount} conditioning exercises appended after.
Isolation: ${isolationInstruction} Then ${conditioningCount} conditioning exercises appended after. No extra fields. No explanation. No markdown.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: BLOCK_GENERATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const rawText = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const blockPlan = JSON.parse(cleanJSON(rawText));

    if (!blockPlan.compound_session || !blockPlan.isolation_session) {
      throw new Error("Invalid block plan structure from Claude");
    }

    // Enrich conditioning once (phase-independent)
    const enrichedCompConditioning = enrichConditioningExercises(
      blockPlan.compound_session.conditioning || [],
      conditioningLookup,
    );
    const enrichedIsoConditioning = enrichConditioningExercises(
      blockPlan.isolation_session.conditioning || [],
      conditioningLookup,
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const progResult = await client.query(
        `INSERT INTO programmes (user_id, phase, block_number, week_start) VALUES ($1, $2, $3, CURRENT_DATE) RETURNING id`,
        [req.userId, current_phase, current_block],
      );
      const programmeId = progResult.rows[0].id;

      for (let week = 1; week <= 3; week++) {
        const weekConfig = getWeekConfig(
          current_phase,
          trainingLevel,
          current_block,
          week,
        );

        // Server calculates weights from phaseConfig percentage × 1RM,
        // then validates against equipment constraints
        const compoundExercises = await enrichExercisesForWeek(
          blockPlan.compound_session.exercises,
          weekConfig,
          weightLookup,
          gymId,
          req.userId,
        );

        const isolationExercises = await enrichExercisesForWeek(
          blockPlan.isolation_session.exercises,
          weekConfig,
          weightLookup,
          gymId,
          req.userId,
        );

        // TODO: Week 1 session 1 should be flagged as a 1RM baseline testing
        // session (one max-effort set per exercise, 4-8 reps to failure).
        // The baseline results would then recalculate weights for the
        // remaining sessions. See BASELINE_TEST_CONFIG in phaseConfig.js.

        const comp1 = await client.query(
          `INSERT INTO sessions (user_id, programme_id, session_type, occurrence, week_number, gym_id)
           VALUES ($1, $2, 'compound', 1, $3, $4) RETURNING id`,
          [req.userId, programmeId, week, gymId],
        );
        await insertSessionExercises(
          client,
          comp1.rows[0].id,
          compoundExercises,
          enrichedCompConditioning,
        );

        const comp2 = await client.query(
          `INSERT INTO sessions (user_id, programme_id, session_type, occurrence, week_number, gym_id)
           VALUES ($1, $2, 'compound', 2, $3, $4) RETURNING id`,
          [req.userId, programmeId, week, gymId],
        );
        await insertSessionExercises(
          client,
          comp2.rows[0].id,
          compoundExercises,
          enrichedCompConditioning,
        );

        const iso = await client.query(
          `INSERT INTO sessions (user_id, programme_id, session_type, occurrence, week_number, gym_id)
           VALUES ($1, $2, 'isolation', 1, $3, $4) RETURNING id`,
          [req.userId, programmeId, week, gymId],
        );
        await insertSessionExercises(
          client,
          iso.rows[0].id,
          isolationExercises,
          enrichedIsoConditioning,
        );
      }

      await client.query("COMMIT");
      res.status(201).json({
        message: "Block generated successfully",
        programme_id: programmeId,
        compound_session: blockPlan.compound_session,
        isolation_session: blockPlan.isolation_session,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Generate block error:", err.message);
    res.status(500).json({ error: "Server error", detail: err.message });
  }
});

// ─── Generate gym session ─────────────────────────────────────────────────────
// POST /ai/generate-gym-session

router.post("/generate-gym-session", requireAuth, async (req, res) => {
  const { session_id, gym_id } = req.body;
  if (!session_id)
    return res.status(400).json({ error: "session_id is required" });
  if (!gym_id) return res.status(400).json({ error: "gym_id is required" });

  try {
    const gymResult = await pool.query(
      `SELECT gym_name FROM gyms WHERE id = $1 AND user_id = $2`,
      [gym_id, req.userId],
    );
    if (gymResult.rows.length === 0)
      return res.status(404).json({ error: "Gym not found" });
    const gymName = gymResult.rows[0].gym_name;

    const sessionResult = await pool.query(
      `SELECT s.*, p.phase, p.block_number, u.phase_week, u.training_level
       FROM sessions s
       JOIN programmes p ON p.id = s.programme_id
       JOIN users u ON u.id = s.user_id
       WHERE s.id = $1 AND s.user_id = $2`,
      [session_id, req.userId],
    );
    if (sessionResult.rows.length === 0)
      return res.status(404).json({ error: "Session not found" });

    const session = sessionResult.rows[0];
    const { session_type, phase, block_number, week_number } = session;
    const trainingLevel = normaliseTrainingLevel(session.training_level);

    const userResult = await pool.query(
      `SELECT weight_exercises_per_session, conditioning_exercises_per_session, goal_description FROM users WHERE id = $1`,
      [req.userId],
    );
    const {
      weight_exercises_per_session,
      conditioning_exercises_per_session,
      goal_description,
    } = userResult.rows[0];
    const weightExercises = weight_exercises_per_session || 6;
    const conditioningCount = conditioning_exercises_per_session || 3;

    const [
      sessionHistory,
      oneRepMaxHistory,
      bodyCompHistory,
      previousBlockExercises,
      conditioningLookup,
      weightLookup,
    ] = await Promise.all([
      getSessionHistory(req.userId),
      getOneRepMaxHistory(req.userId),
      getBodyCompHistory(req.userId),
      getPreviousBlockExercises(req.userId, phase, block_number),
      getConditioningLookup(gym_id),
      buildWeightLookup(req.userId, gym_id),
    ]);

    const gymCSV = await buildGymCSV(gym_id, req.userId);
    const condCSV = buildConditioningCSV(conditioningLookup);
    const sessionTypeLabel =
      session_type === "compound" ? "compound" : "isolation";
    const weightInstruction = buildWildcardInstruction(
      weightExercises,
      sessionTypeLabel,
      goal_description,
    );

    const userPrompt = `Select exercises for a single ${sessionTypeLabel} session for the following athlete at ${gymName}.
The server will calculate all weights, reps, and sets — return exercise selections only.

This session replaces a planned session at a different gym. Apply the same exercise selection logic — sub-component coverage, progressive overload response, recency, EMG score, and tiebreaker rules all apply.

CURRENT STATE
- Phase: ${phase}
- Block: ${block_number}
- Week: ${week_number} of 3
- Training level: ${trainingLevel}
- Gym: ${gymName}
- Weight exercises: ${weightExercises}
- Conditioning exercises: ${conditioningCount}
- Athlete notes: ${goal_description || "None"}

EXERCISE LIBRARY (${gymName} only)
${gymCSV}

CONDITIONING LIBRARY
${condCSV}

ESTIMATED 1RM HISTORY (for selection context — do not calculate weights)
${JSON.stringify(oneRepMaxHistory, null, 2)}

SESSION HISTORY — LAST 4 WEEKS
${JSON.stringify(sessionHistory, null, 2)}

PREVIOUS BLOCK EXERCISES
${previousBlockExercises.length > 0 ? previousBlockExercises.join(", ") : "None — this is the first block"}

BODY COMPOSITION — LAST 4 WEEKS
${JSON.stringify(bodyCompHistory, null, 2)}

Return ONLY this exact JSON structure, nothing else:
{
  "exercises": [
    {
      "exercise": "<name>",
      "muscles_primary": "<primary muscle>",
      "sub_component": "<sub component>"
    }
  ],
  "conditioning": [
    {
      "exercise": "<name>",
      "sets": <number>
    }
  ]
}

${weightInstruction} Then ${conditioningCount} conditioning exercises.
No extra fields. No explanation. No markdown.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: BLOCK_GENERATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const rawText = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const result = JSON.parse(cleanJSON(rawText));

    if (!result.exercises || result.exercises.length === 0)
      throw new Error("Invalid session structure from Claude");

    // Calculate weights for this specific week
    const weekConfig = getWeekConfig(
      phase,
      trainingLevel,
      block_number,
      week_number,
    );
    const enrichedExercises = await enrichExercisesForWeek(
      result.exercises,
      weekConfig,
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

// ─── Generate missing sessions ────────────────────────────────────────────────
// POST /ai/generate-missing

router.post("/generate-missing", async (req, res) => {
  const cronSecret = req.headers["x-cron-secret"];
  if (cronSecret) {
    if (cronSecret !== process.env.CRON_SECRET)
      return res.status(401).json({ error: "Invalid cron secret" });
    req.userId = req.body.user_id;
  } else {
    const authHeader = req.headers["authorization"];
    if (!authHeader)
      return res.status(401).json({ error: "No token provided" });
    try {
      const jwt = require("jsonwebtoken");
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = decoded.userId;
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }
  }

  const { programme_id, weeks_needed, existing_plan } = req.body;
  if (!programme_id || !weeks_needed || weeks_needed.length === 0) {
    return res
      .status(400)
      .json({ error: "programme_id and weeks_needed are required" });
  }

  try {
    const userResult = await pool.query(
      `SELECT current_phase, current_block, phase_week,
              weight_exercises_per_session, conditioning_exercises_per_session,
              goal_description, training_level
       FROM users WHERE id = $1`,
      [req.userId],
    );
    if (userResult.rows.length === 0)
      return res.status(404).json({ error: "User not found" });

    const {
      current_phase,
      current_block,
      phase_week,
      weight_exercises_per_session,
      conditioning_exercises_per_session,
      goal_description,
    } = userResult.rows[0];
    const trainingLevel = normaliseTrainingLevel(
      userResult.rows[0].training_level,
    );
    const weightExercises = weight_exercises_per_session || 6;
    const conditioningCount = conditioning_exercises_per_session || 3;

    const gymResult = await pool.query(
      `SELECT id, gym_name FROM gyms WHERE user_id = $1 AND is_default = TRUE LIMIT 1`,
      [req.userId],
    );
    if (gymResult.rows.length === 0)
      return res.status(400).json({ error: "No default gym configured." });
    const gymId = gymResult.rows[0].id;
    const gymName = gymResult.rows[0].gym_name;

    const [
      sessionHistory,
      oneRepMaxHistory,
      bodyCompHistory,
      previousBlockExercises,
      dietHistory,
      moodHistory,
      cardioHistory,
      conditioningLookup,
      weightLookup,
    ] = await Promise.all([
      getSessionHistory(req.userId),
      getOneRepMaxHistory(req.userId),
      getBodyCompHistory(req.userId),
      getPreviousBlockExercises(req.userId, current_phase, current_block),
      getDietHistory(req.userId),
      getMoodHistory(req.userId),
      getCardioHistory(req.userId),
      getConditioningLookup(gymId),
      buildWeightLookup(req.userId, gymId),
    ]);

    const gymCSV = await buildGymCSV(gymId, req.userId);
    const condCSV = buildConditioningCSV(conditioningLookup);
    const compoundInstruction = buildWildcardInstruction(
      weightExercises,
      "compound",
      goal_description,
    );
    const isolationInstruction = buildWildcardInstruction(
      weightExercises,
      "isolation",
      goal_description,
    );

    const existingPlanSection = existing_plan
      ? `EXISTING PLAN (use as baseline — keep exercises unless avoidance notes or quantity changes require substitution)\n${JSON.stringify(existing_plan, null, 2)}`
      : "EXISTING PLAN: None available — select fresh exercises following standard rules.";

    const userPrompt = `Select exercises for missing sessions for the following athlete.
The server will calculate all weights, reps, and sets — return exercise selections only.
Use the existing plan as a baseline and only change exercises where the athlete notes explicitly require avoidance, or where the exercise count has changed and wildcard slots need adjusting.

CURRENT STATE
- Phase: ${current_phase}
- Block: ${current_block}
- Phase week: ${phase_week} of 6
- Training level: ${trainingLevel}
- Gym: ${gymName}
- Weeks to generate: ${weeks_needed.join(", ")}
- Weight exercises per session: ${weightExercises}
- Conditioning exercises per session: ${conditioningCount}
- Athlete notes: ${goal_description || "None"}

${existingPlanSection}

EXERCISE LIBRARY
${gymCSV}

CONDITIONING LIBRARY
${condCSV}

ESTIMATED 1RM HISTORY (for selection context — do not calculate weights)
${JSON.stringify(oneRepMaxHistory, null, 2)}

SESSION HISTORY — LAST 4 WEEKS
${JSON.stringify(sessionHistory, null, 2)}

PREVIOUS BLOCK EXERCISES
${previousBlockExercises.length > 0 ? previousBlockExercises.join(", ") : "None — this is the first block"}

BODY COMPOSITION — LAST 4 WEEKS
${JSON.stringify(bodyCompHistory, null, 2)}

DIET — LAST 2 WEEKS
${dietHistory.length > 0 ? JSON.stringify(dietHistory, null, 2) : "No diet data logged"}

MOOD AND ENERGY — LAST 2 WEEKS
${moodHistory.length > 0 ? JSON.stringify(moodHistory, null, 2) : "No mood data logged"}

CARDIO — LAST 2 WEEKS
${cardioHistory.length > 0 ? JSON.stringify(cardioHistory, null, 2) : "No cardio logged"}

Return ONLY this exact JSON structure, nothing else:
{
  "compound_session": {
    "exercises": [
      {
        "exercise": "<name>",
        "muscles_primary": "<primary muscle>",
        "sub_component": "<sub component>"
      }
    ],
    "conditioning": [
      {
        "exercise": "<name>",
        "sets": <number>
      }
    ]
  },
  "isolation_session": {
    "exercises": [
      {
        "exercise": "<name>",
        "muscles_primary": "<primary muscle>",
        "sub_component": "<sub component>"
      }
    ],
    "conditioning": [
      {
        "exercise": "<name>",
        "sets": <number>
      }
    ]
  }
}

Compound: ${compoundInstruction} Then ${conditioningCount} conditioning exercises.
Isolation: ${isolationInstruction} Then ${conditioningCount} conditioning exercises. No extra fields. No explanation. No markdown.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: BLOCK_GENERATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const rawText = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const blockPlan = JSON.parse(cleanJSON(rawText));

    if (!blockPlan.compound_session || !blockPlan.isolation_session)
      throw new Error("Invalid block plan structure from Claude");

    const enrichedCompConditioning = enrichConditioningExercises(
      blockPlan.compound_session.conditioning || [],
      conditioningLookup,
    );
    const enrichedIsoConditioning = enrichConditioningExercises(
      blockPlan.isolation_session.conditioning || [],
      conditioningLookup,
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const week of weeks_needed) {
        const weekConfig = getWeekConfig(
          current_phase,
          trainingLevel,
          current_block,
          week,
        );

        const compoundExercises = await enrichExercisesForWeek(
          blockPlan.compound_session.exercises,
          weekConfig,
          weightLookup,
          gymId,
          req.userId,
        );

        const isolationExercises = await enrichExercisesForWeek(
          blockPlan.isolation_session.exercises,
          weekConfig,
          weightLookup,
          gymId,
          req.userId,
        );

        const comp1 = await client.query(
          `INSERT INTO sessions (user_id, programme_id, session_type, occurrence, week_number, gym_id)
           VALUES ($1, $2, 'compound', 1, $3, $4) RETURNING id`,
          [req.userId, programme_id, week, gymId],
        );
        await insertSessionExercises(
          client,
          comp1.rows[0].id,
          compoundExercises,
          enrichedCompConditioning,
        );

        const comp2 = await client.query(
          `INSERT INTO sessions (user_id, programme_id, session_type, occurrence, week_number, gym_id)
           VALUES ($1, $2, 'compound', 2, $3, $4) RETURNING id`,
          [req.userId, programme_id, week, gymId],
        );
        await insertSessionExercises(
          client,
          comp2.rows[0].id,
          compoundExercises,
          enrichedCompConditioning,
        );

        const iso = await client.query(
          `INSERT INTO sessions (user_id, programme_id, session_type, occurrence, week_number, gym_id)
           VALUES ($1, $2, 'isolation', 1, $3, $4) RETURNING id`,
          [req.userId, programme_id, week, gymId],
        );
        await insertSessionExercises(
          client,
          iso.rows[0].id,
          isolationExercises,
          enrichedIsoConditioning,
        );
      }

      await client.query("COMMIT");
      res.status(201).json({
        message: "Missing sessions generated successfully",
        weeks: weeks_needed,
        compound_session: blockPlan.compound_session,
        isolation_session: blockPlan.isolation_session,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Generate missing error:", err.message);
    res.status(500).json({ error: "Server error", detail: err.message });
  }
});

// ─── Extra session ────────────────────────────────────────────────────────────
// POST /ai/extra-session

router.post("/extra-session", requireAuth, async (req, res) => {
  const { gym_id, session_type = "compound" } = req.body;
  if (!gym_id) return res.status(400).json({ error: "gym_id is required" });
  try {
    const gymCheck = await pool.query(
      `SELECT id, gym_name FROM gyms WHERE id = $1 AND user_id = $2`,
      [gym_id, req.userId],
    );
    if (gymCheck.rows.length === 0)
      return res.status(404).json({ error: "Gym not found" });
    const gymId = gymCheck.rows[0].id;
    const gymName = gymCheck.rows[0].gym_name;

    const userResult = await pool.query(
      `SELECT current_phase, current_block, phase_week,
              weight_exercises_per_session, conditioning_exercises_per_session,
              goal_description, training_level
       FROM users WHERE id = $1`,
      [req.userId],
    );
    if (userResult.rows.length === 0)
      return res.status(404).json({ error: "User not found" });

    const {
      current_phase,
      current_block,
      phase_week,
      weight_exercises_per_session,
      conditioning_exercises_per_session,
      goal_description,
    } = userResult.rows[0];
    const trainingLevel = normaliseTrainingLevel(
      userResult.rows[0].training_level,
    );
    const weightExercises = weight_exercises_per_session || 6;
    const conditioningCount = conditioning_exercises_per_session || 3;

    // Determine which week config to use for an extra session.
    // phase_week 1-3 → block 1, phase_week 4-6 → block 2, phase_week 7+ → rest
    let weekConfig;
    if (phase_week >= 7) {
      // Rest week — use flat rest config
      weekConfig = { percentage: 0.45, reps: 12, sets: 3 };
    } else {
      const blockNumber = phase_week <= 3 ? 1 : 2;
      const weekInBlock = phase_week <= 3 ? phase_week : phase_week - 3;
      weekConfig = getWeekConfig(
        current_phase,
        trainingLevel,
        blockNumber,
        weekInBlock,
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
      getSessionHistory(req.userId),
      getOneRepMaxHistory(req.userId),
      getBodyCompHistory(req.userId),
      getDietHistory(req.userId),
      getMoodHistory(req.userId),
      getCardioHistory(req.userId),
      getConditioningLookup(gymId),
      buildWeightLookup(req.userId, gymId),
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

    const weightInstruction = buildWildcardInstruction(
      weightExercises,
      session_type,
      goal_description,
    );

    const userPrompt = `The athlete has arrived at the gym for an extra ${session_type} session today. Select the ${weightExercises} best weight exercises based on what has been undertrained recently, recovery needs, and training history. Then select ${conditioningCount} conditioning exercises.
The server will calculate all weights, reps, and sets — return exercise selections only.

CURRENT STATE
- Phase: ${current_phase}
- Block: ${current_block}
- Phase week: ${phase_week} of 6
- Training level: ${trainingLevel}
- Gym: ${gymName}
- Days since last session: ${daysSinceLast}
- Weight exercises: ${weightExercises}
- Conditioning exercises: ${conditioningCount}
- Athlete notes: ${goal_description || "None"}

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

Use today's mood and energy scores to inform exercise selection. If energy is low, select exercises the athlete performs well at. If cardio load has been heavy this week, favour upper body compound movements to allow leg recovery.

Return ONLY this exact JSON structure, nothing else:
{
  "exercises": [
    {
      "exercise": "<name>",
      "muscles_primary": "<primary muscle>",
      "sub_component": "<sub component>"
    }
  ],
  "conditioning": [
    {
      "exercise": "<name>",
      "sets": <number>
    }
  ]
}

${weightInstruction} Then ${conditioningCount} conditioning exercises. No extra fields. No explanation. No markdown.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: BLOCK_GENERATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const rawText = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const result = JSON.parse(cleanJSON(rawText));

    if (!result.exercises || result.exercises.length === 0)
      throw new Error("Invalid session structure from Claude");

    const enrichedExercises = await enrichExercisesForWeek(
      result.exercises,
      weekConfig,
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
        `INSERT INTO sessions (user_id, programme_id, session_type, occurrence, week_number, gym_id, status, started_at)
         VALUES ($1, $2, 'extra', 1, $3, $4, 'in_progress', NOW()) RETURNING id`,
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

    // Build equipment lookup for resolving equipment_name → equipment_id
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

    // Resolve equipment_name to equipment_id for each exercise
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

// ─── Gym CSV builder ──────────────────────────────────────────────────────────

async function buildGymCSV(gymId, userId) {
  if (!gymId) {
    return "exercise,muscles_primary,muscles_secondary,type,equipment_name,sub_component,emg_score,target_weight\n(no gym selected)";
  }
  try {
    const result = await pool.query(
      `SELECT e.exercise, e.muscles_primary, e.muscles_secondary, e.type,
              e.sub_component, e.emg_score, e.target_weight,
              eq.equipment_name
       FROM exercises e
       LEFT JOIN equipment eq ON eq.id = e.equipment_id
       WHERE e.user_id = $1 AND e.gym_id = $2 AND e.active = TRUE
       ORDER BY e.muscles_primary, e.emg_score DESC`,
      [userId, gymId],
    );

    const header =
      "exercise,muscles_primary,muscles_secondary,type,equipment_name,sub_component,emg_score,target_weight";
    if (result.rows.length === 0)
      return header + "\n(no exercises configured for this gym)";

    const rows = result.rows.map(
      (e) =>
        `${e.exercise},${e.muscles_primary},${e.muscles_secondary},${e.type},${e.equipment_name ?? "none"},${e.sub_component},${e.emg_score},${e.target_weight ?? "null"}`,
    );
    return [header, ...rows].join("\n");
  } catch (err) {
    console.error("buildGymCSV DB error:", err.message);
    return "exercise,muscles_primary,muscles_secondary,type,equipment_name,sub_component,emg_score,target_weight\n(error loading exercises)";
  }
}

// ─── System prompts ───────────────────────────────────────────────────────────

const BLOCK_GENERATION_SYSTEM_PROMPT = `You are a personal gym coach and exercise selector. You follow periodisation principles from Tudor Bompa's Serious Strength Training.

ROLE
You select and order exercises. The server calculates all weights, reps, and sets from periodised loading patterns (phaseConfig × 1RM). Do not include weights, reps, or sets in your response. Your focus is choosing the right exercises for the athlete's current phase, history, and goals.

TRAINING STRUCTURE
- Sessions alternate Compound → Isolation → Compound (repeating based on weekly session count)
- Each session has two parts: weight exercises followed by conditioning exercises
- The number of weight exercises and conditioning exercises per session is specified in the user prompt
- Compound session weight exercises: 1 each from Back, Chest, Lower Back, Quads, Shoulders, plus Wildcard slots for any count above 5
- Isolation session weight exercises: Core (always first), Biceps, Triceps, Shoulders, Forearms, plus Wildcard slots for any count above 5
- Conditioning exercises are always appended after weight exercises — select from the conditioning library provided

EXERCISE SELECTION RULES
1. SUB-COMPONENT COVERAGE — exclude sub-components used in previous block
2. PROGRESSIVE OVERLOAD — favour exercises with stronger historical performance
3. RECENCY — deprioritise exercises from last block unless EMG gap is 2+ points
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
- Maximum Strength: Force production and neural adaptation. Favour heavy compound movements. Prefer barbell and loadable equipment that supports heavy loading.
- Muscle Definition: Metabolic conditioning at high reps. All equipment types permitted. Favour exercises suitable for sustained high-rep endurance work.

ATHLETE NOTES
Read the "Athlete notes" field in the user prompt carefully. It may contain avoidance instructions, muscle preferences, or both.

AVOIDANCE: If it contains explicit avoidance instructions (e.g. "avoid", "do not", "exclude", "no X", "dodgy knee", "bad back") apply them strictly — do not select any exercise targeting the affected muscle group or body part. Ignore vague mentions of discomfort, soreness, or tiredness — only act on clear directives.

PREFERENCES: If it mentions muscles or body parts to focus on (e.g. "focus on triceps", "prioritise calves", "want bigger arms"), thread that preference through ALL exercise selection — not just wildcard slots. For mandatory muscle slots, choose the exercise variant that best involves the preferred muscle as a secondary mover. For example, if the athlete wants triceps focus, prefer Chest Press (triceps secondary) over Chest Fly (no triceps) for the Chest slot. Fill wildcard slots with preferred muscles first, then fall back to standard undertrained logic.

Be tolerant of spelling mistakes and interpret the intent.
BLOCK EXCLUSION — no exercise from Block 1 may appear in Block 2

CONDITIONING SELECTION RULES
- Always include at least 1 cardio category exercise and 1 core category exercise
- Use remaining slots for mobility or trx based on athlete goals and phase
- Only return the exercise name and sets — targets and metrics are looked up server-side
- Exercise names must match the conditioning library exactly

You must return ONLY valid JSON matching the exact structure specified. No explanation, no markdown, no extra fields.`;

module.exports = router;
