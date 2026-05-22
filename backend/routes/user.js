// backend/routes/user.js
// User profile routes — read current phase and progress.

const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware");

const router = express.Router();

// ─── Get user profile ─────────────────────────────────────────────────────────
// GET /user/profile

router.get("/profile", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, current_phase, current_block, phase_week,
              phase_start_date, created_at
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

module.exports = router;
