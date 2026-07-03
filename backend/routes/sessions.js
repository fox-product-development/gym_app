// backend/routes/sessions.js
// Session routes — create, retrieve, log sets, start and complete sessions.
//
// No blocks. Sessions belong to a programme (one per phase run), identified
// by week_number within that programme. session_type is phase-specific
// (full_body, upper, lower, mixed_mxs, mixed_h_24, mixed_h_6, extra) rather
// than the old compound/isolation/occurrence model.
//
// NO PROGRESSIVE OVERLOAD. The old PO system (range_exceeded cascade,
// auto-bumping target_weight when an athlete exceeded the rep range) has
// been removed. The 1RM retest schedule (every 3-6 weeks depending on
// phase) IS the progressive overload mechanism now — it measures actual
// max-effort performance under controlled conditions rather than inferring
// readiness from a working set, and it doesn't fight the deliberately
// conservative early-week loading that periodisation depends on. Effort
// data (RPE or similar) may be added later as a coaching/reporting signal,
// but it will not automatically change target weights.
//
// 1RM DATA ONLY COMES FROM 1RM TEST SESSIONS. Logging a set in a normal
// session never writes to one_rep_max_history — only the 1RM test
// completion handler does. This was a deliberate fix: writing an Epley
// estimate from every regular working set would silently overwrite the
// most recent real test result with non-maximal data, since downstream
// lookups (ai.js's buildWeightLookup) always take the most recent row.

const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware");
const {
  PHASE_CONFIG,
  getSessionConfig,
  getMixedWeekConfig,
} = require("../phaseConfig");
const { validateAndCorrectWeights } = require("./ai");

const router = express.Router();

function getUserKey(userId) {
  return `user${userId}`;
}

// ─── Get sessions for current week ───────────────────────────────────────────
// GET /sessions/week
// Returns sessions for the user's current phase_week within their current
// programme (the most recent programme matching current_phase).

router.get("/week", requireAuth, async (req, res) => {
  try {
    const userResult = await pool.query(
      `SELECT current_phase, phase_week FROM users WHERE id = $1`,
      [req.userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const { current_phase, phase_week } = userResult.rows[0];

    const progResult = await pool.query(
      `SELECT id FROM programmes
       WHERE user_id = $1
         AND phase = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.userId, current_phase],
    );

    if (progResult.rows.length === 0) {
      return res.json([]);
    }

    const programmeId = progResult.rows[0].id;

    const result = await pool.query(
      `SELECT
         s.*,
         g.gym_name,
         json_agg(
           json_build_object(
             'id', pe.id,
             'session_id', pe.session_id,
             'exercise_name', pe.exercise_name,
             'muscles_primary', pe.muscles_primary,
             'sub_component', pe.sub_component,
             'order_index', pe.order_index,
             'target_sets', pe.target_sets,
             'target_reps', pe.target_reps,
             'target_weight', pe.target_weight,
             'set_style', pe.set_style,
             'metric', pe.metric,
             'group_id', pe.group_id,
             'equipment_unit', COALESCE(eq.unit, 'kg'),
             'equipment_increment', eq.increment
           ) ORDER BY pe.order_index
         ) FILTER (WHERE pe.id IS NOT NULL) AS planned_exercises
       FROM sessions s
       LEFT JOIN gyms g ON g.id = s.gym_id
       LEFT JOIN planned_exercises pe ON pe.session_id = s.id
       LEFT JOIN exercises ex
         ON ex.exercise = pe.exercise_name
         AND ex.gym_id = s.gym_id
         AND ex.user_id = s.user_id
       LEFT JOIN equipment eq ON eq.id = ex.equipment_id
       WHERE s.programme_id = $1
         AND s.user_id = $2
         AND s.week_number = $3
       GROUP BY s.id, g.gym_name
       ORDER BY s.id ASC`,
      [programmeId, req.userId, phase_week],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Get week sessions error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Get a single session ─────────────────────────────────────────────────────
// GET /sessions/:id
// Unchanged from previous version — no phase/block dependency.

router.get("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const sessionResult = await pool.query(
      `SELECT s.*, g.gym_name
       FROM sessions s
       LEFT JOIN gyms g ON g.id = s.gym_id
       WHERE s.id = $1 AND s.user_id = $2`,
      [id, req.userId],
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    const session = sessionResult.rows[0];

    const plannedResult = await pool.query(
      `SELECT pe.*,
              COALESCE(eq.unit, 'kg') AS equipment_unit,
              eq.increment AS equipment_increment
       FROM planned_exercises pe
       LEFT JOIN exercises ex
         ON ex.exercise = pe.exercise_name
         AND ex.gym_id = $2
         AND ex.user_id = $3
       LEFT JOIN equipment eq ON eq.id = ex.equipment_id
       WHERE pe.session_id = $1
       ORDER BY pe.order_index ASC`,
      [id, session.gym_id, req.userId],
    );

    const loggedResult = await pool.query(
      `SELECT * FROM logged_sets
       WHERE session_id = $1
       ORDER BY exercise_name, set_number ASC`,
      [id],
    );

    res.json({
      ...session,
      planned_exercises: plannedResult.rows,
      logged_sets: loggedResult.rows,
    });
  } catch (err) {
    console.error("Get session error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Create a session ─────────────────────────────────────────────────────────
// POST /sessions
// Manual session creation (used by frontend flows outside AI generation,
// e.g. importing a one-off session). session_type is now a free-form phase
// session type string rather than a fixed compound/isolation enum.

router.post("/", requireAuth, async (req, res) => {
  const { programme_id, session_type, week_number, gym_id, exercises } =
    req.body;

  if (!session_type || !week_number || !exercises || exercises.length === 0) {
    return res.status(400).json({
      error: "session_type, week_number and exercises are required",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const sessionResult = await client.query(
      `INSERT INTO sessions
         (user_id, programme_id, session_type, week_number, gym_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        req.userId,
        programme_id || null,
        session_type,
        week_number,
        gym_id || null,
      ],
    );

    const session = sessionResult.rows[0];

    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      await client.query(
        `INSERT INTO planned_exercises
           (session_id, exercise_name, muscles_primary, sub_component,
            order_index, target_sets, target_reps, target_weight)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          session.id,
          ex.exercise_name,
          ex.muscles_primary || null,
          ex.sub_component || null,
          ex.order_index !== undefined ? ex.order_index : i,
          ex.target_sets,
          ex.target_reps,
          ex.target_weight,
        ],
      );
    }

    await client.query("COMMIT");
    res.status(201).json(session);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Create session error:", err.message);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});

// ─── Start a session ──────────────────────────────────────────────────────────
// PATCH /sessions/:id/start
// Unchanged from previous version.

router.patch("/:id/start", requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE sessions
       SET status = 'in_progress', started_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, req.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Start session error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Log a set ────────────────────────────────────────────────────────────────
// POST /sessions/:id/sets
//
// Just logs the set. No 1RM write happens here at all — 1RM data only ever
// comes from a 1RM test session's completion (see PATCH /:id/complete),
// which reads logged_sets directly rather than relying on a side-effect
// written during normal logging. This guarantees one_rep_max_history is
// only ever updated by a genuine max-effort test, never by a normal
// working set in an ordinary session.

router.post("/:id/sets", requireAuth, async (req, res) => {
  const { id } = req.params;
  const {
    exercise_name,
    set_number,
    drop_number = 0,
    weight,
    reps,
    notes,
  } = req.body;

  if (!exercise_name || !set_number || !weight || !reps) {
    return res.status(400).json({
      error: "exercise_name, set_number, weight and reps are required",
    });
  }

  try {
    const setResult = await pool.query(
      `INSERT INTO logged_sets
         (session_id, exercise_name, set_number, drop_number, weight, reps, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, exercise_name, set_number, drop_number, weight, reps, notes || null],
    );

    res.status(201).json(setResult.rows[0]);
  } catch (err) {
    console.error("Log set error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Update a logged set ──────────────────────────────────────────────────────
// PATCH /sessions/:id/sets/:setId
//
// Corrects the rep count on an already-logged set, rather than inserting a
// duplicate. Only reps are editable via this route — weight is untouched,
// matching the "Change rep count from X to Y" UI. The ownership check joins
// back to sessions.user_id since logged_sets itself has no user_id column.

router.patch("/:id/sets/:setId", requireAuth, async (req, res) => {
  const { id, setId } = req.params;
  const { reps } = req.body;

  if (!reps) {
    return res.status(400).json({ error: "reps is required" });
  }

  try {
    const result = await pool.query(
      `UPDATE logged_sets
       SET reps = $1
       WHERE id = $2
         AND session_id = $3
         AND session_id IN (SELECT id FROM sessions WHERE user_id = $4)
       RETURNING *`,
      [reps, setId, id, req.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Logged set not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Update logged set error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Complete a session ───────────────────────────────────────────────────────// PATCH /sessions/:id/complete
//
// If this session is a 1RM test session (is_1rm_test = true), completion
// triggers the recalculation cascade — and this is now the ONLY place in
// the app that writes to one_rep_max_history:
//   1. Read every exercise's first logged set from this session (the
//      max-effort set the test was designed to capture)
//   2. Calculate Epley 1RM for each and write to one_rep_max_history
//   3. Find every remaining PLANNED session in the same programme
//   4. For each, recalculate target_weight on every planned_exercises row
//      using fresh 1RM × that session's phaseConfig percentage
//
// This IS the progressive overload mechanism for this app — see the file
// header note. Normal (non-test) sessions completing do nothing further.

router.patch("/:id/complete", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE sessions
       SET status = 'complete',
           completed_at = NOW(),
           notes = COALESCE($1, notes)
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [notes || null, id, req.userId],
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Session not found" });
    }

    const session = result.rows[0];

    if (session.is_1rm_test) {
      await recalculateFromOneRmTest(client, session, req.userId);
    }

    await client.query("COMMIT");

    res.json(session);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Complete session error:", err.message);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});

// Performs the 1RM test recalculation cascade described above. Runs inside
// the same transaction as the session completion update. This is the ONLY
// function in the entire app that writes to one_rep_max_history.
async function recalculateFromOneRmTest(client, session, userId) {
  const userKey = getUserKey(userId);

  const testSetsResult = await client.query(
    `SELECT DISTINCT ON (exercise_name)
       exercise_name, weight, reps
     FROM logged_sets
     WHERE session_id = $1 AND set_number = 1 AND drop_number = 0
     ORDER BY exercise_name, logged_at ASC`,
    [session.id],
  );

  const freshOneRmByExercise = {};
  for (const row of testSetsResult.rows) {
    const weight = parseFloat(row.weight);
    const reps = parseInt(row.reps, 10);
    const estimated1RM = weight * (1 + reps / 30);
    freshOneRmByExercise[row.exercise_name.toLowerCase()] = estimated1RM;

    await client.query(
      `INSERT INTO one_rep_max_history
         (user_id, exercise_name, estimated_1rm, weight_used, reps_performed)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, row.exercise_name, estimated1RM.toFixed(2), weight, reps],
    );
  }

  if (Object.keys(freshOneRmByExercise).length === 0) {
    console.warn(
      `1RM test session ${session.id} completed with no logged sets — nothing to recalculate`,
    );
    return;
  }

  const phase = await getPhaseForProgramme(client, session.programme_id);

  const remainingSessionsResult = await client.query(
    `SELECT id, session_type, week_number
     FROM sessions
     WHERE programme_id = $1
       AND user_id = $2
       AND status = 'planned'`,
    [session.programme_id, userId],
  );

  for (const remaining of remainingSessionsResult.rows) {
    const exercisesResult = await client.query(
      `SELECT id, exercise_name FROM planned_exercises
       WHERE session_id = $1 AND muscles_primary != 'Conditioning'`,
      [remaining.id],
    );

    if (exercisesResult.rows.length === 0) continue;

    let sessionConfig;
    try {
      sessionConfig = resolveSessionConfigForRecalc(
        phase,
        userKey,
        remaining.week_number,
        remaining.session_type,
      );
    } catch (err) {
      console.error(
        `Could not resolve session config for recalculation (session ${remaining.id}):`,
        err.message,
      );
      continue;
    }

    // Build raw weights first, then validate the whole batch against
    // equipment increments/max weights in one pass — same rule every other
    // weight calculation in the app follows (see ai.js's
    // enrichExercisesForSession), so a recalculated weight never suggests
    // a dumbbell/plate combination that doesn't physically exist.
    const toUpdate = [];
    for (const ex of exercisesResult.rows) {
      const oneRm = freshOneRmByExercise[ex.exercise_name.toLowerCase()];
      if (!oneRm) continue; // exercise wasn't part of this 1RM test

      toUpdate.push({
        id: ex.id,
        exercise: ex.exercise_name,
        weight: oneRm * sessionConfig.percentage,
      });
    }

    if (toUpdate.length > 0) {
      await validateAndCorrectWeights(toUpdate, session.gym_id, userId);

      for (const ex of toUpdate) {
        await client.query(
          `UPDATE planned_exercises SET target_weight = $1 WHERE id = $2`,
          [ex.weight, ex.id],
        );
      }
    }
  }

  console.log(
    `✓ Recalculated target weights for ${remainingSessionsResult.rows.length} remaining session(s) following 1RM test (session ${session.id})`,
  );
}

// Looks up the phase for a programme — needed because the sessions table
// itself doesn't store phase directly (it's on programmes).
async function getPhaseForProgramme(client, programmeId) {
  const result = await client.query(
    `SELECT phase FROM programmes WHERE id = $1`,
    [programmeId],
  );
  return result.rows[0]?.phase;
}

// Resolves a single session's { percentage, reps, sets } config for
// recalculation purposes. We only need percentage here — reps/sets on the
// planned_exercises row are untouched by a 1RM recalculation.
function resolveSessionConfigForRecalc(
  phase,
  userKey,
  weekNumber,
  sessionType,
) {
  if (phase === "mixed") {
    const mixedWeek = getMixedWeekConfig(userKey, weekNumber);
    const track = sessionType === "mixed_mxs" ? "mxs" : "h";
    return mixedWeek[track][0];
  }
  if (phase === "transition") {
    return getSessionConfig("transition", userKey, 1, 0);
  }
  return getSessionConfig(phase, userKey, weekNumber, 0);
}

// ─── Reopen a completed session ───────────────────────────────────────────────
// PATCH /sessions/:id/reopen
// Unchanged from previous version.

router.patch("/:id/reopen", requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE sessions
       SET status = 'in_progress', completed_at = NULL
       WHERE id = $1 AND user_id = $2 AND status = 'complete'
       RETURNING *`,
      [id, req.userId],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Session not found or not complete" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Reopen session error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
