// backend/routes/bodycomp.js
// Body composition routes — log and retrieve weight and muscle mass entries.

const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware");

const router = express.Router();

// ─── Log a new entry ──────────────────────────────────────────────────────────
// POST /bodycomp
// Saves a new weight and/or muscle mass reading.

router.post("/", requireAuth, async (req, res) => {
  const { weight_kg, muscle_mass_kg, source = "manual" } = req.body;

  if (!weight_kg && !muscle_mass_kg) {
    return res
      .status(400)
      .json({
        error: "At least one of weight_kg or muscle_mass_kg is required",
      });
  }

  try {
    // Check if there is already an entry for today
    const existing = await pool.query(
      `SELECT id FROM body_composition
       WHERE user_id = $1 AND logged_at = CURRENT_DATE`,
      [req.userId],
    );

    let result;

    if (existing.rows.length > 0) {
      // Update today's entry
      result = await pool.query(
        `UPDATE body_composition
         SET weight_kg = COALESCE($1, weight_kg),
             muscle_mass_kg = COALESCE($2, muscle_mass_kg),
             source = $3
         WHERE user_id = $4 AND logged_at = CURRENT_DATE
         RETURNING *`,
        [weight_kg, muscle_mass_kg, source, req.userId],
      );
    } else {
      // Create a new entry
      result = await pool.query(
        `INSERT INTO body_composition (user_id, weight_kg, muscle_mass_kg, source)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [req.userId, weight_kg, muscle_mass_kg, source],
      );
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Body comp log error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Get recent entries ───────────────────────────────────────────────────────
// GET /bodycomp?weeks=12
// Returns the last N weeks of body composition entries.

router.get("/", requireAuth, async (req, res) => {
  const weeks = parseInt(req.query.weeks) || 12;

  try {
    const result = await pool.query(
      `SELECT * FROM body_composition
       WHERE user_id = $1
         AND logged_at >= CURRENT_DATE - INTERVAL '${weeks} weeks'
       ORDER BY logged_at ASC`,
      [req.userId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Body comp fetch error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
