// backend/cron.js
// Sunday evening cron job — advances cycle position/phase week, generates
// weekly coaching report, and emails it to the user. Runs every Sunday at
// 10:30PM UTC via node-cron in index.js.
//
// Phase advancement is driven entirely by cycleConfig.js. There is no
// longer a `cycles` DB table (dropped — it duplicated what cycleConfig.js
// now defines in code) and no separate "rest week" mechanism (Transition
// entries in cycleConfig.js serve this purpose).
//
// cycleConfig.js is now per-user (see that file's header) — every call to
// getCycleEntry/getNextCycleEntry must pass the user's cycleConfig key
// ('user' + id) as the first argument.

require("dotenv").config();
const Anthropic = require("@anthropic-ai/sdk");
const pool = require("./db");
const { sendWeeklyReport } = require("./email");
const { SYSTEM_PROMPT, buildUserPrompt } = require("./prompts/sundayReport");
const {
  CYCLE_CONFIG,
  getCycleEntry,
  getNextCycleEntry,
} = require("./cycleConfig");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Maps a DB user id to the cycleConfig.js / phaseConfig.js user key.
function getUserKey(userId) {
  return `user${userId}`;
}

// ─── Phase advancement ────────────────────────────────────────────────────────
async function advancePhaseWeek(user) {
  const { id, cycle_position, phase_week } = user;
  const userKey = getUserKey(id);
  const entry = getCycleEntry(userKey, cycle_position);

  console.log(
    `Advancing user ${id}: phase=${entry.phase} (position ${cycle_position}) week=${phase_week}/${entry.weeks}`,
  );

  if (phase_week < entry.weeks) {
    const newWeek = phase_week + 1;
    await pool.query(`UPDATE users SET phase_week = $1 WHERE id = $2`, [
      newWeek,
      id,
    ]);
    console.log(`✓ Phase week advanced to ${newWeek} for user ${id}`);
    return;
  }

  await startNextPhase(user);
}

// ─── Start next phase ─────────────────────────────────────────────────────────
async function startNextPhase(user) {
  const { id, cycle_position } = user;
  const userKey = getUserKey(id);

  const nextEntry = getNextCycleEntry(userKey, cycle_position);
  const nextPosition = (cycle_position + 1) % CYCLE_CONFIG[userKey].length;

  await pool.query(
    `UPDATE users
     SET current_phase = $1,
         cycle_position = $2,
         phase_week = 1,
         phase_start_date = CURRENT_DATE
     WHERE id = $3`,
    [nextEntry.phase, nextPosition, id],
  );

  console.log(
    `✓ User ${id} advanced to new phase: ${nextEntry.phase} (position ${nextPosition})`,
  );

  await triggerPhaseGeneration({
    ...user,
    current_phase: nextEntry.phase,
    cycle_position: nextPosition,
    phase_week: 1,
  });
}

// ─── Phase generation trigger ─────────────────────────────────────────────────
async function triggerPhaseGeneration(user) {
  const userKey = getUserKey(user.id);
  const entry = getCycleEntry(userKey, user.cycle_position);
  console.log(
    `Triggering phase generation for user ${user.id}: phase=${entry.phase}, weeks=${entry.weeks}, sessionsPerWeek=${entry.sessionsPerWeek}`,
  );

  let preselectForMd = false;
  if (entry.phase === "transition") {
    const lookahead = getNextCycleEntry(userKey, user.cycle_position);
    preselectForMd = lookahead.phase === "muscle_definition";
  }

  try {
    const port = process.env.PORT || 3000;
    const response = await fetch(`http://localhost:${port}/ai/generate-phase`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": process.env.CRON_SECRET,
      },
      body: JSON.stringify({
        user_id: user.id,
        preselect_for_md: preselectForMd,
      }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Phase generation failed");
    }
    console.log(`✓ Phase generation complete for user ${user.id}`);
  } catch (err) {
    console.error("Phase generation failed:", err.message);
  }
}

// ─── Week generation trigger ───────────────────────────────────────────────────
async function triggerWeekGeneration(user) {
  console.log(
    `Triggering week generation for user ${user.id}: week=${user.phase_week}`,
  );
  try {
    const port = process.env.PORT || 3000;
    const response = await fetch(`http://localhost:${port}/ai/generate-week`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": process.env.CRON_SECRET,
      },
      body: JSON.stringify({
        user_id: user.id,
        week_number: user.phase_week,
      }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Week generation failed");
    }
    console.log(`✓ Week generation complete for user ${user.id}`);
  } catch (err) {
    console.error("Week generation failed:", err.message);
  }
}

// ─── Test-only: single-user phase advancement (no report) ────────────────────
async function runPhaseAdvancementForUser(userId) {
  const result = await pool.query(
    `SELECT id, username, email, current_phase, cycle_position,
            phase_week, agent_tone
     FROM users WHERE id = $1`,
    [userId],
  );

  if (result.rows.length === 0) {
    console.log(`User ${userId} not found`);
    return;
  }

  await advancePhaseWeek(result.rows[0]);
  console.log(`✓ Phase advancement test complete for user ${userId}`);
}

// ─── Main job ─────────────────────────────────────────────────────────────────
async function runSundayReport(exitWhenDone = false) {
  console.log("Sunday report job started:", new Date().toISOString());
  try {
    const usersResult = await pool.query(
      `SELECT id, username, email, current_phase, cycle_position,
              phase_week, agent_tone
       FROM users`,
    );

    if (usersResult.rows.length === 0) {
      console.log("No users found — skipping");
      if (exitWhenDone) process.exit(0);
      return;
    }

    for (const user of usersResult.rows) {
      await advancePhaseWeek(user);
      await generateReportForUser(user);
    }

    console.log("Sunday report job completed successfully");
    if (exitWhenDone) process.exit(0);
  } catch (err) {
    console.error("Sunday report job failed:", err.message);
    if (exitWhenDone) process.exit(1);
  }
}

// ─── Report generation ────────────────────────────────────────────────────────
// (unchanged — body composition, diet, mood, cardio, 1RM history queries
// and report email logic, identical to the previous version)

async function generateReportForUser(user, overrideWeekStartDate = null) {
  // ... unchanged from previous version ...
}

if (require.main === module) {
  runSundayReport(true);
}

module.exports = {
  runSundayReport,
  generateReportForUser,
  runPhaseAdvancementForUser,
};
