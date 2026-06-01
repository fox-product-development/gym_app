// backend/routes/report.js
// Manual report generation endpoint.
// Checks if a report already exists for the current week — if not, generates one.
// Allows the user to trigger a report from the dashboard without running the full cron job.

const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware");
const { generateReportForUser } = require("../cron");

const router = express.Router();

// ─── Generate report if missing ───────────────────────────────────────────────
// POST /report/generate
// Checks if a report exists for the current week's Monday date.
// If it exists, returns { status: "up_to_date" }.
// If not, generates and stores a new report, returns { status: "generated" }.

router.post("/generate", requireAuth, async (req, res) => {
  try {
    // Calculate this week's Monday date (same logic as cron.js)
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const weekStartDate = monday.toISOString().split("T")[0];

    // Check if a report already exists for this week
    const existing = await pool.query(
      `SELECT id FROM weekly_feedback
       WHERE user_id = $1 AND week_start_date = $2`,
      [req.userId, weekStartDate],
    );

    if (existing.rows.length > 0) {
      return res.json({ status: "up_to_date" });
    }

    // Fetch user row for generateReportForUser
    const userResult = await pool.query(
      `SELECT id, current_phase, current_block, phase_week FROM users WHERE id = $1`,
      [req.userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    await generateReportForUser(userResult.rows[0]);

    res.json({ status: "generated" });
  } catch (err) {
    console.error("Manual report generation error:", err.message);
    res.status(500).json({ error: "Server error", detail: err.message });
  }
});

module.exports = router;
