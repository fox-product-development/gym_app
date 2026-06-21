// backend/cycleConfig.js
// Single source of truth for the annual training cycle sequence.
// Defines phase order, duration (weeks), and sessions per week for each
// entry in the 52-week year. Read by cron.js to drive phase advancement
// and by ai.js to determine session structure when generating a phase.
//
// PER-USER. Each user has their own cycle sequence — they are not required
// to follow the same annual plan. user1 runs a Recreational/Advanced
// hybrid double-periodization cycle. user2 runs a higher-variety,
// non-bulk-style cycle (modelled on Bompa's Figure 2.6, Non-Bulk Program)
// with no standalone Maximum Strength phases — Entry-level athletes are
// advised against MxS work, so those slots are replaced with additional
// Mixed/Muscle Definition coverage instead.
//
// cycle_position on the users table is the index into CYCLE_CONFIG[userKey].
// phase_week on the users table is the 1-based week within the current entry.
//
// To find the next phase (used for transition exercise selection logic):
//   CYCLE_CONFIG[userKey][(cycle_position + 1) % CYCLE_CONFIG[userKey].length]
//
// The cycle wraps via modulo — the final index completing rolls back to
// index 0, restarting the year. No special-case "end of cycle" handling is
// needed anywhere that reads this config.

// ─── user1 — Recreational/Advanced hybrid double-periodization (52 weeks) ───
const user1Cycle = [
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
];
// Total weeks: 3+6+3+6+1+6+1+3+3+3+6+1+6+4 = 52

// ─── user2 — Entry-level, non-bulk/high-variety cycle (52 weeks) ────────────
// Modelled on Bompa Figure 2.6 (Non-Bulk Program). No standalone Maximum
// Strength phases — those slots are replaced with additional Mixed/Muscle
// Definition coverage instead, per Bompa's guidance that Entry-level
// athletes should avoid MxS work.
const user2Cycle = [
  { phase: "anatomical_adaptation", weeks: 3, sessionsPerWeek: 4 }, // 0
  { phase: "hypertrophy", weeks: 3, sessionsPerWeek: 4 }, // 1
  { phase: "maximum_strength", weeks: 3, sessionsPerWeek: 3 }, // 2
  { phase: "transition", weeks: 1, sessionsPerWeek: 3 }, // 3
  { phase: "mixed", weeks: 3, sessionsPerWeek: 4 }, // 4
  { phase: "muscle_definition", weeks: 3, sessionsPerWeek: 4 }, // 5
  { phase: "transition", weeks: 3, sessionsPerWeek: 3 }, // 6
  { phase: "anatomical_adaptation", weeks: 4, sessionsPerWeek: 4 }, // 7
  { phase: "hypertrophy", weeks: 3, sessionsPerWeek: 4 }, // 8
  { phase: "mixed", weeks: 3, sessionsPerWeek: 4 }, // 9
  { phase: "transition", weeks: 1, sessionsPerWeek: 3 }, // 10
  { phase: "muscle_definition", weeks: 3, sessionsPerWeek: 4 }, // 11
  { phase: "maximum_strength", weeks: 3, sessionsPerWeek: 3 }, // 12
  { phase: "transition", weeks: 1, sessionsPerWeek: 3 }, // 13
  { phase: "muscle_definition", weeks: 3, sessionsPerWeek: 4 }, // 14
  { phase: "mixed", weeks: 3, sessionsPerWeek: 4 }, // 15
  { phase: "transition", weeks: 1, sessionsPerWeek: 3 }, // 16
  // Manual override, phase 17 should be
  // { phase: "muscle_definition", weeks: 4, sessionsPerWeek: 4 },
  // changing to hypertrophy to give a more natural entry point
  { phase: "hypertrophy", weeks: 6, sessionsPerWeek: 4 }, // 17
  { phase: "transition", weeks: 4, sessionsPerWeek: 3 }, // 18
];
// Total weeks: 3+3+3+1+3+3+3+4+3+3+1+3+3+1+3+3+1+4+4 = 52
//
// NOTE: this cycle still contains "maximum_strength" entries (positions 2
// and 12) even though user2's phaseConfig has no maximum_strength.user2
// entry. Mike has flagged these as needing to become "anatomical_adaptation"
// instead (Entry-level athletes are advised against MxS work) — left as
// maximum_strength here pending that decision being applied to phaseConfig.
// Running the cycle as-is today would throw at MxS lookup time for user2;
// see phaseConfig.js for the corresponding gap.

const CYCLE_CONFIG = Object.freeze({
  user1: Object.freeze(user1Cycle),
  user2: Object.freeze(user2Cycle),
  user3: Object.freeze(user1Cycle), // TEST ACCOUNT — mirrors user1
});

// Returns the phase config entry at a given cycle position for a given
// user. Throws on an out-of-range index, or an unknown userKey, so callers
// don't silently receive undefined.
function getCycleEntry(userKey, cyclePosition) {
  const userCycle = CYCLE_CONFIG[userKey];
  if (!userCycle) {
    throw new Error(`Unknown userKey: ${userKey}`);
  }
  const entry = userCycle[cyclePosition];
  if (!entry) {
    throw new Error(
      `Invalid cycle_position: ${cyclePosition} for ${userKey}. Must be 0-${userCycle.length - 1}.`,
    );
  }
  return entry;
}

// Returns the entry that follows the given cycle position for a given
// user, wrapping to the start of that user's array if called on the final
// entry. Used by transition generation logic to decide whether to
// pre-select exercises for the upcoming Muscle Definition phase.
function getNextCycleEntry(userKey, cyclePosition) {
  const userCycle = CYCLE_CONFIG[userKey];
  if (!userCycle) {
    throw new Error(`Unknown userKey: ${userKey}`);
  }
  const nextPosition = (cyclePosition + 1) % userCycle.length;
  return userCycle[nextPosition];
}

module.exports = { CYCLE_CONFIG, getCycleEntry, getNextCycleEntry };
