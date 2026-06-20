// backend/scripts/reset-testuser.js
// Wipes training/programme data for testuser (user_id = 3) and resets their
// phase position to the start of the cycle. Does NOT touch gyms, equipment,
// or exercises — those are assumed already set up and are left intact.
//
// Usage (from backend/ directory):
//   node scripts/reset-testuser.js

require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const USER_ID = 3;

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    console.log("Resetting testuser (id=3) training data...\n");

    const tables = [
      {
        label: "logged_sets",
        sql: `DELETE FROM logged_sets WHERE session_id IN (SELECT id FROM sessions WHERE user_id = $1)`,
      },
      {
        label: "planned_exercises",
        sql: `DELETE FROM planned_exercises WHERE session_id IN (SELECT id FROM sessions WHERE user_id = $1)`,
      },
      { label: "sessions", sql: `DELETE FROM sessions WHERE user_id = $1` },
      { label: "programmes", sql: `DELETE FROM programmes WHERE user_id = $1` },
      {
        label: "one_rep_max_history",
        sql: `DELETE FROM one_rep_max_history WHERE user_id = $1`,
      },
      {
        label: "weekly_feedback",
        sql: `DELETE FROM weekly_feedback WHERE user_id = $1`,
      },
    ];

    for (const t of tables) {
      const result = await client.query(t.sql, [USER_ID]);
      console.log(`  ✓ ${t.label}: ${result.rowCount} rows deleted`);
    }

    // Reset phase position to the start of the cycle. Only touches columns
    // that exist on the current users table.
    await client.query(
      `UPDATE users
       SET current_phase = 'anatomical_adaptation',
           cycle_position = 0,
           phase_week = 1,
           phase_start_date = CURRENT_DATE
       WHERE id = $1`,
      [USER_ID],
    );
    console.log("\n  ✓ User phase position reset to cycle start");

    await client.query("COMMIT");
    console.log("\n✅ Testuser training data reset complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Reset failed, rolled back:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
