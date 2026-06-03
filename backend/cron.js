// backend/cron.js
// Sunday evening cron job — advances phase week, generates weekly coaching report,
// and emails it to the user. Runs every Sunday at 8PM via node-cron in index.js.

require("dotenv").config();
const Anthropic = require("@anthropic-ai/sdk");
const pool = require("./db");
const { sendWeeklyReport } = require("./email");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── System prompt ────────────────────────────────────────────────────────────

const SUNDAY_REPORT_SYSTEM_PROMPT = `You are a personal gym coach writing a weekly review for your athlete. You have access to their full week of data — training sessions, diet logs, mood and energy ratings, cardio activity, and body composition. 

Your job is to find the connections between these data points and tell a coherent story about the week. Do not summarise each category separately. Instead, reason across all the data to explain what happened and why — how diet may have influenced energy, how energy influenced session performance, how cardio load affected recovery, and how all of this connects to progressive overload and phase progress.

Write like a coach who has reviewed the data carefully and has something specific to say. Not a data report. Not a list of observations. A considered, evidence-based assessment followed by clear actions.

Tone guide is provided per athlete — follow it precisely.`;

// ─── Tone map ─────────────────────────────────────────────────────────────────

const TONE_GUIDE = {
  motivational:
    "Be encouraging and celebratory. Acknowledge every win. Frame challenges as opportunities. Keep energy high throughout.",
  neutral:
    "Be factual and balanced. No fluff, no cheerleading. State what happened and what to do about it.",
  coaching:
    "Explain the why behind every observation. Help the athlete understand the reasoning, not just the conclusion. Be instructional and clear.",
  drill_sergeant:
    "Be direct and demanding. High expectations, no excuses. Praise is brief. Criticism is specific. Focus on execution.",
};

// ─── Phase cycle ──────────────────────────────────────────────────────────────

function nextPhase(currentPhase, phaseCycle) {
  if (!phaseCycle || phaseCycle.length === 0) {
    const defaultCycle = [
      "anatomical_adaptation",
      "hypertrophy",
      "maximum_strength",
      "muscle_definition",
    ];
    const idx = defaultCycle.indexOf(currentPhase);
    return defaultCycle[(idx + 1) % defaultCycle.length];
  }

  const phases = phaseCycle.map((p) => p.phase);
  const idx = phases.indexOf(currentPhase);
  return phases[(idx + 1) % phases.length];
}

// ─── Phase advancement ────────────────────────────────────────────────────────

async function advancePhaseWeek(user) {
  const { id, current_phase, current_block, phase_week } = user;
  console.log(
    `Advancing phase week for user ${id}: phase=${current_phase} block=${current_block} week=${phase_week}`,
  );

  if (phase_week === 7) {
    const newPhase = nextPhase(current_phase, user.phase_cycle);
    await pool.query(
      `UPDATE users
       SET current_phase = $1, current_block = 1, phase_week = 1,
           phase_start_date = CURRENT_DATE
       WHERE id = $2`,
      [newPhase, id],
    );
    console.log(`✓ Advanced to new phase: ${newPhase}`);
    await triggerBlockGeneration({
      ...user,
      current_phase: newPhase,
      current_block: 1,
      phase_week: 1,
    });
    return;
  }

  const newWeek = phase_week + 1;
  await pool.query(`UPDATE users SET phase_week = $1 WHERE id = $2`, [
    newWeek,
    id,
  ]);
  console.log(`✓ Phase week advanced to ${newWeek}`);

  if (newWeek === 4) {
    await pool.query(`UPDATE users SET current_block = 2 WHERE id = $1`, [id]);
    await triggerBlockGeneration({ ...user, current_block: 2, phase_week: 4 });
    return;
  }

  if (newWeek === 7) {
    await createRestWeekSessions(user);
  }
}

// ─── Block generation trigger ─────────────────────────────────────────────────

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

async function createRestWeekSessions(user) {
  console.log(`Creating rest week sessions for user ${user.id}`);
  try {
    const progResult = await pool.query(
      `SELECT id FROM programmes
       WHERE user_id = $1 AND phase = $2 AND block_number = 2
       ORDER BY created_at DESC LIMIT 1`,
      [user.id, user.current_phase],
    );

    if (progResult.rows.length === 0) {
      console.error("No Block 2 programme found for rest week creation");
      return;
    }

    const programmeId = progResult.rows[0].id;

    const week6Sessions = await pool.query(
      `SELECT s.id, s.session_type, s.occurrence,
              json_agg(pe.* ORDER BY pe.order_index) AS exercises
       FROM sessions s
       JOIN planned_exercises pe ON pe.session_id = s.id
       WHERE s.programme_id = $1 AND s.week_number = 6
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
        for (const ex of week6Session.exercises) {
          const exResult = await client.query(
            `SELECT target_weight_kg FROM exercises
             WHERE user_id = $1 AND exercise = $2 LIMIT 1`,
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

async function runSundayReport(exitWhenDone = false) {
  console.log("Sunday report job started:", new Date().toISOString());
  try {
    const usersResult = await pool.query(
      `SELECT id, username, email, current_phase, current_block,
              phase_week, phase_cycle, agent_tone,
              goal_size, goal_strength, goal_definition, goal_fitness,
              training_level, weekly_sessions, goal_description
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

async function generateReportForUser(user) {
  console.log(`Generating report for user ${user.id}...`);

  // Sessions — last 4 weeks
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
     LEFT JOIN planned_exercises pe ON pe.session_id = s.id
     LEFT JOIN logged_sets ls ON ls.session_id = s.id
     WHERE s.user_id = $1
       AND s.completed_at >= NOW() - INTERVAL '4 weeks'
     GROUP BY s.id
     ORDER BY s.completed_at DESC`,
    [user.id],
  );

  // Body composition — last 4 weeks
  const bodyCompResult = await pool.query(
    `SELECT weight_kg, muscle_mass_kg, body_fat_pct, logged_at
     FROM body_composition
     WHERE user_id = $1
       AND logged_at >= NOW() - INTERVAL '4 weeks'
     ORDER BY logged_at ASC`,
    [user.id],
  );

  // Diet logs — last 2 weeks
  const dietResult = await pool.query(
    `SELECT logged_at, calories_kcal, protein_g, carbs_g, fat_g,
            sugar_g, fibre_g, saturated_fat_g, salt_g
     FROM diet_logs
     WHERE user_id = $1
       AND logged_at >= NOW() - INTERVAL '2 weeks'
     ORDER BY logged_at ASC`,
    [user.id],
  );

  // Mood and energy — last 2 weeks
  const moodResult = await pool.query(
    `SELECT logged_at, mood, energy, notes
     FROM mood_logs
     WHERE user_id = $1
       AND logged_at >= NOW() - INTERVAL '2 weeks'
     ORDER BY logged_at ASC`,
    [user.id],
  );

  // Cardio — last 2 weeks
  const cardioResult = await pool.query(
    `SELECT logged_at, activity_type, duration_minutes, distance_km, notes
     FROM cardio_logs
     WHERE user_id = $1
       AND logged_at >= NOW() - INTERVAL '2 weeks'
     ORDER BY logged_at ASC`,
    [user.id],
  );

  // Progressive overload this week
  const poResult = await pool.query(
    `SELECT DISTINCT pe.exercise_name, pe.muscles_primary
     FROM planned_exercises pe
     JOIN sessions s ON s.id = pe.session_id
     WHERE s.user_id = $1
       AND s.completed_at >= NOW() - INTERVAL '1 week'
       AND pe.range_exceeded = TRUE`,
    [user.id],
  );

  // 1RM history
  const oneRepMaxResult = await pool.query(
    `SELECT DISTINCT ON (exercise_name)
       exercise_name, estimated_1rm, logged_at
     FROM one_rep_max_history
     WHERE user_id = $1
     ORDER BY exercise_name, logged_at DESC`,
    [user.id],
  );

  const tone = user.agent_tone || "neutral";
  const toneGuide = TONE_GUIDE[tone] || TONE_GUIDE.neutral;

  const userPrompt = `Write the weekly coaching report for the following athlete.

ATHLETE PROFILE
- Training level: ${user.training_level || "not set"}
- Goals: Size ${user.goal_size || "?"}★ · Strength ${user.goal_strength || "?"}★ · Definition ${user.goal_definition || "?"}★ · Fitness ${user.goal_fitness || "?"}★
- Preferences: ${user.goal_description || "none specified"}
- Phase: ${user.current_phase} · Block ${user.current_block} · Week ${user.phase_week} of 6

TONE
${toneGuide}

SESSION DATA — LAST 4 WEEKS
${JSON.stringify(sessionResult.rows, null, 2)}

PROGRESSIVE OVERLOAD ACHIEVED THIS WEEK
${poResult.rows.length > 0 ? poResult.rows.map((p) => `${p.exercise_name} (${p.muscles_primary})`).join(", ") : "None this week"}

ESTIMATED 1RM HISTORY
${JSON.stringify(oneRepMaxResult.rows, null, 2)}

BODY COMPOSITION — LAST 4 WEEKS
${JSON.stringify(bodyCompResult.rows, null, 2)}

DIET LOGS — LAST 2 WEEKS
${dietResult.rows.length > 0 ? JSON.stringify(dietResult.rows, null, 2) : "No diet data logged"}

MOOD AND ENERGY — LAST 2 WEEKS
${moodResult.rows.length > 0 ? JSON.stringify(moodResult.rows, null, 2) : "No mood data logged"}

CARDIO — LAST 2 WEEKS
${cardioResult.rows.length > 0 ? JSON.stringify(cardioResult.rows, null, 2) : "No cardio logged"}

Write the report in exactly this structure:

[HEADLINE]
One sentence capturing the character of this week. Written by you, specific to this athlete, not a template.

[LOOKING BACK]
Reason across ALL the data to tell the story of this week. Find the connections — how did diet influence energy, how did energy influence session performance, how did cardio load affect recovery? Name specific exercises, weights, and numbers. Do not summarise each category separately. Write one connected narrative that explains what happened and why.

[STOP · START · CONTINUE]
Three sections, each with 2-3 specific evidence-based actions. Every action must reference the data that supports it. No generic advice.

STOP — things the data suggests are working against their goals
START — new behaviours the data suggests would help
CONTINUE — things that are clearly working and should be maintained

Keep the entire report readable and direct. It will be displayed in the app and emailed to the athlete.`;

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

  // Calculate week start date
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

  console.log(`✓ Report stored for user ${user.id}`);

  // Email the report if the user has an email address
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
