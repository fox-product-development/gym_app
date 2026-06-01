// backend/validWeights.js
// Valid loadable weights per equipment type.
// All dumbbell weights are per dumbbell (single hand).
// All barbell weights are total including bar.
// Used by AI prompt builder and progressive overload rounding.

const validWeights = {
  // Home gym dumbbells (single dumbbell) and EZ bar — same plate pool
  home_dumbbell: [
    0, 1, 2.5, 3.5, 5, 6, 7.5, 8.5, 10, 11, 12.5, 13.5, 15, 16, 17.5, 18.5, 20,
    21, 22.5, 23.5, 25, 26, 27.5, 28.5, 30, 31, 32.5, 33.5, 35, 36, 37.5, 38.5,
    40, 41, 42.5, 43.5, 45, 46, 47.5, 48.5, 50, 51, 52.5, 53.5, 55, 56, 60, 61,
    62.5, 63.5, 65, 66, 67.5, 68.5,
  ],

  // Home gym EZ bar — same valid weights as home dumbbell (shared plate pool)
  home_barbell: [
    0, 5, 6, 7.5, 8.5, 10, 11, 12.5, 13.5, 15, 16, 17.5, 18.5, 20, 21, 22.5,
    23.5, 25, 26, 27.5, 28.5, 30, 31, 32.5, 33.5, 35, 36, 37.5, 38.5, 40, 41,
    42.5, 43.5, 45, 46, 47.5, 48.5, 50, 51, 52.5, 53.5, 55, 56, 57.5, 58.5, 60,
    61, 62.5, 63.5, 65, 66, 67.5, 68.5, 70, 71, 72.5, 73.5,
  ],

  // Work gym fixed dumbbells — 1kg increments, weight is per dumbbell
  work_dumbbell: Array.from({ length: 54 }, (_, i) => i + 1),

  // Work gym bench barbell (10kg bar) — 5kg increments
  work_barbell: Array.from({ length: 49 }, (_, i) => 10 + i * 5),

  // Work gym Olympic barbell (20kg bar) — 5kg increments
  work_olympic_barbell: Array.from({ length: 47 }, (_, i) => 20 + i * 5),

  // Work gym cable machines — 2.2kg increments from 0
  work_machine: Array.from({ length: 50 }, (_, i) =>
    parseFloat((i * 2.26).toFixed(1)),
  ),
};

// Helper: given a target weight and equipment type + gym, return the nearest
// valid weight that does not exceed the target (round down to keep it achievable).
function roundToValid(weight, equipmentType, gym) {
  const list = getValidList(equipmentType, gym);
  if (!list) return weight;
  const valid = list.filter((w) => w <= weight);
  return valid.length > 0 ? valid[valid.length - 1] : list[0];
}

// Helper: return the next valid weight above the current weight (for PO increments).
function nextValidWeight(currentWeight, equipmentType, gym) {
  const list = getValidList(equipmentType, gym);
  if (!list) return currentWeight;
  const next = list.find((w) => w > currentWeight);
  return next !== undefined ? next : currentWeight;
}

// Internal: map equipment_type + gym to the correct valid weight array.
function getValidList(equipmentType, gym) {
  if (gym === "home") {
    if (equipmentType === "barbell") return validWeights.home_barbell;
    if (equipmentType === "dumbbells" || equipmentType === "single dumbbell")
      return validWeights.home_dumbbell;
    return null; // none / bodyweight
  }
  if (gym === "work") {
    if (equipmentType === "machine") return validWeights.work_machine;
    if (equipmentType === "olympic barbell")
      return validWeights.work_olympic_barbell;
    if (equipmentType === "barbell") return validWeights.work_barbell;
    if (equipmentType === "dumbbells" || equipmentType === "single dumbbell")
      return validWeights.work_dumbbell;
    return null; // none / bodyweight
  }
  return null;
}

module.exports = { validWeights, roundToValid, nextValidWeight, getValidList };
