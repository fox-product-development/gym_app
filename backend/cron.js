// backend/cron.js
// Sunday evening cron job — advances cycle position/phase week, generates
// weekly coaching report, and emails it to the user. Runs every Sunday at
// 10:30PM UTC via node-cron in index.js.
//
// Phase advancement is driven entirely by cycleConfig.js. There is no
// longer a `cycles` DB table (dropped — it duplicated what cycleConfig.js
// now defines in code) and no separate "rest week" mechanism (Transition
// entries in cycleConfig.js serve this purpose).

require("dotenv").config();
const Anthropic = require("@anthropic-ai/sdk");
const pool = require("./db");
const { sendWeeklyReport } = require("./email");
const { SYSTEM_PROMPT, buildUserPrompt } = require("./prompts/sundayReport");
const { getCycleEntry, getNextCycleEntry } = require("./cycleConfig");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Phase advancement ────────────────────────────────────────────────────────
// Reads cycle_position and phase_week directly from the user row.
// cycle_position is an index into CYCLE_CONFIG (see cycleConfig.js).
// phase_week is 1-based, counting weeks within the current cycle entry.

async function advancePhaseWeek(user) {
  const { id, cycle_position, phase_week } = user;
  const entry = getCycleEntry(cycle_position);

  console.log(
    `Advancing user ${id}: phase=${entry.phase} (position ${cycle_position}) week=${phase_week}/${entry.weeks}`,
  );

  if (phase_week < entry.weeks) {
    // Still within the current phase — just move to the next week and
    // generate that week's sessions using the exercises already selected
    // for this phase.
    const newWeek = phase_week + 1;
    await pool.query(`UPDATE users SET phase_week = $1 WHERE id = $2`, [
      newWeek,
      id,
    ]);
    console.log(`✓ Phase week advanced to ${newWeek} for user ${id}`);

    await triggerWeekGeneration({
      ...user,
      phase_week: newWeek,
    });
    return;
  }

  // Phase complete — advance to the next cycle entry, wrapping around the
  // end of the year via modulo (handled inside getNextCycleEntry).
  await startNextPhase(user);
}

// ─── Start next phase ─────────────────────────────────────────────────────────

async function startNextPhase(user) {
  const { id, cycle_position } = user;

  const nextEntry = getNextCycleEntry(cycle_position);
  const nextPosition =
    (cycle_position + 1) % require("./cycleConfig").CYCLE_CONFIG.length;

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

// ─── Phase generation trigger (new phase starting — full phase generated) ────
// Called once when a new phase begins. The AI selects exercises for the
// entire phase in one call; the server then generates every week's sessions
// from those exercises using phaseConfig's per-week, per-session values.
//
// Transition look-ahead: if the phase about to start is itself a transition,
// and the entry AFTER it is muscle_definition, the route is told to
// pre-select MD exercises rather than inheriting from the prior phase.

async function triggerPhaseGeneration(user) {
  const entry = getCycleEntry(user.cycle_position);
  console.log(
    `Triggering phase generation for user ${user.id}: phase=${entry.phase}, weeks=${entry.weeks}, sessionsPerWeek=${entry.sessionsPerWeek}`,
  );

  let preselectForMd = false;
  if (entry.phase === "transition") {
    const lookahead = getNextCycleEntry(user.cycle_position);
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
        phase: entry.phase,
        total_weeks: entry.weeks,
        sessions_per_week: entry.sessionsPerWeek,
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

// ─── Week generation trigger (continuing within an already-generated phase) ──
// Called when moving to a new week within the same phase. The exercises were
// already selected when the phase started — this just generates the next
// week's sessions with that week's phaseConfig values.

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
// Unchanged from the previous version aside from removing the dropped user
// columns from the surrounding query. Report content itself (body comp,
// diet, mood, cardio, PO, 1RM history) is out of scope for the phase/cycle
// rebuild and is not modified here.

async function generateReportForUser(user, overrideWeekStartDate = null) {
  console.log(`Generating report for user ${user.id}...`);

  const sessionResult = await pool.query(
    `SELECT
       s.id, s.session_type, s.week_number,
       g.gym_name AS gym,
       s.status, s.notes, s.started_at, s.completed_at,
       json_agg(
         json_build_object(
           'exercise_name', pe.exercise_name,
           'muscles_primary', pe.muscles_primary,
           'sub_component', pe.sub_component,
           'target_sets', pe.target_sets,
           'target_reps', pe.target_reps,
           'target_weight', pe.target_weight,
           'range_exceeded', pe.range_exceeded
         ) ORDER BY pe.order_index
       ) FILTER (WHERE pe.id IS NOT NULL) AS planned_exercises,
       json_agg(
         json_build_object(
           'exercise_name', ls.exercise_name,
           'set_number', ls.set_number,
           'weight', ls.weight,
           'reps', ls.reps,
           'notes', ls.notes
         ) ORDER BY ls.exercise_name, ls.set_number
       ) FILTER (WHERE ls.id IS NOT NULL) AS logged_sets
     FROM sessions s
     LEFT JOIN gyms g ON g.id = s.gym_id
     LEFT JOIN planned_exercises pe ON pe.session_id = s.id
     LEFT JOIN logged_sets ls ON ls.session_id = s.id
     WHERE s.user_id = $1
       AND s.created_at >= NOW() - INTERVAL '4 weeks'
     GROUP BY s.id, g.gym_name
     ORDER BY s.created_at DESC`,
    [user.id],
  );

  const bodyCompResult = await pool.query(
    `SELECT weight_kg, muscle_mass_kg, body_fat_pct, logged_at
     FROM body_composition
     WHERE user_id = $1
       AND logged_at >= NOW() - INTERVAL '4 weeks'
     ORDER BY logged_at ASC`,
    [user.id],
  );

  const dietResult = await pool.query(
    `SELECT logged_at, calories_kcal, protein_g, carbs_g, fat_g,
            sugar_g, fibre_g, saturated_fat_g, salt_g
     FROM diet_logs
     WHERE user_id = $1
       AND logged_at >= NOW() - INTERVAL '2 weeks'
     ORDER BY logged_at ASC`,
    [user.id],
  );

  const moodResult = await pool.query(
    `SELECT logged_at, mood, energy, notes
     FROM mood_logs
     WHERE user_id = $1
       AND logged_at >= NOW() - INTERVAL '2 weeks'
     ORDER BY logged_at ASC`,
    [user.id],
  );

  const cardioResult = await pool.query(
    `SELECT logged_at, activity_type, duration_minutes, distance_km, notes
     FROM cardio_logs
     WHERE user_id = $1
       AND logged_at >= NOW() - INTERVAL '2 weeks'
     ORDER BY logged_at ASC`,
    [user.id],
  );

  const poResult = await pool.query(
    `SELECT DISTINCT pe.exercise_name, pe.muscles_primary
     FROM planned_exercises pe
     JOIN sessions s ON s.id = pe.session_id
     WHERE s.user_id = $1
       AND s.completed_at >= NOW() - INTERVAL '1 week'
       AND pe.range_exceeded = TRUE`,
    [user.id],
  );

  const oneRepMaxResult = await pool.query(
    `SELECT DISTINCT ON (exercise_name)
       exercise_name, estimated_1rm, logged_at
     FROM one_rep_max_history
     WHERE user_id = $1
     ORDER BY exercise_name, logged_at DESC`,
    [user.id],
  );

  const userPrompt = buildUserPrompt({
    user,
    sessions: sessionResult.rows,
    poExercises: poResult.rows,
    oneRepMaxHistory: oneRepMaxResult.rows,
    bodyComp: bodyCompResult.rows,
    dietLogs: dietResult.rows,
    moodLogs: moodResult.rows,
    cardioLogs: cardioResult.rows,
  });

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const reportText = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  let weekStartDate;
  if (overrideWeekStartDate) {
    weekStartDate = overrideWeekStartDate;
  } else {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    weekStartDate = monday.toISOString().split("T")[0];
  }

  await pool.query(
    `INSERT INTO weekly_feedback (user_id, week_start_date, ai_summary)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [user.id, weekStartDate, reportText],
  );

  console.log(`✓ Report stored for user ${user.id}`);

  if (user.email) {
    try {
      await sendWeeklyReport({
        toEmail: user.email,
        username: user.username,
        reportText,
        weekStartDate,
      });
    } catch (err) {
      console.error(`Failed to email report to ${user.email}:`, err.message);
    }
  } else {
    console.log(`No email address for user ${user.id} — skipping email`);
  }
}

// Run directly if called via node cron.js
if (require.main === module) {
  runSundayReport(true);
}

module.exports = { runSundayReport, generateReportForUser };
