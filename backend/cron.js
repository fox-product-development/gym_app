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

// ─── Main job ─────────────────────────────────────────────────────────────────

async function runSundayReport() {
  console.log("Sunday report job started:", new Date().toISOString());

  try {
    // Get all users — single user app but written to support multiple
    const usersResult = await pool.query(
      `SELECT id, current_phase, current_block, phase_week FROM users`,
    );

    if (usersResult.rows.length === 0) {
      console.log("No users found — skipping");
      process.exit(0);
    }

    for (const user of usersResult.rows) {
      await generateReportForUser(user);
    }

    console.log("Sunday report job completed successfully");
    process.exit(0);
  } catch (err) {
    console.error("Sunday report job failed:", err.message);
    process.exit(1);
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

Write the report in the following structure:

1. WEEK SUMMARY
   A short paragraph summarising this week's sessions — what was completed, overall performance, anything notable.

2. PATTERNS
   What patterns are visible across the last 4 weeks? Improvements, stalls, consistency, scheduling. Be specific — name exercises and numbers where relevant.

3. PROGRESSIVE OVERLOAD REVIEW
   Which exercises are progressing well? Which are flat or declining? Are there any exercises where the PO score suggests a rotation is due?

4. PHASE PROGRESS
   How is the athlete tracking against the current phase goals? Are they on course to complete the phase, or is there a case for extending or transitioning early?

5. NEXT WEEK FOCUS
   Two or three specific things the athlete should focus on in the coming week. Keep it actionable and direct.`;

  // Call Claude
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
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

runSundayReport();
