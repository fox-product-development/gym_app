// backend/scripts/export-active-exercises.js
// Run from backend/ folder: node scripts/export-active-exercises.js
// Exports all active exercises grouped by primary muscle, showing gym and target_weight

require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  const result = await pool.query(
    `SELECT e.exercise, e.muscles_primary, e.type, e.target_weight,
            g.gym_name, eq.equipment_name
     FROM exercises e
     LEFT JOIN gyms g ON g.id = e.gym_id
     LEFT JOIN equipment eq ON eq.id = e.equipment_id
     WHERE e.active = TRUE AND e.user_id = '1'
     ORDER BY e.muscles_primary, g.gym_name, e.exercise`,
  );

  const grouped = {};
  for (const row of result.rows) {
    const muscle = row.muscles_primary || "Unknown";
    if (!grouped[muscle]) grouped[muscle] = [];
    grouped[muscle].push(row);
  }

  for (const [muscle, exercises] of Object.entries(grouped)) {
    console.log(`\n=== ${muscle} (${exercises.length} exercises) ===`);
    for (const ex of exercises) {
      const tw = ex.target_weight !== null ? `${ex.target_weight}` : "null";
      const equip = ex.equipment_name || "bodyweight";
      console.log(
        `  ${ex.gym_name} | ${ex.exercise} | ${ex.type} | ${equip} | tw: ${tw}`,
      );
    }
  }

  console.log(`\nTotal active: ${result.rows.length}`);
  await pool.end();
}

run().catch((err) => {
  console.error("Error:", err.message);
  pool.end();
  process.exit(1);
});
