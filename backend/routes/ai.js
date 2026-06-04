// backend/routes/ai.js
// AI routes — block generation, gym session swap, extra session, weekly feedback.

const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const pool = require("../db");
const requireAuth = require("../middleware");
const { validWeights } = require("../validWeights");

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanJSON(text) {
  return text.replace(/```json|```/g, "").trim();
}

async function getSessionHistory(userId) {
  const result = await pool.query(
    `SELECT
       s.id, s.session_type, s.occurrence, s.week_number, s.gym,
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
     LEFT JOIN planned_exercises pe ON pe.session_id = s.id
     LEFT JOIN logged_sets ls ON ls.session_id = s.id
     WHERE s.user_id = $1
       AND s.completed_at >= NOW() - INTERVAL '4 weeks'
     GROUP BY s.id
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

// Fetches conditioning exercises for a given gym.
// gym_id = null rows are available at all gyms.
async function getConditioningExercises(gymId) {
  const result = await pool.query(
    `SELECT exercise, category, metric, target, sets
     FROM conditioning
     WHERE gym_id IS NULL OR gym_id = $1
     ORDER BY category, exercise`,
    [gymId],
  );
  return result.rows;
}

// ─── Equipment summary for AI prompt ─────────────────────────────────────────────
// Builds weight guidance for the AI prompt.
// Machine and fixed: uses increment_kg and max_weight_kg from the equipment table.
// Loadable: uses hardcoded validWeights arrays (plate logic not yet DB-driven).
// Bodyweight: always 0.

async function buildEquipmentSummary(gymId, userId) {
  let machineAndFixedSection = "";

  try {
    const result = await pool.query(
      `SELECT equipment_name, type, increment_kg, max_weight_kg
       FROM equipment
       WHERE gym_id = $1 AND user_id = $2
         AND type IN ('machine', 'fixed')
         AND increment_kg IS NOT NULL
       ORDER BY type, equipment_name`,
      [gymId, userId],
    );

    if (result.rows.length > 0) {
      const lines = result.rows.map((e) => {
        const max = e.max_weight_kg ? ` — max ${e.max_weight_kg}kg` : "";
        return `  ${e.equipment_name} (${e.type}): increments of ${e.increment_kg}kg${max}`;
      });
      machineAndFixedSection = `\nMACHINE AND FIXED EQUIPMENT (from gym database)\nFor these, select any weight that is a multiple of the increment and does not exceed the max:\n${lines.join("\n")}`;
    }
  } catch (err) {
    console.error("buildEquipmentSummary DB error:", err.message);
  }

  return `WEIGHT GUIDANCE PER EQUIPMENT TYPE

LOADABLE EQUIPMENT (barbell, dumbbells — use these exact values only):

home gym — dumbbells and single dumbbell (weight shown is per dumbbell):
${validWeights.home_dumbbell.join(", ")}

home gym — EZ bar / barbell (total weight including 5kg bar):
${validWeights.home_barbell.join(", ")}

work gym — dumbbells and single dumbbell (weight shown is per dumbbell, fixed rubber dumbbells in 1kg increments):
${validWeights.work_dumbbell.join(", ")}

work gym — barbell (bench bar, 10kg bar, total weight including bar, 5kg increments):
${validWeights.work_barbell.join(", ")}

work gym — olympic barbell (20kg bar, total weight including bar, 5kg increments):
${validWeights.work_olympic_barbell.join(", ")}
${machineAndFixedSection}

DUMBBELL CONVENTION
All dumbbell weights (equipment_type = "dumbbells" or "single dumbbell") are stored and displayed as the weight of ONE dumbbell. For example, weight_kg: 10 means 10kg in each hand for a pair exercise, or 10kg in one hand for a single dumbbell exercise. Never double the weight for pair exercises.

BODYWEIGHT EXERCISES
Exercises with equipment_type = "none" always have weight_kg: 0.`;
}

// Builds a plain-text summary of conditioning exercises for the AI prompt.
function buildConditioningCSV(conditioningExercises) {
  if (!conditioningExercises || conditioningExercises.length === 0) {
    return "No conditioning exercises available.";
  }
  const header = "exercise,category,metric,target,sets";
  const rows = conditioningExercises.map(
    (e) => `${e.exercise},${e.category},${e.metric},${e.target},${e.sets}`,
  );
  return [header, ...rows].join("\n");
}

// Builds the wildcard slot instruction based on how many weight exercises are requested.
// Base is 6 exercises with 1 wildcard. Each exercise above or below 6 adds or removes a wildcard slot.
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
    const fixed = Math.min(weightExercises, 5); // Back, Chest, Lower Back, Quads, Shoulders
    if (weightExercises <= 4) {
      // Drop from the end of the fixed list
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
    // Isolation: Core (always first), Biceps, Triceps, Shoulders, Forearms, then wildcards
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

// ─── Generate block ───────────────────────────────────────────────────────────
// POST /ai/generate-block
// Always generates for the default Work Gym.
// Called on Week 1 and Week 4 of every phase by the Sunday cron job.

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

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResult.rows[0];
    const {
      current_phase,
      current_block,
      phase_week,
      weight_exercises_per_session,
      conditioning_exercises_per_session,
      goal_description,
    } = user;

    const weightExercises = weight_exercises_per_session || 6;
    const conditioningCount = conditioning_exercises_per_session || 3;

    // Get the user's default gym
    const gymResult = await pool.query(
      `SELECT id, gym_name FROM gyms
       WHERE user_id = $1 AND is_default = TRUE
       LIMIT 1`,
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
      conditioningExercises,
    ] = await Promise.all([
      getSessionHistory(req.userId),
      getOneRepMaxHistory(req.userId),
      getBodyCompHistory(req.userId),
      getPreviousBlockExercises(req.userId, current_phase, current_block),
      getDietHistory(req.userId),
      getMoodHistory(req.userId),
      getCardioHistory(req.userId),
      getConditioningExercises(gymId),
    ]);

    const gymCSV = await buildGymCSV(gymId, req.userId);
    const condCSV = buildConditioningCSV(conditioningExercises);
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

For conditioning: select ${conditioningCount} exercises from the conditioning library. Aim for at least 1 cardio movement and 1 core exercise. Use remaining slots to match the athlete's goal description and phase. For time-based exercises (metric = time), the target value is seconds — weight_kg should equal the target value (e.g. Plank target 60 → weight_kg: 60). For rep-based exercises weight_kg should be 0.

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
        "weight_kg": <number>
      }
    ],
    "conditioning": [
      {
        "exercise": "<name>",
        "sets": <number>,
        "target_reps": <number>,
        "weight_kg": <number>
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
        "weight_kg": <number>
      }
    ],
    "conditioning": [
      {
        "exercise": "<name>",
        "sets": <number>,
        "target_reps": <number>,
        "weight_kg": <number>
      }
    ]
  }
}

${compoundInstruction} Then ${conditioningCount} conditioning exercises appended after.
Isolation: ${isolationInstruction} Then ${conditioningCount} conditioning exercises appended after.${current_phase === "muscle_definition" ? " IMPORTANT: This is Muscle Definition phase — every weight exercise in both sessions must have equipment_type = 'machine'. No barbells, dumbbells, or bodyweight exercises. Conditioning exercises are exempt from this restriction." : ""} No extra fields. No explanation. No markdown.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: BLOCK_GENERATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const rawText = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    const blockPlan = JSON.parse(cleanJSON(rawText));

    if (!blockPlan.compound_session || !blockPlan.isolation_session) {
      throw new Error("Invalid block plan structure from Claude");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const progResult = await client.query(
        `INSERT INTO programmes (user_id, phase, block_number, week_start)
         VALUES ($1, $2, $3, CURRENT_DATE)
         RETURNING id`,
        [req.userId, current_phase, current_block],
      );

      const programmeId = progResult.rows[0].id;

      for (let week = 1; week <= 3; week++) {
        // Helper to insert exercises + conditioning for a session
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
                ex.weight_kg,
                phase === "muscle_definition" ? "drop" : "standard",
              ],
            );
          }

          for (let i = 0; i < condExs.length; i++) {
            const ex = condExs[i];
            await client.query(
              `INSERT INTO planned_exercises
                 (session_id, exercise_name, muscles_primary, sub_component,
                  order_index, target_sets, target_reps, target_weight, set_style)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [
                sessionId,
                ex.exercise,
                "Conditioning",
                "Conditioning",
                weightExs.length + i,
                ex.sets,
                ex.target_reps,
                ex.weight_kg,
                "standard",
              ],
            );
          }
        }

        // Compound session — occurrence 1
        const comp1Result = await client.query(
          `INSERT INTO sessions
             (user_id, programme_id, session_type, occurrence, week_number, gym_id, gym)
           VALUES ($1, $2, 'compound', 1, $3, $4, $5)
           RETURNING id`,
          [req.userId, programmeId, week, gymId, gymName],
        );
        await insertSessionExercises(
          comp1Result.rows[0].id,
          blockPlan.compound_session,
          current_phase,
        );

        // Compound session — occurrence 2
        const comp2Result = await client.query(
          `INSERT INTO sessions
             (user_id, programme_id, session_type, occurrence, week_number, gym_id, gym)
           VALUES ($1, $2, 'compound', 2, $3, $4, $5)
           RETURNING id`,
          [req.userId, programmeId, week, gymId, gymName],
        );
        await insertSessionExercises(
          comp2Result.rows[0].id,
          blockPlan.compound_session,
          current_phase,
        );

        // Isolation session
        const isoResult = await client.query(
          `INSERT INTO sessions
             (user_id, programme_id, session_type, occurrence, week_number, gym_id, gym)
           VALUES ($1, $2, 'isolation', 1, $3, $4, $5)
           RETURNING id`,
          [req.userId, programmeId, week, gymId, gymName],
        );
        await insertSessionExercises(
          isoResult.rows[0].id,
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
// Called when the user confirms they want to switch gym for a session.
// Replaces the planned exercises for the given session with ones suited to the selected gym.
// The session is then started immediately.

router.post("/generate-gym-session", requireAuth, async (req, res) => {
  const { session_id, gym_id } = req.body;

  if (!session_id) {
    return res.status(400).json({ error: "session_id is required" });
  }
  if (!gym_id) {
    return res.status(400).json({ error: "gym_id is required" });
  }

  try {
    // Get the gym name for this gym_id
    const gymResult = await pool.query(
      `SELECT gym_name FROM gyms WHERE id = $1 AND user_id = $2`,
      [gym_id, req.userId],
    );
    if (gymResult.rows.length === 0) {
      return res.status(404).json({ error: "Gym not found" });
    }
    const gymName = gymResult.rows[0].gym_name;

    const sessionResult = await pool.query(
      `SELECT s.*, p.phase, p.block_number
       FROM sessions s
       JOIN programmes p ON p.id = s.programme_id
       WHERE s.id = $1 AND s.user_id = $2`,
      [session_id, req.userId],
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    const session = sessionResult.rows[0];
    const { session_type, phase, block_number, phase_week } = session;

    const userResult = await pool.query(
      `SELECT weight_exercises_per_session, conditioning_exercises_per_session, goal_description
       FROM users WHERE id = $1`,
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
      conditioningExercises,
    ] = await Promise.all([
      getSessionHistory(req.userId),
      getOneRepMaxHistory(req.userId),
      getBodyCompHistory(req.userId),
      getPreviousBlockExercises(req.userId, phase, block_number),
      getConditioningExercises(gym_id),
    ]);

    const gymCSV = await buildGymCSV(gym_id, req.userId);
    const condCSV = buildConditioningCSV(conditioningExercises);
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
      "weight_kg": <number>
    }
  ],
  "conditioning": [
    {
      "exercise": "<name>",
      "sets": <number>,
      "target_reps": <number>,
      "weight_kg": <number>
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
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    const result = JSON.parse(cleanJSON(rawText));

    if (!result.exercises || result.exercises.length === 0) {
      throw new Error("Invalid session structure from Claude");
    }

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
          `INSERT INTO planned_exercises
             (session_id, exercise_name, muscles_primary, sub_component,
              order_index, target_sets, target_reps, target_weight)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            session_id,
            ex.exercise,
            ex.muscles_primary,
            ex.sub_component,
            i,
            ex.sets,
            ex.target_reps,
            ex.weight_kg,
          ],
        );
      }

      for (let i = 0; i < condExs.length; i++) {
        const ex = condExs[i];
        await client.query(
          `INSERT INTO planned_exercises
             (session_id, exercise_name, muscles_primary, sub_component,
              order_index, target_sets, target_reps, target_weight)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            session_id,
            ex.exercise,
            "Conditioning",
            "Conditioning",
            weightExs.length + i,
            ex.sets,
            ex.target_reps,
            ex.weight_kg,
          ],
        );
      }

      await client.query(
        `UPDATE sessions
         SET gym_id = $1, status = 'in_progress', started_at = NOW()
         WHERE id = $2`,
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
// Called by the replan endpoint to regenerate only the specific week numbers
// that had their planned sessions deleted. Uses the existing programme_id so
// completed sessions in other weeks are preserved.
// Takes the existing exercise plan as a baseline and modifies it rather than
// picking entirely fresh exercises.

router.post("/generate-missing", async (req, res) => {
  // Allow cron secret or JWT
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
              goal_description
       FROM users WHERE id = $1`,
      [req.userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResult.rows[0];
    const {
      current_phase,
      current_block,
      phase_week,
      weight_exercises_per_session,
      conditioning_exercises_per_session,
      goal_description,
    } = user;

    const weightExercises = weight_exercises_per_session || 6;
    const conditioningCount = conditioning_exercises_per_session || 3;

    // Use user's default gym
    const gymResult = await pool.query(
      `SELECT id, gym_name FROM gyms
       WHERE user_id = $1 AND is_default = TRUE
       LIMIT 1`,
      [req.userId],
    );
    if (gymResult.rows.length === 0) {
      return res.status(400).json({
        error: "No default gym configured.",
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
      conditioningExercises,
    ] = await Promise.all([
      getSessionHistory(req.userId),
      getOneRepMaxHistory(req.userId),
      getBodyCompHistory(req.userId),
      getPreviousBlockExercises(req.userId, current_phase, current_block),
      getDietHistory(req.userId),
      getMoodHistory(req.userId),
      getCardioHistory(req.userId),
      getConditioningExercises(gymId),
    ]);

    const gymCSV = await buildGymCSV(gymId, req.userId);
    const condCSV = buildConditioningCSV(conditioningExercises);
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
      ? `EXISTING PLAN (use as baseline — keep exercises unless avoidance notes or quantity changes require substitution)
${JSON.stringify(existing_plan, null, 2)}`
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
        "weight_kg": <number>
      }
    ],
    "conditioning": [
      {
        "exercise": "<name>",
        "sets": <number>,
        "target_reps": <number>,
        "weight_kg": <number>
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
        "weight_kg": <number>
      }
    ],
    "conditioning": [
      {
        "exercise": "<name>",
        "sets": <number>,
        "target_reps": <number>,
        "weight_kg": <number>
      }
    ]
  }
}

Compound: ${compoundInstruction} Then ${conditioningCount} conditioning exercises.
Isolation: ${isolationInstruction} Then ${conditioningCount} conditioning exercises.${current_phase === "muscle_definition" ? " IMPORTANT: Muscle Definition phase — weight exercises must use equipment_type = 'machine' only. Conditioning exercises are exempt." : ""} No extra fields. No explanation. No markdown.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: BLOCK_GENERATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const rawText = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    const blockPlan = JSON.parse(cleanJSON(rawText));

    if (!blockPlan.compound_session || !blockPlan.isolation_session) {
      throw new Error("Invalid block plan structure from Claude");
    }

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
                ex.weight_kg,
                phase === "muscle_definition" ? "drop" : "standard",
              ],
            );
          }

          for (let i = 0; i < condExs.length; i++) {
            const ex = condExs[i];
            await client.query(
              `INSERT INTO planned_exercises
                 (session_id, exercise_name, muscles_primary, sub_component,
                  order_index, target_sets, target_reps, target_weight, set_style)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [
                sessionId,
                ex.exercise,
                "Conditioning",
                "Conditioning",
                weightExs.length + i,
                ex.sets,
                ex.target_reps,
                ex.weight_kg,
                "standard",
              ],
            );
          }
        }

        // Compound occurrence 1
        const comp1 = await client.query(
          `INSERT INTO sessions
             (user_id, programme_id, session_type, occurrence, week_number, gym_id, gym)
           VALUES ($1, $2, 'compound', 1, $3, $4, $5)
           RETURNING id`,
          [req.userId, programme_id, week, gymId, gymName],
        );
        await insertSessionExercises(
          comp1.rows[0].id,
          blockPlan.compound_session,
          current_phase,
        );

        // Compound occurrence 2
        const comp2 = await client.query(
          `INSERT INTO sessions
             (user_id, programme_id, session_type, occurrence, week_number, gym_id, gym)
           VALUES ($1, $2, 'compound', 2, $3, $4, $5)
           RETURNING id`,
          [req.userId, programme_id, week, gymId, gymName],
        );
        await insertSessionExercises(
          comp2.rows[0].id,
          blockPlan.compound_session,
          current_phase,
        );

        // Isolation
        const iso = await client.query(
          `INSERT INTO sessions
             (user_id, programme_id, session_type, occurrence, week_number, gym_id, gym)
           VALUES ($1, $2, 'isolation', 1, $3, $4, $5)
           RETURNING id`,
          [req.userId, programme_id, week, gymId, gymName],
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

  if (!gym_id) {
    return res.status(400).json({ error: "gym_id is required" });
  }

  try {
    // Verify the gym belongs to this user, and get its name
    const gymCheck = await pool.query(
      `SELECT id, gym_name FROM gyms WHERE id = $1 AND user_id = $2`,
      [gym_id, req.userId],
    );
    if (gymCheck.rows.length === 0) {
      return res.status(404).json({ error: "Gym not found" });
    }
    const gymId = gymCheck.rows[0].id;
    const gymName = gymCheck.rows[0].gym_name;

    const userResult = await pool.query(
      `SELECT current_phase, current_block, phase_week,
              weight_exercises_per_session, conditioning_exercises_per_session,
              goal_description
       FROM users WHERE id = $1`,
      [req.userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResult.rows[0];
    const {
      current_phase,
      current_block,
      phase_week,
      weight_exercises_per_session,
      conditioning_exercises_per_session,
      goal_description,
    } = user;

    const weightExercises = weight_exercises_per_session || 6;
    const conditioningCount = conditioning_exercises_per_session || 3;

    const [
      sessionHistory,
      oneRepMaxHistory,
      bodyCompHistory,
      dietHistory,
      moodHistory,
      cardioHistory,
      conditioningExercises,
    ] = await Promise.all([
      getSessionHistory(req.userId),
      getOneRepMaxHistory(req.userId),
      getBodyCompHistory(req.userId),
      getDietHistory(req.userId),
      getMoodHistory(req.userId),
      getCardioHistory(req.userId),
      getConditioningExercises(gymId),
    ]);

    const lastSession = sessionHistory[0];
    const daysSinceLast = lastSession
      ? Math.floor(
          (Date.now() - new Date(lastSession.completed_at).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : 7;

    const gymCSV = await buildGymCSV(gymId, req.userId);
    const condCSV = buildConditioningCSV(conditioningExercises);
    const equipmentSummary = await buildEquipmentSummary(gymId, req.userId);

    const userPrompt = `The athlete has arrived at the gym for an extra session today. Select the ${weightExercises} best weight exercises for them based on what has been undertrained recently, recovery needs, and training history. Then select ${conditioningCount} conditioning exercises.

CURRENT STATE
- Phase: ${current_phase}
- Block: ${current_block}
- Phase week: ${phase_week} of 6
- Gym: ${gym}
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
      "weight_kg": <number>
    }
  ],
  "conditioning": [
    {
      "exercise": "<name>",
      "sets": <number>,
      "target_reps": <number>,
      "weight_kg": <number>
    }
  ]
}

Exactly ${weightExercises} weight exercises and ${conditioningCount} conditioning exercises. Apply the current phase sets and reps scheme. Use target_weight_kg from the exercise library where available. Only suggest weights from the valid weights lists above. No extra fields. No explanation. No markdown.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: BLOCK_GENERATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const rawText = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    const result = JSON.parse(cleanJSON(rawText));

    if (!result.exercises || result.exercises.length === 0) {
      throw new Error("Invalid session structure from Claude");
    }

    const progResult = await pool.query(
      `SELECT p.id FROM programmes p
       JOIN sessions s ON s.programme_id = p.id
       WHERE s.user_id = $1
       ORDER BY p.created_at DESC
       LIMIT 1`,
      [req.userId],
    );

    if (progResult.rows.length === 0) {
      return res.status(400).json({ error: "No active programme found" });
    }

    const programmeId = progResult.rows[0].id;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const sessionResult = await client.query(
        `INSERT INTO sessions
           (user_id, programme_id, session_type, occurrence, week_number, gym_id, gym, status, started_at)
         VALUES ($1, $2, 'extra', 1, $3, $4, $5, 'in_progress', NOW())
         RETURNING id`,
        [req.userId, programmeId, phase_week, gymId, gymName],
      );

      const sessionId = sessionResult.rows[0].id;
      const weightExs = result.exercises || [];
      const condExs = result.conditioning || [];

      for (let i = 0; i < weightExs.length; i++) {
        const ex = weightExs[i];
        await client.query(
          `INSERT INTO planned_exercises
             (session_id, exercise_name, muscles_primary, sub_component,
              order_index, target_sets, target_reps, target_weight)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            sessionId,
            ex.exercise,
            ex.muscles_primary,
            ex.sub_component,
            i,
            ex.sets,
            ex.target_reps,
            ex.weight_kg,
          ],
        );
      }

      for (let i = 0; i < condExs.length; i++) {
        const ex = condExs[i];
        await client.query(
          `INSERT INTO planned_exercises
             (session_id, exercise_name, muscles_primary, sub_component,
              order_index, target_sets, target_reps, target_weight)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            sessionId,
            ex.exercise,
            "Conditioning",
            "Conditioning",
            weightExs.length + i,
            ex.sets,
            ex.target_reps,
            ex.weight_kg,
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

  if (!exercise_name) {
    return res.status(400).json({ error: "exercise_name is required" });
  }

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
      .filter((block) => block.type === "text")
      .map((block) => block.text)
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

  if (!gym_id) {
    return res.status(400).json({ error: "gym_id is required" });
  }

  try {
    const gymResult = await pool.query(
      `SELECT gym_name FROM gyms WHERE id = $1 AND user_id = $2`,
      [gym_id, req.userId],
    );

    if (gymResult.rows.length === 0) {
      return res.status(404).json({ error: "Gym not found" });
    }

    const gymName = gymResult.rows[0].gym_name;

    const equipmentResult = await pool.query(
      `SELECT equipment_name, type, unladen_weight_kg, increment_kg
       FROM equipment WHERE gym_id = $1 AND user_id = $2
       ORDER BY type ASC, equipment_name ASC`,
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

SSuggest 15 exercises appropriate for this equipment. Cover all major muscle groups. Do not suggest any exercise already in their library.
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
      "equipment_type": "<barbell, dumbbells, single dumbbell, machine, none>"
    }
  ]
}

Group logically but return as a flat array. No explanation. No markdown. Valid JSON only.`,
        },
      ],
    });

    const rawText = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    const result = JSON.parse(cleanJSON(rawText));
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
      `SELECT * FROM weekly_feedback
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
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
    return "exercise,muscles_primary,muscles_secondary,type,equipment_name,sub_component,emg_score,target_weight_kg,increment_kg,max_weight_kg\n(no gym selected)";
  }
  try {
    const result = await pool.query(
      `SELECT e.exercise, e.muscles_primary, e.muscles_secondary, e.type,
              e.equipment_type, e.sub_component, e.emg_score, e.target_weight_kg,
              eq.equipment_name, eq.increment_kg, eq.max_weight_kg
       FROM exercises e
       LEFT JOIN equipment eq ON eq.id = e.equipment_id
       WHERE e.user_id = $1 AND e.gym_id = $2 AND e.active = TRUE
       ORDER BY e.muscles_primary, e.emg_score DESC`,
      [userId, gymId],
    );

    const header =
      "exercise,muscles_primary,muscles_secondary,type,equipment_name,sub_component,emg_score,target_weight_kg,increment_kg,max_weight_kg";

    if (result.rows.length === 0) {
      return header + "\n(no exercises configured for this gym)";
    }

    const rows = result.rows.map(
      (e) =>
        `${e.exercise},${e.muscles_primary},${e.muscles_secondary},${e.type},${e.equipment_name ?? e.equipment_type ?? "none"},${e.sub_component},${e.emg_score},${e.target_weight_kg ?? "null"},${e.increment_kg ?? "null"},${e.max_weight_kg ?? "null"}`,
    );
    return [header, ...rows].join("\n");
  } catch (err) {
    console.error("buildGymCSV DB error:", err.message);
    return "exercise,muscles_primary,muscles_secondary,type,equipment_name,sub_component,emg_score,target_weight_kg,increment_kg,max_weight_kg\n(error loading exercises)";
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
- For time-based exercises (metric = time): target value is seconds, set weight_kg equal to target (e.g. Plank 60s → weight_kg: 60)
- For rep-based exercises: weight_kg should be 0

WEIGHT RULES
- The exercise library CSV includes equipment_name, increment_kg, and max_weight_kg per exercise
- If max_weight_kg is provided: NEVER suggest a weight exceeding it
- If increment_kg is provided: the weight must be a multiple of the increment
- If target_weight_kg is NOT null: use it directly (as long as it does not exceed max_weight_kg)
- If target_weight_kg IS null: estimate using phase percentage of 1RM if available, or a conservative starting weight:
  - Anatomical Adaptation: 60% of 1RM
  - Hypertrophy: 67% of 1RM
  - Maximum Strength: 80% of 1RM
  - Muscle Definition: 55% of 1RM
- For loadable equipment (where increment_kg and max_weight_kg are null): use the valid weights from the WEIGHT GUIDANCE section in the user prompt

You must only suggest weights that are valid for the exercise's equipment_type. The user prompt includes the full valid weight list — pick the closest valid value that does not exceed the calculated target.

DUMBBELL CONVENTION
weight_kg for any dumbbell exercise is the weight of ONE dumbbell. Do not double it for pair exercises.

PHASE SCHEMES
- Anatomical Adaptation: 3 sets x 20 reps target (min 15)
- Hypertrophy: 4 sets x 12 reps target (min 8)
- Maximum Strength: 4 sets x 6 reps target (min 3)
- Muscle Definition: 1 set x 40 reps target (min 30) — DROP SET STYLE (Work Gym only)

MUSCLE DEFINITION — CABLE MACHINE RESTRICTION
When the phase is 'muscle_definition', weight exercises must only use equipment_type = 'machine'. Conditioning exercises are exempt from this restriction.

You must return ONLY valid JSON matching the exact structure specified. No explanation, no markdown, no extra fields.`;

module.exports = router;
