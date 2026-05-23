// backend/routes/bodycomp.js
// Body composition routes — log and retrieve entries, and extract data from scale images.

const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const pool = require("../db");
const requireAuth = require("../middleware");

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Log a new entry ──────────────────────────────────────────────────────────
// POST /bodycomp
// Saves a new weight, muscle mass, and/or body fat % reading.

router.post("/", requireAuth, async (req, res) => {
  const {
    weight_kg,
    muscle_mass_kg,
    body_fat_pct,
    source = "manual",
  } = req.body;

  if (!weight_kg && !muscle_mass_kg && !body_fat_pct) {
    return res.status(400).json({
      error:
        "At least one of weight_kg, muscle_mass_kg, or body_fat_pct is required",
    });
  }

  try {
    // Check if there is already an entry for today
    const existing = await pool.query(
      `SELECT id FROM body_composition
       WHERE user_id = $1 AND logged_at = CURRENT_DATE`,
      [req.userId],
    );

    let result;

    if (existing.rows.length > 0) {
      // Update today's entry
      result = await pool.query(
        `UPDATE body_composition
         SET weight_kg      = COALESCE($1, weight_kg),
             muscle_mass_kg = COALESCE($2, muscle_mass_kg),
             body_fat_pct   = COALESCE($3, body_fat_pct),
             source         = $4
         WHERE user_id = $5 AND logged_at = CURRENT_DATE
         RETURNING *`,
        [weight_kg, muscle_mass_kg, body_fat_pct, source, req.userId],
      );
    } else {
      // Create a new entry
      result = await pool.query(
        `INSERT INTO body_composition (user_id, weight_kg, muscle_mass_kg, body_fat_pct, source)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [req.userId, weight_kg, muscle_mass_kg, body_fat_pct, source],
      );
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Body comp log error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Get recent entries ───────────────────────────────────────────────────────
// GET /bodycomp?weeks=12
// Returns the last N weeks of body composition entries.

router.get("/", requireAuth, async (req, res) => {
  const weeks = parseInt(req.query.weeks) || 12;

  try {
    const result = await pool.query(
      `SELECT * FROM body_composition
       WHERE user_id = $1
         AND logged_at >= CURRENT_DATE - INTERVAL '${weeks} weeks'
       ORDER BY logged_at ASC`,
      [req.userId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Body comp fetch error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Extract body comp from image ─────────────────────────────────────────────
// POST /bodycomp/extract-from-image
// Accepts a base64-encoded image of a smart scale screen.
// Sends it to Claude to extract weight, muscle mass, and body fat %.
// Returns the extracted values as JSON for the frontend to pre-fill the form.
// The frontend must still confirm and submit — this route does not save anything.

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
      max_tokens: 256,
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
              text: `This is a screenshot from a smart body composition scale app.

Extract the following three values from the screen:
- Weight in kg (look for the largest number, usually labelled "Weight")
- Muscle mass in kg (look for "Muscle Mass" or "Skeletal Muscle Mass")
- Body fat percentage (look for "Body Fat" — return the number only, not the % symbol)

Return ONLY this exact JSON structure, nothing else:
{
  "weight_kg": <number or null if not found>,
  "muscle_mass_kg": <number or null if not found>,
  "body_fat_pct": <number or null if not found>
}

No explanation. No markdown. Numbers only, no units in the values.`,
            },
          ],
        },
      ],
    });

    const rawText = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    const cleanText = rawText.replace(/```json|```/g, "").trim();
    const extracted = JSON.parse(cleanText);

    res.json(extracted);
  } catch (err) {
    console.error("Image extraction error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
