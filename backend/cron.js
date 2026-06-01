// backend/cron.js
// Sunday evening cron job — generates the weekly coaching report.
// Railway runs this every Sunday at 8PM via a cron service.
// Run manually for testing: node cron.js

require("dotenv").config();
const Anthropic = require("@anthropic-ai/sdk");
const pool = require("./db");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── System prompt ────────────────────────────────────────────────────────────

const SUNDAY_REPORT_SYSTEM_PROMPT = `You are a personal gym coach reviewing your athlete's training diary at the end of the week. You have access to 4 weeks of session data, body composition readings, and the athlete's own notes. You think like a coach — you look at the full picture before drawing conclusions, you separate scheduling noise from genuine performance trends, and you make recommendations based on evidence not assumptions.

Your tone is direct and encouraging. Like a training partner who knows their stuff. Not sentimental, not motivational-poster. Honest, specific, and constructive.

You are writing a weekly report the athlete will read on their dashboard. It should feel like a message from their coach, not a data summary.`;

// ─── Phase cycle ──────────────────────────────────────────────────────────────

const PHASE_CYCLE = [
  "anatomical_adaptation",
  "hypertrophy",
  "maximum_strength",
  "muscle_definition",
];

function nextPhase(currentPhase) {
  const idx = PHASE_CYCLE.indexOf(currentPhase);
  return PHASE_CYCLE[(idx + 1) % PHASE_CYCLE.length];
}

// ─── Phase advancement ────────────────────────────────────────────────────────
// Runs at the start of every Sunday cron job.
// Increments phase_week and triggers block generation or phase advancement
// as needed.

async function advancePhaseWeek(user) {
  const { id, current_phase, current_block, phase_week } = user;
  console.log(
    `Advancing phase week for user ${id}: phase=${current_phase} block=${current_block} week=${phase_week}`,
  );

  // ── Week 7 (rest week just ended) → advance to next phase ─────────────────
  if (phase_week === 7) {
    const newPhase = nextPhase(current_phase);
    await pool.query(
      `UPDATE users
       SET current_phase = $1, current_block = 1, phase_week = 1,
           phase_start_date = CURRENT_DATE
       WHERE id = $2`,
      [newPhase, id],
    );
    console.log(`✓ Advanced to new phase: ${newPhase}`);

    // Generate Block 1 for new phase
    await triggerBlockGeneration({
      ...user,
      current_phase: newPhase,
      current_block: 1,
      phase_week: 1,
    });
    return;
  }

  // ── All other weeks → increment phase_week ────────────────────────────────
  const newWeek = phase_week + 1;
  await pool.query(`UPDATE users SET phase_week = $1 WHERE id = $2`, [
    newWeek,
    id,
  ]);
  console.log(`✓ Phase week advanced to ${newWeek}`);

  // ── New week 4 → generate Block 2 ─────────────────────────────────────────
  if (newWeek === 4) {
    await pool.query(`UPDATE users SET current_block = 2 WHERE id = $1`, [id]);
    await triggerBlockGeneration({ ...user, current_block: 2, phase_week: 4 });
    return;
  }

  // ── New week 7 → create rest week sessions ────────────────────────────────
  if (newWeek === 7) {
    await createRestWeekSessions(user);
  }
}

// ─── Block generation trigger ─────────────────────────────────────────────────
// Calls the generate-block endpoint internally using the CRON_SECRET.

async function triggerBlockGeneration(user) {
  console.log(
    `Triggering block generation for user ${user.id} phase=${user.current_phase} block=${user.current_block}`,
  );

  try {
    const port = process.env.PORT || 3000;
    const response = await fetch(`http://localhost:${port}/ai/generate-block`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": process.env.CRON_SECRET,
      },
      body: JSON.stringify({ user_id: user.id }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Block generation failed");
    }

    console.log(`✓ Block generation complete for user ${user.id}`);
  } catch (err) {
    console.error("Block generation failed:", err.message);
  }
}

// ─── Rest week session creation ───────────────────────────────────────────────
// Copies Week 6 exercises, sets 3 sets × 12 reps @ 45% of target_weight_kg,
// and creates 3 sessions (compound occ1, compound occ2, isolation) for week 7.

async function createRestWeekSessions(user) {
  console.log(`Creating rest week sessions for user ${user.id}`);

  try {
    // Get the current programme
    const progResult = await pool.query(
      `SELECT id FROM programmes
       WHERE user_id = $1
         AND phase = $2
         AND block_number = 2
       ORDER BY created_at DESC LIMIT 1`,
      [user.id, user.current_phase],
    );

    if (progResult.rows.length === 0) {
      console.error("No Block 2 programme found for rest week creation");
      return;
    }

    const programmeId = progResult.rows[0].id;

    // Get Week 6 sessions and their exercises
    const week6Sessions = await pool.query(
      `SELECT s.id, s.session_type, s.occurrence,
              json_agg(pe.* ORDER BY pe.order_index) AS exercises
       FROM sessions s
       JOIN planned_exercises pe ON pe.session_id = s.id
       WHERE s.programme_id = $1
         AND s.week_number = 6
       GROUP BY s.id`,
      [programmeId],
    );

    if (week6Sessions.rows.length === 0) {
      console.error("No Week 6 sessions found for rest week creation");
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const week6Session of week6Sessions.rows) {
        // Create the rest week session
        const sessionResult = await client.query(
          `INSERT INTO sessions
             (user_id, programme_id, session_type, occurrence, week_number, gym)
           VALUES ($1, $2, $3, $4, 7, 'work')
           RETURNING id`,
          [
            user.id,
            programmeId,
            week6Session.session_type,
            week6Session.occurrence,
          ],
        );

        const sessionId = sessionResult.rows[0].id;

        // Insert exercises at 3 sets × 12 reps @ 45% of target_weight_kg
        for (const ex of week6Session.exercises) {
          // Look up current target_weight_kg from exercises table
          const exResult = await client.query(
            `SELECT target_weight_kg FROM exercises
             WHERE user_id = $1 AND exercise = $2
             LIMIT 1`,
            [user.id, ex.exercise_name],
          );

          const targetWeight =
            exResult.rows.length > 0 && exResult.rows[0].target_weight_kg
              ? Math.round(
                  parseFloat(exResult.rows[0].target_weight_kg) * 0.45 * 2,
                ) / 2
              : Math.round(parseFloat(ex.target_weight) * 0.45 * 2) / 2;

          await client.query(
            `INSERT INTO planned_exercises
               (session_id, exercise_name, muscles_primary, sub_component,
                order_index, target_sets, target_reps, target_weight)
             VALUES ($1, $2, $3, $4, $5, 3, 12, $6)`,
            [
              sessionId,
              ex.exercise_name,
              ex.muscles_primary,
              ex.sub_component,
              ex.order_index,
              targetWeight,
            ],
          );
        }
      }

      await client.query("COMMIT");
      console.log(`✓ Rest week sessions created for user ${user.id}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Rest week session creation failed:", err.message);
  }
}

// ─── Main job ─────────────────────────────────────────────────────────────────
// Called by node-cron from index.js on a schedule.
// Also callable directly: node cron.js

async function runSundayReport(exitWhenDone = false) {
  console.log("Sunday report job started:", new Date().toISOString());

  try {
    const usersResult = await pool.query(
      `SELECT id, current_phase, current_block, phase_week FROM users`,
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

async function generateReportForUser(user) {
  console.log(`Generating report for user ${user.id}...`);

  // Fetch session history — last 4 weeks
  const sessionResult = await pool.query(
    `SELECT
       s.id, s.session_type, s.occurrence, s.week_number, s.gym,
       s.status, s.notes, s.started_at, s.completed_at,
       json_agg(
         json_build_object(
           'exercise_name', pe.exercise_name,
           'muscles_primary', pe.muscles_primary,
           'target_sets', pe.target_sets,
           'target_reps', pe.target_reps,
           'target_weight', pe.target_weight
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
     LEFT JOIN planned_exercises pe ON pe.session_id = s.id
     LEFT JOIN logged_sets ls ON ls.session_id = s.id
     WHERE s.user_id = $1
       AND s.completed_at >= NOW() - INTERVAL '4 weeks'
     GROUP BY s.id
     ORDER BY s.completed_at DESC`,
    [user.id],
  );

  // Fetch body composition — last 4 weeks
  const bodyCompResult = await pool.query(
    `SELECT weight_kg, muscle_mass_kg, logged_at
     FROM body_composition
     WHERE user_id = $1
       AND logged_at >= NOW() - INTERVAL '4 weeks'
     ORDER BY logged_at ASC`,
    [user.id],
  );

  // Fetch 1RM history — latest per exercise
  const oneRepMaxResult = await pool.query(
    `SELECT DISTINCT ON (exercise_name)
       exercise_name, estimated_1rm, logged_at
     FROM one_rep_max_history
     WHERE user_id = $1
     ORDER BY exercise_name, logged_at DESC`,
    [user.id],
  );

  // Fetch progressive overload flags from this week's sessions
  const poResult = await pool.query(
    `SELECT DISTINCT pe.exercise_name, pe.muscles_primary
     FROM planned_exercises pe
     JOIN sessions s ON s.id = pe.session_id
     WHERE s.user_id = $1
       AND s.completed_at >= NOW() - INTERVAL '1 week'
       AND pe.range_exceeded = TRUE`,
    [user.id],
  );

  const poAchieved = poResult.rows;

  // Build the user prompt
  const userPrompt = `Write the weekly coaching report for the following athlete.

CURRENT STATE
- Phase: ${user.current_phase}
- Phase week: ${user.phase_week} of 6
- Block: ${user.current_block}

SESSION HISTORY — LAST 4 WEEKS
${JSON.stringify(sessionResult.rows, null, 2)}

BODY COMPOSITION — LAST 4 WEEKS
${JSON.stringify(bodyCompResult.rows, null, 2)}

ESTIMATED 1RM HISTORY
${JSON.stringify(oneRepMaxResult.rows, null, 2)}

PROGRESSIVE OVERLOAD ACHIEVED THIS WEEK
${
  poAchieved.length > 0
    ? poAchieved
        .map((p) => `${p.exercise_name} (${p.muscles_primary})`)
        .join(", ")
    : "None this week"
}

Write the report in the following structure:

1. WEEK SUMMARY
   A short paragraph summarising this week's sessions — what was completed, overall performance, anything notable.

2. PATTERNS
   What patterns are visible across the last 4 weeks? Improvements, stalls, consistency, scheduling. Be specific — name exercises and numbers where relevant.

3. PROGRESSIVE OVERLOAD REVIEW
   If any exercises hit progressive overload this week (listed above), give a brief well done acknowledgement and confirm that target weights have been increased for the next session. If none, note which exercises are close to hitting their rep targets.

4. PHASE PROGRESS
   How is the athlete tracking against the current phase goals? Are they on course to complete the phase, or is there a case for extending or transitioning early?

5. NEXT WEEK FOCUS
   Two or three specific things the athlete should focus on in the coming week. Keep it actionable and direct.`;

  // Call Claude
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system: SUNDAY_REPORT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const reportText = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  // Calculate this week's Monday date
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const weekStartDate = monday.toISOString().split("T")[0];

  // Store the report
  await pool.query(
    `INSERT INTO weekly_feedback (user_id, week_start_date, ai_summary)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [user.id, weekStartDate, reportText],
  );

  console.log(
    `Report generated for user ${user.id} — week starting ${weekStartDate}`,
  );
}

// Run directly if called via node cron.js
if (require.main === module) {
  runSundayReport(true);
}

module.exports = { runSundayReport, generateReportForUser };
