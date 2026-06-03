// backend/routes/auth.js
// Authentication routes — register and login.

require("dotenv").config();
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../db");

const router = express.Router();
const SALT_ROUNDS = 10;

// ─── Register ─────────────────────────────────────────────────────────────────
// POST /auth/register
// Creates a new user account. Email must be on the approved_emails list.

router.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res
      .status(400)
      .json({ error: "Username, email and password are required" });
  }

  if (password.length < 8) {
    return res
      .status(400)
      .json({ error: "Password must be at least 8 characters" });
  }

  try {
    // Check email is on the approved list and hasn't been used
    const approved = await pool.query(
      "SELECT id, used FROM approved_emails WHERE email = $1",
      [email.toLowerCase()],
    );

    if (approved.rows.length === 0) {
      return res
        .status(403)
        .json({ error: "This email address is not approved for registration" });
    }

    if (approved.rows[0].used) {
      return res
        .status(409)
        .json({ error: "An account already exists for this email address" });
    }

    // Check username is available
    const existing = await pool.query(
      "SELECT id FROM users WHERE username = $1",
      [username],
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Username already taken" });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Create the user
    const result = await pool.query(
      `INSERT INTO users (username, email, password)
       VALUES ($1, $2, $3)
       RETURNING id, username, email, is_admin, current_phase, current_block, phase_week, phase_start_date`,
      [username, email.toLowerCase(), hashedPassword],
    );

    const user = result.rows[0];

    // Mark the approved email as used
    await pool.query(
      "UPDATE approved_emails SET used = TRUE WHERE email = $1",
      [email.toLowerCase()],
    );

    // Create a token
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "30d" },
    );

    res.status(201).json({ token, user });
  } catch (err) {
    console.error("Register error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Login ────────────────────────────────────────────────────────────────────
// POST /auth/login
// Logs in an existing user and returns a token.

router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Username and password are required" });
  }

  try {
    // Find the user
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [
      username,
    ]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const user = result.rows[0];

    // Check the password
    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // Create a token
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "30d" },
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        is_admin: user.is_admin,
        current_phase: user.current_phase,
        current_block: user.current_block,
        phase_week: user.phase_week,
        phase_start_date: user.phase_start_date,
      },
    });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
