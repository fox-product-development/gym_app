// backend/routes/sessions.js
// Session routes — create, retrieve, log sets, and complete sessions.

const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware");

const router = express.Router();

// ─── Get all sessions for current week ───────────────────────────────────────
// GET /sessions/week
// Returns all sessions for the current week for the logged in user.

router.get("/week", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         s.*,
         json_agg(
           pe.* ORDER BY pe.order_index
         ) FILTER (WHERE pe.id IS NOT NULL) AS planned_exercises
       FROM sessions s
       LEFT JOIN planned_exercises pe ON pe.session_id = s.id
       WHERE s.user_id = $1
         AND s.date >= date_trunc('week', CURRENT_DATE)
         AND s.date < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days'
       GROUP BY s.id
       ORDER BY s.date ASC`,
      [req.userId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Get week sessions error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Get a single session ─────────────────────────────────────────────────────
// GET /sessions/:id
// Returns a session with its planned exercises and logged sets.

router.get("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    // Get session
    const sessionResult = await pool.query(
      `SELECT * FROM sessions WHERE id = $1 AND user_id = $2`,
      [id, req.userId],
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    const session = sessionResult.rows[0];

    // Get planned exercises
    const plannedResult = await pool.query(
      `SELECT * FROM planned_exercises
       WHERE session_id = $1
       ORDER BY order_index ASC`,
      [id],
    );

    // Get logged sets
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

router.post("/", requireAuth, async (req, res) => {
  const { date, gym, day_focus, programme_id, exercises } = req.body;

  if (!date || !gym || !day_focus || !exercises || exercises.length === 0) {
    return res
      .status(400)
      .json({ error: "date, gym, day_focus and exercises are required" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Create the session
    const sessionResult = await client.query(
      `INSERT INTO sessions (user_id, programme_id, date, gym, day_focus)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.userId, programme_id || null, date, gym, day_focus],
    );

    const session = sessionResult.rows[0];

    // Insert planned exercises
    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      await client.query(
        `INSERT INTO planned_exercises
           (session_id, exercise_name, order_index, warmup_sets,
            target_sets, target_reps, target_weight)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          session.id,
          ex.exercise_name,
          i,
          JSON.stringify(ex.warmup_sets || []),
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
// Marks a session as in progress and records the start time.

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
// Logs a completed set during a session.
// Also updates the 1RM estimate if reps are in the 3-10 range.

router.post("/:id/sets", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { exercise_name, set_number, weight, reps, notes } = req.body;

  if (!exercise_name || !set_number || !weight || !reps) {
    return res
      .status(400)
      .json({
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

    // Update 1RM estimate if reps are in the 3-10 range
    // Uses the Epley formula: 1RM = weight x (1 + reps / 30)
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
// Marks a session as complete and records the end time.

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
