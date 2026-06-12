// backend/scripts/reset-testuser.js
// Wipes all training data for testuser (user_id = 3) and resets their profile
// to a clean state as if they just registered.
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

    console.log("Resetting testuser (id=3)...\n");

    // Delete in dependency order
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
      { label: "cycles", sql: `DELETE FROM cycles WHERE user_id = $1` },
      {
        label: "one_rep_max_history",
        sql: `DELETE FROM one_rep_max_history WHERE user_id = $1`,
      },
      {
        label: "weekly_feedback",
        sql: `DELETE FROM weekly_feedback WHERE user_id = $1`,
      },
      {
        label: "body_composition",
        sql: `DELETE FROM body_composition WHERE user_id = $1`,
      },
      { label: "diet_logs", sql: `DELETE FROM diet_logs WHERE user_id = $1` },
      { label: "mood_logs", sql: `DELETE FROM mood_logs WHERE user_id = $1` },
      {
        label: "cardio_logs",
        sql: `DELETE FROM cardio_logs WHERE user_id = $1`,
      },
      { label: "exercises", sql: `DELETE FROM exercises WHERE user_id = $1` },
      { label: "plates", sql: `DELETE FROM plates WHERE user_id = $1` },
      { label: "equipment", sql: `DELETE FROM equipment WHERE user_id = $1` },
      { label: "gyms", sql: `DELETE FROM gyms WHERE user_id = $1` },
    ];

    for (const t of tables) {
      const result = await client.query(t.sql, [USER_ID]);
      console.log(`  ✓ ${t.label}: ${result.rowCount} rows deleted`);
    }

    // Reset user profile to clean state
    await client.query(
      `UPDATE users
       SET goal_size = NULL,
           goal_strength = NULL,
           goal_definition = NULL,
           goal_fitness = NULL,
           training_level = NULL,
           weekly_sessions = NULL,
           weight_exercises_per_session = 6,
           conditioning_exercises_per_session = 3,
           goal_description = NULL,
           agent_tone = 'neutral',
           current_phase = 'anatomical_adaptation',
           current_block = 1,
           phase_week = 1,
           phase_start_date = CURRENT_DATE,
           in_rest_week = FALSE
       WHERE id = $1`,
      [USER_ID],
    );
    console.log("\n  ✓ User profile reset to defaults");

    await client.query("COMMIT");
    console.log("\n✅ Testuser reset complete. Ready for fresh onboarding.");
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
