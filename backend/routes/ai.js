// backend/routes/ai.js
// AI routes — block generation, extra session, and weekly feedback retrieval.

const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const pool = require("../db");
const requireAuth = require("../middleware");

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanJSON(text) {
  return text.replace(/```json|```/g, "").trim();
}

async function getSessionHistory(userId) {
  const result = await pool.query(
    `SELECT
       s.id, s.session_type, s.occurrence, s.week_number, s.gym,
       s.status, s.notes, s.completed_at,
       json_agg(
         json_build_object(
           'exercise_name', pe.exercise_name,
           'muscles_primary', pe.muscles_primary,
           'sub_component', pe.sub_component,
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
    [userId],
  );
  return result.rows;
}

async function getOneRepMaxHistory(userId) {
  const result = await pool.query(
    `SELECT DISTINCT ON (exercise_name)
       exercise_name, estimated_1rm, weight_used, reps_performed, logged_at
     FROM one_rep_max_history
     WHERE user_id = $1
     ORDER BY exercise_name, logged_at DESC`,
    [userId],
  );
  return result.rows;
}

async function getBodyCompHistory(userId) {
  const result = await pool.query(
    `SELECT weight_kg, muscle_mass_kg, logged_at
     FROM body_composition
     WHERE user_id = $1
       AND logged_at >= NOW() - INTERVAL '4 weeks'
     ORDER BY logged_at ASC`,
    [userId],
  );
  return result.rows;
}

async function getPreviousBlockExercises(userId, phase, blockNumber) {
  const previousBlock = blockNumber === 2 ? 1 : null;
  if (!previousBlock) return [];

  const result = await pool.query(
    `SELECT DISTINCT pe.exercise_name
     FROM planned_exercises pe
     JOIN sessions s ON s.id = pe.session_id
     JOIN programmes p ON p.id = s.programme_id
     WHERE s.user_id = $1
       AND p.phase = $2
       AND p.block_number = $3`,
    [userId, phase, previousBlock],
  );
  return result.rows.map((r) => r.exercise_name);
}

// ─── Generate block ───────────────────────────────────────────────────────────
// POST /ai/generate-block
// Generates a training block and writes sessions to the database.

router.post("/generate-block", requireAuth, async (req, res) => {
  try {
    const userResult = await pool.query(
      `SELECT current_phase, current_block, phase_week, current_gym
       FROM users WHERE id = $1`,
      [req.userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResult.rows[0];
    const { current_phase, current_block, phase_week, current_gym } = user;

    const [
      sessionHistory,
      oneRepMaxHistory,
      bodyCompHistory,
      previousBlockExercises,
    ] = await Promise.all([
      getSessionHistory(req.userId),
      getOneRepMaxHistory(req.userId),
      getBodyCompHistory(req.userId),
      getPreviousBlockExercises(req.userId, current_phase, current_block),
    ]);

    const gymCSV = buildGymCSV(current_gym);

    const userPrompt = `Generate a training block for the following athlete.

CURRENT STATE
- Phase: ${current_phase}
- Block: ${current_block}
- Phase week: ${phase_week} of 6
- Gym: ${current_gym}

EXERCISE LIBRARY
${gymCSV}

ESTIMATED 1RM HISTORY
${JSON.stringify(oneRepMaxHistory, null, 2)}

SESSION HISTORY — LAST 4 WEEKS
${JSON.stringify(sessionHistory, null, 2)}

PREVIOUS BLOCK EXERCISES
${previousBlockExercises.length > 0 ? previousBlockExercises.join(", ") : "None — this is the first block"}

BODY COMPOSITION — LAST 4 WEEKS
${JSON.stringify(bodyCompHistory, null, 2)}

Return ONLY this exact JSON structure, nothing else:
{
  "block": <number>,
  "phase": "<phase_name>",
  "compound_session": {
    "exercises": [
      {
        "exercise": "<name>",
        "muscles_primary": "<primary muscle>",
        "sub_component": "<sub component>",
        "sets": <number>,
        "target_reps": <number>,
        "weight_kg": <number>
      }
    ]
  },
  "isolation_session": {
    "exercises": [
      {
        "exercise": "<name>",
        "muscles_primary": "<primary muscle>",
        "sub_component": "<sub component>",
        "sets": <number>,
        "target_reps": <number>,
        "weight_kg": <number>
      }
    ]
  }
}

6 exercises in compound_session, 6 exercises in isolation_session. No extra fields. No explanation. No markdown.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: BLOCK_GENERATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const rawText = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    console.log("Claude raw response:", rawText);

    const blockPlan = JSON.parse(cleanJSON(rawText));

    // Validate structure
    if (!blockPlan.compound_session || !blockPlan.isolation_session) {
      throw new Error("Invalid block plan structure from Claude");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Create the programme record
      const progResult = await client.query(
        `INSERT INTO programmes (user_id, phase, block_number, week_start)
         VALUES ($1, $2, $3, CURRENT_DATE)
         RETURNING id`,
        [req.userId, current_phase, current_block],
      );

      const programmeId = progResult.rows[0].id;

      // Create 3 weeks of sessions from the two session plans
      for (let week = 1; week <= 3; week++) {
        // Compound session — occurrence 1
        const comp1Result = await client.query(
          `INSERT INTO sessions
             (user_id, programme_id, session_type, occurrence, week_number, gym)
           VALUES ($1, $2, 'compound', 1, $3, $4)
           RETURNING id`,
          [req.userId, programmeId, week, current_gym],
        );

        // Insert compound exercises for occurrence 1
        for (let i = 0; i < blockPlan.compound_session.exercises.length; i++) {
          const ex = blockPlan.compound_session.exercises[i];
          await client.query(
            `INSERT INTO planned_exercises
               (session_id, exercise_name, muscles_primary, sub_component,
                order_index, target_sets, target_reps, target_weight)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              comp1Result.rows[0].id,
              ex.exercise,
              ex.muscles_primary,
              ex.sub_component,
              i,
              ex.sets,
              ex.target_reps,
              ex.weight_kg,
            ],
          );
        }

        // Compound session — occurrence 2 (same exercises)
        const comp2Result = await client.query(
          `INSERT INTO sessions
             (user_id, programme_id, session_type, occurrence, week_number, gym)
           VALUES ($1, $2, 'compound', 2, $3, $4)
           RETURNING id`,
          [req.userId, programmeId, week, current_gym],
        );

        // Copy exercises to occurrence 2
        for (let i = 0; i < blockPlan.compound_session.exercises.length; i++) {
          const ex = blockPlan.compound_session.exercises[i];
          await client.query(
            `INSERT INTO planned_exercises
               (session_id, exercise_name, muscles_primary, sub_component,
                order_index, target_sets, target_reps, target_weight)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              comp2Result.rows[0].id,
              ex.exercise,
              ex.muscles_primary,
              ex.sub_component,
              i,
              ex.sets,
              ex.target_reps,
              ex.weight_kg,
            ],
          );
        }

        // Isolation session — occurrence 1
        const isoResult = await client.query(
          `INSERT INTO sessions
             (user_id, programme_id, session_type, occurrence, week_number, gym)
           VALUES ($1, $2, 'isolation', 1, $3, $4)
           RETURNING id`,
          [req.userId, programmeId, week, current_gym],
        );

        // Insert isolation exercises
        for (let i = 0; i < blockPlan.isolation_session.exercises.length; i++) {
          const ex = blockPlan.isolation_session.exercises[i];
          await client.query(
            `INSERT INTO planned_exercises
               (session_id, exercise_name, muscles_primary, sub_component,
                order_index, target_sets, target_reps, target_weight)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              isoResult.rows[0].id,
              ex.exercise,
              ex.muscles_primary,
              ex.sub_component,
              i,
              ex.sets,
              ex.target_reps,
              ex.weight_kg,
            ],
          );
        }
      }

      await client.query("COMMIT");

      res.status(201).json({
        message: "Block generated successfully",
        programme_id: programmeId,
        compound_session: blockPlan.compound_session,
        isolation_session: blockPlan.isolation_session,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Generate block error:", err.message);
    res.status(500).json({ error: "Server error", detail: err.message });
  }
});

// ─── Extra session ────────────────────────────────────────────────────────────
// POST /ai/extra-session

router.post("/extra-session", requireAuth, async (req, res) => {
  const { gym } = req.body;

  if (!gym || !["work", "home"].includes(gym)) {
    return res.status(400).json({ error: "gym must be work or home" });
  }

  try {
    const userResult = await pool.query(
      `SELECT current_phase, phase_week FROM users WHERE id = $1`,
      [req.userId],
    );

    const user = userResult.rows[0];
    const sessionHistory = await getSessionHistory(req.userId);

    const lastSession = sessionHistory[0];
    const daysSinceLast = lastSession
      ? Math.floor(
          (Date.now() - new Date(lastSession.completed_at).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : 7;

    const gymCSV = buildGymCSV(gym);

    const userPrompt = `The athlete has arrived at the gym and wants to do an extra session today.

CURRENT STATE
- Phase: ${user.current_phase}
- Phase week: ${user.phase_week} of 6
- Gym: ${gym}
- Days since last session: ${daysSinceLast}

EXERCISE LIBRARY
${gymCSV}

SESSION HISTORY — LAST 4 WEEKS
${JSON.stringify(sessionHistory, null, 2)}

Rank every exercise in the library from most to least recommended for today. For each exercise provide a one-line reason. Consider: what has been undertrained, what needs rest, how many days since last session, and any patterns in the session notes.

Return JSON only, no preamble.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: EXTRA_SESSION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const rawText = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    const result = JSON.parse(cleanJSON(rawText));
    res.json(result);
  } catch (err) {
    console.error("Extra session error:", err.message);
    res.status(500).json({ error: "Server error", detail: err.message });
  }
});

// ─── Get latest weekly feedback ───────────────────────────────────────────────
// GET /ai/weekly-feedback

router.get("/weekly-feedback", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM weekly_feedback
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.userId],
    );

    res.json(result.rows.length > 0 ? result.rows[0] : null);
  } catch (err) {
    console.error("Get weekly feedback error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Gym CSV builder ──────────────────────────────────────────────────────────

function buildGymCSV(gym) {
  const exercises = gym === "work" ? WORK_GYM_EXERCISES : HOME_GYM_EXERCISES;
  const header =
    "exercise,muscles_primary,muscles_secondary,type,sub_component,emg_score";
  const rows = exercises.map(
    (e) =>
      `${e.exercise},${e.muscles_primary},${e.muscles_secondary},${e.type},${e.sub_component},${e.emg_score}`,
  );
  return [header, ...rows].join("\n");
}

// ─── System prompts ───────────────────────────────────────────────────────────

const BLOCK_GENERATION_SYSTEM_PROMPT = `You are a personal gym coach and training planner. You follow periodisation principles from Tudor Bompa's Serious Strength Training and Zatsiorsky's Science and Practice of Strength Training, adapted for a recreational level athlete training alone 3 times per week.

TRAINING STRUCTURE
- Each week: Compound session → Isolation session → Compound session
- The same compound plan is used twice per week
- Compound session: 6 exercises — 1 each from Back, Chest, Lower Back, Quads, Shoulders, plus 1 Wildcard compound
- Isolation session: 6 exercises — Core (always first), Biceps, Triceps, Shoulders, Forearms, Wildcard from {Core, Calves, Hamstrings}

EXERCISE SELECTION RULES
1. SUB-COMPONENT COVERAGE — exclude sub-components used in previous block
2. PROGRESSIVE OVERLOAD — favour exercises with stronger historical performance
3. RECENCY — deprioritise exercises from last block unless EMG gap is 2+ points
4. EMG SCORE — prefer higher scores when other factors are equal
5. TIEBREAKER — use table order

BLOCK EXCLUSION — no exercise from Block 1 may appear in Block 2

WEIGHT CALCULATION
- Compound exercises (Size/Strength phases): percentage of estimated 1RM
- Isolation exercises: direct working weight, conservative starting point
- AA phase: no 1RM percentage — suggest conservative starting weights
- If no history exists, use conservative starting weights

PHASE SCHEMES
- Anatomical Adaptation: 3 sets x 20 reps target (min 15)
- Hypertrophy: 4 sets x 12 reps target (min 8)
- Maximum Strength: 4 sets x 6 reps target (min 3)
- Muscle Definition: 1 set x 40 reps target (min 30)

You must return ONLY valid JSON matching the exact structure specified. No explanation, no markdown, no extra fields.`;

const EXTRA_SESSION_SYSTEM_PROMPT = `You are a personal gym coach. The athlete has shown up for an extra session. Rank every exercise in the provided library from most to least recommended. One line reason per exercise. Be direct. No fluff.`;

// ─── Exercise data ────────────────────────────────────────────────────────────

const HOME_GYM_EXERCISES = [
  {
    exercise: "Dumbbell Bent Over Row",
    muscles_primary: "Back",
    muscles_secondary: "Biceps/Rear Delts",
    type: "Compound",
    sub_component: "Lat/Mid-trap",
    emg_score: 4,
  },
  {
    exercise: "EZ Bar Bent Over Row",
    muscles_primary: "Back",
    muscles_secondary: "Biceps/Rear Delts",
    type: "Compound",
    sub_component: "Lat/Mid-trap",
    emg_score: 3,
  },
  {
    exercise: "Single Arm Dumbbell Row",
    muscles_primary: "Back",
    muscles_secondary: "Biceps",
    type: "Compound",
    sub_component: "Lower lat",
    emg_score: 3,
  },
  {
    exercise: "Dumbbell Curl",
    muscles_primary: "Biceps",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Short head",
    emg_score: 3,
  },
  {
    exercise: "Dumbbell Hammer Curl",
    muscles_primary: "Biceps",
    muscles_secondary: "Brachialis",
    type: "Isolation",
    sub_component: "Brachialis/Long head",
    emg_score: 2,
  },
  {
    exercise: "EZ Bar Curl",
    muscles_primary: "Biceps",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Long head",
    emg_score: 4,
  },
  {
    exercise: "Dumbbell Bench Press",
    muscles_primary: "Chest",
    muscles_secondary: "Shoulders/Triceps",
    type: "Compound",
    sub_component: "Sternal head",
    emg_score: 4,
  },
  {
    exercise: "Push Up",
    muscles_primary: "Chest",
    muscles_secondary: "Shoulders/Triceps",
    type: "Compound",
    sub_component: "Sternal/Clavicular head",
    emg_score: 2,
  },
  {
    exercise: "Dead Bug",
    muscles_primary: "Core",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Deep stabilisers",
    emg_score: 3,
  },
  {
    exercise: "Leg Raise",
    muscles_primary: "Core",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Lower abs",
    emg_score: 4,
  },
  {
    exercise: "Lying Knee Raise",
    muscles_primary: "Core",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Lower abs",
    emg_score: 1,
  },
  {
    exercise: "Plank",
    muscles_primary: "Core",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Deep stabilisers",
    emg_score: 3,
  },
  {
    exercise: "Side Plank",
    muscles_primary: "Core",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Obliques",
    emg_score: 3,
  },
  {
    exercise: "Reverse Wrist Curl (Dumbbell)",
    muscles_primary: "Forearms",
    muscles_secondary: "Brachialis",
    type: "Isolation",
    sub_component: "Extensors",
    emg_score: 2,
  },
  {
    exercise: "Wrist Curl (Dumbbell)",
    muscles_primary: "Forearms",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Flexors",
    emg_score: 2,
  },
  {
    exercise: "Glute Bridge",
    muscles_primary: "Glutes",
    muscles_secondary: "Hamstrings",
    type: "Isolation",
    sub_component: "Glutes",
    emg_score: 2,
  },
  {
    exercise: "Dumbbell Stiff Leg Deadlift",
    muscles_primary: "Lower Back",
    muscles_secondary: "Hamstrings/Glutes",
    type: "Compound",
    sub_component: "Hamstring/Glute",
    emg_score: 3,
  },
  {
    exercise: "Romanian Deadlift (Dumbbell)",
    muscles_primary: "Lower Back",
    muscles_secondary: "Hamstrings/Glutes",
    type: "Compound",
    sub_component: "Hip hinge/Hamstring emphasis",
    emg_score: 4,
  },
  {
    exercise: "Dumbbell Goblet Squat",
    muscles_primary: "Quads",
    muscles_secondary: "Glutes",
    type: "Compound",
    sub_component: "Quads/Glutes",
    emg_score: 4,
  },
  {
    exercise: "Dumbbell Lunge",
    muscles_primary: "Quads",
    muscles_secondary: "Glutes/Hamstrings",
    type: "Compound",
    sub_component: "Quads/Glutes",
    emg_score: 3,
  },
  {
    exercise: "Dumbbell Step Back Lunge",
    muscles_primary: "Quads",
    muscles_secondary: "Glutes/Hamstrings",
    type: "Compound",
    sub_component: "Glutes/Hamstrings",
    emg_score: 2,
  },
  {
    exercise: "Dumbbell Lateral Raise",
    muscles_primary: "Shoulders",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Lateral delt",
    emg_score: 2,
  },
  {
    exercise: "Dumbbell Rear Delt Fly",
    muscles_primary: "Shoulders",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Rear delt",
    emg_score: 2,
  },
  {
    exercise: "Dumbbell Shoulder Press",
    muscles_primary: "Shoulders",
    muscles_secondary: "Triceps",
    type: "Compound",
    sub_component: "Anterior/Lateral delt",
    emg_score: 4,
  },
  {
    exercise: "EZ Bar Overhead Press",
    muscles_primary: "Shoulders",
    muscles_secondary: "Triceps",
    type: "Compound",
    sub_component: "Anterior/Lateral delt",
    emg_score: 4,
  },
  {
    exercise: "Dumbbell Overhead Tricep Extension",
    muscles_primary: "Triceps",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Long head",
    emg_score: 3,
  },
  {
    exercise: "EZ Bar Skull Crusher",
    muscles_primary: "Triceps",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Long head",
    emg_score: 3,
  },
];

const WORK_GYM_EXERCISES = [
  {
    exercise: "Barbell Bent Over Row",
    muscles_primary: "Back",
    muscles_secondary: "Biceps/Rear Delts",
    type: "Compound",
    sub_component: "Lat/Mid-trap",
    emg_score: 5,
  },
  {
    exercise: "Dumbbell Bent Over Row",
    muscles_primary: "Back",
    muscles_secondary: "Biceps/Rear Delts",
    type: "Compound",
    sub_component: "Lat/Mid-trap",
    emg_score: 4,
  },
  {
    exercise: "Landmine Row",
    muscles_primary: "Back",
    muscles_secondary: "Biceps",
    type: "Compound",
    sub_component: "Different pull angle",
    emg_score: 3,
  },
  {
    exercise: "Single Arm Dumbbell Row",
    muscles_primary: "Back",
    muscles_secondary: "Biceps",
    type: "Compound",
    sub_component: "Lower lat",
    emg_score: 3,
  },
  {
    exercise: "Barbell Curl",
    muscles_primary: "Biceps",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Long head",
    emg_score: 4,
  },
  {
    exercise: "Cable Curl",
    muscles_primary: "Biceps",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Short head",
    emg_score: 3,
  },
  {
    exercise: "Dumbbell Curl",
    muscles_primary: "Biceps",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Short head",
    emg_score: 3,
  },
  {
    exercise: "Hammer Curl",
    muscles_primary: "Biceps",
    muscles_secondary: "Brachialis",
    type: "Isolation",
    sub_component: "Brachialis/Long head",
    emg_score: 2,
  },
  {
    exercise: "Standing Calf Raise",
    muscles_primary: "Calves",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Gastrocnemius",
    emg_score: 2,
  },
  {
    exercise: "Barbell Bench Press",
    muscles_primary: "Chest",
    muscles_secondary: "Shoulders/Triceps",
    type: "Compound",
    sub_component: "Sternal head",
    emg_score: 5,
  },
  {
    exercise: "Decline Dumbbell Press",
    muscles_primary: "Chest",
    muscles_secondary: "Triceps",
    type: "Compound",
    sub_component: "Lower/Sternal head",
    emg_score: 3,
  },
  {
    exercise: "Dumbbell Bench Press",
    muscles_primary: "Chest",
    muscles_secondary: "Shoulders/Triceps",
    type: "Compound",
    sub_component: "Sternal/Clavicular head",
    emg_score: 4,
  },
  {
    exercise: "Incline Barbell Press",
    muscles_primary: "Chest",
    muscles_secondary: "Shoulders/Triceps",
    type: "Compound",
    sub_component: "Upper/Clavicular head",
    emg_score: 4,
  },
  {
    exercise: "Incline Dumbbell Press",
    muscles_primary: "Chest",
    muscles_secondary: "Shoulders/Triceps",
    type: "Compound",
    sub_component: "Upper/Clavicular head",
    emg_score: 3,
  },
  {
    exercise: "Bench Situp",
    muscles_primary: "Core",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Upper abs",
    emg_score: 1,
  },
  {
    exercise: "Cable Crunch",
    muscles_primary: "Core",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Upper abs",
    emg_score: 4,
  },
  {
    exercise: "Cable Woodchop",
    muscles_primary: "Core",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Obliques/Core",
    emg_score: 3,
  },
  {
    exercise: "Dead Bug",
    muscles_primary: "Core",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Deep stabilisers",
    emg_score: 3,
  },
  {
    exercise: "Incline Russian Twist",
    muscles_primary: "Core",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Obliques",
    emg_score: 3,
  },
  {
    exercise: "Incline Situp",
    muscles_primary: "Core",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Upper abs",
    emg_score: 2,
  },
  {
    exercise: "Leg Raise",
    muscles_primary: "Core",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Lower abs",
    emg_score: 4,
  },
  {
    exercise: "Lying Knee Raise",
    muscles_primary: "Core",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Lower abs",
    emg_score: 1,
  },
  {
    exercise: "Plank",
    muscles_primary: "Core",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Deep stabilisers",
    emg_score: 3,
  },
  {
    exercise: "Side Plank",
    muscles_primary: "Core",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Obliques",
    emg_score: 3,
  },
  {
    exercise: "TRX Knee Tuck",
    muscles_primary: "Core",
    muscles_secondary: "Hip Flexors",
    type: "Isolation",
    sub_component: "Lower abs",
    emg_score: 4,
  },
  {
    exercise: "TRX Pike",
    muscles_primary: "Core",
    muscles_secondary: "Core",
    type: "Isolation",
    sub_component: "Lower abs/Core",
    emg_score: 4,
  },
  {
    exercise: "TRX Side Knee Tuck",
    muscles_primary: "Core",
    muscles_secondary: "Abs",
    type: "Isolation",
    sub_component: "Obliques/Lower abs",
    emg_score: 3,
  },
  {
    exercise: "Reverse Wrist Curl",
    muscles_primary: "Forearms",
    muscles_secondary: "Brachialis",
    type: "Isolation",
    sub_component: "Extensors",
    emg_score: 2,
  },
  {
    exercise: "Wrist Curl (Barbell)",
    muscles_primary: "Forearms",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Flexors",
    emg_score: 2,
  },
  {
    exercise: "Leg Curl Machine",
    muscles_primary: "Hamstrings",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Hamstrings",
    emg_score: 3,
  },
  {
    exercise: "Barbell Deadlift",
    muscles_primary: "Lower Back",
    muscles_secondary: "Glutes/Hamstrings",
    type: "Compound",
    sub_component: "Full posterior chain",
    emg_score: 5,
  },
  {
    exercise: "Romanian Deadlift",
    muscles_primary: "Lower Back",
    muscles_secondary: "Hamstrings/Glutes",
    type: "Compound",
    sub_component: "Hip hinge/Hamstring emphasis",
    emg_score: 4,
  },
  {
    exercise: "Barbell Squat",
    muscles_primary: "Quads",
    muscles_secondary: "Glutes/Hamstrings",
    type: "Compound",
    sub_component: "Quads/Glutes",
    emg_score: 5,
  },
  {
    exercise: "Leg Extension Machine",
    muscles_primary: "Quads",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Quads",
    emg_score: 3,
  },
  {
    exercise: "Leg Press Machine",
    muscles_primary: "Quads",
    muscles_secondary: "Glutes/Hamstrings",
    type: "Compound",
    sub_component: "Quads/Glutes — different loading angle",
    emg_score: 4,
  },
  {
    exercise: "Cable Lateral Raise",
    muscles_primary: "Shoulders",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Lateral delt",
    emg_score: 2,
  },
  {
    exercise: "Dumbbell Lateral Raise",
    muscles_primary: "Shoulders",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Lateral delt",
    emg_score: 2,
  },
  {
    exercise: "Dumbbell Rear Delt Fly",
    muscles_primary: "Shoulders",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Rear delt/Rhomboids",
    emg_score: 2,
  },
  {
    exercise: "Dumbbell Shoulder Press",
    muscles_primary: "Shoulders",
    muscles_secondary: "Triceps",
    type: "Compound",
    sub_component: "Anterior delt/Stabilisers",
    emg_score: 4,
  },
  {
    exercise: "Face Pull",
    muscles_primary: "Shoulders",
    muscles_secondary: "Upper Back/Rotator Cuff",
    type: "Isolation",
    sub_component: "Rear delt/Rotator cuff",
    emg_score: 3,
  },
  {
    exercise: "Overhead Barbell Press",
    muscles_primary: "Shoulders",
    muscles_secondary: "Triceps/Upper Chest",
    type: "Compound",
    sub_component: "Anterior/Lateral delt",
    emg_score: 5,
  },
  {
    exercise: "Overhead Tricep Extension",
    muscles_primary: "Triceps",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Long head",
    emg_score: 4,
  },
  {
    exercise: "Skull Crusher",
    muscles_primary: "Triceps",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Long head/Medial head",
    emg_score: 4,
  },
  {
    exercise: "Tricep Pushdown (Cable)",
    muscles_primary: "Triceps",
    muscles_secondary: "None",
    type: "Isolation",
    sub_component: "Lateral head",
    emg_score: 4,
  },
];

module.exports = router;
