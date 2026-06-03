// backend/routes/diet.js
// Diet logging routes — log daily macros and extract from Nutra Check screenshots.

const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const pool = require("../db");
const requireAuth = require("../middleware");

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Log a diet entry ─────────────────────────────────────────────────────────
// POST /diet
// Saves or updates today's macro breakdown.

router.post("/", requireAuth, async (req, res) => {
  const {
    calories_kcal,
    fat_g,
    saturated_fat_g,
    carbs_g,
    sugar_g,
    fibre_g,
    protein_g,
    salt_g,
    source = "manual",
  } = req.body;

  if (!calories_kcal && !protein_g) {
    return res.status(400).json({
      error: "At least calories_kcal or protein_g is required",
    });
  }

  try {
    const existing = await pool.query(
      `SELECT id FROM diet_logs
       WHERE user_id = $1 AND logged_at = CURRENT_DATE`,
      [req.userId],
    );

    let result;

    if (existing.rows.length > 0) {
      result = await pool.query(
        `UPDATE diet_logs
         SET calories_kcal   = COALESCE($1, calories_kcal),
             fat_g           = COALESCE($2, fat_g),
             saturated_fat_g = COALESCE($3, saturated_fat_g),
             carbs_g         = COALESCE($4, carbs_g),
             sugar_g         = COALESCE($5, sugar_g),
             fibre_g         = COALESCE($6, fibre_g),
             protein_g       = COALESCE($7, protein_g),
             salt_g          = COALESCE($8, salt_g),
             source          = $9
         WHERE user_id = $10 AND logged_at = CURRENT_DATE
         RETURNING *`,
        [
          calories_kcal,
          fat_g,
          saturated_fat_g,
          carbs_g,
          sugar_g,
          fibre_g,
          protein_g,
          salt_g,
          source,
          req.userId,
        ],
      );
    } else {
      result = await pool.query(
        `INSERT INTO diet_logs
           (user_id, calories_kcal, fat_g, saturated_fat_g, carbs_g,
            sugar_g, fibre_g, protein_g, salt_g, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          req.userId,
          calories_kcal,
          fat_g,
          saturated_fat_g,
          carbs_g,
          sugar_g,
          fibre_g,
          protein_g,
          salt_g,
          source,
        ],
      );
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Diet log error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Get recent diet entries ──────────────────────────────────────────────────
// GET /diet?weeks=4
// Returns the last N weeks of diet entries.

router.get("/", requireAuth, async (req, res) => {
  const weeks = parseInt(req.query.weeks) || 4;

  try {
    const result = await pool.query(
      `SELECT * FROM diet_logs
       WHERE user_id = $1
         AND logged_at >= CURRENT_DATE - INTERVAL '${weeks} weeks'
       ORDER BY logged_at ASC`,
      [req.userId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Diet fetch error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Extract diet from image ──────────────────────────────────────────────────
// POST /diet/extract-from-image
// Accepts a base64-encoded Nutra Check screenshot.
// Returns extracted macro values for the frontend to pre-fill the form.
// Does not save anything — frontend must confirm and submit.

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
              text: `This is a screenshot from the Nutra Check food diary app showing daily nutrition totals.

Extract the following values from the screen:
- Calories (kcal) — the total daily calories
- Fat (g)
- Saturated fat (g)
- Carbohydrates (g)
- Sugar (g)
- Fibre (g)
- Protein (g)
- Salt (g)

Return ONLY this exact JSON structure, nothing else:
{
  "calories_kcal": <number or null if not found>,
  "fat_g": <number or null if not found>,
  "saturated_fat_g": <number or null if not found>,
  "carbs_g": <number or null if not found>,
  "sugar_g": <number or null if not found>,
  "fibre_g": <number or null if not found>,
  "protein_g": <number or null if not found>,
  "salt_g": <number or null if not found>
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
    console.error("Diet image extraction error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
