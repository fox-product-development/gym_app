// backend/routes/sessions.js
// Session routes — create, retrieve, log sets, start and complete sessions.

const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware");

const router = express.Router();

// ─── Get sessions for current block ──────────────────────────────────────────
// GET /sessions/week
// Returns all sessions for the current programme block for the logged in user.

router.get("/week", requireAuth, async (req, res) => {
  try {
    // Get the user's current programme
    const userResult = await pool.query(
      `SELECT current_phase, current_block FROM users WHERE id = $1`,
      [req.userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const { current_phase, current_block } = userResult.rows[0];

    // Get the current programme
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

    // Get all sessions for this programme with their planned exercises
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
       GROUP BY s.id
       ORDER BY s.week_number ASC, s.session_type ASC, s.occurrence ASC`,
      [programmeId, req.userId],
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
// Creates a new planned session with its exercises.
// Called by the AI block generation route — not directly by the app.

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

    // Create the session
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

    // Insert planned exercises
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
// Logs a completed set. Auto-calculates 1RM if reps are in the 3-10 range.

router.post("/:id/sets", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { exercise_name, set_number, weight, reps, notes } = req.body;

  if (!exercise_name || !set_number || !weight || !reps) {
    return res.status(400).json({
      error: "exercise_name, set_number, weight and reps are required",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Log the set
    const setResult = await client.query(
      `INSERT INTO logged_sets
         (session_id, exercise_name, set_number, weight, reps, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, exercise_name, set_number, weight, reps, notes || null],
    );

    // Auto-calculate 1RM using Epley formula for reps in 3-10 range
    if (reps >= 3 && reps <= 10) {
      const estimated1RM = weight * (1 + reps / 30);
      await client.query(
        `INSERT INTO one_rep_max_history
           (user_id, exercise_name, estimated_1rm, weight_used, reps_performed)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.userId, exercise_name, estimated1RM.toFixed(2), weight, reps],
      );
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

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Complete session error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
