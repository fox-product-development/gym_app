// backend/scripts/migrate-simplify-users-table.js
// Drops columns on the users table that are now redundant following the
// phaseConfig.js / cycleConfig.js rebuild. The app uses a fixed, predefined
// cycle and phase loadout per user (keyed by the user's existing id column,
// not a separate level/key field) — so the level/goal/cycle-definition
// columns below are no longer read anywhere and can be removed.
//
// Run from backend/ folder: node scripts/migrate-simplify-users-table.js

require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Columns being dropped, with the reason each is now redundant:
//   current_block                    — blocks removed; phaseConfig is keyed by week, not block
//   phase_cycle                      — superseded by cycleConfig.js (code-defined, not per-user DB jsonb)
//   goal_size                        — no goal-weighted cycle proposal logic exists; cycle is predetermined
//   goal_strength                    — same as above
//   goal_definition                  — same as above
//   goal_fitness                     — same as above
//   training_level                   — phaseConfig.js no longer has a level dimension; keyed by user id instead
//   weekly_sessions                  — sessions/week is now defined per phase in cycleConfig.js, not per user
//   goal_description                 — no AI cycle-proposal logic reads this; not used by the new model
//   weight_exercises_per_session     — exercise count is now phase-determined in code (ai.js), not user-configurable
//   in_rest_week                     — superseded by current_phase = 'transition' check
//
// Columns kept, with reason:
//   id, username                     — id is now the user key referenced directly by phaseConfig.js
//   current_phase                    — displayed in the app
//   phase_week                       — displayed in the app
//   phase_start_date                 — date tracking, kept
//   conditioning_exercises_per_session — conditioning exercises remain additional to phase-defined weight exercises
//   cycle_position                   — set by the earlier migration, still required by cron/ai.js

const COLUMNS_TO_DROP = [
  "current_block",
  "phase_cycle",
  "goal_size",
  "goal_strength",
  "goal_definition",
  "goal_fitness",
  "training_level",
  "weekly_sessions",
  "goal_description",
  "weight_exercises_per_session",
  "in_rest_week",
];

async function run() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const column of COLUMNS_TO_DROP) {
      console.log(`Dropping users.${column}...`);
      await client.query(`ALTER TABLE users DROP COLUMN IF EXISTS ${column}`);
    }

    await client.query("COMMIT");

    console.log("\nMigration complete. Columns dropped:");
    COLUMNS_TO_DROP.forEach((c) => console.log(`  - ${c}`));
    console.log(
      "\nColumns kept: id, username, current_phase, phase_week, " +
        "phase_start_date, conditioning_exercises_per_session, cycle_position",
    );
    console.log(
      "\nReminder: any code still referencing the dropped columns (old " +
        "ai.js, cron.js, frontend settings/onboarding screens) must be " +
        "updated before this migration runs against a live environment, " +
        "or those code paths will start erroring on missing columns.",
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
