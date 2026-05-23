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
  await pool.query("DROP TABLE IF EXISTS users CASCADE");
  console.log("✓ All tables dropped");
}

async function createTables() {
  try {
    const fresh = process.argv.includes("--fresh");
    if (fresh) {
      await dropTables();
    }

    // ─── User ────────────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id               SERIAL PRIMARY KEY,
        username         TEXT NOT NULL UNIQUE,
        password         TEXT NOT NULL,
        current_phase    TEXT NOT NULL DEFAULT 'anatomical_adaptation'
          CHECK (current_phase IN (
            'anatomical_adaptation',
            'hypertrophy',
            'maximum_strength',
            'muscle_definition',
            'rest'
          )),
        current_block    INTEGER NOT NULL DEFAULT 1
          CHECK (current_block IN (1, 2)),
        phase_week       INTEGER NOT NULL DEFAULT 1,
        phase_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at       TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✓ users table ready");

    // ─── Programmes ──────────────────────────────────────────────────────────
    // Each row is one AI-generated 3-week block (or 1-week rest block).
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
    // session_type: compound (x2/week), isolation (x1/week), or extra
    // occurrence: 1 = first compound session, 2 = repeated compound session
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id             SERIAL PRIMARY KEY,
        programme_id   INTEGER REFERENCES programmes(id),
        user_id        INTEGER REFERENCES users(id),
        session_type   TEXT NOT NULL
          CHECK (session_type IN ('compound', 'isolation', 'extra')),
        occurrence     INTEGER NOT NULL DEFAULT 1,
        week_number    INTEGER NOT NULL,
        gym            TEXT NOT NULL CHECK (gym IN ('work', 'home')),
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
