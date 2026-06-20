// backend/routes/user.js
// User profile routes — read and update profile data.

const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware");

const router = express.Router();

// ─── Get user profile ─────────────────────────────────────────────────────────
// GET /user/profile

router.get("/profile", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, email, is_admin, current_phase, cycle_position,
              phase_week, phase_start_date, agent_tone,
              conditioning_exercises_per_session, created_at
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

// ─── Update profile ───────────────────────────────────────────────────────────
// PATCH /user/profile
// Used by settings to save agent tone and conditioning preference — the
// only two profile fields a user can currently set themselves.

router.patch("/profile", requireAuth, async (req, res) => {
  const { agent_tone, conditioning_exercises_per_session } = req.body;

  try {
    const result = await pool.query(
      `UPDATE users
       SET
         agent_tone                         = COALESCE($1, agent_tone),
         conditioning_exercises_per_session = COALESCE($2, conditioning_exercises_per_session)
       WHERE id = $3
       RETURNING id, username, email, is_admin, current_phase, cycle_position,
                 phase_week, phase_start_date, agent_tone,
                 conditioning_exercises_per_session`,
      [agent_tone, conditioning_exercises_per_session, req.userId],
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Update profile error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
