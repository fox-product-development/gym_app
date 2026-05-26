// backend/routes/bridge.js
// Bridge endpoints for Activity Coach integration.
// Secured with BRIDGE_SECRET header — no JWT required.

const express = require("express");
const pool = require("../db");

const router = express.Router();

// ─── Bridge auth middleware ───────────────────────────────────────────────────
// All bridge routes require Authorization: Bearer <BRIDGE_SECRET>

function requireBridgeAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token || token !== process.env.BRIDGE_SECRET) {
    return res.status(401).json({ error: "Unauthorised" });
  }

  next();
}

// ─── GET /bridge/weight ───────────────────────────────────────────────────────
// Returns full weight history from body_composition table.
// Activity Coach calls this to display weight data.

router.get("/weight", requireBridgeAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT logged_at AS date, weight_kg
       FROM body_composition
       ORDER BY logged_at ASC`,
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Bridge weight error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── GET /bridge/context ──────────────────────────────────────────────────────
// Returns current training context for Activity Coach AI agents.
// Includes phase, week, this week's session status, PO flags, recent 1RMs.

router.get("/context", requireBridgeAuth, async (req, res) => {
  try {
    // Get user state
    const userResult = await pool.query(
      `SELECT current_phase, current_block, phase_week FROM users LIMIT 1`,
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const { current_phase, current_block, phase_week } = userResult.rows[0];

    // Get current programme
    const progResult = await pool.query(
      `SELECT id FROM programmes
       WHERE phase = $1 AND block_number = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [current_phase, current_block],
    );

    let sessions = [];
    let rangeExceededExercises = [];

    if (progResult.rows.length > 0) {
      const programmeId = progResult.rows[0].id;

      // Get this week's sessions with their planned exercises
      const sessionResult = await pool.query(
        `SELECT
           s.id, s.session_type, s.status, s.gym,
           s.started_at, s.completed_at,
           json_agg(
             json_build_object(
               'exercise_name', pe.exercise_name,
               'muscles_primary', pe.muscles_primary,
               'range_exceeded', pe.range_exceeded
             ) ORDER BY pe.order_index
           ) FILTER (WHERE pe.id IS NOT NULL) AS exercises
         FROM sessions s
         LEFT JOIN planned_exercises pe ON pe.session_id = s.id
         WHERE s.programme_id = $1
           AND s.week_number = $2
         GROUP BY s.id
         ORDER BY s.session_type ASC, s.occurrence ASC`,
        [programmeId, phase_week],
      );

      sessions = sessionResult.rows;

      // Extract exercises where range_exceeded = true this week
      for (const session of sessions) {
        if (session.exercises) {
          for (const ex of session.exercises) {
            if (ex.range_exceeded) {
              rangeExceededExercises.push(ex.exercise_name);
            }
          }
        }
      }
    }

    // Get recent 1RM highlights (last 14 days, best per exercise)
    const oneRmResult = await pool.query(
      `SELECT DISTINCT ON (exercise_name)
         exercise_name, estimated_1rm, weight_used, reps_performed, logged_at
       FROM one_rep_max_history
       WHERE logged_at >= NOW() - INTERVAL '14 days'
       ORDER BY exercise_name, estimated_1rm DESC`,
    );

    res.json({
      current_phase,
      current_block,
      phase_week,
      sessions_this_week: sessions.map((s) => ({
        session_type: s.session_type,
        status: s.status,
        gym: s.gym,
        completed_at: s.completed_at,
        exercises: s.exercises,
      })),
      progressive_overload_achieved: rangeExceededExercises,
      recent_1rm_highlights: oneRmResult.rows,
    });
  } catch (err) {
    console.error("Bridge context error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
