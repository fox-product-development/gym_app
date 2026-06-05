// backend/routes/sessions.js
// Session routes — create, retrieve, log sets, start and complete sessions.

const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware");
const { getNextValidWeight } = require("../weightCalc");

const router = express.Router();

// ─── Get sessions for current week ───────────────────────────────────────────
// GET /sessions/week
// Returns sessions for the user's current phase_week only.

router.get("/week", requireAuth, async (req, res) => {
  try {
    const userResult = await pool.query(
      `SELECT current_phase, current_block, phase_week FROM users WHERE id = $1`,
      [req.userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const { current_phase, current_block, phase_week } = userResult.rows[0];

    const progResult = await pool.query(
      `SELECT id FROM programmes
       WHERE user_id = $1
         AND phase = $2
         AND block_number = $3
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.userId, current_phase, current_block],
    );

    if (progResult.rows.length === 0) {
      return res.json([]);
    }

    const programmeId = progResult.rows[0].id;

    // Filter to current phase_week only
    const result = await pool.query(
      `SELECT
         s.*,
         json_agg(
           pe.* ORDER BY pe.order_index
         ) FILTER (WHERE pe.id IS NOT NULL) AS planned_exercises
       FROM sessions s
       LEFT JOIN planned_exercises pe ON pe.session_id = s.id
       WHERE s.programme_id = $1
         AND s.user_id = $2
         AND s.week_number = $3
       GROUP BY s.id
       ORDER BY s.session_type ASC, s.occurrence ASC`,
      [programmeId, req.userId, phase_week],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Get week sessions error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Get a single session ─────────────────────────────────────────────────────
// GET /sessions/:id

router.get("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const sessionResult = await pool.query(
      `SELECT * FROM sessions WHERE id = $1 AND user_id = $2`,
      [id, req.userId],
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    const session = sessionResult.rows[0];

    const plannedResult = await pool.query(
      `SELECT * FROM planned_exercises
       WHERE session_id = $1
       ORDER BY order_index ASC`,
      [id],
    );

    const loggedResult = await pool.query(
      `SELECT * FROM logged_sets
       WHERE session_id = $1
       ORDER BY exercise_name, set_number ASC`,
      [id],
    );

    res.json({
      ...session,
      planned_exercises: plannedResult.rows,
      logged_sets: loggedResult.rows,
    });
  } catch (err) {
    console.error("Get session error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Create a session ─────────────────────────────────────────────────────────
// POST /sessions

router.post("/", requireAuth, async (req, res) => {
  const {
    programme_id,
    session_type,
    occurrence,
    week_number,
    gym,
    exercises,
  } = req.body;

  if (
    !session_type ||
    !occurrence ||
    !week_number ||
    !gym ||
    !exercises ||
    exercises.length === 0
  ) {
    return res.status(400).json({
      error:
        "session_type, occurrence, week_number, gym and exercises are required",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const sessionResult = await client.query(
      `INSERT INTO sessions
         (user_id, programme_id, session_type, occurrence, week_number, gym)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        req.userId,
        programme_id || null,
        session_type,
        occurrence,
        week_number,
        gym,
      ],
    );

    const session = sessionResult.rows[0];

    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      await client.query(
        `INSERT INTO planned_exercises
           (session_id, exercise_name, muscles_primary, sub_component,
            order_index, target_sets, target_reps, target_weight)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          session.id,
          ex.exercise_name,
          ex.muscles_primary || null,
          ex.sub_component || null,
          ex.order_index !== undefined ? ex.order_index : i,
          ex.target_sets,
          ex.target_reps,
          ex.target_weight,
        ],
      );
    }

    await client.query("COMMIT");
    res.status(201).json(session);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Create session error:", err.message);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});

// ─── Start a session ──────────────────────────────────────────────────────────
// PATCH /sessions/:id/start

router.patch("/:id/start", requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE sessions
       SET status = 'in_progress', started_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, req.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Start session error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Log a set ────────────────────────────────────────────────────────────────
// POST /sessions/:id/sets
//
// On every set:
//   - Log the set to logged_sets
//   - On set_number = 1 only: calculate 1RM via Epley and store in one_rep_max_history
//
// After logging, check for progressive overload (PO):
//   - Get the planned_exercises row for this exercise in this session
//   - Get the current phase to determine max reps for this phase
//   - If all planned sets have been logged AND every logged set hit target_reps:
//       - Set range_exceeded = true on the planned_exercises row
//       - Calculate next valid weight using equipment constraints (weightCalc.js)
//       - Update target_weight_kg in exercises table for this exercise
//         and user_id (both gyms)

// Phase max reps lookup
const PHASE_MAX_REPS = {
  anatomical_adaptation: 20,
  hypertrophy: 12,
  maximum_strength: 6,
  muscle_definition: 40,
};

router.post("/:id/sets", requireAuth, async (req, res) => {
  const { id } = req.params;
  const {
    exercise_name,
    set_number,
    drop_number = 0,
    weight,
    reps,
    notes,
  } = req.body;

  if (!exercise_name || !set_number || !weight || !reps) {
    return res.status(400).json({
      error: "exercise_name, set_number, weight and reps are required",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Log the set
    const setResult = await client.query(
      `INSERT INTO logged_sets
         (session_id, exercise_name, set_number, drop_number, weight, reps, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, exercise_name, set_number, drop_number, weight, reps, notes || null],
    );

    // 2. Calculate 1RM on the first set only (not drops, not high-rep sets)
    // Only fires when set_number = 1, drop_number = 0, and reps <= 12
    if (set_number === 1 && drop_number === 0 && reps <= 12) {
      const estimated1RM = weight * (1 + reps / 30);
      await client.query(
        `INSERT INTO one_rep_max_history
           (user_id, exercise_name, estimated_1rm, weight_used, reps_performed)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.userId, exercise_name, estimated1RM.toFixed(2), weight, reps],
      );
    }

    // 3. Check for progressive overload
    // Get the planned exercise row for this session, including set_style
    const plannedResult = await client.query(
      `SELECT pe.id, pe.target_sets, pe.target_reps, pe.range_exceeded,
              pe.set_style, s.gym_id
       FROM planned_exercises pe
       JOIN sessions s ON s.id = pe.session_id
       WHERE pe.session_id = $1
         AND pe.exercise_name = $2`,
      [id, exercise_name],
    );

    if (plannedResult.rows.length > 0) {
      const planned = plannedResult.rows[0];

      // Only check PO if range_exceeded not already set
      if (!planned.range_exceeded) {
        let rangeExceeded = false;

        if (planned.set_style === "drop") {
          // Drop set PO: fire only on the opening set (set 1, drop 0) hitting full target reps
          if (
            set_number === 1 &&
            drop_number === 0 &&
            reps >= planned.target_reps
          ) {
            rangeExceeded = true;
          }
        } else {
          // Standard set PO: all planned sets logged and every set hit max reps
          const loggedResult = await client.query(
            `SELECT reps FROM logged_sets
             WHERE session_id = $1 AND exercise_name = $2
             ORDER BY set_number ASC`,
            [id, exercise_name],
          );

          const loggedSets = loggedResult.rows;

          if (loggedSets.length >= planned.target_sets) {
            const userResult = await client.query(
              `SELECT current_phase FROM users WHERE id = $1`,
              [req.userId],
            );
            const phase = userResult.rows[0]?.current_phase;
            const maxReps = PHASE_MAX_REPS[phase] || planned.target_reps;
            rangeExceeded = loggedSets.every((s) => s.reps >= maxReps);
          }
        }

        if (rangeExceeded) {
          // Set range_exceeded flag
          await client.query(
            `UPDATE planned_exercises
             SET range_exceeded = TRUE
             WHERE id = $1`,
            [planned.id],
          );

          // Look up the exercise record using gym_id
          const exerciseResult = await client.query(
            `SELECT id, target_weight_kg
             FROM exercises
             WHERE user_id = $1
               AND gym_id = $2
               AND exercise = $3`,
            [req.userId, planned.gym_id, exercise_name],
          );

          if (
            exerciseResult.rows.length > 0 &&
            exerciseResult.rows[0].target_weight_kg !== null
          ) {
            const ex = exerciseResult.rows[0];

            // Calculate the next achievable weight based on equipment constraints
            const newWeight = await getNextValidWeight(ex.id, req.userId);

            if (
              newWeight !== null &&
              newWeight !== parseFloat(ex.target_weight_kg)
            ) {
              await client.query(
                `UPDATE exercises
                 SET target_weight_kg = $1
                 WHERE id = $2`,
                [newWeight, ex.id],
              );
            }
          }
        }
      }
    }

    await client.query("COMMIT");
    res.status(201).json(setResult.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Log set error:", err.message);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});

// ─── Complete a session ───────────────────────────────────────────────────────
// PATCH /sessions/:id/complete

router.patch("/:id/complete", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;

  try {
    const result = await pool.query(
      `UPDATE sessions
       SET status = 'complete',
           completed_at = NOW(),
           notes = COALESCE($1, notes)
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [notes || null, id, req.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    const session = result.rows[0];

    // ─── Push completed session to Activity Coach ─────────────────────────
    // Non-blocking — failure here does not affect session completion.
    try {
      const activityPayload = {
        type: "gym",
        date: session.completed_at,
        duration_minutes: 60,
        notes: session.notes || null,
        user_id: process.env.ACTIVITY_COACH_USER_ID,
      };

      const response = await fetch(
        "https://www.activitycoach.co.uk/api/bridge/activities",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.BRIDGE_SECRET}`,
          },
          body: JSON.stringify(activityPayload),
        },
      );

      if (!response.ok) {
        console.error(
          "Activity Coach push failed:",
          response.status,
          await response.text(),
        );
      }
    } catch (pushErr) {
      console.error("Activity Coach push error:", pushErr.message);
    }

    res.json(session);
  } catch (err) {
    console.error("Complete session error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
