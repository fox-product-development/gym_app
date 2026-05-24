require("dotenv").config();
// backend/db/migrate_phase_week.js
// Updates users table constraints:
//   - Removes 'rest' from current_phase CHECK constraint
//   - Adds CHECK (phase_week BETWEEN 1 AND 7)
// Run once: node db/migrate_phase_week.js

const pool = require("./index");

async function migrate() {
  try {
    // Drop and recreate current_phase constraint without 'rest'
    await pool.query(
      `ALTER TABLE users
       DROP CONSTRAINT IF EXISTS users_current_phase_check`,
    );
    await pool.query(
      `ALTER TABLE users
       ADD CONSTRAINT users_current_phase_check
       CHECK (current_phase IN (
         'anatomical_adaptation',
         'hypertrophy',
         'maximum_strength',
         'muscle_definition'
       ))`,
    );
    console.log("✓ current_phase constraint updated — rest removed");

    // Add phase_week constraint
    await pool.query(
      `ALTER TABLE users
       DROP CONSTRAINT IF EXISTS users_phase_week_check`,
    );
    await pool.query(
      `ALTER TABLE users
       ADD CONSTRAINT users_phase_week_check
       CHECK (phase_week BETWEEN 1 AND 7)`,
    );
    console.log("✓ phase_week constraint updated — now 1-7");

    process.exit(0);
  } catch (err) {
    console.error("Migration error:", err);
    process.exit(1);
  }
}

migrate();
