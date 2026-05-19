// backend/index.js
// Main entry point for the GymApp backend API.
// Sets up Express, middleware, and routes.

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────

// Allow requests from the app
app.use(cors());

// Parse incoming JSON request bodies
app.use(express.json());

// ─── Health check ─────────────────────────────────────────────────────────────
// A simple endpoint to confirm the server is running.
// Railway also uses this to check the service is healthy.

app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "GymApp API is running" });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
// We will add routes here as we build each feature.

// ─── Start server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`GymApp API running on port ${PORT}`);
});
