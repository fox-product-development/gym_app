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

// Phases that get a rest week inserted after completion
const PHASES_WITH_REST_WEEK = ["hypertrophy", "maximum_strength"];

// ─── Phase transition weight recalculation ────────────────────────────────────
// Runs before block generation fires at the start of a new phase.
// Derives an implied 1RM from each exercise's current target weight using the
// outgoing phase percentage, then calculates the new target using the incoming
// phase percentage. Snaps DOWN to the nearest valid equipment weight.

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
    const implied1RM = currentTarget / outgoingPercentage;
    const newTargetRaw = implied1RM * incomingPercentage;
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
// Reads from the cycles table instead of a hardcoded sequence.
// Rest weeks are inserted after Hypertrophy and Max Strength phases only.
// phase_week counts training weeks (1 to duration_weeks).
// When phase_week exceeds duration_weeks, the phase is complete.

async function advancePhaseWeek(user) {
  const { id, current_phase, current_block, phase_week } = user;
  console.log(
    `Advancing phase week for user ${id}: phase=${current_phase} block=${current_block} week=${phase_week}`,
  );

  // Get the current in_progress cycle row to know the duration
  const cycleResult = await pool.query(
    `SELECT id, phase, phase_order, duration_weeks
     FROM cycles
     WHERE user_id = $1 AND status = 'in_progress'
     ORDER BY phase_order ASC
     LIMIT 1`,
    [id],
  );

  // Fall back to 6 if no cycle row found (safety net for legacy users)
  const durationWeeks =
    cycleResult.rows.length > 0
      ? parseInt(cycleResult.rows[0].duration_weeks)
      : 6;
  const currentCycleRow =
    cycleResult.rows.length > 0 ? cycleResult.rows[0] : null;

  // Block boundary: midpoint of duration_weeks
  const blockBoundary = durationWeeks / 2;

  // Check if we are in a rest week (phase_week > durationWeeks signals
  // rest week is in progress — we use a sentinel value)
  const isRestWeek = user.in_rest_week === true;

  if (isRestWeek) {
    // Rest week is over — advance to the next phase
    await startNextPhase(user, currentCycleRow);
    return;
  }

  if (phase_week >= durationWeeks) {
    // Training weeks complete for this phase
    const needsRestWeek = PHASES_WITH_REST_WEEK.includes(current_phase);

    if (needsRestWeek) {
      // Insert rest week sessions and mark user as in_rest_week
      await createRestWeekSessions(user);
      await pool.query(`UPDATE users SET in_rest_week = TRUE WHERE id = $1`, [
        id,
      ]);
      console.log(`✓ Rest week started for user ${id}`);
    } else {
      // No rest week for this phase — advance directly
      await startNextPhase(user, currentCycleRow);
    }
    return;
  }

  // Normal week increment
  const newWeek = phase_week + 1;
  await pool.query(`UPDATE users SET phase_week = $1 WHERE id = $2`, [
    newWeek,
    id,
  ]);
  console.log(`✓ Phase week advanced to ${newWeek}`);

  // Block 2 trigger: when we hit the week after the block boundary
  if (newWeek === blockBoundary + 1) {
    await pool.query(`UPDATE users SET current_block = 2 WHERE id = $1`, [id]);
    await triggerBlockGeneration({
      ...user,
      current_block: 2,
      phase_week: newWeek,
    });
  }
}

// ─── Start next phase ─────────────────────────────────────────────────────────

async function startNextPhase(user, currentCycleRow) {
  const { id, current_phase } = user;

  // Mark current cycle row as complete
  if (currentCycleRow) {
    await pool.query(`UPDATE cycles SET status = 'complete' WHERE id = $1`, [
      currentCycleRow.id,
    ]);
  }

  // Find the next pending cycle row
  const nextCycleResult = await pool.query(
    `SELECT id, phase, phase_order, duration_weeks
     FROM cycles
     WHERE user_id = $1 AND status = 'pending'
     ORDER BY phase_order ASC
     LIMIT 1`,
    [id],
  );

  if (nextCycleResult.rows.length === 0) {
    // Cycle is complete — no more phases
    console.log(
      `Cycle complete for user ${id} — no further phases. User will enter cycle planning on next login.`,
    );
    await pool.query(
      `UPDATE users
       SET in_rest_week = FALSE
       WHERE id = $1`,
      [id],
    );
    return;
  }

  const nextPhaseRow = nextCycleResult.rows[0];
  const newPhase = nextPhaseRow.phase;

  // Recalculate target weights before block generation reads them
  await recalculateTargetWeightsForPhaseTransition(id, current_phase, newPhase);

  // Mark the next cycle row as in_progress
  await pool.query(`UPDATE cycles SET status = 'in_progress' WHERE id = $1`, [
    nextPhaseRow.id,
  ]);

  // Update user state
  await pool.query(
    `UPDATE users
     SET current_phase = $1,
         current_block = 1,
         phase_week = 1,
         phase_start_date = CURRENT_DATE,
         in_rest_week = FALSE
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
// Copies the last week of the current block at reduced load.
// Rest week target = current target_weight × (rest% / current_phase%)

async function createRestWeekSessions(user) {
  console.log(`Creating rest week sessions for user ${user.id}`);
  try {
    // Get the cycle duration to find the last week of the current phase
    const cycleResult = await pool.query(
      `SELECT duration_weeks FROM cycles
       WHERE user_id = $1 AND status = 'in_progress'
       ORDER BY phase_order ASC LIMIT 1`,
      [user.id],
    );
    const durationWeeks =
      cycleResult.rows.length > 0
        ? parseInt(cycleResult.rows[0].duration_weeks)
        : 6;
    const lastTrainingWeek = durationWeeks;

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

    const lastWeekSessions = await pool.query(
      `SELECT s.id, s.session_type, s.occurrence,
              json_agg(pe.* ORDER BY pe.order_index) AS exercises
       FROM sessions s
       JOIN planned_exercises pe ON pe.session_id = s.id
       WHERE s.programme_id = $1 AND s.week_number = $2
       GROUP BY s.id`,
      [programmeId, lastTrainingWeek],
    );

    if (lastWeekSessions.rows.length === 0) {
      console.error(
        `No week ${lastTrainingWeek} sessions found for rest week creation`,
      );
      return;
    }

    const currentPhaseConfig = PHASE_CONFIG[user.current_phase];
    const restPhaseConfig = PHASE_CONFIG.rest;
    const restRatio =
      restPhaseConfig.percentage / (currentPhaseConfig?.percentage || 0.75);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Rest week uses a week_number one beyond durationWeeks as a sentinel
      const restWeekNumber = durationWeeks + 1;

      for (const lastWeekSession of lastWeekSessions.rows) {
        const gymResult = await client.query(
          `SELECT gym_id FROM sessions WHERE id = $1`,
          [lastWeekSession.id],
        );
        const gymId = gymResult.rows[0]?.gym_id || null;

        const sessionResult = await client.query(
          `INSERT INTO sessions
             (user_id, programme_id, session_type, occurrence, week_number, gym_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [
            user.id,
            programmeId,
            lastWeekSession.session_type,
            lastWeekSession.occurrence,
            restWeekNumber,
            gymId,
          ],
        );
        const sessionId = sessionResult.rows[0].id;

        for (const ex of lastWeekSession.exercises) {
          const exResult = await client.query(
            `SELECT target_weight FROM exercises
             WHERE user_id = $1 AND exercise = $2 LIMIT 1`,
            [user.id, ex.exercise_name],
          );

          const baseWeight =
            exResult.rows.length > 0 && exResult.rows[0].target_weight
              ? parseFloat(exResult.rows[0].target_weight)
              : parseFloat(ex.target_weight);

          const rawRestWeight = Math.round(baseWeight * restRatio * 100) / 100;

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
              phase_week, in_rest_week, agent_tone,
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

  const sessionResult = await pool.query(
    `SELECT
       s.id, s.session_type, s.occurrence, s.week_number,
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
