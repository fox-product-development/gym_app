// backend/routes/gyms.js
// Gym, equipment, and plate management routes.

const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware");

const router = express.Router();

// ─── Gyms ─────────────────────────────────────────────────────────────────────

// GET /gyms — get all gyms for the user
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

// POST /gyms — create a new gym
router.post("/", requireAuth, async (req, res) => {
  const { gym_name, is_default = false } = req.body;

  if (!gym_name) {
    return res.status(400).json({ error: "gym_name is required" });
  }

  try {
    // If this is the default, unset any existing default
    if (is_default) {
      await pool.query(
        `UPDATE gyms SET is_default = FALSE WHERE user_id = $1`,
        [req.userId],
      );
    }

    const result = await pool.query(
      `INSERT INTO gyms (user_id, gym_name, is_default)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.userId, gym_name, is_default],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Create gym error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /gyms/:id — update gym name or default status
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
       SET gym_name  = COALESCE($1, gym_name),
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

// DELETE /gyms/:id — delete a gym and all its equipment and plates
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

// GET /gyms/:gymId/equipment
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

// POST /gyms/:gymId/equipment
router.post("/:gymId/equipment", requireAuth, async (req, res) => {
  const { equipment_name, type, unladen_weight_kg, increment_kg } = req.body;

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
         (user_id, gym_id, equipment_name, type, unladen_weight_kg, increment_kg)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        req.userId,
        req.params.gymId,
        equipment_name,
        type,
        unladen_weight_kg || null,
        increment_kg || null,
      ],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Create equipment error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /gyms/:gymId/equipment/:id
router.patch("/:gymId/equipment/:id", requireAuth, async (req, res) => {
  const { equipment_name, type, unladen_weight_kg, increment_kg } = req.body;

  try {
    const result = await pool.query(
      `UPDATE equipment
       SET equipment_name   = COALESCE($1, equipment_name),
           type             = COALESCE($2, type),
           unladen_weight_kg = COALESCE($3, unladen_weight_kg),
           increment_kg     = COALESCE($4, increment_kg)
       WHERE id = $5 AND gym_id = $6 AND user_id = $7
       RETURNING *`,
      [
        equipment_name,
        type,
        unladen_weight_kg,
        increment_kg,
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

// DELETE /gyms/:gymId/equipment/:id
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

// GET /gyms/:gymId/plates
router.get("/:gymId/plates", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM plates
       WHERE gym_id = $1 AND user_id = $2
       ORDER BY weight_kg ASC`,
      [req.params.gymId, req.userId],
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Get plates error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /gyms/:gymId/plates — add a plate size
router.post("/:gymId/plates", requireAuth, async (req, res) => {
  const { weight_kg, quantity } = req.body;

  if (!weight_kg || quantity === undefined) {
    return res
      .status(400)
      .json({ error: "weight_kg and quantity are required" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO plates (user_id, gym_id, weight_kg, quantity)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.userId, req.params.gymId, weight_kg, quantity],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Create plate error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /gyms/:gymId/plates — save all plate quantities in one call
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

// DELETE /gyms/:gymId/plates/:id
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

// GET /gyms/admin/approved-emails
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

// POST /gyms/admin/approved-emails
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
