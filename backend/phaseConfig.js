// backend/phaseConfig.js
// Single source of truth for phase rep schemes, percentages, and PO rules.
// Imported by sessions.js, cron.js, and calibration.js.
// Do not hardcode these values anywhere else.
//
// Structure: PHASE_CONFIG[phase].levels[trainingLevel].block_N.week_N
//            = { percentage, reps, sets }
//
// Training level mapping (matches users.training_level CHECK constraint):
//   new          → Bompa "Entry-Level"
//   recreational → Bompa "Recreational"  (renamed from 'amateur' — see migration note below)
//   serious      → Bompa "Advanced"
//   professional → Bompa "Professional"
//
// MIGRATION NOTE: users.training_level CHECK constraint currently allows
// 'amateur', not 'recreational'. A migration is needed to rename the value
// before this config can be used for any user currently set to 'amateur'.
//
// Where Bompa's tables show a range (e.g. "3-4 sets"), the higher value is
// used here, with the original range noted in a comment.
//
// Professional Maximum Strength Block 2 Week 3: Bompa's table shows up to
// 130% 1RM via eccentric-only loading (requires a spotter to lift the weight
// concentrically, athlete only lowers it). This app has no way to verify
// spotter availability or supervise eccentric-only technique safely, so this
// is capped at 95% concentric — the standard solo-liftable ceiling.

const PHASE_CONFIG = Object.freeze({
  // ─── Anatomical Adaptation ────────────────────────────────────────────────
  // Bompa Tables 10.2 (Entry/Recreational, 6-week) and 10.3 (Advanced, 3-week).
  // Professional: not separately tabled — uses Advanced 3-week version, or
  // may skip AA entirely (handled at the cycle-planning level, not here).
  anatomical_adaptation: {
    minReps: 8,
    poEnabled: true,
    levels: {
      new: {
        block_1: {
          week_1: { percentage: 0.4, reps: 15, sets: 3 },
          week_2: { percentage: 0.5, reps: 12, sets: 3 },
          week_3: { percentage: 0.6, reps: 8, sets: 3 },
        },
        block_2: {
          week_1: { percentage: 0.5, reps: 15, sets: 4 },
          week_2: { percentage: 0.6, reps: 12, sets: 4 },
          week_3: { percentage: 0.7, reps: 10, sets: 4 },
        },
      },
      recreational: {
        block_1: {
          week_1: { percentage: 0.4, reps: 15, sets: 3 },
          week_2: { percentage: 0.5, reps: 12, sets: 3 },
          week_3: { percentage: 0.6, reps: 8, sets: 3 },
        },
        block_2: {
          week_1: { percentage: 0.5, reps: 15, sets: 4 },
          week_2: { percentage: 0.6, reps: 12, sets: 4 },
          week_3: { percentage: 0.7, reps: 10, sets: 4 },
        },
      },
      serious: {
        // Advanced — single 3-week block, no block_2.
        block_1: {
          week_1: { percentage: 0.5, reps: 15, sets: 3 },
          week_2: { percentage: 0.6, reps: 12, sets: 4 },
          week_3: { percentage: 0.7, reps: 10, sets: 4 },
        },
        block_2: null,
      },
      professional: {
        // Not separately tabled — uses Advanced 3-week version as a brief
        // re-introduction. Cycle planning may skip AA for this level entirely.
        block_1: {
          week_1: { percentage: 0.5, reps: 15, sets: 3 },
          week_2: { percentage: 0.6, reps: 12, sets: 4 },
          week_3: { percentage: 0.7, reps: 10, sets: 4 },
        },
        block_2: null,
      },
    },
  },

  // ─── Hypertrophy ──────────────────────────────────────────────────────────
  // Bompa Tables 11.2 (Entry), 11.3 (Recreational), 11.4 (Advanced), 11.5 (Professional).
  hypertrophy: {
    minReps: 8,
    poEnabled: true,
    levels: {
      new: {
        block_1: {
          week_1: { percentage: 0.4, reps: 10, sets: 2 },
          week_2: { percentage: 0.4, reps: 15, sets: 2 },
          week_3: { percentage: 0.5, reps: 10, sets: 3 }, // Bompa: 2-3 sets
        },
        block_2: {
          week_1: { percentage: 0.4, reps: 10, sets: 3 },
          week_2: { percentage: 0.5, reps: 10, sets: 3 },
          week_3: { percentage: 0.6, reps: 10, sets: 3 },
        },
      },
      recreational: {
        block_1: {
          week_1: { percentage: 0.5, reps: 12, sets: 3 },
          week_2: { percentage: 0.6, reps: 12, sets: 3 },
          week_3: { percentage: 0.6, reps: 15, sets: 4 }, // volume-dominant peak — see reference doc
        },
        block_2: {
          week_1: { percentage: 0.5, reps: 12, sets: 3 },
          week_2: { percentage: 0.6, reps: 12, sets: 4 },
          week_3: { percentage: 0.7, reps: 10, sets: 4 },
        },
      },
      serious: {
        block_1: {
          week_1: { percentage: 0.6, reps: 12, sets: 4 },
          week_2: { percentage: 0.6, reps: 15, sets: 4 },
          week_3: { percentage: 0.75, reps: 10, sets: 4 },
        },
        block_2: {
          week_1: { percentage: 0.7, reps: 10, sets: 4 },
          week_2: { percentage: 0.75, reps: 10, sets: 4 },
          week_3: { percentage: 0.8, reps: 8, sets: 5 }, // Bompa: 4-5 sets
        },
      },
      professional: {
        block_1: {
          week_1: { percentage: 0.7, reps: 12, sets: 4 },
          week_2: { percentage: 0.7, reps: 15, sets: 5 }, // Bompa: 4-5 sets
          week_3: { percentage: 0.8, reps: 7, sets: 6 }, // Bompa: 3-6 sets, varies by exercise
        },
        block_2: {
          week_1: { percentage: 0.7, reps: 10, sets: 5 },
          week_2: { percentage: 0.75, reps: 8, sets: 5 }, // Bompa: 3-5 sets
          week_3: { percentage: 0.85, reps: 4, sets: 6 },
        },
      },
    },
  },

  // ─── Maximum Strength ─────────────────────────────────────────────────────
  // Bompa Tables 13.2 (Recreational), 13.3 (Advanced), 13.4 (Professional).
  // Entry-Level: not separately tabled — uses Recreational with reduced sets.
  maximum_strength: {
    minReps: 2,
    poEnabled: true,
    levels: {
      new: {
        block_1: {
          week_1: { percentage: 0.7, reps: 8, sets: 2 },
          week_2: { percentage: 0.75, reps: 8, sets: 3 },
          week_3: { percentage: 0.75, reps: 8, sets: 3 },
        },
        block_2: {
          week_1: { percentage: 0.8, reps: 6, sets: 3 },
          week_2: { percentage: 0.8, reps: 6, sets: 3 },
          week_3: { percentage: 0.9, reps: 3, sets: 3 },
        },
      },
      recreational: {
        block_1: {
          week_1: { percentage: 0.7, reps: 8, sets: 3 },
          week_2: { percentage: 0.75, reps: 8, sets: 4 },
          week_3: { percentage: 0.75, reps: 8, sets: 4 },
        },
        block_2: {
          week_1: { percentage: 0.8, reps: 6, sets: 4 },
          week_2: { percentage: 0.8, reps: 6, sets: 4 }, // Bompa: 3-4 sets
          week_3: { percentage: 0.9, reps: 3, sets: 4 },
        },
      },
      serious: {
        block_1: {
          week_1: { percentage: 0.75, reps: 8, sets: 4 },
          week_2: { percentage: 0.8, reps: 6, sets: 5 },
          week_3: { percentage: 0.85, reps: 5, sets: 5 }, // Bompa: 80-85%
        },
        block_2: {
          week_1: { percentage: 0.85, reps: 5, sets: 5 },
          week_2: { percentage: 0.9, reps: 3, sets: 5 },
          week_3: { percentage: 0.95, reps: 2, sets: 5 },
        },
      },
      professional: {
        block_1: {
          week_1: { percentage: 0.7, reps: 8, sets: 6 },
          week_2: { percentage: 0.85, reps: 4, sets: 6 }, // Bompa: 75-85%, 4-8 reps
          week_3: { percentage: 0.95, reps: 3, sets: 7 }, // Bompa: 85-100%, 1-3 reps
        },
        block_2: {
          week_1: { percentage: 0.8, reps: 6, sets: 6 },
          week_2: { percentage: 0.95, reps: 2, sets: 6 }, // Bompa: 90-95%, 2-3 reps
          week_3: { percentage: 0.95, reps: 3, sets: 7 }, // capped — see file header note on eccentric loading
        },
      },
    },
  },

  // ─── Muscle Definition ────────────────────────────────────────────────────
  // App adaptation, not a direct Bompa phase. Load scaled by level per
  // Tables 14.1 (Recreational, 30%) and 14.2 (Advanced/Professional, 40-50%).
  // Structural progression (exercise grouping) from Bompa's tables is not
  // implemented — using our weekly rep escalation (30/40/50) instead.
  muscle_definition: {
    minReps: 25,
    poEnabled: true,
    levels: {
      new: {
        block_1: {
          week_1: { percentage: 0.3, reps: 30, sets: 1 },
          week_2: { percentage: 0.3, reps: 40, sets: 1 },
          week_3: { percentage: 0.3, reps: 50, sets: 1 },
        },
        block_2: {
          week_1: { percentage: 0.3, reps: 30, sets: 1 },
          week_2: { percentage: 0.3, reps: 40, sets: 1 },
          week_3: { percentage: 0.3, reps: 50, sets: 1 },
        },
      },
      recreational: {
        block_1: {
          week_1: { percentage: 0.3, reps: 30, sets: 1 },
          week_2: { percentage: 0.3, reps: 40, sets: 1 },
          week_3: { percentage: 0.3, reps: 50, sets: 1 },
        },
        block_2: {
          week_1: { percentage: 0.3, reps: 30, sets: 1 },
          week_2: { percentage: 0.3, reps: 40, sets: 1 },
          week_3: { percentage: 0.3, reps: 50, sets: 1 },
        },
      },
      serious: {
        block_1: {
          week_1: { percentage: 0.45, reps: 30, sets: 1 },
          week_2: { percentage: 0.45, reps: 40, sets: 1 },
          week_3: { percentage: 0.45, reps: 50, sets: 1 },
        },
        block_2: {
          week_1: { percentage: 0.4, reps: 30, sets: 1 }, // recovery-week influence — see Table 14.2
          week_2: { percentage: 0.45, reps: 40, sets: 1 },
          week_3: { percentage: 0.45, reps: 50, sets: 1 },
        },
      },
      professional: {
        block_1: {
          week_1: { percentage: 0.5, reps: 30, sets: 1 },
          week_2: { percentage: 0.5, reps: 40, sets: 1 },
          week_3: { percentage: 0.5, reps: 50, sets: 1 },
        },
        block_2: {
          week_1: { percentage: 0.4, reps: 30, sets: 1 }, // recovery-week influence — see Table 14.2
          week_2: { percentage: 0.5, reps: 40, sets: 1 },
          week_3: { percentage: 0.5, reps: 50, sets: 1 },
        },
      },
    },
  },

  // ─── Rest week ────────────────────────────────────────────────────────────
  // Flat across all training levels — not tabled per-level by Bompa.
  rest: {
    sets: 3,
    targetReps: 12,
    minReps: null,
    percentage: 0.45,
    poEnabled: false,
  },
});

// ─── 1RM Baseline Testing Protocol ─────────────────────────────────────────
// Bompa's prescribed method for establishing/retesting 1RM at each block
// boundary (every 3 weeks). One max-effort set per exercise, not a true
// single-rep attempt — using a 4-8 rep range keeps Epley estimation accurate
// (Epley degrades significantly above ~10 reps).
const BASELINE_TEST_CONFIG = Object.freeze({
  minTestReps: 4,
  maxTestReps: 8,
  restBetweenExercisesMinutes: { min: 3, max: 5 },
  setsPerExercise: 1,
  toFailure: true,
  // If logged reps exceed this, the result is flagged as unreliable for
  // Epley estimation (too far into high-rep range) rather than rejected.
  unreliableAboveReps: 10,
});

// ─── Lookup helper ──────────────────────────────────────────────────────────
// Returns the { percentage, reps, sets } for a given phase/level/block/week.
// Throws if the combination doesn't exist (e.g. block_2 for AA serious/professional)
// so callers must handle the single-block phases explicitly rather than
// silently receiving undefined.
function getWeekConfig(phase, trainingLevel, blockNumber, weekNumber) {
  const phaseConfig = PHASE_CONFIG[phase];
  if (!phaseConfig) throw new Error(`Unknown phase: ${phase}`);

  const levelConfig = phaseConfig.levels && phaseConfig.levels[trainingLevel];
  if (!levelConfig) {
    throw new Error(
      `No config for phase "${phase}" at level "${trainingLevel}"`,
    );
  }

  const blockKey = `block_${blockNumber}`;
  const block = levelConfig[blockKey];
  if (!block) {
    throw new Error(
      `Phase "${phase}" at level "${trainingLevel}" has no ${blockKey} (this level may only run a single block for this phase)`,
    );
  }

  const weekKey = `week_${weekNumber}`;
  const week = block[weekKey];
  if (!week) {
    throw new Error(
      `No week ${weekNumber} config for ${phase}/${trainingLevel}/${blockKey}`,
    );
  }

  return week;
}

module.exports = { PHASE_CONFIG, BASELINE_TEST_CONFIG, getWeekConfig };
