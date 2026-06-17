// export-exercises.js
// Run from backend/ folder: node export-exercises.js
// Requires DATABASE_URL in .env or environment

require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  try {
    const result = await pool.query(`
      SELECT e.id, e.exercise, e.muscles_primary, e.sub_component, e.type,
             e.active, e.target_weight, g.gym_name,
             eq.equipment_name
      FROM exercises e
      LEFT JOIN gyms g ON g.id = e.gym_id
      LEFT JOIN equipment eq ON eq.id = e.equipment_id
      WHERE e.user_id = 1
      ORDER BY g.gym_name, e.muscles_primary, e.exercise
    `);

    // Print as a readable table
    console.log(
      [
        "id",
        "exercise",
        "muscles_primary",
        "sub_component",
        "type",
        "active",
        "target_weight",
        "gym",
        "equipment",
      ].join("\t"),
    );
    console.log("-".repeat(160));

    for (const row of result.rows) {
      console.log(
        [
          row.id,
          row.exercise,
          row.muscles_primary,
          row.sub_component || "-",
          row.type,
          row.active,
          row.target_weight ?? "null",
          row.gym_name || "-",
          row.equipment_name || "bodyweight",
        ].join("\t"),
      );
    }

    console.log(`\n--- Total: ${result.rows.length} exercises ---`);
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await pool.end();
  }
}

run();
