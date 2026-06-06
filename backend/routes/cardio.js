// backend/routes/cardio.js
// Cardio logging routes — log and retrieve non-gym cardio activity.

const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware");
const Anthropic = require("@anthropic-ai/sdk");

const router = express.Router();
const anthropic = new Anthropic();

// ─── Log a cardio entry ───────────────────────────────────────────────────────
// POST /cardio
// Saves a cardio activity entry.

router.post("/", requireAuth, async (req, res) => {
  const {
    activity_type,
    duration_minutes,
    distance_km,
    avg_heart_rate,
    calories,
    avg_pace_seconds,
    notes,
    logged_at,
  } = req.body;

  if (!activity_type || !duration_minutes) {
    return res.status(400).json({
      error: "activity_type and duration_minutes are required",
    });
  }

  if (duration_minutes < 1) {
    return res.status(400).json({
      error: "duration_minutes must be at least 1",
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO cardio_logs
         (user_id, activity_type, duration_minutes, distance_km,
          avg_heart_rate, calories, avg_pace_seconds, notes, logged_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::date, CURRENT_DATE))
       RETURNING *`,
      [
        req.userId,
        activity_type,
        duration_minutes,
        distance_km || null,
        avg_heart_rate || null,
        calories || null,
        avg_pace_seconds || null,
        notes || null,
        logged_at || null,
      ],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Cardio log error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Get recent cardio entries ────────────────────────────────────────────────
// GET /cardio?weeks=4
// Returns the last N weeks of cardio entries.

router.get("/", requireAuth, async (req, res) => {
  const weeks = parseInt(req.query.weeks) || 4;

  try {
    const result = await pool.query(
      `SELECT * FROM cardio_logs
       WHERE user_id = $1
         AND logged_at >= CURRENT_DATE - INTERVAL '${weeks} weeks'
       ORDER BY logged_at DESC`,
      [req.userId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Cardio fetch error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Update a cardio entry ────────────────────────────────────────────────────
// PUT /cardio/:id
// Edits an existing cardio entry.

router.put("/:id", requireAuth, async (req, res) => {
  const {
    activity_type,
    duration_minutes,
    distance_km,
    avg_heart_rate,
    calories,
    avg_pace_seconds,
    notes,
  } = req.body;

  if (!activity_type || !duration_minutes) {
    return res.status(400).json({
      error: "activity_type and duration_minutes are required",
    });
  }

  if (duration_minutes < 1) {
    return res.status(400).json({
      error: "duration_minutes must be at least 1",
    });
  }

  try {
    const result = await pool.query(
      `UPDATE cardio_logs
       SET activity_type    = $1,
           duration_minutes = $2,
           distance_km      = $3,
           avg_heart_rate   = $4,
           calories         = $5,
           avg_pace_seconds = $6,
           notes            = $7
       WHERE id = $8 AND user_id = $9
       RETURNING *`,
      [
        activity_type,
        duration_minutes,
        distance_km || null,
        avg_heart_rate || null,
        calories || null,
        avg_pace_seconds || null,
        notes || null,
        req.params.id,
        req.userId,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Entry not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Cardio update error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Delete a cardio entry ────────────────────────────────────────────────────
// DELETE /cardio/:id
// Removes a cardio entry — in case of logging errors.

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM cardio_logs
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [req.params.id, req.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Entry not found" });
    }

    res.json({ deleted: true });
  } catch (err) {
    console.error("Cardio delete error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Extract cardio data from Strava screenshot ───────────────────────────────
// POST /cardio/extract-from-image
// Accepts a base64-encoded Strava activity screenshot.
// Sends it to Claude to extract activity type, duration, distance, heart rate,
// calories, pace, and AI notes.
// Returns extracted values as JSON — does NOT save anything.
// The frontend pre-fills the confirmation form before the user saves.

router.post("/extract-from-image", requireAuth, async (req, res) => {
  const { image_base64, media_type } = req.body;

  if (!image_base64 || !media_type) {
    return res.status(400).json({
      error: "image_base64 and media_type are required",
    });
  }

  const validMediaTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
  ];
  if (!validMediaTypes.includes(media_type)) {
    return res.status(400).json({
      error:
        "media_type must be one of: image/jpeg, image/png, image/webp, image/gif",
    });
  }

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type,
                data: image_base64,
              },
            },
            {
              type: "text",
              text: `This is a screenshot from the Strava app showing a completed activity summary.

Extract the following values:

1. Activity type — identify from the icon below the username:
   - Shoe icon = check the activity name and AI notes for "run" or "walk" to distinguish Running vs Walking
   - Bike icon = Cycling
   - Activity names like "Evening Run", "Morning Walk", "Evening Ride" also indicate the type
   - AI notes (e.g. "Nice run!", "Great ride!") can also confirm the type
   - If unclear, use "Other"

2. Duration — the "Moving Time" value, converted to whole minutes (e.g. "26:35" = 27 minutes, round up)

3. Distance — in kilometres with 2 decimal places (e.g. 4.01). If shown in miles, convert to km (multiply by 1.609)

4. Average heart rate — the number shown next to "Avg HR" or the heart icon (e.g. 166). Return just the number, no units

5. Calories — the number shown next to "Calories" or the flame icon (e.g. 336). Return just the number

6. Average pace — look for "Avg Pace" (running/walking, shown as min:sec /km e.g. "6:38 /km") OR "Avg Speed" (cycling, shown as km/h e.g. "24.5 km/h"):
   - If Avg Pace (running/walking): convert min:sec to total seconds (e.g. 6:38 = 6×60 + 38 = 398 seconds)
   - If Avg Speed (cycling): convert km/h to seconds per km (e.g. 24.5 km/h = 3600 ÷ 24.5 = 147 seconds, round to nearest integer)
   - Always return the value as seconds per kilometre

7. Notes — the "Athlete Intelligence" or AI-generated notes text shown on the summary (e.g. "Nice run! Your average heart rate was..."). Copy the full text exactly as shown. If no notes are visible, return null

Return ONLY this exact JSON structure, nothing else:
{
  "activity_type": "<Running|Walking|Cycling|Other>",
  "duration_minutes": <integer>,
  "distance_km": <number with 2 decimals or null>,
  "avg_heart_rate": <integer or null>,
  "calories": <integer or null>,
  "avg_pace_seconds": <integer or null>,
  "notes": "<string or null>"
}

No explanation. No markdown. No backticks.`,
            },
          ],
        },
      ],
    });

    const raw = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    const clean = raw.replace(/```json|```/g, "").trim();
    const extracted = JSON.parse(clean);

    res.json(extracted);
  } catch (err) {
    console.error("Cardio image extraction error:", err.message);
    res.status(500).json({ error: "Failed to extract data from image" });
  }
});

module.exports = router;
