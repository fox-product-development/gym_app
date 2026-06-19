// backend/scripts/migrate-bompa-redesign.js
// Additive-only migration for the Bompa redesign. Adds new columns required
// by the new phase/cycle model. Does NOT remove old columns (current_block,
// block_number, occurrence) — those are removed in a separate follow-up
// script once all code referencing them has been deployed.
//
// Run from backend/ folder: node scripts/migrate-bompa-redesign.js

require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Mike's starting position in the new 52-week cycle: index 12 (the
// temporary Hypertrophy entry standing in for Muscle Definition).
// phase_week is intentionally NOT reset here — it should already reflect
// his current week within this H run. Confirm the existing value is
// correct before running this script.
const MIKE_CYCLE_POSITION = 12;

async function run() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    console.log("Adding cycle_position to users...");
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS cycle_position INTEGER NOT NULL DEFAULT 0
    `);

    console.log("Adding total_weeks to programmes...");
    await client.query(`
      ALTER TABLE programmes
      ADD COLUMN IF NOT EXISTS total_weeks INTEGER
    `);

    console.log("Adding is_1rm_test to sessions...");
    await client.query(`
      ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS is_1rm_test BOOLEAN NOT NULL DEFAULT FALSE
    `);

    console.log("Adding group_id to planned_exercises...");
    await client.query(`
      ALTER TABLE planned_exercises
      ADD COLUMN IF NOT EXISTS group_id INTEGER
    `);

    console.log(
      `Setting cycle_position = ${MIKE_CYCLE_POSITION} for existing users...`,
    );
    const userUpdate = await client.query(
      `UPDATE users SET cycle_position = $1 RETURNING id, phase_week, current_phase`,
      [MIKE_CYCLE_POSITION],
    );
    for (const row of userUpdate.rows) {
      console.log(
        `  user ${row.id}: cycle_position=${MIKE_CYCLE_POSITION}, phase_week=${row.phase_week} (unchanged), current_phase=${row.current_phase}`,
      );
    }

    console.log("Fixing muscles_primary: 'Quadriceps' -> 'Quads'...");
    const quadFix = await client.query(`
      UPDATE exercises
      SET muscles_primary = 'Quads'
      WHERE muscles_primary = 'Quadriceps'
      RETURNING id, exercise
    `);
    for (const row of quadFix.rows) {
      console.log(`  fixed exercise ${row.id}: ${row.exercise}`);
    }

    await client.query("COMMIT");
    console.log("\nMigration complete. No columns were removed.");
    console.log(
      "Reminder: current_block, block_number, and occurrence still exist " +
        "and are unused by new code paths once deployed. Remove them in a " +
        "separate follow-up script after deployment is verified.",
    );
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed, rolled back:", err.message);
    throw err;
  } finally {
    client.release();
  }
}

run()
  .then(() => pool.end())
  .catch((err) => {
    console.error("Error:", err.message);
    pool.end();
    process.exit(1);
  });
