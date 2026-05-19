require("dotenv").config();
// backend/db/schema.js
// Creates all database tables if they don't already exist.
// Run this once to set up the database: node db/schema.js

const pool = require("./index");

async function createTables() {
  try {
    // ─── User ────────────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id          SERIAL PRIMARY KEY,
        username    TEXT NOT NULL UNIQUE,
        password    TEXT NOT NULL,
        current_goal TEXT NOT NULL DEFAULT 'size'
          CHECK (current_goal IN ('maintain', 'trim', 'size', 'strength')),
        current_gym TEXT NOT NULL DEFAULT 'work'
          CHECK (current_gym IN ('work', 'home')),
        goal_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at  TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✓ users table ready");

    // ─── Programmes ──────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS programmes (
        id           SERIAL PRIMARY KEY,
        user_id      INTEGER REFERENCES users(id),
        week_number  INTEGER NOT NULL,
        goal         TEXT NOT NULL,
        week_start   DATE NOT NULL,
        created_at   TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✓ programmes table ready");

    // ─── Sessions ────────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id           SERIAL PRIMARY KEY,
        programme_id INTEGER REFERENCES programmes(id),
        user_id      INTEGER REFERENCES users(id),
        date         DATE NOT NULL,
        gym          TEXT NOT NULL CHECK (gym IN ('work', 'home')),
        day_focus    TEXT NOT NULL,
        status       TEXT NOT NULL DEFAULT 'planned'
          CHECK (status IN ('planned', 'in_progress', 'complete')),
        notes        TEXT,
        started_at   TIMESTAMP,
        completed_at TIMESTAMP,
        created_at   TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✓ sessions table ready");

    // ─── Planned exercises ───────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS planned_exercises (
        id              SERIAL PRIMARY KEY,
        session_id      INTEGER REFERENCES sessions(id),
        exercise_name   TEXT NOT NULL,
        order_index     INTEGER NOT NULL,
        warmup_sets     JSONB,
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
        logged_at       DATE NOT NULL DEFAULT CURRENT_DATE,
        source          TEXT DEFAULT 'manual'
          CHECK (source IN ('manual', 'apple_health')),
        created_at      TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✓ body_composition table ready");

    // ─── Weekly feedback ──────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS weekly_feedback (
        id                    SERIAL PRIMARY KEY,
        user_id               INTEGER REFERENCES users(id),
        week_start_date       DATE NOT NULL,
        ai_summary            TEXT,
        deload_recommended    BOOLEAN DEFAULT FALSE,
        phase_change_recommended BOOLEAN DEFAULT FALSE,
        phase_change_suggestion TEXT,
        created_at            TIMESTAMP DEFAULT NOW()
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
