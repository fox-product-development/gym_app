require("dotenv").config();
// backend/db/schema.js
// Creates all database tables if they don't already exist.
// Run with --fresh flag to drop and recreate all tables: node db/schema.js --fresh

const pool = require("./index");

async function dropTables() {
  await pool.query("DROP TABLE IF EXISTS weekly_feedback CASCADE");
  await pool.query("DROP TABLE IF EXISTS body_composition CASCADE");
  await pool.query("DROP TABLE IF EXISTS one_rep_max_history CASCADE");
  await pool.query("DROP TABLE IF EXISTS logged_sets CASCADE");
  await pool.query("DROP TABLE IF EXISTS planned_exercises CASCADE");
  await pool.query("DROP TABLE IF EXISTS sessions CASCADE");
  await pool.query("DROP TABLE IF EXISTS programmes CASCADE");
  await pool.query("DROP TABLE IF EXISTS cycles CASCADE");
  await pool.query("DROP TABLE IF EXISTS exercises CASCADE");
  await pool.query("DROP TABLE IF EXISTS cardio_logs CASCADE");
  await pool.query("DROP TABLE IF EXISTS mood_logs CASCADE");
  await pool.query("DROP TABLE IF EXISTS diet_logs CASCADE");
  await pool.query("DROP TABLE IF EXISTS plates CASCADE");
  await pool.query("DROP TABLE IF EXISTS equipment CASCADE");
  await pool.query("DROP TABLE IF EXISTS gyms CASCADE");
  await pool.query("DROP TABLE IF EXISTS approved_emails CASCADE");
  await pool.query("DROP TABLE IF EXISTS users CASCADE");
  console.log("✓ All tables dropped");
}

async function createTables() {
  try {
    const fresh = process.argv.includes("--fresh");
    if (fresh) {
      await dropTables();
    }

    // ─── Users ───────────────────────────────────────────────────────────────
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
            'maximum_strength',
            'muscle_definition'
          )),
        current_block     INTEGER NOT NULL DEFAULT 1
          CHECK (current_block IN (1, 2)),
        phase_week        INTEGER NOT NULL DEFAULT 1
          CHECK (phase_week BETWEEN 1 AND 8),
        phase_start_date  DATE NOT NULL DEFAULT CURRENT_DATE,
        phase_cycle       JSONB,
        agent_tone        TEXT NOT NULL DEFAULT 'neutral'
          CHECK (agent_tone IN ('motivational', 'neutral', 'coaching', 'drill_sergeant')),
        goal_size         INTEGER CHECK (goal_size BETWEEN 1 AND 5),
        goal_strength     INTEGER CHECK (goal_strength BETWEEN 1 AND 5),
        goal_definition   INTEGER CHECK (goal_definition BETWEEN 1 AND 5),
        goal_fitness      INTEGER CHECK (goal_fitness BETWEEN 1 AND 5),
        training_level    TEXT CHECK (training_level IN ('new', 'amateur', 'serious', 'professional')),
        weekly_sessions   INTEGER CHECK (weekly_sessions BETWEEN 1 AND 14),
        goal_description  TEXT,
        weight_exercises_per_session        INTEGER,
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

    // ─── Cycles ──────────────────────────────────────────────────────────────
    // One row per phase per user. A full cycle is 4 rows (or more if duplicate
    // phases are added). The cron reads these to determine phase advancement
    // instead of using a hardcoded sequence.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cycles (
        id             SERIAL PRIMARY KEY,
        user_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,
        phase          TEXT NOT NULL
          CHECK (phase IN (
            'anatomical_adaptation',
            'hypertrophy',
            'maximum_strength',
            'muscle_definition'
          )),
        phase_order    INTEGER NOT NULL,
        status         TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'in_progress', 'complete')),
        duration_weeks INTEGER NOT NULL DEFAULT 6
          CHECK (duration_weeks IN (4, 6, 8)),
        created_at     TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✓ cycles table ready");

    // ─── Programmes ──────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS programmes (
        id           SERIAL PRIMARY KEY,
        user_id      INTEGER REFERENCES users(id),
        phase        TEXT NOT NULL,
        block_number INTEGER NOT NULL CHECK (block_number IN (1, 2)),
        week_start   DATE NOT NULL,
        created_at   TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✓ programmes table ready");

    // ─── Sessions ────────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id             SERIAL PRIMARY KEY,
        programme_id   INTEGER REFERENCES programmes(id),
        user_id        INTEGER REFERENCES users(id),
        gym_id         INTEGER REFERENCES gyms(id),
        session_type   TEXT NOT NULL
          CHECK (session_type IN ('compound', 'isolation', 'extra')),
        occurrence     INTEGER NOT NULL DEFAULT 1,
        week_number    INTEGER NOT NULL,
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
        range_exceeded  BOOLEAN DEFAULT FALSE,
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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS one_rep_max_history (
        id              SERIAL PRIMARY KEY,
        user_id         INTEGER REFERENCES users(id),
        exercise_name   TEXT NOT NULL,
        estimated_1rm   NUMERIC(6,2) NOT NULL,
        weight_used     NUMERIC(6,2) NOT NULL,
        reps_performed  INTEGER NOT NULL,
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
