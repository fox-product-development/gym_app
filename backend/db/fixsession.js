require("dotenv").config();
const pool = require("./index");

async function fix() {
  try {
    const result = await pool.query(
      `UPDATE sessions 
       SET status = 'planned', started_at = NULL
       WHERE user_id = 1 
         AND session_type = 'isolation' 
         AND week_number = 2
       RETURNING id, status`,
    );
    console.log("Updated:", result.rows);
    process.exit(0);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

fix();
