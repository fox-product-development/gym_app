// backend/index.js
// Main entry point for the GymApp backend API.
// Sets up Express, middleware, and routes.

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const db = require("./db");
const { runSundayReport } = require("./cron");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────

// Allow requests from the app
app.use(cors());

// Parse incoming JSON request bodies
app.use(express.json({ limit: "10mb" }));

// ─── Health check ─────────────────────────────────────────────────────────────
// A simple endpoint to confirm the server is running.
// Railway also uses this to check the service is healthy.

app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "GymApp API is running" });
});

// ─── Routes ───────────────────────────────────────────────────────────────────

const authRoutes = require("./routes/auth");
app.use("/auth", authRoutes);

const bodyCompRoutes = require("./routes/bodycomp");
app.use("/bodycomp", bodyCompRoutes);

const sessionRoutes = require("./routes/sessions");
app.use("/sessions", sessionRoutes);

const aiRoutes = require("./routes/ai");
app.use("/ai", aiRoutes);

const oneRepMaxRoutes = require("./routes/onerepmax");
app.use("/onerepmax", oneRepMaxRoutes);

const userRoutes = require("./routes/user");
app.use("/user", userRoutes);

const reportRoutes = require("./routes/report");
app.use("/report", reportRoutes);

const bridgeRoutes = require("./routes/bridge");
app.use("/bridge", bridgeRoutes);

const dietRoutes = require("./routes/diet");
app.use("/diet", dietRoutes);

const moodRoutes = require("./routes/mood");
app.use("/mood", moodRoutes);

const cardioRoutes = require("./routes/cardio");
app.use("/cardio", cardioRoutes);

const gymRoutes = require("./routes/gyms");
app.use("/gyms", gymRoutes);

const cyclesRouter = require("./routes/cycles");
app.use("/cycles", cyclesRouter);

// ─── Scheduled jobs ───────────────────────────────────────────────────────────

// Sunday at 8PM — generate weekly coaching report and advance phase week
cron.schedule("30 22 * * 0", () => {
  console.log("Triggering Sunday report via node-cron...");
  runSundayReport(false);
});

// ─── Start server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`GymApp API running on port ${PORT}`);
});
