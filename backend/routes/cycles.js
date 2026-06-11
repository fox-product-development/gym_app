// backend/routes/cycles.js
// Cycle management routes — read, save, and delete training cycles.
// A cycle is an ordered list of phases the user will work through.
// The cron reads from this table instead of a hardcoded phase sequence.

const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware");

const router = express.Router();

// ─── Get current cycle ────────────────────────────────────────────────────────
// GET /cycles
// Returns all rows for the user's most recent cycle, ordered by phase_order.
// The most recent cycle is identified by the highest created_at on any row
// sharing the same batch (identified by the minimum id in that group).

router.get("/", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, phase, phase_order, status, duration_weeks, created_at
       FROM cycles
       WHERE user_id = $1
       ORDER BY phase_order ASC`,
      [req.userId],
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Get cycles error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Save a confirmed cycle ───────────────────────────────────────────────────
// POST /cycles
// Deletes all existing cycle rows for the user, then inserts the new confirmed
// cycle. The first phase is set to in_progress; the rest are pending.
// Also updates users.current_phase to match the first phase.
//
// Body:
//   phases: [{ phase: string }]  — ordered list
//   duration_weeks: number       — 4, 6, or 8

router.post("/", requireAuth, async (req, res) => {
  const { phases, duration_weeks } = req.body;

  if (!phases || !Array.isArray(phases) || phases.length === 0) {
    return res.status(400).json({ error: "phases array is required" });
  }

  const validDurations = [4, 6, 8];
  const duration = parseInt(duration_weeks) || 6;
  if (!validDurations.includes(duration)) {
    return res.status(400).json({ error: "duration_weeks must be 4, 6, or 8" });
  }

  const validPhases = [
    "anatomical_adaptation",
    "hypertrophy",
    "maximum_strength",
    "muscle_definition",
  ];

  for (const p of phases) {
    if (!validPhases.includes(p.phase)) {
      return res.status(400).json({ error: `Invalid phase: ${p.phase}` });
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Delete existing cycle rows for this user
    await client.query(`DELETE FROM cycles WHERE user_id = $1`, [req.userId]);

    // Insert new cycle rows
    for (let i = 0; i < phases.length; i++) {
      const status = i === 0 ? "in_progress" : "pending";
      await client.query(
        `INSERT INTO cycles (user_id, phase, phase_order, status, duration_weeks)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.userId, phases[i].phase, i + 1, status, duration],
      );
    }

    // Update users.current_phase to the first phase and reset tracking fields
    await client.query(
      `UPDATE users
       SET current_phase = $1,
           current_block = 1,
           phase_week = 1,
           phase_start_date = CURRENT_DATE
       WHERE id = $2`,
      [phases[0].phase, req.userId],
    );

    await client.query("COMMIT");

    const cycleResult = await pool.query(
      `SELECT id, phase, phase_order, status, duration_weeks
       FROM cycles WHERE user_id = $1 ORDER BY phase_order ASC`,
      [req.userId],
    );

    res.status(201).json({ cycle: cycleResult.rows });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Save cycle error:", err.message);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});

// ─── Delete current cycle ─────────────────────────────────────────────────────
// DELETE /cycles
// Removes all cycle rows for the user. Used when the user is about to
// create a new cycle (e.g. after a star rating change).
// Does NOT delete programmes or sessions — that is handled separately.

router.delete("/", requireAuth, async (req, res) => {
  try {
    await pool.query(`DELETE FROM cycles WHERE user_id = $1`, [req.userId]);
    res.json({ deleted: true });
  } catch (err) {
    console.error("Delete cycle error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
