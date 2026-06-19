// backend/cycleConfig.js
// Single source of truth for the annual training cycle sequence.
// Defines phase order, duration (weeks), and sessions per week for each
// entry in the 52-week year. Read by cron.js to drive phase advancement
// and by ai.js to determine session structure when generating a phase.
//
// cycle_position on the users table is the index into this array.
// phase_week on the users table is the 1-based week within the current entry.
//
// To find the next phase (used for transition exercise selection logic):
//   CYCLE_CONFIG[(cycle_position + 1) % CYCLE_CONFIG.length]
//
// The cycle wraps via modulo — index 13 completing rolls back to index 0,
// restarting the year. No special-case "end of cycle" handling is needed
// anywhere that reads this config.

const CYCLE_CONFIG = Object.freeze([
  { phase: "anatomical_adaptation", weeks: 3, sessionsPerWeek: 4 }, // 0
  { phase: "hypertrophy", weeks: 6, sessionsPerWeek: 4 }, // 1
  { phase: "mixed", weeks: 3, sessionsPerWeek: 4 }, // 2
  { phase: "maximum_strength", weeks: 6, sessionsPerWeek: 3 }, // 3
  { phase: "transition", weeks: 1, sessionsPerWeek: 3 }, // 4
  { phase: "muscle_definition", weeks: 6, sessionsPerWeek: 4 }, // 5
  { phase: "transition", weeks: 1, sessionsPerWeek: 3 }, // 6
  { phase: "anatomical_adaptation", weeks: 3, sessionsPerWeek: 4 }, // 7
  { phase: "hypertrophy", weeks: 3, sessionsPerWeek: 4 }, // 8
  { phase: "mixed", weeks: 3, sessionsPerWeek: 4 }, // 9
  { phase: "maximum_strength", weeks: 6, sessionsPerWeek: 3 }, // 10
  { phase: "transition", weeks: 1, sessionsPerWeek: 3 }, // 11
  // TEMPORARY OVERRIDE — index 12 is normally 'muscle_definition' (6 weeks,
  // 4 sessions/week). Mike asked to run Hypertrophy here instead. Revert to
  // muscle_definition in August, then redeploy. This is a manual code edit,
  // not a runtime/DB toggle.
  { phase: "hypertrophy", weeks: 6, sessionsPerWeek: 4 }, // 12
  { phase: "transition", weeks: 4, sessionsPerWeek: 3 }, // 13
]);

// Total weeks: 3+6+3+6+1+6+1+3+3+3+6+1+6+4 = 52

// Returns the phase config entry at a given cycle position. Throws on an
// out-of-range index so callers don't silently receive undefined.
function getCycleEntry(cyclePosition) {
  const entry = CYCLE_CONFIG[cyclePosition];
  if (!entry) {
    throw new Error(
      `Invalid cycle_position: ${cyclePosition}. Must be 0-${CYCLE_CONFIG.length - 1}.`,
    );
  }
  return entry;
}

// Returns the entry that follows the given cycle position, wrapping to the
// start of the array if called on the final entry. Used by transition
// generation logic to decide whether to pre-select exercises for the
// upcoming Muscle Definition phase.
function getNextCycleEntry(cyclePosition) {
  const nextPosition = (cyclePosition + 1) % CYCLE_CONFIG.length;
  return CYCLE_CONFIG[nextPosition];
}

module.exports = { CYCLE_CONFIG, getCycleEntry, getNextCycleEntry };
