require("dotenv").config();
const { Pool } = require("pg");
const fs = require("fs");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool
  .query("SELECT * FROM exercises ORDER BY gym, type, exercise")
  .then((r) => {
    fs.writeFileSync("exercises_export.json", JSON.stringify(r.rows, null, 2));
    console.log("Done — exercises_export.json written");
    pool.end();
  })
  .catch((err) => {
    console.error(err);
    pool.end();
  });

// run with command
// node export.js
