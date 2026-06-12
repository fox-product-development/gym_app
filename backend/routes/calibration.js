// backend/routes/calibration.js
// Calibration endpoints — exercise picker and completion handler.
// Calibration establishes baseline 1RM estimates for new users before
// their first training block is generated.

const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const pool = require("../db");
const requireAuth = require("../middleware");

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Inference ratios ─────────────────────────────────────────────────────────
// Conservative ratios for deriving 1RM estimates for muscles not directly
// tested in calibration. Deliberately low — PO will correct upward.

const INFERENCE_RATIOS = {
  Triceps: { source: "Chest", ratio: 0.4 },
  Biceps: { source: "Back", ratio: 0.35 },
  Forearms: { source: "Back", ratio: 0.2 },
  "Lower Back": { source: "Hamstrings", ratio: 0.5 },
  Calves: { source: "Quads", ratio: 0.5 },
  Glutes: { source: "Quads", ratio: 0.8 },
};

// Core gets a flat nominal 1RM — most core work is bodyweight or very light
const CORE_DEFAULT_1RM = 20;

// ─── GET /calibration/exercises ───────────────────────────────────────────────
// Uses the AI to select 5–7 exercises from the user's library that together
// cover all major muscle groups as broadly as possible.

router.get("/exercises", requireAuth, async (req, res) => {
  const { gym_id } = req.query;
  if (!gym_id) return res.status(400).json({ error: "gym_id is required" });

  try {
    const result = await pool.query(
      `SELECT e.id, e.exercise, e.muscles_primary, e.muscles_secondary,
              e.sub_component, e.emg_score,
              eq.type AS equipment_type, eq.equipment_name,
              eq.unit AS equipment_unit
       FROM exercises e
       LEFT JOIN equipment eq ON eq.id = e.equipment_id
       WHERE e.user_id = $1 AND e.gym_id = $2 AND e.active = TRUE
       ORDER BY e.muscles_primary, e.emg_score DESC`,
      [req.userId, parseInt(gym_id)],
    );

    const exercises = result.rows;

    if (exercises.length === 0) {
      return res.status(400).json({ error: "No exercises found for this gym" });
    }

    // Build CSV for AI prompt
    const header =
      "id,exercise,muscles_primary,muscles_secondary,sub_component,emg_score,equipment_type,equipment_name";
    const rows = exercises.map(
      (e) =>
        `${e.id},${e.exercise},${e.muscles_primary},${e.muscles_secondary || ""},${e.sub_component || ""},${e.emg_score || ""},${e.equipment_type || "bodyweight"},${e.equipment_name || "none"}`,
    );
    const exerciseCSV = [header, ...rows].join("\n");

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `You are selecting exercises for a strength calibration session. The goal is to test the user's baseline strength across all major muscle groups so we can estimate 1RM values for their entire exercise library.

Select between 5 and 7 exercises from the library below that together cover as many major muscle groups as possible (Chest, Back, Shoulders, Quads, Hamstrings, and any others well represented in the library).

Rules:
- Prefer machine and fixed equipment over loadable (barbells/dumbbells) — safer for users who don't yet know their limits
- No duplicate muscle groups unless the library has very limited options
- No duplicate exercises
- Use only exercises from the library — return the exact id and exercise name as they appear

EXERCISE LIBRARY
${exerciseCSV}

Return ONLY this exact JSON structure, nothing else:
{
  "exercises": [
    {
      "id": <number>,
      "exercise": "<name>",
      "muscles_primary": "<primary muscle>"
    }
  ]
}

No explanation. No markdown. Valid JSON only.`,
        },
      ],
    });

    const rawText = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    const clean = rawText.replace(/```json|```/g, "").trim();
    const aiResult = JSON.parse(clean);

    if (!aiResult.exercises || aiResult.exercises.length === 0) {
      throw new Error("AI returned no exercises");
    }

    // Enrich each selected exercise with metadata from DB result
    const enriched = aiResult.exercises
      .map((selected) => {
        const ex = exercises.find((e) => e.id === selected.id);
        if (!ex) return null;
        return {
          exercise_id: ex.id,
          exercise_name: ex.exercise,
          muscles_primary: ex.muscles_primary,
          muscles_secondary: ex.muscles_secondary || null,
          sub_component: ex.sub_component || null,
          equipment_name: ex.equipment_name || null,
          equipment_unit: ex.equipment_unit || "kg",
        };
      })
      .filter(Boolean);

    res.json({ exercises: enriched });
  } catch (err) {
    console.error("Calibration exercises error:", err.message);
    res.status(500).json({ error: "Server error", detail: err.message });
  }
});

// ─── POST /calibration/complete ───────────────────────────────────────────────
// Processes calibration results:
// 1. Calculates 1RM for each calibrated exercise via Epley
// 2. Builds a muscle group 1RM map
// 3. Applies inference ratios to derive 1RM for uncalibrated muscles
// 4. Writes 1RM estimates to one_rep_max_history for every exercise in the
//    user's library across all gyms

router.post("/complete", requireAuth, async (req, res) => {
  const { results } = req.body;

  if (!results || results.length === 0) {
    return res.status(400).json({ error: "results are required" });
  }

  try {
    const now = new Date();
    const calibrated1RMs = {};
    const directlyCalibrated = new Set();

    // ── Step 1: Calculate 1RM for each calibrated exercise ─────────────────
    for (const r of results) {
      const estimated1rm = r.weight * (1 + r.reps / 30);

      await pool.query(
        `INSERT INTO one_rep_max_history
           (user_id, exercise_name, estimated_1rm, weight_used, reps_performed, logged_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [req.userId, r.exercise_name, estimated1rm, r.weight, r.reps, now],
      );

      directlyCalibrated.add(r.exercise_name.toLowerCase());

      // Keep the highest 1RM if a muscle appears more than once
      if (
        !calibrated1RMs[r.muscles_primary] ||
        estimated1rm > calibrated1RMs[r.muscles_primary]
      ) {
        calibrated1RMs[r.muscles_primary] = estimated1rm;
      }
    }

    // ── Step 2: Build full muscle 1RM map with inferred muscles ────────────
    const muscle1RMs = { ...calibrated1RMs };

    for (const [muscle, rule] of Object.entries(INFERENCE_RATIOS)) {
      if (!muscle1RMs[muscle] && muscle1RMs[rule.source]) {
        muscle1RMs[muscle] = muscle1RMs[rule.source] * rule.ratio;
      }
    }

    if (!muscle1RMs["Core"]) {
      muscle1RMs["Core"] = CORE_DEFAULT_1RM;
    }

    // ── Step 3: Write inferred 1RM to all exercises in user's library ───────
    const allExercises = await pool.query(
      `SELECT id, exercise, muscles_primary
       FROM exercises
       WHERE user_id = $1 AND active = TRUE`,
      [req.userId],
    );

    for (const ex of allExercises.rows) {
      if (directlyCalibrated.has(ex.exercise.toLowerCase())) continue;

      const estimated1rm = muscle1RMs[ex.muscles_primary];
      if (!estimated1rm) continue;

      await pool.query(
        `INSERT INTO one_rep_max_history
           (user_id, exercise_name, estimated_1rm, weight_used, reps_performed, logged_at)
         VALUES ($1, $2, $3, NULL, NULL, $4)`,
        [req.userId, ex.exercise, estimated1rm, now],
      );
    }

    res.json({
      message: "Calibration complete",
      muscle_1rms: muscle1RMs,
    });
  } catch (err) {
    console.error("Calibration complete error:", err.message);
    res.status(500).json({ error: "Server error", detail: err.message });
  }
});

module.exports = router;
