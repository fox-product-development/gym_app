// backend/routes/mood.js
// Mood and energy logging routes — log and retrieve daily ratings.

const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware");

const router = express.Router();

// ─── Log a mood entry ─────────────────────────────────────────────────────────
// POST /mood
// Saves or updates today's mood and energy ratings.

router.post("/", requireAuth, async (req, res) => {
  const { mood, energy, notes } = req.body;

  if (!mood || !energy) {
    return res.status(400).json({
      error: "mood and energy are required",
    });
  }

  if (mood < 1 || mood > 5 || energy < 1 || energy > 5) {
    return res.status(400).json({
      error: "mood and energy must be between 1 and 5",
    });
  }

  try {
    const existing = await pool.query(
      `SELECT id FROM mood_logs
       WHERE user_id = $1 AND logged_at = CURRENT_DATE`,
      [req.userId],
    );

    let result;

    if (existing.rows.length > 0) {
      result = await pool.query(
        `UPDATE mood_logs
         SET mood   = $1,
             energy = $2,
             notes  = COALESCE($3, notes)
         WHERE user_id = $4 AND logged_at = CURRENT_DATE
         RETURNING *`,
        [mood, energy, notes, req.userId],
      );
    } else {
      result = await pool.query(
        `INSERT INTO mood_logs (user_id, mood, energy, notes)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [req.userId, mood, energy, notes],
      );
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Mood log error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Get recent mood entries ──────────────────────────────────────────────────
// GET /mood?weeks=4
// Returns the last N weeks of mood and energy entries.

router.get("/", requireAuth, async (req, res) => {
  const weeks = parseInt(req.query.weeks) || 4;

  try {
    const result = await pool.query(
      `SELECT * FROM mood_logs
       WHERE user_id = $1
         AND logged_at >= CURRENT_DATE - INTERVAL '${weeks} weeks'
       ORDER BY logged_at ASC`,
      [req.userId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Mood fetch error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
