// backend/scripts/populate-testuser.js
// Populates testuser (user_id = 3) with goals and a gym setup so they can
// skip onboarding and gym setup during testing. Run after reset-testuser.js.
//
// Sets up:
//   - Goal ratings and training preferences
//   - "Test gym" with default flag
//   - Dumbbell (fixed, 2kg increment, 50kg max)
//   - Cable (machine, 1kg increment, 100kg max)
//
// Usage (from backend/ directory):
//   node scripts/populate-testuser.js

require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const USER_ID = 3;

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    console.log("Populating testuser (id=3)...\n");

    // 1. Set goals and training preferences
    await client.query(
      `UPDATE users
       SET goal_size = 3,
           goal_strength = 3,
           goal_definition = 5,
           goal_fitness = 5,
           training_level = 'serious',
           weekly_sessions = 4,
           weight_exercises_per_session = 7,
           conditioning_exercises_per_session = 3,
           goal_description = NULL,
           agent_tone = 'neutral'
       WHERE id = $1`,
      [USER_ID],
    );
    console.log("  ✓ Goals and preferences set");

    // 2. Check if gym already exists (idempotent)
    const existingGym = await client.query(
      `SELECT id FROM gyms WHERE user_id = $1 AND gym_name = 'Test gym'`,
      [USER_ID],
    );

    let gymId;
    if (existingGym.rows.length > 0) {
      gymId = existingGym.rows[0].id;
      console.log(`  ✓ Gym already exists (id=${gymId})`);
    } else {
      // Clear any default flag on other gyms first
      await client.query(
        `UPDATE gyms SET is_default = FALSE WHERE user_id = $1`,
        [USER_ID],
      );

      const gymResult = await client.query(
        `INSERT INTO gyms (user_id, gym_name, is_default)
         VALUES ($1, 'Test gym', TRUE)
         RETURNING id`,
        [USER_ID],
      );
      gymId = gymResult.rows[0].id;
      console.log(`  ✓ Gym created (id=${gymId})`);
    }

    // 3. Add equipment (skip if already exists for this gym)
    const equipmentDefs = [
      {
        equipment_name: "dumbbell",
        type: "fixed",
        unladen_weight: null,
        increment: 2,
        max_weight: 50,
        unit: "kg",
      },
      {
        equipment_name: "Cable",
        type: "machine",
        unladen_weight: null,
        increment: 1,
        max_weight: 100,
        unit: "kg",
      },
    ];

    for (const eq of equipmentDefs) {
      const existing = await client.query(
        `SELECT id FROM equipment
         WHERE user_id = $1 AND gym_id = $2 AND equipment_name = $3`,
        [USER_ID, gymId, eq.equipment_name],
      );

      if (existing.rows.length > 0) {
        console.log(`  ✓ Equipment "${eq.equipment_name}" already exists`);
      } else {
        await client.query(
          `INSERT INTO equipment
             (user_id, gym_id, equipment_name, type, unladen_weight, increment, max_weight, unit)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            USER_ID,
            gymId,
            eq.equipment_name,
            eq.type,
            eq.unladen_weight,
            eq.increment,
            eq.max_weight,
            eq.unit,
          ],
        );
        console.log(`  ✓ Equipment "${eq.equipment_name}" created`);
      }
    }

    await client.query("COMMIT");
    console.log("\n✅ Testuser populated. Goals set, gym and equipment ready.");
    console.log(
      "   Login will skip onboarding and go to cycle editor (no active cycle).",
    );
    console.log("   Or set up a cycle manually to go straight to dashboard.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Populate failed, rolled back:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
