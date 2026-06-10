// backend/cron.js
// Sunday evening cron job — advances phase week, generates weekly coaching report,
// and emails it to the user. Runs every Sunday at 10:30PM UTC via node-cron in index.js.

require("dotenv").config();
const Anthropic = require("@anthropic-ai/sdk");
const pool = require("./db");
const { sendWeeklyReport } = require("./email");
const { SYSTEM_PROMPT, buildUserPrompt } = require("./prompts/sundayReport");
const { PHASE_CONFIG } = require("./phaseConfig");
const { snapToValidWeight } = require("./weightCalc");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

// ─── Phase transition weight recalculation ────────────────────────────────────
// Runs at the end of a phase (phase_week = 7) before block generation fires.
// Derives an implied 1RM from each exercise's current target weight using the
// outgoing phase percentage, then calculates the new target using the incoming
// phase percentage. Snaps DOWN to the nearest valid equipment weight to stay
// conservative on the first session of the new phase.

async function recalculateTargetWeightsForPhaseTransition(
  userId,
  outgoingPhase,
  incomingPhase,
) {
  console.log(
    `Recalculating target weights for user ${userId}: ${outgoingPhase} → ${incomingPhase}`,
  );

  const outgoingPercentage = PHASE_CONFIG[outgoingPhase]?.percentage;
  const incomingPercentage = PHASE_CONFIG[incomingPhase]?.percentage;

  if (!outgoingPercentage || !incomingPercentage) {
    console.error(
      `Unknown phase in transition: ${outgoingPhase} → ${incomingPhase}`,
    );
    return;
  }

  // Fetch all active exercises with a non-null target weight for this user
  const exerciseResult = await pool.query(
    `SELECT e.id, e.exercise, e.target_weight
     FROM exercises e
     WHERE e.user_id = $1
       AND e.target_weight IS NOT NULL
       AND e.active = TRUE`,
    [userId],
  );

  if (exerciseResult.rows.length === 0) {
    console.log(
      `No exercises with target weights found for user ${userId} — skipping recalculation`,
    );
    return;
  }

  let updated = 0;
  let skipped = 0;

  for (const ex of exerciseResult.rows) {
    const currentTarget = parseFloat(ex.target_weight);

    // Derive implied 1RM from current target weight and outgoing phase percentage
    const implied1RM = currentTarget / outgoingPercentage;

    // Calculate new target for incoming phase
    const newTargetRaw = implied1RM * incomingPercentage;

    // Snap DOWN to nearest valid equipment weight (conservative)
    const newTarget = await snapToValidWeight(newTargetRaw, ex.id, userId);

    if (newTarget > 0 && newTarget !== currentTarget) {
      await pool.query(
        `UPDATE exercises SET target_weight = $1 WHERE id = $2`,
        [newTarget, ex.id],
      );
      updated++;
    } else {
      skipped++;
    }
  }

  console.log(
    `✓ Phase transition recalculation complete for user ${userId}: ${updated} updated, ${skipped} unchanged`,
  );
}

// ─── Phase advancement ────────────────────────────────────────────────────────

async function advancePhaseWeek(user) {
  const { id, current_phase, current_block, phase_week } = user;
  console.log(
    `Advancing phase week for user ${id}: phase=${current_phase} block=${current_block} week=${phase_week}`,
  );

  if (phase_week === 7) {
    const newPhase = nextPhase(current_phase, user.phase_cycle);

    // Recalculate all target weights before advancing the phase counter.
    // Block generation reads target_weight immediately after, so this
    // must complete first.
    await recalculateTargetWeightsForPhaseTransition(
      id,
      current_phase,
      newPhase,
    );

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
// Copies Week 6 exercises at reduced load for the rest week.
// Rest week target = current target_weight × (rest% / current_phase%)
// This keeps rest week weights proportional to the current training target
// rather than using a hardcoded 45% multiplier against the raw weight.

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

    const currentPhaseConfig = PHASE_CONFIG[user.current_phase];
    const restPhaseConfig = PHASE_CONFIG.rest;

    // Ratio of rest week percentage to current phase percentage
    // e.g. Hypertrophy (75%) → rest (45%) = 0.45 / 0.75 = 0.60
    const restRatio =
      restPhaseConfig.percentage / (currentPhaseConfig?.percentage || 0.75);

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
          // Use current target_weight from exercises table if available,
          // fall back to planned weight from week 6 session
          const exResult = await client.query(
            `SELECT target_weight FROM exercises
             WHERE user_id = $1 AND exercise = $2 LIMIT 1`,
            [user.id, ex.exercise_name],
          );

          const baseWeight =
            exResult.rows.length > 0 && exResult.rows[0].target_weight
              ? parseFloat(exResult.rows[0].target_weight)
              : parseFloat(ex.target_weight);

          // Derive rest week weight from the ratio, then snap to valid equipment weight
          const rawRestWeight = Math.round(baseWeight * restRatio * 100) / 100;

          // Look up the exercise id for snapToValidWeight
          const exIdResult = await client.query(
            `SELECT id FROM exercises WHERE user_id = $1 AND exercise = $2 LIMIT 1`,
            [user.id, ex.exercise_name],
          );

          let targetWeight;
          if (exIdResult.rows.length > 0) {
            targetWeight = await snapToValidWeight(
              rawRestWeight,
              exIdResult.rows[0].id,
              user.id,
            );
          } else {
            // No exercise record — fall back to simple rounding
            targetWeight = Math.round(rawRestWeight * 2) / 2;
          }

          await client.query(
            `INSERT INTO planned_exercises
               (session_id, exercise_name, muscles_primary, sub_component,
                order_index, target_sets, target_reps, target_weight)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              sessionId,
              ex.exercise_name,
              ex.muscles_primary,
              ex.sub_component,
              ex.order_index,
              restPhaseConfig.sets,
              restPhaseConfig.targetReps,
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

async function generateReportForUser(user, overrideWeekStartDate = null) {
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
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const reportText = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  // Calculate week start date — use override if provided, otherwise calculate
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
