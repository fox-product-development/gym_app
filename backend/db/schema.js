require("dotenv").config();
// backend/db/schema.js
// Creates all database tables if they don't already exist.
// Run with --fresh flag to drop and recreate all tables: node db/schema.js --fresh
//
// REBUILT [today's date] for the Bompa redesign:
//   - No training levels. phaseConfig.js is keyed by userKey ('user1',
//     'user2'...) derived directly from the user's id — training_level,
//     goal_size/strength/definition/fitness, weekly_sessions,
//     goal_description, weight_exercises_per_session, and in_rest_week
//     are all removed from users as they're no longer read anywhere.
//   - No blocks. current_block is removed from users; block_number is
//     removed from programmes. A phase's exercises are selected once and
//     every week within that phase is generated from that single selection.
//   - No cycles table. Phase sequencing is now defined in code
//     (cycleConfig.js), not as DB rows. cycle_position (an index into that
//     array) replaces it. phase_cycle (the old per-user jsonb attempt at
//     the same idea) is also removed.
//   - No progressive overload. range_exceeded is removed from
//     planned_exercises — the 1RM retest schedule is now the sole
//     progressive overload mechanism (see sessions.js).
//   - session_type is now phase-specific (full_body, upper, lower,
//     mixed_mxs, mixed_h_24, mixed_h_6, extra) rather than the old fixed
//     compound/isolation/extra enum. occurrence is removed — session order
//     within a week is implicit from session_type and insertion order.
//   - is_1rm_test added to sessions — flags a session as a 1RM testing
//     session rather than a normal training session.
//   - group_id added to planned_exercises — used only in Muscle Definition
//     weeks 4-6 to assign exercises into nonstop-execution groups.
//   - total_weeks added to programmes — how many weeks this programme's
//     phase runs for (3 or 6, depending on the user's cycle config entry).
//   - phase CHECK constraints (users.current_phase, programmes.phase)
//     extended to include 'mixed' and 'transition', which didn't exist
//     before today.

const pool = require("./index");

async function dropTables() {
  await pool.query("DROP TABLE IF EXISTS weekly_feedback CASCADE");
  await pool.query("DROP TABLE IF EXISTS body_composition CASCADE");
  await pool.query("DROP TABLE IF EXISTS one_rep_max_history CASCADE");
  await pool.query("DROP TABLE IF EXISTS logged_sets CASCADE");
  await pool.query("DROP TABLE IF EXISTS planned_exercises CASCADE");
  await pool.query("DROP TABLE IF EXISTS sessions CASCADE");
  await pool.query("DROP TABLE IF EXISTS programmes CASCADE");
  await pool.query("DROP TABLE IF EXISTS exercises CASCADE");
  await pool.query("DROP TABLE IF EXISTS cardio_logs CASCADE");
  await pool.query("DROP TABLE IF EXISTS mood_logs CASCADE");
  await pool.query("DROP TABLE IF EXISTS diet_logs CASCADE");
  await pool.query("DROP TABLE IF EXISTS conditioning CASCADE");
  await pool.query("DROP TABLE IF EXISTS plates CASCADE");
  await pool.query("DROP TABLE IF EXISTS equipment CASCADE");
  await pool.query("DROP TABLE IF EXISTS gyms CASCADE");
  await pool.query("DROP TABLE IF EXISTS approved_emails CASCADE");
  await pool.query("DROP TABLE IF EXISTS users CASCADE");
  console.log("✓ All tables dropped");
  // Note: 'cycles' is intentionally not in this list. It was dropped via
  // migrate-bompa-redesign.js / a manual DROP TABLE earlier today, since
  // phase sequencing now lives in cycleConfig.js, not the database. If
  // you're running --fresh against a database that still has the old
  // 'cycles' table from before today, drop it manually first.

  console.log("✓ All tables dropped");
}

async function createTables() {
  try {
    const fresh = process.argv.includes("--fresh");
    if (fresh) {
      await dropTables();
    }

    // ─── Users ───────────────────────────────────────────────────────────────
    // cycle_position is an index into CYCLE_CONFIG (cycleConfig.js) — it
    // replaces the old cycles table entirely. phase_week is 1-based and
    // counts weeks within the CURRENT cycle entry (no longer within a
    // block — blocks don't exist).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id                SERIAL PRIMARY KEY,
        username          TEXT NOT NULL UNIQUE,
        email             TEXT UNIQUE,
        password          TEXT NOT NULL,
        is_admin          BOOLEAN NOT NULL DEFAULT FALSE,
        current_phase     TEXT NOT NULL DEFAULT 'anatomical_adaptation'
          CHECK (current_phase IN (
            'anatomical_adaptation',
            'hypertrophy',
            'mixed',
            'maximum_strength',
            'muscle_definition',
            'transition'
          )),
        cycle_position    INTEGER NOT NULL DEFAULT 0,
        phase_week        INTEGER NOT NULL DEFAULT 1
          CHECK (phase_week BETWEEN 1 AND 8),
        phase_start_date  DATE NOT NULL DEFAULT CURRENT_DATE,
        agent_tone        TEXT NOT NULL DEFAULT 'neutral'
          CHECK (agent_tone IN ('motivational', 'neutral', 'coaching', 'drill_sergeant')),
        conditioning_exercises_per_session  INTEGER,
        created_at        TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✓ users table ready");

    // ─── Approved emails ─────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS approved_emails (
        id         SERIAL PRIMARY KEY,
        email      TEXT NOT NULL UNIQUE,
        used       BOOLEAN NOT NULL DEFAULT FALSE,
        added_at   TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✓ approved_emails table ready");

    // ─── Gyms ────────────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gyms (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER REFERENCES users(id),
        gym_name    TEXT NOT NULL,
        is_default  BOOLEAN NOT NULL DEFAULT FALSE,
        created_at  TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✓ gyms table ready");

    // ─── Equipment ───────────────────────────────────────────────────────────
    // Equipment per gym. type drives weight calculation logic.
    // loadable: uses plate pool. fixed/machine: uses increment. apparatus: no weight.
    // unit: 'kg' or 'lbs' — determines display suffix and increment unit.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS equipment (
        id                  SERIAL PRIMARY KEY,
        user_id             INTEGER REFERENCES users(id),
        gym_id              INTEGER REFERENCES gyms(id),
        equipment_name      TEXT NOT NULL,
        type                TEXT NOT NULL
          CHECK (type IN ('loadable', 'fixed', 'machine', 'apparatus')),
        unladen_weight      NUMERIC(5,2),
        increment           NUMERIC(5,2),
        max_weight          NUMERIC(6,2),
        unit                TEXT NOT NULL DEFAULT 'kg'
          CHECK (unit IN ('kg', 'lbs')),
        created_at          TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✓ equipment table ready");

    // ─── Plates ──────────────────────────────────────────────────────────────
    // Plate inventory per gym. Pooled across all loadable equipment in that gym.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS plates (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER REFERENCES users(id),
        gym_id      INTEGER REFERENCES gyms(id),
        weight      NUMERIC(5,3) NOT NULL,
        quantity    INTEGER NOT NULL DEFAULT 0,
        created_at  TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✓ plates table ready");

    // ─── Conditioning ────────────────────────────────────────────────────────
    // Bodyweight conditioning exercises (cardio, core, mobility, TRX).
    // gym_id is nullable — most apply to all gyms; TRX exercises are gym-specific.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conditioning (
        id          SERIAL PRIMARY KEY,
        exercise    TEXT NOT NULL,
        category    TEXT NOT NULL,
        metric      TEXT NOT NULL,
        target      INTEGER NOT NULL,
        sets        INTEGER NOT NULL DEFAULT 3,
        gym_id      INTEGER REFERENCES gyms(id)
      );
    `);
    console.log("✓ conditioning table ready");

    // ─── Programmes ──────────────────────────────────────────────────────────
    // One row per phase run. block_number is removed — a phase's exercises
    // are selected once (by the AI) and every week of the phase is
    // generated from that single selection, so there's no second block to
    // distinguish. total_weeks records how many weeks this specific phase
    // run covers (3 or 6, taken from the user's cycleConfig entry at the
    // time the phase was generated).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS programmes (
        id           SERIAL PRIMARY KEY,
        user_id      INTEGER REFERENCES users(id),
        phase        TEXT NOT NULL
          CHECK (phase IN (
            'anatomical_adaptation',
            'hypertrophy',
            'mixed',
            'maximum_strength',
            'muscle_definition',
            'transition'
          )),
        total_weeks  INTEGER NOT NULL,
        week_start   DATE NOT NULL,
        created_at   TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✓ programmes table ready");

    // ─── Sessions ────────────────────────────────────────────────────────────
    // session_type is phase-specific rather than a fixed compound/isolation
    // enum — see ai.js's PHASE_SESSION_TEMPLATES for what each phase uses.
    // occurrence is removed — session order within a week is implicit from
    // session_type and insertion order, not a separate counter.
    // is_1rm_test flags a session as a max-effort testing session — see
    // sessions.js for how completing one of these recalculates target
    // weights for the rest of the phase.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id             SERIAL PRIMARY KEY,
        programme_id   INTEGER REFERENCES programmes(id),
        user_id        INTEGER REFERENCES users(id),
        gym_id         INTEGER REFERENCES gyms(id),
        session_type   TEXT NOT NULL
          CHECK (session_type IN (
            'full_body',
            'upper',
            'lower',
            'mixed_mxs',
            'mixed_h_24',
            'mixed_h_6',
            'extra'
          )),
        week_number    INTEGER NOT NULL,
        is_1rm_test    BOOLEAN NOT NULL DEFAULT FALSE,
        status         TEXT NOT NULL DEFAULT 'planned'
          CHECK (status IN ('planned', 'in_progress', 'complete')),
        notes          TEXT,
        started_at     TIMESTAMP,
        completed_at   TIMESTAMP,
        created_at     TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✓ sessions table ready");

    // ─── Planned exercises ───────────────────────────────────────────────────
    // range_exceeded is removed — progressive overload via rep-range
    // detection no longer exists (see sessions.js header note). group_id is
    // added for Muscle Definition weeks 4-6, where exercises are performed
    // nonstop in pairs/groups rather than individually; NULL for every
    // other phase and for MD weeks 1-3.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS planned_exercises (
        id              SERIAL PRIMARY KEY,
        session_id      INTEGER REFERENCES sessions(id),
        exercise_name   TEXT NOT NULL,
        muscles_primary TEXT,
        sub_component   TEXT,
        order_index     INTEGER NOT NULL,
        target_sets     INTEGER NOT NULL,
        target_reps     INTEGER NOT NULL,
        target_weight   NUMERIC(6,2) NOT NULL,
        set_style       TEXT NOT NULL DEFAULT 'standard'
          CHECK (set_style IN ('standard', 'drop')),
        metric          TEXT,
        group_id        INTEGER,
        created_at      TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✓ planned_exercises table ready");

    // ─── Logged sets ─────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS logged_sets (
        id              SERIAL PRIMARY KEY,
        session_id      INTEGER REFERENCES sessions(id),
        exercise_name   TEXT NOT NULL,
        set_number      INTEGER NOT NULL,
        drop_number     INTEGER NOT NULL DEFAULT 0,
        weight          NUMERIC(6,2) NOT NULL,
        reps            INTEGER NOT NULL,
        notes           TEXT,
        logged_at       TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✓ logged_sets table ready");

    // ─── 1RM history ─────────────────────────────────────────────────────────
    // The ONLY writer of this table is now the 1RM test completion handler
    // in sessions.js (recalculateFromOneRmTest). Normal session set logging
    // no longer writes here — see sessions.js header note for why that
    // changed (it was silently overwriting genuine test data with
    // non-maximal working-set estimates).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS one_rep_max_history (
        id              SERIAL PRIMARY KEY,
        user_id         INTEGER REFERENCES users(id),
        exercise_name   TEXT NOT NULL,
        estimated_1rm   NUMERIC(6,2) NOT NULL,
        weight_used     NUMERIC(6,2),
        reps_performed  INTEGER,
        logged_at       TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✓ one_rep_max_history table ready");

    // ─── Body composition ─────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS body_composition (
        id              SERIAL PRIMARY KEY,
        user_id         INTEGER REFERENCES users(id),
        weight_kg       NUMERIC(5,2),
        muscle_mass_kg  NUMERIC(5,2),
        body_fat_pct    NUMERIC(4,1),
        logged_at       DATE NOT NULL DEFAULT CURRENT_DATE,
        source          TEXT DEFAULT 'manual'
          CHECK (source IN ('manual', 'apple_health', 'image')),
        created_at      TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✓ body_composition table ready");

    // ─── Exercises ────────────────────────────────────────────────────────────
    // target_weight remains here as a column but is no longer treated as a
    // weight-calculation source anywhere in the app — 1RM × phaseConfig
    // percentage is the sole source (see ai.js's calculateExerciseWeight,
    // which has no fallback). It's still written to by the 1RM test
    // recalculation cascade's sibling effects historically, but as of
    // today's rebuild that cascade only touches planned_exercises, not
    // this table — target_weight here is effectively informational/legacy
    // and may be removed in a future pass once confirmed nothing reads it.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS exercises (
        id                SERIAL PRIMARY KEY,
        user_id           INTEGER REFERENCES users(id),
        gym_id            INTEGER REFERENCES gyms(id),
        equipment_id      INTEGER REFERENCES equipment(id),
        exercise          TEXT NOT NULL,
        muscles_primary   TEXT NOT NULL,
        muscles_secondary TEXT,
        type              TEXT NOT NULL CHECK (type IN ('Compound', 'Isolation')),
        sub_component     TEXT,
        emg_score         INTEGER,
        active            BOOLEAN NOT NULL DEFAULT TRUE,
        target_weight     NUMERIC(6,2) DEFAULT NULL,
        created_at        TIMESTAMP DEFAULT NOW(),
        UNIQUE (user_id, gym_id, exercise)
      );
    `);
    console.log("✓ exercises table ready");

    // ─── Diet logs ───────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS diet_logs (
        id                SERIAL PRIMARY KEY,
        user_id           INTEGER REFERENCES users(id),
        logged_at         DATE NOT NULL DEFAULT CURRENT_DATE,
        calories_kcal     NUMERIC(7,2),
        fat_g             NUMERIC(6,2),
        saturated_fat_g   NUMERIC(6,2),
        carbs_g           NUMERIC(6,2),
        sugar_g           NUMERIC(6,2),
        fibre_g           NUMERIC(6,2),
        protein_g         NUMERIC(6,2),
        salt_g            NUMERIC(6,2),
        source            TEXT DEFAULT 'manual'
          CHECK (source IN ('manual', 'image')),
        created_at        TIMESTAMP DEFAULT NOW(),
        UNIQUE (user_id, logged_at)
      );
    `);
    console.log("✓ diet_logs table ready");

    // ─── Mood logs ───────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mood_logs (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER REFERENCES users(id),
        logged_at   DATE NOT NULL DEFAULT CURRENT_DATE,
        mood        INTEGER NOT NULL CHECK (mood BETWEEN 1 AND 5),
        energy      INTEGER NOT NULL CHECK (energy BETWEEN 1 AND 5),
        notes       TEXT,
        created_at  TIMESTAMP DEFAULT NOW(),
        UNIQUE (user_id, logged_at)
      );
    `);
    console.log("✓ mood_logs table ready");

    // ─── Cardio logs ─────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cardio_logs (
        id               SERIAL PRIMARY KEY,
        user_id          INTEGER REFERENCES users(id),
        logged_at        DATE NOT NULL DEFAULT CURRENT_DATE,
        activity_type    TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL,
        distance_km      NUMERIC(6,2),
        avg_heart_rate   INTEGER,
        calories         INTEGER,
        avg_pace_seconds INTEGER,
        notes            TEXT,
        created_at       TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✓ cardio_logs table ready");

    // ─── Weekly feedback ──────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS weekly_feedback (
        id                       SERIAL PRIMARY KEY,
        user_id                  INTEGER REFERENCES users(id),
        week_start_date          DATE NOT NULL,
        ai_summary               TEXT,
        phase_change_recommended BOOLEAN DEFAULT FALSE,
        phase_change_suggestion  TEXT,
        created_at               TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✓ weekly_feedback table ready");

    console.log("\n✅ All tables created successfully");
    process.exit(0);
  } catch (err) {
    console.error("Error creating tables:", err);
    process.exit(1);
  }
}

createTables();
