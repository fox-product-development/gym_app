// backend/routes/report.js
// Manual report generation endpoint.
// Accepts an optional week_start_date to regenerate a report for a past week.
// If no date is provided, defaults to the current week's Monday.
// If a date is provided, always regenerates even if a report already exists.

const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware");
const { generateReportForUser } = require("../cron");

const router = express.Router();

// ─── Generate report ──────────────────────────────────────────────────────────
// POST /report/generate
// Optional body: { week_start_date: "2026-05-25" }
//
// No date provided:
//   - Calculates current week's Monday
//   - If report exists → returns { status: "up_to_date" }
//   - If not → generates and returns { status: "generated" }
//
// Date provided:
//   - Uses the supplied date as the week start
//   - Always regenerates, overwriting any existing report for that date
//   - Returns { status: "regenerated", week_start_date }

router.post("/generate", requireAuth, async (req, res) => {
  try {
    const { week_start_date } = req.body;
    const isManualDate = !!week_start_date;

    let weekStartDate;

    if (isManualDate) {
      // Validate the supplied date
      const parsed = new Date(week_start_date);
      if (isNaN(parsed.getTime())) {
        return res
          .status(400)
          .json({ error: "Invalid week_start_date — use YYYY-MM-DD format" });
      }
      weekStartDate = week_start_date;
    } else {
      // Calculate this week's Monday
      const today = new Date();
      const dayOfWeek = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      weekStartDate = monday.toISOString().split("T")[0];
    }

    // If no manual date, check if report already exists
    if (!isManualDate) {
      const existing = await pool.query(
        `SELECT id FROM weekly_feedback
         WHERE user_id = $1 AND week_start_date = $2`,
        [req.userId, weekStartDate],
      );

      if (existing.rows.length > 0) {
        return res.json({
          status: "up_to_date",
          week_start_date: weekStartDate,
        });
      }
    }

    // If manual date, delete any existing report for that week so we can overwrite
    if (isManualDate) {
      await pool.query(
        `DELETE FROM weekly_feedback
         WHERE user_id = $1 AND week_start_date = $2`,
        [req.userId, weekStartDate],
      );
    }

    // Fetch full user row — cron's generateReportForUser needs all profile fields
    const userResult = await pool.query(
      `SELECT id, username, email, current_phase, phase_week,
              cycle_position, agent_tone
       FROM users WHERE id = $1`,
      [req.userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    await generateReportForUser(userResult.rows[0], weekStartDate);

    res.json({
      status: isManualDate ? "regenerated" : "generated",
      week_start_date: weekStartDate,
    });
  } catch (err) {
    console.error("Manual report generation error:", err.message);
    res.status(500).json({ error: "Server error", detail: err.message });
  }
});

module.exports = router;
