// backend/scripts/drop-legacy-columns.js
// Migration: drop legacy columns that have been replaced by FK relationships.
//
// Columns being dropped:
//   exercises.equipment_type  — replaced by equipment_id FK
//   exercises.gym             — replaced by gym_id FK
//   exercises.one_rep_max     — nothing writes to it; informational column now orphaned
//   sessions.gym              — replaced by gym_id FK
//
// Run AFTER deploying updated backend code (sessions.js, ai.js, gyms.js).
// Running before code deploy will cause errors on any live requests during the window.
//
// Usage:
//   node backend/scripts/drop-legacy-columns.js

require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    console.log("Dropping exercises.equipment_type...");
    await client.query(
      `ALTER TABLE exercises DROP COLUMN IF EXISTS equipment_type`,
    );

    console.log("Dropping exercises.gym...");
    await client.query(`ALTER TABLE exercises DROP COLUMN IF EXISTS gym`);

    console.log("Dropping exercises.one_rep_max...");
    await client.query(
      `ALTER TABLE exercises DROP COLUMN IF EXISTS one_rep_max`,
    );

    console.log("Dropping sessions.gym...");
    await client.query(`ALTER TABLE sessions DROP COLUMN IF EXISTS gym`);

    await client.query("COMMIT");
    console.log("Migration complete — all 4 legacy columns dropped.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed, rolled back:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
