// backend/routes/gyms.js
// Gym, equipment, and plate management routes.

const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware");

const router = express.Router();

// ─── Gyms ─────────────────────────────────────────────────────────────────────

router.get("/", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM gyms WHERE user_id = $1 ORDER BY is_default DESC, gym_name ASC`,
      [req.userId],
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Get gyms error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  const { gym_name, is_default = false } = req.body;

  if (!gym_name) {
    return res.status(400).json({ error: "gym_name is required" });
  }

  try {
    // If this is the user's first gym, auto-set it as default
    const existingGyms = await pool.query(
      `SELECT id FROM gyms WHERE user_id = $1`,
      [req.userId],
    );
    const shouldBeDefault = is_default || existingGyms.rows.length === 0;

    if (shouldBeDefault) {
      await pool.query(
        `UPDATE gyms SET is_default = FALSE WHERE user_id = $1`,
        [req.userId],
      );
    }

    const result = await pool.query(
      `INSERT INTO gyms (user_id, gym_name, is_default)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.userId, gym_name, shouldBeDefault],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Create gym error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/:id", requireAuth, async (req, res) => {
  const { gym_name, is_default } = req.body;

  try {
    if (is_default) {
      await pool.query(
        `UPDATE gyms SET is_default = FALSE WHERE user_id = $1`,
        [req.userId],
      );
    }

    const result = await pool.query(
      `UPDATE gyms
       SET gym_name   = COALESCE($1, gym_name),
           is_default = COALESCE($2, is_default)
       WHERE id = $3 AND user_id = $4
       RETURNING *`,
      [gym_name, is_default, req.params.id, req.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Gym not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Update gym error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    await pool.query(`DELETE FROM plates WHERE gym_id = $1 AND user_id = $2`, [
      req.params.id,
      req.userId,
    ]);
    await pool.query(
      `DELETE FROM equipment WHERE gym_id = $1 AND user_id = $2`,
      [req.params.id, req.userId],
    );
    await pool.query(`DELETE FROM gyms WHERE id = $1 AND user_id = $2`, [
      req.params.id,
      req.userId,
    ]);
    res.json({ deleted: true });
  } catch (err) {
    console.error("Delete gym error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Equipment ────────────────────────────────────────────────────────────────

router.get("/:gymId/equipment", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM equipment
       WHERE gym_id = $1 AND user_id = $2
       ORDER BY type ASC, equipment_name ASC`,
      [req.params.gymId, req.userId],
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Get equipment error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/:gymId/equipment", requireAuth, async (req, res) => {
  const { equipment_name, type, unladen_weight, increment, max_weight, unit } =
    req.body;
  if (!equipment_name || !type) {
    return res
      .status(400)
      .json({ error: "equipment_name and type are required" });
  }

  const validTypes = ["loadable", "fixed", "machine", "apparatus"];
  if (!validTypes.includes(type)) {
    return res
      .status(400)
      .json({ error: "type must be loadable, fixed, machine, or apparatus" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO equipment
         (user_id, gym_id, equipment_name, type, unladen_weight, increment, max_weight, unit)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        req.userId,
        req.params.gymId,
        equipment_name,
        type,
        unladen_weight || null,
        increment || null,
        max_weight || null,
        unit || "kg",
      ],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Create equipment error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/:gymId/equipment/:id", requireAuth, async (req, res) => {
  const { equipment_name, type, unladen_weight, increment, max_weight, unit } =
    req.body;
  try {
    const result = await pool.query(
      `UPDATE equipment
       SET equipment_name = COALESCE($1, equipment_name),
           type           = COALESCE($2, type),
           unladen_weight = COALESCE($3, unladen_weight),
           increment      = COALESCE($4, increment),
           max_weight     = COALESCE($5, max_weight),
           unit           = COALESCE($6, unit)
       WHERE id = $7 AND gym_id = $8 AND user_id = $9
       RETURNING *`,
      [
        equipment_name,
        type,
        unladen_weight,
        increment,
        max_weight,
        unit,
        req.params.id,
        req.params.gymId,
        req.userId,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Equipment not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Update equipment error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/:gymId/equipment/:id", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM equipment
       WHERE id = $1 AND gym_id = $2 AND user_id = $3
       RETURNING id`,
      [req.params.id, req.params.gymId, req.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Equipment not found" });
    }

    res.json({ deleted: true });
  } catch (err) {
    console.error("Delete equipment error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Plates ───────────────────────────────────────────────────────────────────

router.get("/:gymId/plates", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM plates
       WHERE gym_id = $1 AND user_id = $2
       ORDER BY weight ASC`,
      [req.params.gymId, req.userId],
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Get plates error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/:gymId/plates", requireAuth, async (req, res) => {
  const { weight, quantity } = req.body;

  if (!weight || quantity === undefined) {
    return res.status(400).json({ error: "weight and quantity are required" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO plates (user_id, gym_id, weight, quantity)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.userId, req.params.gymId, weight, quantity],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Create plate error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/:gymId/plates", requireAuth, async (req, res) => {
  const { plates } = req.body;

  if (!plates || !Array.isArray(plates)) {
    return res.status(400).json({ error: "plates array is required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const plate of plates) {
      await client.query(
        `UPDATE plates SET quantity = $1
         WHERE id = $2 AND gym_id = $3 AND user_id = $4`,
        [plate.quantity, plate.id, req.params.gymId, req.userId],
      );
    }
    await client.query("COMMIT");
    res.json({ saved: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Update plates error:", err.message);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});

router.delete("/:gymId/plates/:id", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM plates
       WHERE id = $1 AND gym_id = $2 AND user_id = $3
       RETURNING id`,
      [req.params.id, req.params.gymId, req.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Plate not found" });
    }

    res.json({ deleted: true });
  } catch (err) {
    console.error("Delete plate error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Approved emails (admin only) ─────────────────────────────────────────────

router.get("/admin/approved-emails", requireAuth, async (req, res) => {
  try {
    const adminCheck = await pool.query(
      `SELECT is_admin FROM users WHERE id = $1`,
      [req.userId],
    );

    if (!adminCheck.rows[0]?.is_admin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const result = await pool.query(
      `SELECT * FROM approved_emails ORDER BY added_at DESC`,
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Get approved emails error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/admin/approved-emails", requireAuth, async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "email is required" });
  }

  try {
    const adminCheck = await pool.query(
      `SELECT is_admin FROM users WHERE id = $1`,
      [req.userId],
    );

    if (!adminCheck.rows[0]?.is_admin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const result = await pool.query(
      `INSERT INTO approved_emails (email)
       VALUES ($1)
       ON CONFLICT (email) DO NOTHING
       RETURNING *`,
      [email.toLowerCase().trim()],
    );

    if (result.rows.length === 0) {
      return res
        .status(409)
        .json({ error: "Email already on the approved list" });
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Add approved email error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Exercises ────────────────────────────────────────────────────────────────

// GET /gyms/:gymId/exercises
router.get("/:gymId/exercises", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, exercise, muscles_primary, muscles_secondary, type,
              sub_component, emg_score, target_weight,
              active, equipment_id
       FROM exercises
       WHERE user_id = $1 AND gym_id = $2
       ORDER BY type ASC, muscles_primary ASC, emg_score DESC`,
      [req.userId, req.params.gymId],
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Get exercises error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /gyms/:gymId/exercises/:id — toggle active or update fields
router.patch("/:gymId/exercises/:id", requireAuth, async (req, res) => {
  const {
    active,
    exercise,
    muscles_primary,
    sub_component,
    type,
    emg_score,
    equipment_id,
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE exercises
       SET active          = COALESCE($1, active),
           exercise        = COALESCE($2, exercise),
           muscles_primary = COALESCE($3, muscles_primary),
           sub_component   = COALESCE($4, sub_component),
           type            = COALESCE($5, type),
           emg_score       = COALESCE($6, emg_score),
           equipment_id    = COALESCE($7, equipment_id)
       WHERE id = $8 AND user_id = $9 AND gym_id = $10
       RETURNING *`,
      [
        active,
        exercise,
        muscles_primary,
        sub_component,
        type,
        emg_score,
        equipment_id,
        req.params.id,
        req.userId,
        req.params.gymId,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Exercise not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Update exercise error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /gyms/:gymId/exercises — add a new exercise
router.post("/:gymId/exercises", requireAuth, async (req, res) => {
  const {
    exercise,
    muscles_primary,
    muscles_secondary,
    type,
    sub_component,
    emg_score,
    equipment_id,
  } = req.body;

  if (!exercise || !muscles_primary || !type) {
    return res.status(400).json({
      error: "exercise, muscles_primary and type are required",
    });
  }

  try {
    const gymResult = await pool.query(
      `SELECT id FROM gyms WHERE id = $1 AND user_id = $2`,
      [req.params.gymId, req.userId],
    );

    if (gymResult.rows.length === 0) {
      return res.status(404).json({ error: "Gym not found" });
    }

    const result = await pool.query(
      `INSERT INTO exercises
         (user_id, gym_id, exercise, muscles_primary, muscles_secondary,
          type, sub_component, emg_score, equipment_id, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
       RETURNING *`,
      [
        req.userId,
        req.params.gymId,
        exercise,
        muscles_primary,
        muscles_secondary || null,
        type,
        sub_component || null,
        emg_score || 3,
        equipment_id || null,
      ],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Create exercise error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /gyms/:gymId/exercises/:id
router.delete("/:gymId/exercises/:id", requireAuth, async (req, res) => {
  try {
    const exResult = await pool.query(
      `SELECT exercise FROM exercises
       WHERE id = $1 AND user_id = $2 AND gym_id = $3`,
      [req.params.id, req.userId, req.params.gymId],
    );

    if (exResult.rows.length === 0) {
      return res.status(404).json({ error: "Exercise not found" });
    }

    const exerciseName = exResult.rows[0].exercise;

    await pool.query(
      `DELETE FROM one_rep_max_history
       WHERE user_id = $1 AND exercise_name = $2`,
      [req.userId, exerciseName],
    );

    await pool.query(
      `DELETE FROM logged_sets
       WHERE session_id IN (
         SELECT id FROM sessions WHERE user_id = $1
       ) AND exercise_name = $2`,
      [req.userId, exerciseName],
    );

    await pool.query(`DELETE FROM exercises WHERE id = $1`, [req.params.id]);

    res.json({ deleted: true });
  } catch (err) {
    console.error("Delete exercise error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /gyms/admin/approved-emails/:id
router.delete("/admin/approved-emails/:id", requireAuth, async (req, res) => {
  try {
    const adminCheck = await pool.query(
      `SELECT is_admin FROM users WHERE id = $1`,
      [req.userId],
    );

    if (!adminCheck.rows[0]?.is_admin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    await pool.query(`DELETE FROM approved_emails WHERE id = $1`, [
      req.params.id,
    ]);

    res.json({ deleted: true });
  } catch (err) {
    console.error("Delete approved email error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
