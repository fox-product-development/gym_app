// backend/phaseConfig.js
// Single source of truth for phase rep schemes, percentages, and PO rules.
// Imported by sessions.js, cron.js, and calibration.js.
// Do not hardcode these values anywhere else.

const PHASE_CONFIG = Object.freeze({
  anatomical_adaptation: {
    sets: 3,
    targetReps: 20,
    minReps: 15,
    percentage: 0.6,
    poEnabled: true,
  },
  hypertrophy: {
    sets: 4,
    targetReps: 10,
    minReps: 8,
    percentage: 0.75,
    poEnabled: true,
  },
  maximum_strength: {
    sets: 4,
    targetReps: 5,
    minReps: 3,
    percentage: 0.85,
    poEnabled: true,
  },
  muscle_definition: {
    sets: 1,
    targetReps: 40,
    minReps: 30,
    percentage: 0.55,
    poEnabled: true,
  },
  rest: {
    sets: 3,
    targetReps: 12,
    minReps: null,
    percentage: 0.45,
    poEnabled: false,
  },
});

module.exports = { PHASE_CONFIG };
