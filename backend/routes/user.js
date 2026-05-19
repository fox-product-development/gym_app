// backend/routes/user.js
// User profile routes — read and update current goal and gym.

const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware");

const router = express.Router();

// ─── Get user profile ─────────────────────────────────────────────────────────
// GET /user/profile
// Returns the current user's profile.

router.get("/profile", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, current_goal, current_gym, goal_start_date, created_at
       FROM users
       WHERE id = $1`,
      [req.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Get profile error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Update current goal ──────────────────────────────────────────────────────
// PATCH /user/goal
// Updates the user's active training goal.
// Resets goal_start_date to today when the goal changes.

router.patch("/goal", requireAuth, async (req, res) => {
  const { goal } = req.body;
  const validGoals = ["maintain", "trim", "size", "strength"];

  if (!goal || !validGoals.includes(goal)) {
    return res.status(400).json({
      error: `goal must be one of: ${validGoals.join(", ")}`,
    });
  }

  try {
    const result = await pool.query(
      `UPDATE users
       SET current_goal = $1,
           goal_start_date = CURRENT_DATE
       WHERE id = $2
       RETURNING id, username, current_goal, current_gym, goal_start_date`,
      [goal, req.userId],
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Update goal error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Update current gym ───────────────────────────────────────────────────────
// PATCH /user/gym
// Updates the user's currently selected gym.

router.patch("/gym", requireAuth, async (req, res) => {
  const { gym } = req.body;
  const validGyms = ["work", "home"];

  if (!gym || !validGyms.includes(gym)) {
    return res.status(400).json({
      error: `gym must be one of: ${validGyms.join(", ")}`,
    });
  }

  try {
    const result = await pool.query(
      `UPDATE users
       SET current_gym = $1
       WHERE id = $2
       RETURNING id, username, current_goal, current_gym, goal_start_date`,
      [gym, req.userId],
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Update gym error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
