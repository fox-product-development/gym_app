// backend/routes/sessions.js
// Session routes — create, retrieve, log sets, start and complete sessions.

const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware");
const { getNextValidWeight } = require("../weightCalc");
const { PHASE_CONFIG } = require("../phaseConfig");

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

    const result = await pool.query(
      `SELECT
         s.*,
         g.gym_name,
         json_agg(
           pe.* ORDER BY pe.order_index
         ) FILTER (WHERE pe.id IS NOT NULL) AS planned_exercises
       FROM sessions s
       LEFT JOIN gyms g ON g.id = s.gym_id
       LEFT JOIN planned_exercises pe ON pe.session_id = s.id
       WHERE s.programme_id = $1
         AND s.user_id = $2
         AND s.week_number = $3
       GROUP BY s.id, g.gym_name
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
//
// Returns the session with:
//   - gym_name from the gyms table (via gym_id FK)
//   - equipment_unit per planned exercise (via exercises → equipment JOIN)
//     Used by the frontend to show kg or lbs suffixes correctly.

router.get("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const sessionResult = await pool.query(
      `SELECT s.*, g.gym_name
       FROM sessions s
       LEFT JOIN gyms g ON g.id = s.gym_id
       WHERE s.id = $1 AND s.user_id = $2`,
      [id, req.userId],
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    const session = sessionResult.rows[0];

    // Fetch planned exercises, joining through exercises → equipment to get
    // the unit (kg / lbs) for each exercise so the session screen can display
    // the correct weight suffix.
    const plannedResult = await pool.query(
      `SELECT pe.*,
              COALESCE(eq.unit, 'kg') AS equipment_unit
       FROM planned_exercises pe
       LEFT JOIN exercises ex
         ON ex.exercise = pe.exercise_name
         AND ex.gym_id = $2
         AND ex.user_id = $3
       LEFT JOIN equipment eq ON eq.id = ex.equipment_id
       WHERE pe.session_id = $1
       ORDER BY pe.order_index ASC`,
      [id, session.gym_id, req.userId],
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
    gym_id,
    exercises,
  } = req.body;

  if (
    !session_type ||
    !occurrence ||
    !week_number ||
    !exercises ||
    exercises.length === 0
  ) {
    return res.status(400).json({
      error: "session_type, occurrence, week_number and exercises are required",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const sessionResult = await client.query(
      `INSERT INTO sessions
         (user_id, programme_id, session_type, occurrence, week_number, gym_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        req.userId,
        programme_id || null,
        session_type,
        occurrence,
        week_number,
        gym_id || null,
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
//   - PO only fires for phases where poEnabled = true (Hypertrophy, Max Strength)
//   - Get the planned_exercises row for this exercise in this session
//   - If all planned sets have been logged AND every logged set hit phase targetReps:
//       - Set range_exceeded = true on the planned_exercises row
//       - Calculate next valid weight for the triggering exercise (weightCalc.js)
//       - Update target_weight for the triggering exercise in the exercises table
//       - Cascade: update target_weight for all other active exercises sharing
//         the same muscles_primary for this user (each uses its own equipment increment)
//       - Cascade: update planned_exercises.target_weight for all planned sessions
//         for every affected exercise

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
    // Informational only — writes to one_rep_max_history, not to exercises table
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
    const plannedResult = await client.query(
      `SELECT pe.id, pe.target_sets, pe.target_reps, pe.range_exceeded,
              pe.set_style, pe.muscles_primary, s.gym_id
       FROM planned_exercises pe
       JOIN sessions s ON s.id = pe.session_id
       WHERE pe.session_id = $1
         AND pe.exercise_name = $2`,
      [id, exercise_name],
    );

    if (plannedResult.rows.length > 0) {
      const planned = plannedResult.rows[0];

      if (!planned.range_exceeded) {
        const userResult = await client.query(
          `SELECT current_phase FROM users WHERE id = $1`,
          [req.userId],
        );
        const phase = userResult.rows[0]?.current_phase;
        const phaseConfig = PHASE_CONFIG[phase];

        if (!phaseConfig || !phaseConfig.poEnabled) {
          await client.query("COMMIT");
          return res.status(201).json(setResult.rows[0]);
        }

        let rangeExceeded = false;

        if (planned.set_style === "drop") {
          if (
            set_number === 1 &&
            drop_number === 0 &&
            reps >= planned.target_reps
          ) {
            rangeExceeded = true;
          }
        } else {
          const loggedResult = await client.query(
            `SELECT reps FROM logged_sets
             WHERE session_id = $1 AND exercise_name = $2
             ORDER BY set_number ASC`,
            [id, exercise_name],
          );

          const loggedSets = loggedResult.rows;

          if (loggedSets.length >= planned.target_sets) {
            const maxReps = phaseConfig.targetReps;
            rangeExceeded = loggedSets.every((s) => s.reps >= maxReps);
          }
        }

        if (rangeExceeded) {
          await client.query(
            `UPDATE planned_exercises SET range_exceeded = TRUE WHERE id = $1`,
            [planned.id],
          );

          const triggerExResult = await client.query(
            `SELECT id, target_weight
             FROM exercises
             WHERE user_id = $1 AND gym_id = $2 AND exercise = $3`,
            [req.userId, planned.gym_id, exercise_name],
          );

          const updatedExercises = [];

          if (
            triggerExResult.rows.length > 0 &&
            triggerExResult.rows[0].target_weight !== null
          ) {
            const triggerEx = triggerExResult.rows[0];
            const newWeight = await getNextValidWeight(
              triggerEx.id,
              req.userId,
            );

            if (
              newWeight !== null &&
              newWeight !== parseFloat(triggerEx.target_weight)
            ) {
              await client.query(
                `UPDATE exercises SET target_weight = $1 WHERE id = $2`,
                [newWeight, triggerEx.id],
              );
              updatedExercises.push({ name: exercise_name, weight: newWeight });
            }
          }

          if (
            planned.muscles_primary &&
            planned.muscles_primary !== "Conditioning"
          ) {
            const siblingResult = await client.query(
              `SELECT e.id, e.exercise, e.target_weight
               FROM exercises e
               WHERE e.user_id = $1
                 AND e.muscles_primary = $2
                 AND e.exercise != $3
                 AND e.target_weight IS NOT NULL
                 AND e.active = TRUE`,
              [req.userId, planned.muscles_primary, exercise_name],
            );

            for (const sibling of siblingResult.rows) {
              const siblingNewWeight = await getNextValidWeight(
                sibling.id,
                req.userId,
              );

              if (
                siblingNewWeight !== null &&
                siblingNewWeight !== parseFloat(sibling.target_weight)
              ) {
                await client.query(
                  `UPDATE exercises SET target_weight = $1 WHERE id = $2`,
                  [siblingNewWeight, sibling.id],
                );
                updatedExercises.push({
                  name: sibling.exercise,
                  weight: siblingNewWeight,
                });
              }
            }
          }

          for (const updated of updatedExercises) {
            await client.query(
              `UPDATE planned_exercises pe
               SET target_weight = $1
               FROM sessions s
               WHERE pe.session_id = s.id
                 AND s.status = 'planned'
                 AND s.user_id = $2
                 AND pe.exercise_name = $3`,
              [updated.weight, req.userId, updated.name],
            );
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
