// backend/weightCalc.js
// Calculates the next valid weight for an exercise based on actual equipment
// constraints and plate inventory. Replaces the hardcoded validWeights.js.

const pool = require("./db");

// ─── Main function ────────────────────────────────────────────────────────────
// Given an exercise, finds the next achievable weight above its current
// target_weight_kg. Returns the new weight, or the current weight if no
// increase is possible (maxed out).

async function getNextValidWeight(exerciseId, userId) {
  // 1. Look up the exercise and its linked equipment
  const exResult = await pool.query(
    `SELECT e.id, e.target_weight_kg, e.equipment_id, e.gym_id,
            eq.type AS eq_type, eq.increment_kg, eq.max_weight_kg,
            eq.unladen_weight_kg, eq.equipment_name
     FROM exercises e
     LEFT JOIN equipment eq ON eq.id = e.equipment_id
     WHERE e.id = $1 AND e.user_id = $2`,
    [exerciseId, userId],
  );

  if (exResult.rows.length === 0) return null;

  const ex = exResult.rows[0];
  const currentWeight = parseFloat(ex.target_weight_kg) || 0;

  // No equipment linked — can't calculate, return current
  if (!ex.equipment_id) return currentWeight;

  const eqType = ex.eq_type;

  // ── Fixed or machine equipment ────────────────────────────────────────────
  if (eqType === "fixed" || eqType === "machine") {
    const increment = parseFloat(ex.increment_kg) || 0;
    const maxWeight = ex.max_weight_kg ? parseFloat(ex.max_weight_kg) : null;

    if (increment <= 0) return currentWeight;

    const nextWeight = currentWeight + increment;

    if (maxWeight !== null && nextWeight > maxWeight) {
      return currentWeight; // Already at max
    }

    return Math.round(nextWeight * 100) / 100;
  }

  // ── Loadable equipment ────────────────────────────────────────────────────
  if (eqType === "loadable") {
    const gymId = ex.gym_id;
    const unladenWeight = parseFloat(ex.unladen_weight_kg) || 0;
    const eqName = (ex.equipment_name || "").toLowerCase();

    // Determine plate divisor:
    // Dumbbells need 4 matching plates (2 per side × 2 dumbbells)
    // Barbells/EZ bars need 2 matching plates (1 per side)
    const isDumbbell = eqName.includes("dumbbell");
    const divisor = isDumbbell ? 4 : 2;

    // Fetch plate inventory for this gym
    const plateResult = await pool.query(
      `SELECT weight_kg, quantity
       FROM plates
       WHERE gym_id = $1 AND user_id = $2
       ORDER BY weight_kg ASC`,
      [gymId, userId],
    );

    if (plateResult.rows.length === 0) return currentWeight;

    // Calculate available plates per side
    const plateSizes = plateResult.rows
      .map((p) => ({
        weight: parseFloat(p.weight_kg),
        perSide: Math.floor(p.quantity / divisor),
      }))
      .filter((p) => p.perSide > 0);

    if (plateSizes.length === 0) return currentWeight;

    // Generate all valid per-side combinations
    // For each plate size, can use 0 to perSide of them
    const perSideWeights = new Set();
    perSideWeights.add(0); // Empty — just the bar/handle

    function generateCombinations(index, currentPerSide) {
      if (index >= plateSizes.length) {
        perSideWeights.add(Math.round(currentPerSide * 100) / 100);
        return;
      }

      const plate = plateSizes[index];
      for (let count = 0; count <= plate.perSide; count++) {
        generateCombinations(index + 1, currentPerSide + count * plate.weight);
      }
    }

    generateCombinations(0, 0);

    // Convert per-side weights to total weights
    // Total = unladen + (perSide × 2)
    const validWeights = [...perSideWeights]
      .map((ps) => Math.round((unladenWeight + ps * 2) * 100) / 100)
      .sort((a, b) => a - b);

    // Find the first valid weight above current
    const nextWeight = validWeights.find((w) => w > currentWeight);

    if (nextWeight !== undefined) {
      return nextWeight;
    }

    // No higher weight available — maxed out
    return currentWeight;
  }

  // Unknown equipment type — return current
  return currentWeight;
}

// ─── Build valid weights list for AI prompt ──────────────────────────────────
// For loadable equipment, generates the full list of achievable weights from
// the plate pool. Used in AI prompts so the AI knows what weights to suggest.

async function getValidWeightsForEquipment(equipmentId, gymId, userId) {
  const eqResult = await pool.query(
    `SELECT type, equipment_name, unladen_weight_kg, increment_kg, max_weight_kg
     FROM equipment WHERE id = $1`,
    [equipmentId],
  );

  if (eqResult.rows.length === 0) return [];

  const eq = eqResult.rows[0];

  if (eq.type === "fixed" || eq.type === "machine") {
    const increment = parseFloat(eq.increment_kg) || 0;
    const maxWeight = eq.max_weight_kg ? parseFloat(eq.max_weight_kg) : null;
    if (increment <= 0) return [];

    const weights = [];
    for (
      let w = increment;
      maxWeight === null ? w <= 200 : w <= maxWeight;
      w += increment
    ) {
      weights.push(Math.round(w * 100) / 100);
    }
    return weights;
  }

  if (eq.type === "loadable") {
    const unladenWeight = parseFloat(eq.unladen_weight_kg) || 0;
    const eqName = (eq.equipment_name || "").toLowerCase();
    const isDumbbell = eqName.includes("dumbbell");
    const divisor = isDumbbell ? 4 : 2;

    const plateResult = await pool.query(
      `SELECT weight_kg, quantity
       FROM plates
       WHERE gym_id = $1 AND user_id = $2
       ORDER BY weight_kg ASC`,
      [gymId, userId],
    );

    if (plateResult.rows.length === 0) return [unladenWeight];

    const plateSizes = plateResult.rows
      .map((p) => ({
        weight: parseFloat(p.weight_kg),
        perSide: Math.floor(p.quantity / divisor),
      }))
      .filter((p) => p.perSide > 0);

    if (plateSizes.length === 0) return [unladenWeight];

    const perSideWeights = new Set();
    perSideWeights.add(0);

    function generateCombinations(index, currentPerSide) {
      if (index >= plateSizes.length) {
        perSideWeights.add(Math.round(currentPerSide * 100) / 100);
        return;
      }
      const plate = plateSizes[index];
      for (let count = 0; count <= plate.perSide; count++) {
        generateCombinations(index + 1, currentPerSide + count * plate.weight);
      }
    }

    generateCombinations(0, 0);

    return [...perSideWeights]
      .map((ps) => Math.round((unladenWeight + ps * 2) * 100) / 100)
      .sort((a, b) => a - b);
  }

  return [];
}

module.exports = { getNextValidWeight, getValidWeightsForEquipment };
