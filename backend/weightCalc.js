// backend/weightCalc.js
// Calculates achievable weights for an exercise based on actual equipment
// constraints and plate inventory.
//
// getNextValidWeight() and snapToValidWeight() have been removed — both
// were only used by mechanisms that no longer exist:
//   - getNextValidWeight() was called exclusively by the old progressive
//     overload cascade in sessions.js (removed — 1RM retesting is now the
//     progressive overload mechanism, see sessions.js header note)
//   - snapToValidWeight() was called exclusively by
//     recalculateTargetWeightsForPhaseTransition() in the old cron.js
//     (removed — phase transitions are now driven by cycleConfig.js and
//     don't derive an implied 1RM from target_weight at all)
//
// getValidWeightsForEquipment() remains — it's still used by ai.js to tell
// the AI what weights are physically achievable on a given piece of
// equipment.

const pool = require("./db");

// ─── Build valid weights list for AI prompt ──────────────────────────────────
// For loadable equipment, generates the full list of achievable weights from
// the plate pool. Used in AI prompts so the AI knows what weights to suggest.

async function getValidWeightsForEquipment(equipmentId, gymId, userId) {
  const eqResult = await pool.query(
    `SELECT type, equipment_name, unladen_weight, increment, max_weight
     FROM equipment WHERE id = $1`,
    [equipmentId],
  );

  if (eqResult.rows.length === 0) return [];

  const eq = eqResult.rows[0];

  if (eq.type === "fixed" || eq.type === "machine") {
    const increment = parseFloat(eq.increment) || 0;
    const maxWeight = eq.max_weight ? parseFloat(eq.max_weight) : null;
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
    const unladenWeight = parseFloat(eq.unladen_weight) || 0;
    const eqName = (eq.equipment_name || "").toLowerCase();
    const isDumbbell = eqName.includes("dumbbell");
    const divisor = isDumbbell ? 4 : 2;

    const plateResult = await pool.query(
      `SELECT weight, quantity
       FROM plates
       WHERE gym_id = $1 AND user_id = $2
       ORDER BY weight ASC`,
      [gymId, userId],
    );

    if (plateResult.rows.length === 0) return [unladenWeight];

    const plateSizes = plateResult.rows
      .map((p) => ({
        weight: parseFloat(p.weight),
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

module.exports = {
  getValidWeightsForEquipment,
};
