require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ─── Deactivate Home Gym exercises (gym_id = 2) ────────────────────────
    const homeExercises = [
      "Single Arm Dumbbell Row",
      "Incline Dumbbell Curl",
      "EZ Bar Preacher Curl",
      "Dumbbell Chest Fly",
      "Dumbbell Front Raise",
      "Dumbbell Step Back Lunge",
      "Dumbbell Sumo Squat",
      "Dumbbell Arnold Press",
      "Dumbbell Shrug",
      "Dumbbell Tricep Kickback",
      "EZ Bar Close Grip Bench Press",
    ];

    for (const name of homeExercises) {
      const res = await client.query(
        `UPDATE exercises SET active = false WHERE exercise = $1 AND gym_id = 2 AND active = true`,
        [name],
      );
      if (res.rowCount > 0) {
        console.log(`✓ Deactivated (home): ${name}`);
      } else {
        console.log(`⚠ Not found or already inactive (home): ${name}`);
      }
    }

    // ─── Deactivate Work Gym exercises (gym_id = 1) ────────────────────────
    const workExercises = [
      "Dumbbell Bent Over Row",
      "Single Arm Dumbbell Row",
      "Dumbbell Curl",
      "Decline Dumbbell Press",
      "Incline Dumbbell Press",
      "Incline Russian Twist",
      "Dumbbell Lateral Raise",
      "Dumbbell Rear Delt Fly",
      "Flutter Kicks",
    ];

    for (const name of workExercises) {
      const res = await client.query(
        `UPDATE exercises SET active = false WHERE exercise = $1 AND gym_id = 1 AND active = true`,
        [name],
      );
      if (res.rowCount > 0) {
        console.log(`✓ Deactivated (work): ${name}`);
      } else {
        console.log(`⚠ Not found or already inactive (work): ${name}`);
      }
    }

    // ─── Rename Home Gym exercise ──────────────────────────────────────────
    const renameRes = await client.query(
      `UPDATE exercises SET exercise = 'Dumbbell Deadlift' WHERE exercise = 'Dumbbell Stiff Leg Deadlift' AND gym_id = 2`,
    );
    if (renameRes.rowCount > 0) {
      console.log(
        `✓ Renamed: "Dumbbell Stiff Leg Deadlift" → "Dumbbell Deadlift" (home)`,
      );
    } else {
      console.log(
        `⚠ Rename target not found (home): "Dumbbell Stiff Leg Deadlift"`,
      );
    }

    // ─── Delete Flutter Kicks from conditioning ────────────────────────────
    const condRes = await client.query(
      `DELETE FROM conditioning WHERE exercise = 'Flutter Kicks'`,
    );
    if (condRes.rowCount > 0) {
      console.log(`✓ Deleted from conditioning: Flutter Kicks`);
    } else {
      console.log(`⚠ Not found in conditioning: Flutter Kicks`);
    }

    await client.query("COMMIT");
    console.log("\n✅ All changes committed");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error — rolled back:", err.message);
  } finally {
    client.release();
    pool.end();
  }
}

run();
