// backend/routes/user.js
// User profile routes — read and update profile and onboarding data.

const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware");

const router = express.Router();

// ─── Get user profile ─────────────────────────────────────────────────────────
// GET /user/profile

router.get("/profile", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, email, is_admin, current_phase, current_block,
              phase_week, phase_start_date, phase_cycle, agent_tone,
              goal_size, goal_strength, goal_definition, goal_fitness,
              training_level, weekly_sessions, goal_description,
              weight_exercises_per_session, conditioning_exercises_per_session,
              created_at
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
// Used by onboarding and settings to save goal profile and preferences.

router.patch("/profile", requireAuth, async (req, res) => {
  const {
    agent_tone,
    goal_size,
    goal_strength,
    goal_definition,
    goal_fitness,
    training_level,
    weekly_sessions,
    goal_description,
    weight_exercises_per_session,
    conditioning_exercises_per_session,
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE users
       SET
         agent_tone                        = COALESCE($1,  agent_tone),
         goal_size                         = COALESCE($2,  goal_size),
         goal_strength                     = COALESCE($3,  goal_strength),
         goal_definition                   = COALESCE($4,  goal_definition),
         goal_fitness                      = COALESCE($5,  goal_fitness),
         training_level                    = COALESCE($6,  training_level),
         weekly_sessions                   = COALESCE($7,  weekly_sessions),
         goal_description                  = COALESCE($8,  goal_description),
         weight_exercises_per_session      = COALESCE($9,  weight_exercises_per_session),
         conditioning_exercises_per_session = COALESCE($10, conditioning_exercises_per_session)
       WHERE id = $11
       RETURNING id, username, email, is_admin, current_phase, current_block,
                 phase_week, phase_start_date, phase_cycle, agent_tone,
                 goal_size, goal_strength, goal_definition, goal_fitness,
                 training_level, weekly_sessions, goal_description,
                 weight_exercises_per_session, conditioning_exercises_per_session`,
      [
        agent_tone,
        goal_size,
        goal_strength,
        goal_definition,
        goal_fitness,
        training_level,
        weekly_sessions,
        goal_description,
        weight_exercises_per_session,
        conditioning_exercises_per_session,
        req.userId,
      ],
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Update profile error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
