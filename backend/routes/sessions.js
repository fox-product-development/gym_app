// backend/routes/sessions.js
// Session routes — create, retrieve, log sets, start and complete sessions.

const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware");
const { getNextValidWeight } = require("../weightCalc");
const { PHASE_CONFIG } = require("../phaseConfig");

const router = express.Router();

// ─── Get sessions for current week ───────────────────────────────────────────
// GET /sessions/week
// Returns sessions for the user's current phase_week only.

router.get("/week", requireAuth, async (req, res) => {
  try {
    const userResult = await pool.query(
      `SELECT current_phase, current_block, phase_week FROM users WHERE id = $1`,
      [req.userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const { current_phase, current_block, phase_week } = userResult.rows[0];

    const progResult = await pool.query(
      `SELECT id FROM programmes
       WHERE user_id = $1
         AND phase = $2
         AND block_number = $3
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.userId, current_phase, current_block],
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
             'range_exceeded', pe.range_exceeded,
             'equipment_unit', COALESCE(eq.unit, 'kg')
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
       ORDER BY s.session_type ASC, s.occurrence ASC`,
      [programmeId, req.userId, phase_week],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Get week sessions error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Replan sessions ──────────────────────────────────────────────────────────
// POST /sessions/replan
//
// Deletes all planned sessions for the current programme, then regenerates
// only the missing session slots via /ai/generate-missing.
//
// Use case: user has changed exercises, equipment, session count, or goal
// notes and wants upcoming sessions to reflect those changes. Completed
// and in-progress sessions are never touched.

router.post("/replan", requireAuth, async (req, res) => {
  try {
    // 1. Get user state and current programme
    const userResult = await pool.query(
      `SELECT current_phase, current_block, phase_week FROM users WHERE id = $1`,
      [req.userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const { current_phase, current_block } = userResult.rows[0];

    const progResult = await pool.query(
      `SELECT id FROM programmes
       WHERE user_id = $1
         AND phase = $2
         AND block_number = $3
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.userId, current_phase, current_block],
    );

    if (progResult.rows.length === 0) {
      return res.status(400).json({ error: "No active programme found" });
    }

    const programmeId = progResult.rows[0].id;

    // 2. Determine block weeks
    const blockWeeks = current_block === 1 ? [1, 2, 3] : [4, 5, 6];

    // 3. Capture the existing exercise plan from planned sessions as a baseline.
    //    The AI will use this to keep the same exercises unless settings changes
    //    require substitution. All weeks share the same plan so we deduplicate.
    const existingPlanResult = await pool.query(
      `SELECT s.session_type, pe.exercise_name, pe.muscles_primary,
              pe.sub_component, pe.target_sets, pe.target_reps,
              pe.target_weight, pe.order_index, pe.metric
       FROM planned_exercises pe
       JOIN sessions s ON s.id = pe.session_id
       WHERE s.programme_id = $1
         AND s.user_id = $2
         AND s.status = 'planned'
       ORDER BY s.session_type, pe.order_index`,
      [programmeId, req.userId],
    );

    let existingPlan = null;
    if (existingPlanResult.rows.length > 0) {
      function buildSessionPlan(rows, sessionType) {
        const typeRows = rows.filter((r) => r.session_type === sessionType);
        const weightRows = typeRows.filter(
          (r) => r.muscles_primary !== "Conditioning",
        );
        const condRows = typeRows.filter(
          (r) => r.muscles_primary === "Conditioning",
        );

        // Deduplicate by exercise name (same plan across all weeks)
        const seenWeight = new Set();
        const exercises = [];
        for (const r of weightRows) {
          if (!seenWeight.has(r.exercise_name)) {
            seenWeight.add(r.exercise_name);
            exercises.push({
              exercise: r.exercise_name,
              muscles_primary: r.muscles_primary,
              sub_component: r.sub_component,
              sets: r.target_sets,
              target_reps: r.target_reps,
              weight: r.target_weight ? parseFloat(r.target_weight) : 0,
            });
          }
        }

        const seenCond = new Set();
        const conditioning = [];
        for (const r of condRows) {
          if (!seenCond.has(r.exercise_name)) {
            seenCond.add(r.exercise_name);
            conditioning.push({
              exercise: r.exercise_name,
              sets: r.target_sets,
            });
          }
        }

        return { exercises, conditioning };
      }

      const compoundPlan = buildSessionPlan(
        existingPlanResult.rows,
        "compound",
      );
      const isolationPlan = buildSessionPlan(
        existingPlanResult.rows,
        "isolation",
      );

      if (
        compoundPlan.exercises.length > 0 ||
        isolationPlan.exercises.length > 0
      ) {
        existingPlan = {
          compound_session: compoundPlan,
          isolation_session: isolationPlan,
        };
      }
    }

    // 4. Delete all planned sessions and their exercises
    const plannedSessionsResult = await pool.query(
      `SELECT id FROM sessions
       WHERE programme_id = $1
         AND user_id = $2
         AND status = 'planned'`,
      [programmeId, req.userId],
    );

    const plannedIds = plannedSessionsResult.rows.map((r) => r.id);

    if (plannedIds.length > 0) {
      await pool.query(
        `DELETE FROM planned_exercises WHERE session_id = ANY($1)`,
        [plannedIds],
      );
      await pool.query(`DELETE FROM sessions WHERE id = ANY($1)`, [plannedIds]);
    }

    // 5. Check which weeks have missing session slots.
    //    Each week expects 3 sessions: compound occ 1, compound occ 2, isolation occ 1.
    const EXPECTED_SLOTS = [
      { session_type: "compound", occurrence: 1 },
      { session_type: "compound", occurrence: 2 },
      { session_type: "isolation", occurrence: 1 },
    ];

    const remainingResult = await pool.query(
      `SELECT week_number, session_type, occurrence
       FROM sessions
       WHERE programme_id = $1
         AND user_id = $2
         AND status IN ('in_progress', 'complete')`,
      [programmeId, req.userId],
    );

    const filledSlots = new Set(
      remainingResult.rows.map(
        (r) => `${r.week_number}-${r.session_type}-${r.occurrence}`,
      ),
    );

    const weeksNeeded = [];
    for (const week of blockWeeks) {
      const hasMissing = EXPECTED_SLOTS.some(
        (slot) =>
          !filledSlots.has(`${week}-${slot.session_type}-${slot.occurrence}`),
      );
      if (hasMissing) weeksNeeded.push(week);
    }

    if (weeksNeeded.length === 0) {
      return res.json({
        message:
          "No sessions to regenerate — all sessions in this block are complete or in progress.",
        weeks_regenerated: [],
      });
    }

    // 6. Call /ai/generate-missing internally
    const port = process.env.PORT || 3000;
    const internalUrl = `http://localhost:${port}/ai/generate-missing`;

    const genResponse = await fetch(internalUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": process.env.CRON_SECRET,
      },
      body: JSON.stringify({
        user_id: req.userId,
        programme_id: programmeId,
        weeks_needed: weeksNeeded,
        existing_plan: existingPlan,
      }),
    });

    if (!genResponse.ok) {
      const errorData = await genResponse.json().catch(() => ({}));
      throw new Error(
        errorData.detail || errorData.error || "Session generation failed",
      );
    }

    // 7. Cleanup: generate-missing creates all 3 session types per week,
    //    but some slots may already be filled by complete/in_progress sessions.
    //    Delete any newly-created planned duplicates.
    await pool.query(
      `DELETE FROM planned_exercises
       WHERE session_id IN (
         SELECT s1.id FROM sessions s1
         WHERE s1.programme_id = $1
           AND s1.user_id = $2
           AND s1.status = 'planned'
           AND EXISTS (
             SELECT 1 FROM sessions s2
             WHERE s2.programme_id = s1.programme_id
               AND s2.user_id = s1.user_id
               AND s2.week_number = s1.week_number
               AND s2.session_type = s1.session_type
               AND s2.occurrence = s1.occurrence
               AND s2.id != s1.id
               AND s2.status IN ('in_progress', 'complete')
           )
       )`,
      [programmeId, req.userId],
    );

    await pool.query(
      `DELETE FROM sessions s1
       USING sessions s2
       WHERE s1.programme_id = $1
         AND s1.user_id = $2
         AND s1.status = 'planned'
         AND s2.programme_id = s1.programme_id
         AND s2.user_id = s1.user_id
         AND s2.week_number = s1.week_number
         AND s2.session_type = s1.session_type
         AND s2.occurrence = s1.occurrence
         AND s2.id != s1.id
         AND s2.status IN ('in_progress', 'complete')`,
      [programmeId, req.userId],
    );

    res.json({
      message: "Sessions replanned successfully",
      weeks_regenerated: weeksNeeded,
    });
  } catch (err) {
    console.error("Replan sessions error:", err.message);
    res.status(500).json({ error: "Server error", detail: err.message });
  }
});

// ─── Get a single session ─────────────────────────────────────────────────────
// GET /sessions/:id
//
// Returns the session with:
//   - gym_name from the gyms table (via gym_id FK)
//   - equipment_unit per planned exercise (via exercises → equipment JOIN)
//     Used by the frontend to show kg or lbs suffixes correctly.

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
              COALESCE(eq.unit, 'kg') AS equipment_unit
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

router.post("/", requireAuth, async (req, res) => {
  const {
    programme_id,
    session_type,
    occurrence,
    week_number,
    gym_id,
    exercises,
  } = req.body;

  if (
    !session_type ||
    !occurrence ||
    !week_number ||
    !exercises ||
    exercises.length === 0
  ) {
    return res.status(400).json({
      error: "session_type, occurrence, week_number and exercises are required",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const sessionResult = await client.query(
      `INSERT INTO sessions
         (user_id, programme_id, session_type, occurrence, week_number, gym_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        req.userId,
        programme_id || null,
        session_type,
        occurrence,
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
// On every set:
//   - Log the set to logged_sets
//   - On set_number = 1 only: calculate 1RM via Epley and store in one_rep_max_history
//
// After logging, check for progressive overload (PO):
//   - PO only fires for phases where poEnabled = true (Hypertrophy, Max Strength)
//   - Get the planned_exercises row for this exercise in this session
//   - If all planned sets have been logged AND every logged set hit phase targetReps:
//       - Set range_exceeded = true on the planned_exercises row
//       - Calculate next valid weight for the triggering exercise (weightCalc.js)
//       - Update target_weight for the triggering exercise in the exercises table
//       - Cascade: update target_weight for all other active exercises sharing
//         the same muscles_primary for this user (each uses its own equipment increment)
//       - Cascade: update planned_exercises.target_weight for all planned sessions
//         for every affected exercise

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

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Log the set
    const setResult = await client.query(
      `INSERT INTO logged_sets
         (session_id, exercise_name, set_number, drop_number, weight, reps, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, exercise_name, set_number, drop_number, weight, reps, notes || null],
    );

    // 2. Calculate 1RM on the first set only (not drops, not high-rep sets)
    // Informational only — writes to one_rep_max_history, not to exercises table
    if (set_number === 1 && drop_number === 0 && reps <= 12) {
      const estimated1RM = weight * (1 + reps / 30);
      await client.query(
        `INSERT INTO one_rep_max_history
           (user_id, exercise_name, estimated_1rm, weight_used, reps_performed)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.userId, exercise_name, estimated1RM.toFixed(2), weight, reps],
      );
    }

    // 3. Check for progressive overload
    const plannedResult = await client.query(
      `SELECT pe.id, pe.target_sets, pe.target_reps, pe.range_exceeded,
              pe.set_style, pe.muscles_primary, s.gym_id
       FROM planned_exercises pe
       JOIN sessions s ON s.id = pe.session_id
       WHERE pe.session_id = $1
         AND pe.exercise_name = $2`,
      [id, exercise_name],
    );

    if (plannedResult.rows.length > 0) {
      const planned = plannedResult.rows[0];

      if (!planned.range_exceeded) {
        const userResult = await client.query(
          `SELECT current_phase FROM users WHERE id = $1`,
          [req.userId],
        );
        const phase = userResult.rows[0]?.current_phase;
        const phaseConfig = PHASE_CONFIG[phase];

        if (!phaseConfig || !phaseConfig.poEnabled) {
          await client.query("COMMIT");
          return res.status(201).json(setResult.rows[0]);
        }

        let rangeExceeded = false;

        if (planned.set_style === "drop") {
          if (
            set_number === 1 &&
            drop_number === 0 &&
            reps >= planned.target_reps
          ) {
            rangeExceeded = true;
          }
        } else {
          const loggedResult = await client.query(
            `SELECT reps FROM logged_sets
             WHERE session_id = $1 AND exercise_name = $2
             ORDER BY set_number ASC`,
            [id, exercise_name],
          );

          const loggedSets = loggedResult.rows;

          if (loggedSets.length >= planned.target_sets) {
            const maxReps = phaseConfig.targetReps;
            rangeExceeded = loggedSets.every((s) => s.reps >= maxReps);
          }
        }

        if (rangeExceeded) {
          await client.query(
            `UPDATE planned_exercises SET range_exceeded = TRUE WHERE id = $1`,
            [planned.id],
          );

          const triggerExResult = await client.query(
            `SELECT id, target_weight
             FROM exercises
             WHERE user_id = $1 AND gym_id = $2 AND exercise = $3`,
            [req.userId, planned.gym_id, exercise_name],
          );

          const updatedExercises = [];

          if (
            triggerExResult.rows.length > 0 &&
            triggerExResult.rows[0].target_weight !== null
          ) {
            const triggerEx = triggerExResult.rows[0];
            const newWeight = await getNextValidWeight(
              triggerEx.id,
              req.userId,
            );

            if (
              newWeight !== null &&
              newWeight !== parseFloat(triggerEx.target_weight)
            ) {
              await client.query(
                `UPDATE exercises SET target_weight = $1 WHERE id = $2`,
                [newWeight, triggerEx.id],
              );
              updatedExercises.push({ name: exercise_name, weight: newWeight });
            }
          }

          if (
            planned.muscles_primary &&
            planned.muscles_primary !== "Conditioning"
          ) {
            const siblingResult = await client.query(
              `SELECT e.id, e.exercise, e.target_weight
               FROM exercises e
               WHERE e.user_id = $1
                 AND e.muscles_primary = $2
                 AND e.exercise != $3
                 AND e.target_weight IS NOT NULL
                 AND e.active = TRUE`,
              [req.userId, planned.muscles_primary, exercise_name],
            );

            for (const sibling of siblingResult.rows) {
              const siblingNewWeight = await getNextValidWeight(
                sibling.id,
                req.userId,
              );

              if (
                siblingNewWeight !== null &&
                siblingNewWeight !== parseFloat(sibling.target_weight)
              ) {
                await client.query(
                  `UPDATE exercises SET target_weight = $1 WHERE id = $2`,
                  [siblingNewWeight, sibling.id],
                );
                updatedExercises.push({
                  name: sibling.exercise,
                  weight: siblingNewWeight,
                });
              }
            }
          }

          for (const updated of updatedExercises) {
            await client.query(
              `UPDATE planned_exercises pe
               SET target_weight = $1
               FROM sessions s
               WHERE pe.session_id = s.id
                 AND s.status = 'planned'
                 AND s.user_id = $2
                 AND pe.exercise_name = $3`,
              [updated.weight, req.userId, updated.name],
            );
          }
        }
      }
    }

    await client.query("COMMIT");
    res.status(201).json(setResult.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Log set error:", err.message);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});

// ─── Complete a session ───────────────────────────────────────────────────────
// PATCH /sessions/:id/complete

router.patch("/:id/complete", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;

  try {
    const result = await pool.query(
      `UPDATE sessions
       SET status = 'complete',
           completed_at = NOW(),
           notes = COALESCE($1, notes)
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [notes || null, id, req.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    const session = result.rows[0];

    // ─── Push completed session to Activity Coach ─────────────────────────
    // Non-blocking — failure here does not affect session completion.
    try {
      const activityPayload = {
        type: "gym",
        date: session.completed_at,
        duration_minutes: 60,
        notes: session.notes || null,
        user_id: process.env.ACTIVITY_COACH_USER_ID,
      };

      const response = await fetch(
        "https://www.activitycoach.co.uk/api/bridge/activities",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.BRIDGE_SECRET}`,
          },
          body: JSON.stringify(activityPayload),
        },
      );

      if (!response.ok) {
        console.error(
          "Activity Coach push failed:",
          response.status,
          await response.text(),
        );
      }
    } catch (pushErr) {
      console.error("Activity Coach push error:", pushErr.message);
    }

    res.json(session);
  } catch (err) {
    console.error("Complete session error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
