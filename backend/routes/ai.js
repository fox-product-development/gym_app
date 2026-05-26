// backend/routes/ai.js
// AI routes — block generation, home gym session swap, extra session, weekly feedback.

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

// ─── Valid weight reference string ───────────────────────────────────────────
// Builds a compact summary of valid weights per equipment type for the AI prompt.

function buildValidWeightsSummary() {
  return `VALID WEIGHTS PER EQUIPMENT TYPE
You must only suggest weights that appear in these lists. Do not round or interpolate — the weight must be an exact value from the relevant list.

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

work gym — machine / cable (2.2kg increments):
${validWeights.work_machine.join(", ")}

DUMBBELL CONVENTION
All dumbbell weights (equipment_type = "dumbbells" or "single dumbbell") are stored and displayed as the weight of ONE dumbbell. For example, weight_kg: 10 means 10kg in each hand for a pair exercise, or 10kg in one hand for a single dumbbell exercise. Never double the weight for pair exercises.

BODYWEIGHT EXERCISES
Exercises with equipment_type = "none" always have weight_kg: 0.`;
}

// ─── Generate block ───────────────────────────────────────────────────────────
// POST /ai/generate-block
// Always generates for Work Gym (the default).
// Called on Week 1 and Week 4 of every phase by the Sunday cron job.
// Accepts either a valid JWT (frontend) or x-cron-secret header (cron job).

router.post("/generate-block", async (req, res) => {
  // Allow cron job to call this route using a shared secret
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
      `SELECT current_phase, current_block, phase_week
       FROM users WHERE id = $1`,
      [req.userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResult.rows[0];
    const { current_phase, current_block, phase_week } = user;
    const gym = "work";

    const [
      sessionHistory,
      oneRepMaxHistory,
      bodyCompHistory,
      previousBlockExercises,
    ] = await Promise.all([
      getSessionHistory(req.userId),
      getOneRepMaxHistory(req.userId),
      getBodyCompHistory(req.userId),
      getPreviousBlockExercises(req.userId, current_phase, current_block),
    ]);

    const gymCSV = await buildGymCSV(gym, req.userId);

    const userPrompt = `Generate a training block for the following athlete.

CURRENT STATE
- Phase: ${current_phase}
- Block: ${current_block}
- Phase week: ${phase_week} of 6
- Gym: ${gym}

EXERCISE LIBRARY
${gymCSV}

${buildValidWeightsSummary()}

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
  "block": <number>,
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
    ]
  }
}

6 exercises in compound_session, 6 exercises in isolation_session. No extra fields. No explanation. No markdown.`;

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
        // Compound session — occurrence 1
        const comp1Result = await client.query(
          `INSERT INTO sessions
             (user_id, programme_id, session_type, occurrence, week_number, gym)
           VALUES ($1, $2, 'compound', 1, $3, $4)
           RETURNING id`,
          [req.userId, programmeId, week, gym],
        );

        for (let i = 0; i < blockPlan.compound_session.exercises.length; i++) {
          const ex = blockPlan.compound_session.exercises[i];
          await client.query(
            `INSERT INTO planned_exercises
               (session_id, exercise_name, muscles_primary, sub_component,
                order_index, target_sets, target_reps, target_weight)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              comp1Result.rows[0].id,
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

        // Compound session — occurrence 2
        const comp2Result = await client.query(
          `INSERT INTO sessions
             (user_id, programme_id, session_type, occurrence, week_number, gym)
           VALUES ($1, $2, 'compound', 2, $3, $4)
           RETURNING id`,
          [req.userId, programmeId, week, gym],
        );

        for (let i = 0; i < blockPlan.compound_session.exercises.length; i++) {
          const ex = blockPlan.compound_session.exercises[i];
          await client.query(
            `INSERT INTO planned_exercises
               (session_id, exercise_name, muscles_primary, sub_component,
                order_index, target_sets, target_reps, target_weight)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              comp2Result.rows[0].id,
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

        // Isolation session
        const isoResult = await client.query(
          `INSERT INTO sessions
             (user_id, programme_id, session_type, occurrence, week_number, gym)
           VALUES ($1, $2, 'isolation', 1, $3, $4)
           RETURNING id`,
          [req.userId, programmeId, week, gym],
        );

        for (let i = 0; i < blockPlan.isolation_session.exercises.length; i++) {
          const ex = blockPlan.isolation_session.exercises[i];
          await client.query(
            `INSERT INTO planned_exercises
               (session_id, exercise_name, muscles_primary, sub_component,
                order_index, target_sets, target_reps, target_weight)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              isoResult.rows[0].id,
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

// ─── Generate home gym session ────────────────────────────────────────────────
// POST /ai/generate-home-session
// Called when the user confirms they want to switch to Home Gym for a session.
// Replaces the planned exercises for the given session in the database.
// The session is then started immediately.

router.post("/generate-home-session", requireAuth, async (req, res) => {
  const { session_id } = req.body;

  if (!session_id) {
    return res.status(400).json({ error: "session_id is required" });
  }

  try {
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

    const [
      sessionHistory,
      oneRepMaxHistory,
      bodyCompHistory,
      previousBlockExercises,
    ] = await Promise.all([
      getSessionHistory(req.userId),
      getOneRepMaxHistory(req.userId),
      getBodyCompHistory(req.userId),
      getPreviousBlockExercises(req.userId, phase, block_number),
    ]);

    const gymCSV = await buildGymCSV("home", req.userId);
    const sessionTypeLabel =
      session_type === "compound" ? "compound" : "isolation";

    const userPrompt = `Generate a single ${sessionTypeLabel} session for the following athlete at their Home Gym.

This session replaces a planned Work Gym session. Apply the same exercise selection logic you would use when generating a full block — sub-component coverage, progressive overload response, recency, EMG score, and tiebreaker rules all apply.

CURRENT STATE
- Phase: ${phase}
- Block: ${block_number}
- Phase week: ${phase_week || "unknown"} of 6
- Gym: home
- Session type: ${sessionTypeLabel}

EXERCISE LIBRARY (Home Gym only)
${gymCSV}

${buildValidWeightsSummary()}

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
  ]
}

${
  session_type === "compound"
    ? "6 exercises: 1 each from Back, Chest, Lower Back, Quads, Shoulders, plus 1 Wildcard compound."
    : "6 exercises: Core (always first), Biceps, Triceps, Shoulders, Forearms, Wildcard from {Core, Calves, Hamstrings}."
}
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

      for (let i = 0; i < result.exercises.length; i++) {
        const ex = result.exercises[i];
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

      await client.query(
        `UPDATE sessions
         SET gym = 'home', status = 'in_progress', started_at = NOW()
         WHERE id = $1`,
        [session_id],
      );

      await client.query("COMMIT");

      res.status(200).json({
        message: "Home Gym session generated and started",
        session_id,
        exercises: result.exercises,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Generate home session error:", err.message);
    res.status(500).json({ error: "Server error", detail: err.message });
  }
});

// ─── Extra session ────────────────────────────────────────────────────────────
// POST /ai/extra-session
// Generates 6 exercises, creates an extra session in the database,
// starts it immediately, and returns session_id for navigation.

router.post("/extra-session", requireAuth, async (req, res) => {
  const { gym } = req.body;

  if (!gym || !["work", "home"].includes(gym)) {
    return res.status(400).json({ error: "gym must be work or home" });
  }

  try {
    const userResult = await pool.query(
      `SELECT current_phase, current_block, phase_week FROM users WHERE id = $1`,
      [req.userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResult.rows[0];
    const { current_phase, current_block, phase_week } = user;

    const [sessionHistory, oneRepMaxHistory, bodyCompHistory] =
      await Promise.all([
        getSessionHistory(req.userId),
        getOneRepMaxHistory(req.userId),
        getBodyCompHistory(req.userId),
      ]);

    const lastSession = sessionHistory[0];
    const daysSinceLast = lastSession
      ? Math.floor(
          (Date.now() - new Date(lastSession.completed_at).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : 7;

    const gymCSV = await buildGymCSV(gym, req.userId);

    const userPrompt = `The athlete has arrived at the gym for an extra session today. Select the 6 best exercises for them based on what has been undertrained recently, recovery needs, and training history.

CURRENT STATE
- Phase: ${current_phase}
- Block: ${current_block}
- Phase week: ${phase_week} of 6
- Gym: ${gym}
- Days since last session: ${daysSinceLast}

EXERCISE LIBRARY
${gymCSV}

${buildValidWeightsSummary()}

ESTIMATED 1RM HISTORY
${JSON.stringify(oneRepMaxHistory, null, 2)}

SESSION HISTORY — LAST 4 WEEKS
${JSON.stringify(sessionHistory, null, 2)}

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
  ]
}

Exactly 6 exercises. Apply the current phase sets and reps scheme. Use target_weight_kg from the exercise library where available. Only suggest weights from the valid weights lists above. No extra fields. No explanation. No markdown.`;

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
           (user_id, programme_id, session_type, occurrence, week_number, gym, status, started_at)
         VALUES ($1, $2, 'extra', 1, $3, $4, 'in_progress', NOW())
         RETURNING id`,
        [req.userId, programmeId, phase_week, gym],
      );

      const sessionId = sessionResult.rows[0].id;

      for (let i = 0; i < result.exercises.length; i++) {
        const ex = result.exercises[i];
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
// Reads from the exercises table in the database.
// Falls back to hardcoded arrays if the table is empty (e.g. before seeding).

async function buildGymCSV(gym, userId) {
  try {
    const result = await pool.query(
      `SELECT exercise, muscles_primary, muscles_secondary, type,
              equipment_type, sub_component, emg_score, target_weight_kg
       FROM exercises
       WHERE user_id = $1 AND gym = $2
       ORDER BY muscles_primary, emg_score DESC`,
      [userId, gym],
    );

    if (result.rows.length > 0) {
      const header =
        "exercise,muscles_primary,muscles_secondary,type,equipment_type,sub_component,emg_score,target_weight_kg";
      const rows = result.rows.map(
        (e) =>
          `${e.exercise},${e.muscles_primary},${e.muscles_secondary},${e.type},${e.equipment_type ?? "none"},${e.sub_component},${e.emg_score},${e.target_weight_kg ?? "null"}`,
      );
      return [header, ...rows].join("\n");
    }
  } catch (err) {
    console.error(
      "buildGymCSV DB error, falling back to hardcoded:",
      err.message,
    );
  }

  // Fallback to hardcoded arrays
  const exercises = gym === "work" ? WORK_GYM_EXERCISES : HOME_GYM_EXERCISES;
  const header =
    "exercise,muscles_primary,muscles_secondary,type,equipment_type,sub_component,emg_score,target_weight_kg";
  const rows = exercises.map(
    (e) =>
      `${e.exercise},${e.muscles_primary},${e.muscles_secondary},${e.type},${e.equipment_type ?? "none"},${e.sub_component},${e.emg_score},null`,
  );
  return [header, ...rows].join("\n");
}

// ─── System prompts ───────────────────────────────────────────────────────────

const BLOCK_GENERATION_SYSTEM_PROMPT = `You are a personal gym coach and training planner. You follow periodisation principles from Tudor Bompa's Serious Strength Training and Zatsiorsky's Science and Practice of Strength Training, adapted for a recreational level athlete training alone 3 times per week.

TRAINING STRUCTURE
- Each week: Compound session → Isolation session → Compound session
- The same compound plan is used twice per week
- Compound session: 6 exercises — 1 each from Back, Chest, Lower Back, Quads, Shoulders, plus 1 Wildcard compound
- Isolation session: 6 exercises — Core (always first), Biceps, Triceps, Shoulders, Forearms, Wildcard from {Core, Calves, Hamstrings}

EXERCISE SELECTION RULES
1. SUB-COMPONENT COVERAGE — exclude sub-components used in previous block
2. PROGRESSIVE OVERLOAD — favour exercises with stronger historical performance
3. RECENCY — deprioritise exercises from last block unless EMG gap is 2+ points
4. EMG SCORE — prefer higher scores when other factors are equal
5. TIEBREAKER — use table order

BLOCK EXCLUSION — no exercise from Block 1 may appear in Block 2

WEIGHT RULES
The exercise library includes target_weight_kg and equipment_type columns.

- If target_weight_kg is NOT null: use it directly. This is the progressive overload system's source of truth.
- If target_weight_kg IS null (new exercise): estimate using phase percentage of 1RM if available, or a conservative starting weight:
  - Anatomical Adaptation: 60% of 1RM
  - Hypertrophy: 67% of 1RM
  - Maximum Strength: 80% of 1RM
  - Muscle Definition: 55% of 1RM

You must only suggest weights that are valid for the exercise's equipment_type. The user prompt will include the full valid weight list per equipment type — pick the closest valid value that does not exceed the calculated target. Never suggest a weight that is not in the valid list for that equipment type.

DUMBBELL CONVENTION
weight_kg for any dumbbell exercise (equipment_type = "dumbbells" or "single dumbbell") is the weight of ONE dumbbell. Do not double it for pair exercises.

PHASE SCHEMES
- Anatomical Adaptation: 3 sets x 20 reps target (min 15)
- Hypertrophy: 4 sets x 12 reps target (min 8)
- Maximum Strength: 4 sets x 6 reps target (min 3)
- Muscle Definition: 1 set x 40 reps target (min 30)

You must return ONLY valid JSON matching the exact structure specified. No explanation, no markdown, no extra fields.`;

// ─── Exercise data (fallback only) ───────────────────────────────────────────

const HOME_GYM_EXERCISES = [
  {
    exercise: "Dumbbell Bent Over Row",
    muscles_primary: "Back",
    muscles_secondary: "Biceps/Rear Delts",
    type: "Compound",
    equipment_type: "dumbbells",
    sub_component: "Lat/Mid-trap",
    emg_score: 4,
  },
  {
    exercise: "EZ Bar Bent Over Row",
    muscles_primary: "Back",
    muscles_secondary: "Biceps/Rear Delts",
    type: "Compound",
    equipment_type: "barbell",
    sub_component: "Lat/Mid-trap",
    emg_score: 3,
  },
  {
    exercise: "Single Arm Dumbbell Row",
    muscles_primary: "Back",
    muscles_secondary: "Biceps",
    type: "Compound",
    equipment_type: "single dumbbell",
    sub_component: "Lower lat",
    emg_score: 3,
  },
  {
    exercise: "Dumbbell Curl",
    muscles_primary: "Biceps",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "single dumbbell",
    sub_component: "Short head",
    emg_score: 3,
  },
  {
    exercise: "Dumbbell Hammer Curl",
    muscles_primary: "Biceps",
    muscles_secondary: "Brachialis",
    type: "Isolation",
    equipment_type: "single dumbbell",
    sub_component: "Brachialis/Long head",
    emg_score: 2,
  },
  {
    exercise: "EZ Bar Curl",
    muscles_primary: "Biceps",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "barbell",
    sub_component: "Long head",
    emg_score: 4,
  },
  {
    exercise: "Dumbbell Bench Press",
    muscles_primary: "Chest",
    muscles_secondary: "Shoulders/Triceps",
    type: "Compound",
    equipment_type: "dumbbells",
    sub_component: "Sternal head",
    emg_score: 4,
  },
  {
    exercise: "Push Up",
    muscles_primary: "Chest",
    muscles_secondary: "Shoulders/Triceps",
    type: "Compound",
    equipment_type: "none",
    sub_component: "Sternal/Clavicular head",
    emg_score: 2,
  },
  {
    exercise: "Dead Bug",
    muscles_primary: "Core",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "none",
    sub_component: "Deep stabilisers",
    emg_score: 3,
  },
  {
    exercise: "Leg Raise",
    muscles_primary: "Core",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "none",
    sub_component: "Lower abs",
    emg_score: 4,
  },
  {
    exercise: "Lying Knee Raise",
    muscles_primary: "Core",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "none",
    sub_component: "Lower abs",
    emg_score: 1,
  },
  {
    exercise: "Plank",
    muscles_primary: "Core",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "none",
    sub_component: "Deep stabilisers",
    emg_score: 3,
  },
  {
    exercise: "Side Plank",
    muscles_primary: "Core",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "none",
    sub_component: "Obliques",
    emg_score: 3,
  },
  {
    exercise: "Reverse Wrist Curl (Dumbbell)",
    muscles_primary: "Forearms",
    muscles_secondary: "Brachialis",
    type: "Isolation",
    equipment_type: "single dumbbell",
    sub_component: "Extensors",
    emg_score: 2,
  },
  {
    exercise: "Wrist Curl (Dumbbell)",
    muscles_primary: "Forearms",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "single dumbbell",
    sub_component: "Flexors",
    emg_score: 2,
  },
  {
    exercise: "Dumbbell Stiff Leg Deadlift",
    muscles_primary: "Lower Back",
    muscles_secondary: "Hamstrings/Glutes",
    type: "Compound",
    equipment_type: "dumbbells",
    sub_component: "Hamstring/Glute",
    emg_score: 3,
  },
  {
    exercise: "Romanian Deadlift (Dumbbell)",
    muscles_primary: "Lower Back",
    muscles_secondary: "Hamstrings/Glutes",
    type: "Compound",
    equipment_type: "dumbbells",
    sub_component: "Hip hinge/Hamstring emphasis",
    emg_score: 4,
  },
  {
    exercise: "Dumbbell Goblet Squat",
    muscles_primary: "Quads",
    muscles_secondary: "Glutes",
    type: "Compound",
    equipment_type: "single dumbbell",
    sub_component: "Quads/Glutes",
    emg_score: 4,
  },
  {
    exercise: "Dumbbell Lunge",
    muscles_primary: "Quads",
    muscles_secondary: "Glutes/Hamstrings",
    type: "Compound",
    equipment_type: "dumbbells",
    sub_component: "Quads/Glutes",
    emg_score: 3,
  },
  {
    exercise: "Dumbbell Step Back Lunge",
    muscles_primary: "Quads",
    muscles_secondary: "Glutes/Hamstrings",
    type: "Compound",
    equipment_type: "dumbbells",
    sub_component: "Glutes/Hamstrings",
    emg_score: 2,
  },
  {
    exercise: "Dumbbell Lateral Raise",
    muscles_primary: "Shoulders",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "dumbbells",
    sub_component: "Lateral delt",
    emg_score: 2,
  },
  {
    exercise: "Dumbbell Rear Delt Fly",
    muscles_primary: "Shoulders",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "dumbbells",
    sub_component: "Rear delt",
    emg_score: 2,
  },
  {
    exercise: "Dumbbell Shoulder Press",
    muscles_primary: "Shoulders",
    muscles_secondary: "Triceps",
    type: "Compound",
    equipment_type: "dumbbells",
    sub_component: "Anterior/Lateral delt",
    emg_score: 4,
  },
  {
    exercise: "EZ Bar Overhead Press",
    muscles_primary: "Shoulders",
    muscles_secondary: "Triceps",
    type: "Compound",
    equipment_type: "barbell",
    sub_component: "Anterior/Lateral delt",
    emg_score: 4,
  },
  {
    exercise: "Dumbbell Overhead Tricep Extension",
    muscles_primary: "Triceps",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "single dumbbell",
    sub_component: "Long head",
    emg_score: 3,
  },
  {
    exercise: "EZ Bar Skull Crusher",
    muscles_primary: "Triceps",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "barbell",
    sub_component: "Long head",
    emg_score: 3,
  },
];

const WORK_GYM_EXERCISES = [
  {
    exercise: "Barbell Bent Over Row",
    muscles_primary: "Back",
    muscles_secondary: "Biceps/Rear Delts",
    type: "Compound",
    equipment_type: "barbell",
    sub_component: "Lat/Mid-trap",
    emg_score: 5,
  },
  {
    exercise: "Dumbbell Bent Over Row",
    muscles_primary: "Back",
    muscles_secondary: "Biceps/Rear Delts",
    type: "Compound",
    equipment_type: "dumbbells",
    sub_component: "Lat/Mid-trap",
    emg_score: 4,
  },
  {
    exercise: "Landmine Row",
    muscles_primary: "Back",
    muscles_secondary: "Biceps",
    type: "Compound",
    equipment_type: "barbell",
    sub_component: "Different pull angle",
    emg_score: 3,
  },
  {
    exercise: "Single Arm Dumbbell Row",
    muscles_primary: "Back",
    muscles_secondary: "Biceps",
    type: "Compound",
    equipment_type: "single dumbbell",
    sub_component: "Lower lat",
    emg_score: 3,
  },
  {
    exercise: "Barbell Curl",
    muscles_primary: "Biceps",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "barbell",
    sub_component: "Long head",
    emg_score: 4,
  },
  {
    exercise: "Cable Curl",
    muscles_primary: "Biceps",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "machine",
    sub_component: "Short head",
    emg_score: 3,
  },
  {
    exercise: "Dumbbell Curl",
    muscles_primary: "Biceps",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "single dumbbell",
    sub_component: "Short head",
    emg_score: 3,
  },
  {
    exercise: "Hammer Curl",
    muscles_primary: "Biceps",
    muscles_secondary: "Brachialis",
    type: "Isolation",
    equipment_type: "single dumbbell",
    sub_component: "Brachialis/Long head",
    emg_score: 2,
  },
  {
    exercise: "Standing Calf Raise",
    muscles_primary: "Calves",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "barbell",
    sub_component: "Gastrocnemius",
    emg_score: 2,
  },
  {
    exercise: "Barbell Bench Press",
    muscles_primary: "Chest",
    muscles_secondary: "Shoulders/Triceps",
    type: "Compound",
    equipment_type: "barbell",
    sub_component: "Sternal head",
    emg_score: 5,
  },
  {
    exercise: "Decline Dumbbell Press",
    muscles_primary: "Chest",
    muscles_secondary: "Triceps",
    type: "Compound",
    equipment_type: "dumbbells",
    sub_component: "Lower/Sternal head",
    emg_score: 3,
  },
  {
    exercise: "Dumbbell Bench Press",
    muscles_primary: "Chest",
    muscles_secondary: "Shoulders/Triceps",
    type: "Compound",
    equipment_type: "dumbbells",
    sub_component: "Sternal/Clavicular head",
    emg_score: 4,
  },
  {
    exercise: "Incline Barbell Press",
    muscles_primary: "Chest",
    muscles_secondary: "Shoulders/Triceps",
    type: "Compound",
    equipment_type: "barbell",
    sub_component: "Upper/Clavicular head",
    emg_score: 4,
  },
  {
    exercise: "Incline Dumbbell Press",
    muscles_primary: "Chest",
    muscles_secondary: "Shoulders/Triceps",
    type: "Compound",
    equipment_type: "dumbbells",
    sub_component: "Upper/Clavicular head",
    emg_score: 3,
  },
  {
    exercise: "Bench Situp",
    muscles_primary: "Core",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "none",
    sub_component: "Upper abs",
    emg_score: 1,
  },
  {
    exercise: "Cable Crunch",
    muscles_primary: "Core",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "machine",
    sub_component: "Upper abs",
    emg_score: 4,
  },
  {
    exercise: "Incline Russian Twist",
    muscles_primary: "Core",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "none",
    sub_component: "Obliques",
    emg_score: 3,
  },
  {
    exercise: "Incline Situp",
    muscles_primary: "Core",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "none",
    sub_component: "Upper abs",
    emg_score: 2,
  },
  {
    exercise: "Leg Raise",
    muscles_primary: "Core",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "none",
    sub_component: "Lower abs",
    emg_score: 4,
  },
  {
    exercise: "Lying Knee Raise",
    muscles_primary: "Core",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "none",
    sub_component: "Lower abs",
    emg_score: 1,
  },
  {
    exercise: "Plank",
    muscles_primary: "Core",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "none",
    sub_component: "Deep stabilisers",
    emg_score: 3,
  },
  {
    exercise: "Side Plank",
    muscles_primary: "Core",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "none",
    sub_component: "Obliques",
    emg_score: 3,
  },
  {
    exercise: "TRX Knee Tuck",
    muscles_primary: "Core",
    muscles_secondary: "Hip Flexors",
    type: "Isolation",
    equipment_type: "none",
    sub_component: "Lower abs",
    emg_score: 4,
  },
  {
    exercise: "TRX Pike",
    muscles_primary: "Core",
    muscles_secondary: "Core",
    type: "Isolation",
    equipment_type: "none",
    sub_component: "Lower abs/Core",
    emg_score: 4,
  },
  {
    exercise: "TRX Side Knee Tuck",
    muscles_primary: "Core",
    muscles_secondary: "Abs",
    type: "Isolation",
    equipment_type: "none",
    sub_component: "Obliques/Lower abs",
    emg_score: 3,
  },
  {
    exercise: "Reverse Wrist Curl",
    muscles_primary: "Forearms",
    muscles_secondary: "Brachialis",
    type: "Isolation",
    equipment_type: "single dumbbell",
    sub_component: "Extensors",
    emg_score: 2,
  },
  {
    exercise: "Wrist Curl (Barbell)",
    muscles_primary: "Forearms",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "barbell",
    sub_component: "Flexors",
    emg_score: 2,
  },
  {
    exercise: "Leg Curl Machine",
    muscles_primary: "Hamstrings",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "machine",
    sub_component: "Hamstrings",
    emg_score: 3,
  },
  {
    exercise: "Barbell Deadlift",
    muscles_primary: "Lower Back",
    muscles_secondary: "Glutes/Hamstrings",
    type: "Compound",
    equipment_type: "olympic barbell",
    sub_component: "Full posterior chain",
    emg_score: 5,
  },
  {
    exercise: "Romanian Deadlift",
    muscles_primary: "Lower Back",
    muscles_secondary: "Hamstrings/Glutes",
    type: "Compound",
    equipment_type: "olympic barbell",
    sub_component: "Hip hinge/Hamstring emphasis",
    emg_score: 4,
  },
  {
    exercise: "Barbell Squat",
    muscles_primary: "Quads",
    muscles_secondary: "Glutes/Hamstrings",
    type: "Compound",
    equipment_type: "barbell",
    sub_component: "Quads/Glutes",
    emg_score: 5,
  },
  {
    exercise: "Leg Extension Machine",
    muscles_primary: "Quads",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "machine",
    sub_component: "Quads",
    emg_score: 3,
  },
  {
    exercise: "Leg Press Machine",
    muscles_primary: "Quads",
    muscles_secondary: "Glutes/Hamstrings",
    type: "Compound",
    equipment_type: "machine",
    sub_component: "Quads/Glutes — different loading angle",
    emg_score: 4,
  },
  {
    exercise: "Dumbbell Lateral Raise",
    muscles_primary: "Shoulders",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "dumbbells",
    sub_component: "Lateral delt",
    emg_score: 2,
  },
  {
    exercise: "Dumbbell Rear Delt Fly",
    muscles_primary: "Shoulders",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "dumbbells",
    sub_component: "Rear delt/Rhomboids",
    emg_score: 2,
  },
  {
    exercise: "Dumbbell Shoulder Press",
    muscles_primary: "Shoulders",
    muscles_secondary: "Triceps",
    type: "Compound",
    equipment_type: "dumbbells",
    sub_component: "Anterior delt/Stabilisers",
    emg_score: 4,
  },
  {
    exercise: "Face Pull",
    muscles_primary: "Shoulders",
    muscles_secondary: "Upper Back/Rotator Cuff",
    type: "Isolation",
    equipment_type: "machine",
    sub_component: "Rear delt/Rotator cuff",
    emg_score: 3,
  },
  {
    exercise: "Overhead Barbell Press",
    muscles_primary: "Shoulders",
    muscles_secondary: "Triceps/Upper Chest",
    type: "Compound",
    equipment_type: "barbell",
    sub_component: "Anterior/Lateral delt",
    emg_score: 5,
  },
  {
    exercise: "Overhead Tricep Extension",
    muscles_primary: "Triceps",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "single dumbbell",
    sub_component: "Long head",
    emg_score: 4,
  },
  {
    exercise: "Skull Crusher",
    muscles_primary: "Triceps",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "barbell",
    sub_component: "Long head/Medial head",
    emg_score: 4,
  },
  {
    exercise: "Tricep Pushdown (Cable)",
    muscles_primary: "Triceps",
    muscles_secondary: "None",
    type: "Isolation",
    equipment_type: "machine",
    sub_component: "Lateral head",
    emg_score: 4,
  },
];

module.exports = router;
