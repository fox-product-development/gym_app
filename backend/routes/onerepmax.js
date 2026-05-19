// backend/routes/onerepmax.js
// 1RM history routes — retrieve estimated 1RM history per exercise.

const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware");

const router = express.Router();

// ─── Get 1RM history for an exercise ─────────────────────────────────────────
// GET /onerepmax/:exercise
// Returns the full 1RM history for a given exercise.

router.get("/:exercise", requireAuth, async (req, res) => {
  const { exercise } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM one_rep_max_history
       WHERE user_id = $1
         AND exercise_name ILIKE $2
       ORDER BY logged_at ASC`,
      [req.userId, exercise],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Get 1RM history error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Get latest 1RM for all exercises ────────────────────────────────────────
// GET /onerepmax
// Returns the most recent 1RM estimate for every exercise the user has logged.

router.get("/", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (exercise_name)
         exercise_name,
         estimated_1rm,
         weight_used,
         reps_performed,
         logged_at
       FROM one_rep_max_history
       WHERE user_id = $1
       ORDER BY exercise_name, logged_at DESC`,
      [req.userId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Get all 1RM error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
