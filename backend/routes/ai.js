// backend/routes/ai.js
// AI routes — block generation, extra session, and weekly feedback retrieval.
// All Claude API calls live here.

const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const pool = require("../db");
const requireAuth = require("../middleware");

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Cleans JSON responses from Claude — strips markdown code fences if present
function cleanJSON(text) {
  return text.replace(/```json|```/g, "").trim();
}

// Fetches the last 4 weeks of session history for a user
async function getSessionHistory(userId) {
  const result = await pool.query(
    `SELECT
       s.id, s.session_type, s.occurrence, s.week_number, s.gym,
       s.status, s.notes, s.started_at, s.completed_at,
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

// Fetches the latest 1RM estimate for each exercise
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

// Fetches the last 4 weeks of body composition data
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

// Fetches exercises used in the previous block (for block exclusion rule)
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
// Called at the start of Week 1 and Week 4 of each phase.
// Generates a 3-week training block and writes it to the database.

router.post("/generate-block", requireAuth, async (req, res) => {
  try {
    // Get user profile
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

    // Gather context for the prompt
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

    // Build the exercise library CSV for the selected gym
    // We import inline to avoid circular dependency issues
    const gymCSV = buildGymCSV(current_gym);

    // Build the user prompt
    const userPrompt = `Generate a 3-week training block for the following athlete.

CURRENT STATE
- Phase: ${current_phase}
- Block: ${current_block} (${current_block === 1 ? "1" : "2"})
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

Generate the full 3-week block plan. Return JSON only, no preamble or explanation.`;

    // Call Claude
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: BLOCK_GENERATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    // Parse the response
    const rawText = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    const blockPlan = JSON.parse(cleanJSON(rawText));

    // Write the plan to the database
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

      // Insert sessions and exercises from the generated plan
      for (const week of blockPlan.weeks) {
        for (const session of week.sessions) {
          // Skip the duplicate compound session — it shares exercises with session 1
          if (
            session.session_type === "compound" &&
            session.exercises.length === 0
          ) {
            // Create the occurrence 2 session pointing to same exercises
            await client.query(
              `INSERT INTO sessions
                 (user_id, programme_id, session_type, occurrence, week_number, gym)
               VALUES ($1, $2, $3, 2, $4, $5)`,
              [
                req.userId,
                programmeId,
                "compound",
                week.week_number,
                current_gym,
              ],
            );
            continue;
          }

          const sessionResult = await client.query(
            `INSERT INTO sessions
               (user_id, programme_id, session_type, occurrence, week_number, gym)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [
              req.userId,
              programmeId,
              session.session_type,
              session.session_type === "compound" ? 1 : 1,
              week.week_number,
              current_gym,
            ],
          );

          const sessionId = sessionResult.rows[0].id;

          // Insert exercises
          for (let i = 0; i < session.exercises.length; i++) {
            const ex = session.exercises[i];
            await client.query(
              `INSERT INTO planned_exercises
                 (session_id, exercise_name, muscles_primary, sub_component,
                  order_index, target_sets, target_reps, target_weight)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                sessionId,
                ex.exercise,
                ex.muscles_primary,
                ex.sub_component,
                i,
                ex.working_sets.sets,
                ex.working_sets.reps,
                ex.working_sets.weight_kg,
              ],
            );
          }

          // Create the occurrence 2 compound session for week
          if (session.session_type === "compound") {
            await client.query(
              `INSERT INTO sessions
                 (user_id, programme_id, session_type, occurrence, week_number, gym)
               VALUES ($1, $2, 'compound', 2, $3, $4)`,
              [req.userId, programmeId, week.week_number, current_gym],
            );
          }
        }
      }

      await client.query("COMMIT");

      res.status(201).json({
        message: "Block generated successfully",
        programme_id: programmeId,
        block: blockPlan,
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
// Called when the user taps Extra Session and selects a gym.
// Returns a ranked list of exercises with reasons.

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

    // Days since last session
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

Rank every exercise in the library from most to least recommended for today. For each exercise provide a one-line reason. Consider: what has been undertrained, what needs rest, how many days since last session, body composition trend, and any patterns in the session notes.

Return JSON only, no preamble.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
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
// Returns the most recent Sunday report for the user.

router.get("/weekly-feedback", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM weekly_feedback
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.userId],
    );

    if (result.rows.length === 0) {
      return res.json(null);
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Get weekly feedback error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Gym CSV builder ──────────────────────────────────────────────────────────
// Builds a CSV string from the hardcoded gym library.
// Used in AI prompts — kept here to avoid importing from constants in backend.

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

Your job is to generate a structured 3-week training block. You think like an experienced coach reviewing a training diary — you look at the data, spot patterns, and make intelligent decisions. You are direct, encouraging, and never sentimental.

TRAINING STRUCTURE
- Each week consists of exactly 2 unique session plans: one Compound session and one Isolation session
- The weekly pattern is: Compound session → Isolation session → Compound session
- The Compound session plan is performed TWICE per week — the same exercises, sets, reps and weights both times. Do not generate two different compound sessions.
- The Isolation session plan is performed ONCE per week
- Sessions are not mapped to specific days. The user trains when their schedule allows.
- Compound session contains 6 exercises: 1 from each of Back, Chest, Lower Back, Quads, Shoulders, plus 1 Wildcard
- Isolation session contains 6 exercises: Biceps, Triceps, Shoulders, Forearms, Core, and a Wildcard. The Core exercise is always placed first. The Wildcard is drawn from {Core, Calves, Hamstrings} isolation exercises only — if Core is drawn, it is placed last to avoid two consecutive core exercises.
- Exercise order within sessions follows best practice: largest compound movements first, isolation last, core always last

EXERCISE SELECTION RULES
Select exercises using the following priority order:

1. SUB-COMPONENT COVERAGE (hard filter)
   - If a sub-component was targeted in the previous block, exclude exercises targeting that same sub-component before any other scoring
   - This ensures full muscle coverage across blocks

2. PROGRESSIVE OVERLOAD RESPONSE
   - Favour exercises with stronger historical PO performance (more weight added over time)
   - After 2 consecutive block selections, apply a dampening factor so the exercise becomes less likely to be selected again even with a strong PO score

3. RECENCY
   - Deprioritise exercises selected in the last consecutive block
   - Recency can be overridden if the EMG score gap between candidates is 2 or more points

4. EMG SCORE (1-5, based on MVC percentage research)
   - Use as a fine-tuning layer. Prefer higher scores when other factors do not differentiate candidates.
   - A score gap of 2 or more points can override recency

5. TIEBREAKER
   - When candidates are equal across all factors, select by position order in the exercise library

WILDCARD SLOT RULES
- Identify which primary muscle group has been least represented across recent sessions
- Select one exercise from that muscle group applying the standard scoring rules above
- If multiple groups are equally underrepresented, use table order as tiebreaker

BLOCK EXCLUSION RULE
- No exercise used in Block 1 (Weeks 1-3) may appear in Block 2 (Weeks 4-6)
- This applies across both compound and isolation sessions
- No exercise may appear in both the compound and isolation session within the same week

1RM AND WEIGHT CALCULATION
- Use the Epley formula to estimate 1RM: Weight x (1 + Reps / 30)
- Only apply Epley when logged reps are in the 3-10 rep range
- For compound exercises in Size and Strength phases, calculate working weight as a percentage of estimated 1RM
- For isolation exercises: track working weight directly, suggest small increments based on logged performance
- For Trim phase: suggest a light starting weight, track progression by rep completion only, no 1RM percentage logic

PHASE REP AND SET SCHEMES
- Anatomical Adaptation (AA): Target 20 reps, 3 sets. Minimum acceptable 15 reps per set.
- Hypertrophy: Target 12 reps, 4 sets. Minimum acceptable 8 reps per set.
- Maximum Strength: Target 6 reps, 4 sets. Minimum acceptable 3 reps per set.
- Muscle Definition (Trim): Target 40 reps, 1 set. Minimum acceptable 30 reps.

PROGRESSIVE OVERLOAD TRIGGERS
- Weight increase: athlete completes all sets at the target rep number
- Weight decrease: athlete fails to reach the minimum acceptable reps on any set
- No change: athlete completes all sets above minimum but below target
- Compound lifts: apply +2.5kg on increase, -2.5kg on decrease
- Isolation exercises: apply +1-2kg on increase, -1-2kg on decrease

YOUR TONE
You are direct and encouraging — like a knowledgeable training partner who has been alongside the athlete for years. You celebrate progress without sentiment. You call out patterns honestly. You never use motivational fluff.`;

const EXTRA_SESSION_SYSTEM_PROMPT = `You are a personal gym coach. The athlete has shown up and asked what they should do today. You have their recent training history. Your job is to recommend a ranked list of exercises from the available gym library, with a one-line reason for each ranking.

Think like a trainer who has been working with this athlete for months. You know what they have been doing, what they have neglected, and what their body needs right now. Be direct. One line per exercise. No fluff.`;

// ─── Exercise data ────────────────────────────────────────────────────────────
// Duplicated from constants/gyms.ts for use in the backend without TypeScript.

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
