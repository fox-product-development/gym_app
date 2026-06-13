// backend/routes/ai.js
// AI routes — block generation, gym session swap, extra session, weekly feedback.

const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const pool = require("../db");
const requireAuth = require("../middleware");
const { getValidWeightsForEquipment } = require("../weightCalc");

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
              goal_description
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

    const [
      sessionHistory,
      oneRepMaxHistory,
      bodyCompHistory,
      previousBlockExercises,
      dietHistory,
      moodHistory,
      cardioHistory,
      conditioningLookup,
    ] = await Promise.all([
      getSessionHistory(req.userId),
      getOneRepMaxHistory(req.userId),
      getBodyCompHistory(req.userId),
      getPreviousBlockExercises(req.userId, current_phase, current_block),
      getDietHistory(req.userId),
      getMoodHistory(req.userId),
      getCardioHistory(req.userId),
      getConditioningLookup(gymId),
    ]);

    const gymCSV = await buildGymCSV(gymId, req.userId);
    const condCSV = buildConditioningCSV(conditioningLookup);
    const equipmentSummary = await buildEquipmentSummary(gymId, req.userId);
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

    const userPrompt = `Generate a training block for the following athlete.

CURRENT STATE
- Phase: ${current_phase}
- Block: ${current_block}
- Phase week: ${phase_week} of 6
- Gym: ${gymName}
- Weight exercises per session: ${weightExercises}
- Conditioning exercises per session: ${conditioningCount}
- Athlete notes: ${goal_description || "None"}

EXERCISE LIBRARY
${gymCSV}

${equipmentSummary}

CONDITIONING LIBRARY
${condCSV}

ESTIMATED 1RM HISTORY
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

Use diet, mood, energy and cardio data to inform weight selection and exercise ordering. If energy has been consistently low, favour moderate weights over ambitious targets. If cardio load has been high, consider recovery when selecting compound movements.

For conditioning: select ${conditioningCount} exercises from the conditioning library. Aim for at least 1 cardio movement and 1 core exercise. Use remaining slots to match the athlete's goal description and phase. Return only the exercise name and sets — targets and metrics are looked up server-side. Exercise names must match the conditioning library exactly.

Return ONLY this exact JSON structure, nothing else:
{
  "phase": "<phase_name>",
  "compound_session": {
    "exercises": [
      {
        "exercise": "<name>",
        "muscles_primary": "<primary muscle>",
        "sub_component": "<sub component>",
        "sets": <number>,
        "target_reps": <number>,
        "weight": <number>
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
        "sub_component": "<sub component>",
        "sets": <number>,
        "target_reps": <number>,
        "weight": <number>
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

${compoundInstruction} Then ${conditioningCount} conditioning exercises appended after.
Isolation: ${isolationInstruction} Then ${conditioningCount} conditioning exercises appended after.${current_phase === "muscle_definition" ? " IMPORTANT: This is Muscle Definition phase — every weight exercise in both sessions must use machine-type equipment only. No barbells, dumbbells, or bodyweight exercises. Conditioning exercises are exempt from this restriction." : ""} No extra fields. No explanation. No markdown.`;

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

    blockPlan.compound_session.exercises = await validateAndCorrectWeights(
      blockPlan.compound_session.exercises,
      gymId,
      req.userId,
    );
    blockPlan.isolation_session.exercises = await validateAndCorrectWeights(
      blockPlan.isolation_session.exercises,
      gymId,
      req.userId,
    );

    blockPlan.compound_session.conditioning = enrichConditioningExercises(
      blockPlan.compound_session.conditioning || [],
      conditioningLookup,
    );
    blockPlan.isolation_session.conditioning = enrichConditioningExercises(
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
        async function insertSessionExercises(sessionId, sessionPlan, phase) {
          const weightExs = sessionPlan.exercises || [];
          const condExs = sessionPlan.conditioning || [];

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
                phase === "muscle_definition" ? "drop" : "standard",
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

        const comp1 = await client.query(
          `INSERT INTO sessions (user_id, programme_id, session_type, occurrence, week_number, gym_id)
           VALUES ($1, $2, 'compound', 1, $3, $4) RETURNING id`,
          [req.userId, programmeId, week, gymId],
        );
        await insertSessionExercises(
          comp1.rows[0].id,
          blockPlan.compound_session,
          current_phase,
        );

        const comp2 = await client.query(
          `INSERT INTO sessions (user_id, programme_id, session_type, occurrence, week_number, gym_id)
           VALUES ($1, $2, 'compound', 2, $3, $4) RETURNING id`,
          [req.userId, programmeId, week, gymId],
        );
        await insertSessionExercises(
          comp2.rows[0].id,
          blockPlan.compound_session,
          current_phase,
        );

        const iso = await client.query(
          `INSERT INTO sessions (user_id, programme_id, session_type, occurrence, week_number, gym_id)
           VALUES ($1, $2, 'isolation', 1, $3, $4) RETURNING id`,
          [req.userId, programmeId, week, gymId],
        );
        await insertSessionExercises(
          iso.rows[0].id,
          blockPlan.isolation_session,
          current_phase,
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
      `SELECT s.*, p.phase, p.block_number, u.phase_week FROM sessions s JOIN programmes p ON p.id = s.programme_id JOIN users u ON u.id = s.user_id WHERE s.id = $1 AND s.user_id = $2`,
      [session_id, req.userId],
    );
    if (sessionResult.rows.length === 0)
      return res.status(404).json({ error: "Session not found" });

    const session = sessionResult.rows[0];
    const { session_type, phase, block_number, phase_week } = session;

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
    ] = await Promise.all([
      getSessionHistory(req.userId),
      getOneRepMaxHistory(req.userId),
      getBodyCompHistory(req.userId),
      getPreviousBlockExercises(req.userId, phase, block_number),
      getConditioningLookup(gym_id),
    ]);

    const gymCSV = await buildGymCSV(gym_id, req.userId);
    const condCSV = buildConditioningCSV(conditioningLookup);
    const equipmentSummary = await buildEquipmentSummary(gym_id, req.userId);
    const sessionTypeLabel =
      session_type === "compound" ? "compound" : "isolation";
    const weightInstruction = buildWildcardInstruction(
      weightExercises,
      sessionTypeLabel,
      goal_description,
    );

    const userPrompt = `Generate a single ${sessionTypeLabel} session for the following athlete at ${gymName}.

This session replaces a planned session at a different gym. Apply the same exercise selection logic — sub-component coverage, progressive overload response, recency, EMG score, and tiebreaker rules all apply.

CURRENT STATE
- Phase: ${phase}
- Block: ${block_number}
- Phase week: ${phase_week || "unknown"} of 6
- Gym: ${gymName}
- Weight exercises: ${weightExercises}
- Conditioning exercises: ${conditioningCount}
- Athlete notes: ${goal_description || "None"}

EXERCISE LIBRARY (${gymName} only)
${gymCSV}

${equipmentSummary}

CONDITIONING LIBRARY
${condCSV}

ESTIMATED 1RM HISTORY
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
      "sub_component": "<sub component>",
      "sets": <number>,
      "target_reps": <number>,
      "weight": <number>
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

    result.exercises = await validateAndCorrectWeights(
      result.exercises,
      gym_id,
      req.userId,
    );
    result.conditioning = enrichConditioningExercises(
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

      const weightExs = result.exercises || [];
      const condExs = result.conditioning || [];

      for (let i = 0; i < weightExs.length; i++) {
        const ex = weightExs[i];
        await client.query(
          `INSERT INTO planned_exercises (session_id, exercise_name, muscles_primary, sub_component, order_index, target_sets, target_reps, target_weight) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            session_id,
            ex.exercise,
            ex.muscles_primary,
            ex.sub_component,
            i,
            ex.sets,
            ex.target_reps,
            ex.weight,
          ],
        );
      }

      for (let i = 0; i < condExs.length; i++) {
        const ex = condExs[i];
        await client.query(
          `INSERT INTO planned_exercises (session_id, exercise_name, muscles_primary, sub_component, order_index, target_sets, target_reps, target_weight, metric) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            session_id,
            ex.exercise,
            "Conditioning",
            "Conditioning",
            weightExs.length + i,
            ex.sets,
            ex.target_reps,
            0,
            ex.metric,
          ],
        );
      }

      await client.query(
        `UPDATE sessions SET gym_id = $1, status = 'in_progress', started_at = NOW() WHERE id = $2`,
        [gym_id, session_id],
      );
      await client.query("COMMIT");

      res.status(200).json({
        message: "Gym session generated and started",
        session_id,
        exercises: result.exercises,
        conditioning: result.conditioning,
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
      `SELECT current_phase, current_block, phase_week, weight_exercises_per_session, conditioning_exercises_per_session, goal_description FROM users WHERE id = $1`,
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
    ] = await Promise.all([
      getSessionHistory(req.userId),
      getOneRepMaxHistory(req.userId),
      getBodyCompHistory(req.userId),
      getPreviousBlockExercises(req.userId, current_phase, current_block),
      getDietHistory(req.userId),
      getMoodHistory(req.userId),
      getCardioHistory(req.userId),
      getConditioningLookup(gymId),
    ]);

    const gymCSV = await buildGymCSV(gymId, req.userId);
    const condCSV = buildConditioningCSV(conditioningLookup);
    const equipmentSummary = await buildEquipmentSummary(gymId, req.userId);
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

    const userPrompt = `Regenerate missing sessions for the following athlete. Use the existing plan as a baseline and only change exercises where the athlete notes explicitly require avoidance, or where the exercise count has changed and wildcard slots need adjusting.

CURRENT STATE
- Phase: ${current_phase}
- Block: ${current_block}
- Phase week: ${phase_week} of 6
- Gym: ${gymName}
- Weeks to generate: ${weeks_needed.join(", ")}
- Weight exercises per session: ${weightExercises}
- Conditioning exercises per session: ${conditioningCount}
- Athlete notes: ${goal_description || "None"}

${existingPlanSection}

EXERCISE LIBRARY
${gymCSV}

${equipmentSummary}

CONDITIONING LIBRARY
${condCSV}

ESTIMATED 1RM HISTORY
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
        "sub_component": "<sub component>",
        "sets": <number>,
        "target_reps": <number>,
        "weight": <number>
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
        "sub_component": "<sub component>",
        "sets": <number>,
        "target_reps": <number>,
        "weight": <number>
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
Isolation: ${isolationInstruction} Then ${conditioningCount} conditioning exercises.${current_phase === "muscle_definition" ? " IMPORTANT: Muscle Definition phase — weight exercises must use machine-type equipment only. Conditioning exercises are exempt." : ""} No extra fields. No explanation. No markdown.`;

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

    blockPlan.compound_session.exercises = await validateAndCorrectWeights(
      blockPlan.compound_session.exercises,
      gymId,
      req.userId,
    );
    blockPlan.isolation_session.exercises = await validateAndCorrectWeights(
      blockPlan.isolation_session.exercises,
      gymId,
      req.userId,
    );

    blockPlan.compound_session.conditioning = enrichConditioningExercises(
      blockPlan.compound_session.conditioning || [],
      conditioningLookup,
    );
    blockPlan.isolation_session.conditioning = enrichConditioningExercises(
      blockPlan.isolation_session.conditioning || [],
      conditioningLookup,
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const week of weeks_needed) {
        async function insertSessionExercises(sessionId, sessionPlan, phase) {
          const weightExs = sessionPlan.exercises || [];
          const condExs = sessionPlan.conditioning || [];

          for (let i = 0; i < weightExs.length; i++) {
            const ex = weightExs[i];
            await client.query(
              `INSERT INTO planned_exercises (session_id, exercise_name, muscles_primary, sub_component, order_index, target_sets, target_reps, target_weight, set_style) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [
                sessionId,
                ex.exercise,
                ex.muscles_primary,
                ex.sub_component,
                i,
                ex.sets,
                ex.target_reps,
                ex.weight,
                phase === "muscle_definition" ? "drop" : "standard",
              ],
            );
          }

          for (let i = 0; i < condExs.length; i++) {
            const ex = condExs[i];
            await client.query(
              `INSERT INTO planned_exercises (session_id, exercise_name, muscles_primary, sub_component, order_index, target_sets, target_reps, target_weight, set_style, metric) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
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

        const comp1 = await client.query(
          `INSERT INTO sessions (user_id, programme_id, session_type, occurrence, week_number, gym_id)
           VALUES ($1, $2, 'compound', 1, $3, $4) RETURNING id`,
          [req.userId, programme_id, week, gymId],
        );
        await insertSessionExercises(
          comp1.rows[0].id,
          blockPlan.compound_session,
          current_phase,
        );

        const comp2 = await client.query(
          `INSERT INTO sessions (user_id, programme_id, session_type, occurrence, week_number, gym_id)
           VALUES ($1, $2, 'compound', 2, $3, $4) RETURNING id`,
          [req.userId, programme_id, week, gymId],
        );
        await insertSessionExercises(
          comp2.rows[0].id,
          blockPlan.compound_session,
          current_phase,
        );

        const iso = await client.query(
          `INSERT INTO sessions (user_id, programme_id, session_type, occurrence, week_number, gym_id)
           VALUES ($1, $2, 'isolation', 1, $3, $4) RETURNING id`,
          [req.userId, programme_id, week, gymId],
        );
        await insertSessionExercises(
          iso.rows[0].id,
          blockPlan.isolation_session,
          current_phase,
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
  const { gym_id } = req.body;
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
      `SELECT current_phase, current_block, phase_week, weight_exercises_per_session, conditioning_exercises_per_session, goal_description FROM users WHERE id = $1`,
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
    const weightExercises = weight_exercises_per_session || 6;
    const conditioningCount = conditioning_exercises_per_session || 3;

    const [
      sessionHistory,
      oneRepMaxHistory,
      bodyCompHistory,
      dietHistory,
      moodHistory,
      cardioHistory,
      conditioningLookup,
    ] = await Promise.all([
      getSessionHistory(req.userId),
      getOneRepMaxHistory(req.userId),
      getBodyCompHistory(req.userId),
      getDietHistory(req.userId),
      getMoodHistory(req.userId),
      getCardioHistory(req.userId),
      getConditioningLookup(gymId),
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
    const equipmentSummary = await buildEquipmentSummary(gymId, req.userId);

    const userPrompt = `The athlete has arrived at the gym for an extra session today. Select the ${weightExercises} best weight exercises for them based on what has been undertrained recently, recovery needs, and training history. Then select ${conditioningCount} conditioning exercises.

CURRENT STATE
- Phase: ${current_phase}
- Block: ${current_block}
- Phase week: ${phase_week} of 6
- Gym: ${gymName}
- Days since last session: ${daysSinceLast}
- Weight exercises: ${weightExercises}
- Conditioning exercises: ${conditioningCount}
- Athlete notes: ${goal_description || "None"}

EXERCISE LIBRARY
${gymCSV}

${equipmentSummary}

CONDITIONING LIBRARY
${condCSV}

ESTIMATED 1RM HISTORY
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

Use today's mood and energy scores to inform exercise selection and weight targets. If energy is low today, select exercises the athlete performs well at moderate intensity. If cardio load has been heavy this week, favour upper body compound movements to allow leg recovery.

Return ONLY this exact JSON structure, nothing else:
{
  "exercises": [
    {
      "exercise": "<name>",
      "muscles_primary": "<primary muscle>",
      "sub_component": "<sub component>",
      "sets": <number>,
      "target_reps": <number>,
      "weight": <number>
    }
  ],
  "conditioning": [
    {
      "exercise": "<name>",
      "sets": <number>
    }
  ]
}

Exactly ${weightExercises} weight exercises and ${conditioningCount} conditioning exercises. Apply the current phase sets and reps scheme. Use target_weight from the exercise library where available. Only suggest weights from the valid weights lists above. No extra fields. No explanation. No markdown.`;

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

    result.exercises = await validateAndCorrectWeights(
      result.exercises,
      gymId,
      req.userId,
    );
    result.conditioning = enrichConditioningExercises(
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
      const weightExs = result.exercises || [];
      const condExs = result.conditioning || [];

      for (let i = 0; i < weightExs.length; i++) {
        const ex = weightExs[i];
        await client.query(
          `INSERT INTO planned_exercises (session_id, exercise_name, muscles_primary, sub_component, order_index, target_sets, target_reps, target_weight) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            sessionId,
            ex.exercise,
            ex.muscles_primary,
            ex.sub_component,
            i,
            ex.sets,
            ex.target_reps,
            ex.weight,
          ],
        );
      }

      for (let i = 0; i < condExs.length; i++) {
        const ex = condExs[i];
        await client.query(
          `INSERT INTO planned_exercises (session_id, exercise_name, muscles_primary, sub_component, order_index, target_sets, target_reps, target_weight, metric) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            sessionId,
            ex.exercise,
            "Conditioning",
            "Conditioning",
            weightExs.length + i,
            ex.sets,
            ex.target_reps,
            0,
            ex.metric,
          ],
        );
      }

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
    return "exercise,muscles_primary,muscles_secondary,type,equipment_name,sub_component,emg_score,target_weight,increment,max_weight\n(no gym selected)";
  }
  try {
    const result = await pool.query(
      `SELECT e.exercise, e.muscles_primary, e.muscles_secondary, e.type,
              e.sub_component, e.emg_score, e.target_weight,
              eq.equipment_name, eq.increment, eq.max_weight
       FROM exercises e
       LEFT JOIN equipment eq ON eq.id = e.equipment_id
       WHERE e.user_id = $1 AND e.gym_id = $2 AND e.active = TRUE
       ORDER BY e.muscles_primary, e.emg_score DESC`,
      [userId, gymId],
    );

    const header =
      "exercise,muscles_primary,muscles_secondary,type,equipment_name,sub_component,emg_score,target_weight,increment,max_weight";
    if (result.rows.length === 0)
      return header + "\n(no exercises configured for this gym)";

    const rows = result.rows.map(
      (e) =>
        `${e.exercise},${e.muscles_primary},${e.muscles_secondary},${e.type},${e.equipment_name ?? "none"},${e.sub_component},${e.emg_score},${e.target_weight ?? "null"},${e.increment ?? "null"},${e.max_weight ?? "null"}`,
    );
    return [header, ...rows].join("\n");
  } catch (err) {
    console.error("buildGymCSV DB error:", err.message);
    return "exercise,muscles_primary,muscles_secondary,type,equipment_name,sub_component,emg_score,target_weight,increment,max_weight\n(error loading exercises)";
  }
}

// ─── System prompts ───────────────────────────────────────────────────────────

const BLOCK_GENERATION_SYSTEM_PROMPT = `You are a personal gym coach and training planner. You follow periodisation principles from Tudor Bompa's Serious Strength Training and Zatsiorsky's Science and Practice of Strength Training.

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

ATHLETE NOTES
Read the "Athlete notes" field in the user prompt. If it contains explicit avoidance instructions (e.g. "avoid", "do not", "exclude", "no X") apply them strictly when selecting exercises — do not select any exercise targeting the affected muscle group. Ignore vague mentions of discomfort, soreness, or tiredness — only act on clear directives. Be tolerant of spelling mistakes and interpret the intent.

BLOCK EXCLUSION — no exercise from Block 1 may appear in Block 2

CONDITIONING SELECTION RULES
- Always include at least 1 cardio category exercise and 1 core category exercise
- Use remaining slots for mobility or trx based on athlete goals and phase
- Only return the exercise name and sets — targets and metrics are looked up server-side
- Exercise names must match the conditioning library exactly

WEIGHT RULES
- The exercise library CSV includes equipment_name, increment, and max_weight per exercise
- If max_weight is provided: NEVER suggest a weight exceeding it
- If increment is provided: the weight must be a multiple of the increment
- If target_weight is NOT null: use it directly (as long as it does not exceed max_weight)
- If target_weight IS null: estimate using phase percentage of 1RM if available, or a conservative starting weight:
  - Anatomical Adaptation: 60% of 1RM
  - Hypertrophy: 75% of 1RM
  - Maximum Strength: 85% of 1RM
  - Muscle Definition: 55% of 1RM
- For loadable equipment (where increment and max_weight are null): use the valid weights from the WEIGHT GUIDANCE section in the user prompt

You must only suggest weights that are valid for the exercise's equipment. The user prompt includes the full valid weight list — pick the closest valid value that does not exceed the calculated target.

DUMBBELL CONVENTION
weight for any dumbbell exercise is the weight of ONE dumbbell. Do not double it for pair exercises.

PHASE SCHEMES
- Anatomical Adaptation: 3 sets x 20 reps target (min 15)
- Hypertrophy: 4 sets x 10 reps target (min 8)
- Maximum Strength: 5 sets x 5 reps target (min 3)
- Muscle Definition: 1 set x 40 reps target (min 30) — DROP SET STYLE (Work Gym only)

MUSCLE DEFINITION — MACHINE EQUIPMENT RESTRICTION
When the phase is 'muscle_definition', weight exercises must only use machine-type equipment. No barbells, dumbbells, or bodyweight exercises. Conditioning exercises are exempt from this restriction.

You must return ONLY valid JSON matching the exact structure specified. No explanation, no markdown, no extra fields.`;

module.exports = router;
