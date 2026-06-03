// backend/routes/cardio.js
// Cardio logging routes — log and retrieve non-gym cardio activity.

const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware");

const router = express.Router();

// ─── Log a cardio entry ───────────────────────────────────────────────────────
// POST /cardio
// Saves a cardio activity entry.

router.post("/", requireAuth, async (req, res) => {
  const { activity_type, duration_minutes, distance_km, notes, logged_at } =
    req.body;

  if (!activity_type || !duration_minutes) {
    return res.status(400).json({
      error: "activity_type and duration_minutes are required",
    });
  }

  if (duration_minutes < 1) {
    return res.status(400).json({
      error: "duration_minutes must be at least 1",
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO cardio_logs
         (user_id, activity_type, duration_minutes, distance_km, notes, logged_at)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE))
       RETURNING *`,
      [
        req.userId,
        activity_type,
        duration_minutes,
        distance_km,
        notes,
        logged_at,
      ],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Cardio log error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Get recent cardio entries ────────────────────────────────────────────────
// GET /cardio?weeks=4
// Returns the last N weeks of cardio entries.

router.get("/", requireAuth, async (req, res) => {
  const weeks = parseInt(req.query.weeks) || 4;

  try {
    const result = await pool.query(
      `SELECT * FROM cardio_logs
       WHERE user_id = $1
         AND logged_at >= CURRENT_DATE - INTERVAL '${weeks} weeks'
       ORDER BY logged_at DESC`,
      [req.userId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Cardio fetch error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Delete a cardio entry ────────────────────────────────────────────────────
// DELETE /cardio/:id
// Removes a cardio entry — in case of logging errors.

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM cardio_logs
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [req.params.id, req.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Entry not found" });
    }

    res.json({ deleted: true });
  } catch (err) {
    console.error("Cardio delete error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
