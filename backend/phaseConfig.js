// backend/phaseConfig.js
// Single source of truth for phase rep schemes, percentages, and PO rules.
// Imported by sessions.js, cron.js, and ai.js. Do not hardcode these values
// anywhere else.
//
// NO TRAINING LEVELS. This app is personal, not multi-tier. Each user has
// their own predetermined cycle (see cycleConfig.js) and their own set of
// phase values below, taken directly from the specific Bompa table that
// matches their actual programme — not derived, not averaged, not
// synthesised. Where a table shows per-session variation within a week,
// that variation is captured per session, not collapsed to one weekly value.
//
// Structure: PHASE_CONFIG[phase][userKey].week_N = sessionArray
//   sessionArray is an array of session configs, one per session in that
//   week. Most sessions are a single set-block: { percentage, reps, sets }.
//   Where a table shows a genuine split within one session (a different
//   load for the final set(s)), the session config carries a `finisher`
//   field for that extra set-block. See maximum_strength.user1.week_2,
//   session index 2, for the only current example of this.
//
// Source tables used per phase per user (see BOMPA_PROGRAMME_REFERENCE.md
// for the full book context):
//   AA            — Table 10.2, both users (identical table)
//   Hypertrophy   — Table 11.4 (user1, Advanced), Table 11.2 (user2, Entry)
//   Mixed         — Tables 12.4 + 12.5 (user1, Recreational H + MxS portions). N/A for user2.
//   MxS           — Table 13.2 (user1, Recreational). N/A for user2.
//   MD            — Table 14.1 (user1, Recreational). N/A for user2.
//
// "Session" here means session number within the week (1st, 2nd, 3rd...),
// NOT a calendar day. Which day of the week a session actually falls on is
// determined by the user's real-world schedule, not by this config.
//
// user3 — TEST ACCOUNT ONLY. Mirrors user1's values exactly (same object
// reference, not a copy) so the existing test user (DB id 3) can exercise
// every code path without needing its own transcribed table data. Remove
// the user3 entries once a proper testing strategy is in place, or keep
// them indefinitely if user3 stays a permanent test fixture — either way,
// do not let user3 drift from user1 by editing it separately.

// ─── Anatomical Adaptation values (shared — identical table for user1/user2/user3) ──
const aaShared = {
  week_1: [{ percentage: 0.4, reps: 15, sets: 3 }],
  week_2: [{ percentage: 0.5, reps: 12, sets: 3 }],
  week_3: [{ percentage: 0.6, reps: 8, sets: 3 }],
  week_4: [{ percentage: 0.5, reps: 15, sets: 4 }],
  week_5: [{ percentage: 0.6, reps: 12, sets: 4 }],
  week_6: [{ percentage: 0.7, reps: 10, sets: 4 }],
};

// ─── Hypertrophy values — user1 (Table 11.4, Advanced) ───────────────────────
const hypertrophyUser1 = {
  // [Lower/Low, Upper/Low, Lower/High, Upper/High]
  week_1: [
    { percentage: 0.6, reps: 12, sets: 4 },
    { percentage: 0.6, reps: 12, sets: 4 },
    { percentage: 0.6, reps: 12, sets: 4 },
    { percentage: 0.6, reps: 12, sets: 4 },
  ],
  week_2: [
    { percentage: 0.6, reps: 15, sets: 4 },
    { percentage: 0.6, reps: 15, sets: 4 },
    { percentage: 0.7, reps: 10, sets: 4 },
    { percentage: 0.7, reps: 10, sets: 4 },
  ],
  week_3: [
    { percentage: 0.75, reps: 10, sets: 4 },
    { percentage: 0.75, reps: 10, sets: 4 },
    { percentage: 0.75, reps: 10, sets: 4 },
    { percentage: 0.75, reps: 10, sets: 4 },
  ],
  week_4: [
    { percentage: 0.6, reps: 12, sets: 4 },
    { percentage: 0.6, reps: 12, sets: 4 },
    { percentage: 0.7, reps: 10, sets: 4 },
    { percentage: 0.7, reps: 10, sets: 4 },
  ],
  week_5: [
    { percentage: 0.75, reps: 10, sets: 4 },
    { percentage: 0.75, reps: 10, sets: 4 },
    { percentage: 0.75, reps: 10, sets: 4 },
    { percentage: 0.75, reps: 10, sets: 4 },
  ],
  week_6: [
    { percentage: 0.8, reps: 8, sets: 5 },
    { percentage: 0.8, reps: 8, sets: 5 },
    { percentage: 0.85, reps: 5, sets: 5 },
    { percentage: 0.85, reps: 5, sets: 5 },
  ],
};

// ─── Hypertrophy values — user2 (Table 11.2, Entry-level) ────────────────────
const hypertrophyUser2 = {
  // [Lower/Low, Upper/Low, Lower/High, Upper/High]
  week_1: [
    { percentage: 0.4, reps: 10, sets: 2 },
    { percentage: 0.4, reps: 10, sets: 2 },
    { percentage: 0.4, reps: 12, sets: 2 },
    { percentage: 0.4, reps: 12, sets: 2 },
  ],
  week_2: [
    { percentage: 0.4, reps: 15, sets: 2 },
    { percentage: 0.4, reps: 15, sets: 2 },
    { percentage: 0.4, reps: 15, sets: 3 },
    { percentage: 0.4, reps: 15, sets: 3 },
  ],
  week_3: [
    { percentage: 0.5, reps: 12, sets: 2 },
    { percentage: 0.5, reps: 12, sets: 2 },
    { percentage: 0.5, reps: 10, sets: 3 },
    { percentage: 0.5, reps: 10, sets: 3 },
  ],
  week_4: [
    { percentage: 0.4, reps: 12, sets: 2 },
    { percentage: 0.4, reps: 12, sets: 2 },
    { percentage: 0.4, reps: 12, sets: 3 },
    { percentage: 0.4, reps: 12, sets: 3 },
  ],
  week_5: [
    { percentage: 0.5, reps: 12, sets: 3 },
    { percentage: 0.5, reps: 12, sets: 3 },
    { percentage: 0.5, reps: 12, sets: 3 },
    { percentage: 0.5, reps: 12, sets: 3 },
  ],
  week_6: [
    { percentage: 0.6, reps: 10, sets: 2 },
    { percentage: 0.6, reps: 10, sets: 2 },
    { percentage: 0.6, reps: 10, sets: 3 },
    { percentage: 0.6, reps: 10, sets: 3 },
  ],
};

// ─── Mixed values — user1 only (Tables 12.4 H portion + 12.5 MxS portion) ────
const mixedUser1 = {
  week_1: {
    mxs: [
      { percentage: 0.7, reps: 8, sets: 3 },
      { percentage: 0.7, reps: 8, sets: 3 },
    ],
    h: [{ percentage: 0.5, reps: 12, sets: 3 }],
  },
  week_2: {
    mxs: [
      { percentage: 0.7, reps: 8, sets: 3 },
      { percentage: 0.8, reps: 7, sets: 3 },
    ],
    h: [{ percentage: 0.6, reps: 12, sets: 3 }],
  },
  week_3: {
    mxs: [
      { percentage: 0.8, reps: 8, sets: 4 },
      { percentage: 0.8, reps: 8, sets: 4 },
    ],
    h: [{ percentage: 0.7, reps: 8, sets: 4 }],
  },
};

// ─── Maximum Strength values — user1 only (Table 13.2, Recreational) ────────
const maximumStrengthUser1 = {
  week_1: [
    { percentage: 0.7, reps: 8, sets: 3 },
    { percentage: 0.75, reps: 8, sets: 4 },
    { percentage: 0.75, reps: 8, sets: 4 },
  ],
  week_2: [
    { percentage: 0.8, reps: 6, sets: 4 },
    { percentage: 0.8, reps: 6, sets: 4 },
    {
      percentage: 0.8,
      reps: 6,
      sets: 3,
      finisher: { percentage: 0.9, reps: 3, sets: 1 },
    },
  ],
  week_3: [
    { percentage: 0.9, reps: 3, sets: 4 },
    { percentage: 0.9, reps: 3, sets: 4 },
    { percentage: 0.9, reps: 3, sets: 4 },
  ],
  week_4: [
    { percentage: 0.75, reps: 8, sets: 3 },
    { percentage: 0.75, reps: 8, sets: 4 },
    { percentage: 0.8, reps: 8, sets: 4 },
  ],
  week_5: [
    { percentage: 0.8, reps: 6, sets: 4 },
    { percentage: 0.85, reps: 6, sets: 4 },
    {
      percentage: 0.85,
      reps: 6,
      sets: 3,
      finisher: { percentage: 0.9, reps: 3, sets: 1 },
    },
  ],
  week_6: [
    { percentage: 0.9, reps: 3, sets: 4 },
    { percentage: 0.95, reps: 2, sets: 4 },
    { percentage: 0.95, reps: 2, sets: 4 },
  ],
};

// ─── Muscle Definition values — user1 only (Table 14.1, Recreational) ───────
const muscleDefinitionUser1 = {
  week_1: [{ percentage: 0.3, reps: 30, sets: 2 }],
  week_2: [{ percentage: 0.3, reps: 40, sets: 2 }],
  week_3: [{ percentage: 0.3, reps: 50, sets: 2 }],
  week_4: [{ percentage: 0.3, reps: 50, sets: 2 }], // nonstop pair, 50 each
  week_5: [{ percentage: 0.3, reps: 50, sets: 2 }], // nonstop group of 4, 50 each
  week_6: [{ percentage: 0.3, reps: 50, sets: 2 }], // nonstop all 8, 50 each
};

const PHASE_CONFIG = Object.freeze({
  // ─── Anatomical Adaptation ────────────────────────────────────────────────
  // Source: Table 10.2. Identical for both real users. Full-body circuit,
  // 4 sessions/week, all sessions in a week share the same value (no
  // per-session split shown in this table). 9 exercises per session.
  anatomical_adaptation: {
    poEnabled: true,
    user1: aaShared,
    user2: aaShared,
    user3: aaShared, // TEST ACCOUNT — mirrors user1/user2 (table is identical anyway)
  },

  // ─── Hypertrophy ──────────────────────────────────────────────────────────
  // user1 source: Table 11.4 (Advanced, 5 workouts/week original — adapted to
  // 4 sessions/week per user's actual schedule). Two muscle groups (Lower,
  // Upper), each with a Low session and a High session per week. Session
  // order: 1=Lower/Low, 2=Upper/Low, 3=Lower/High, 4=Upper/High. Lower and
  // Upper use IDENTICAL loading each week (confirmed from the table — both
  // groups step through the same Low/Medium/High progression together).
  //
  // user2 source: Table 11.2 (Entry-level). Same session ordering convention
  // applied. Values read directly from the table's two-column-per-step
  // layout (interpreted as Low/High per week, consistent with user1).
  hypertrophy: {
    poEnabled: true,
    user1: hypertrophyUser1,
    user2: hypertrophyUser2,
    user3: hypertrophyUser1, // TEST ACCOUNT — mirrors user1
  },

  // ─── Mixed ────────────────────────────────────────────────────────────────
  // user1 only. Source: Table 12.4 (H portion) + Table 12.5 (MxS portion),
  // both Recreational. Two session types per week: MxS sessions (straight
  // sets, heavier) and H sessions (split, lighter). H portion uses one value
  // per week shared across both H session groups (Day 2 + Day 6 in the book
  // matched exactly). MxS portion has genuine per-session variation in week 2.
  // N/A for user2 — this user's cycle has no Mixed phase.
  mixed: {
    poEnabled: true,
    user1: mixedUser1,
    user3: mixedUser1, // TEST ACCOUNT — mirrors user1
  },

  // ─── Maximum Strength ─────────────────────────────────────────────────────
  // user1 only. Source: Table 13.2 (Recreational). 3 sessions/week, genuine
  // per-session variation within each week. Week 2, session 3 has a real
  // within-session split: 3 sets at 80/6 followed by a 1-set finisher at
  // 90/3 — captured via the `finisher` field rather than a second top-level
  // session entry. N/A for user2.
  maximum_strength: {
    poEnabled: true,
    user1: maximumStrengthUser1,
    user3: maximumStrengthUser1, // TEST ACCOUNT — mirrors user1
  },

  // ─── Muscle Definition ────────────────────────────────────────────────────
  // user1 only. Source: Table 14.1 (Recreational). One value per week, flat
  // 30% load throughout. Weeks 4-6 are a structural change (nonstop
  // grouping), not a loading change — group_id assignment happens in ai.js,
  // not here. N/A for user2.
  muscle_definition: {
    poEnabled: true,
    user1: muscleDefinitionUser1,
    user3: muscleDefinitionUser1, // TEST ACCOUNT — mirrors user1
  },

  // ─── Transition ───────────────────────────────────────────────────────────
  // Flat, same for every user — not tabled per-user by Bompa. Always reads
  // week_1 regardless of how many weeks the cycle config gives a given
  // transition entry (1-4 weeks). PO disabled. Exercise selection logic
  // (inherit from prior phase, or pre-select for an upcoming MD phase) lives
  // in ai.js/cron.js, not here. No per-user keying needed.
  transition: {
    poEnabled: false,
    week_1: [{ percentage: 0.4, reps: 12, sets: 2 }],
  },
});

// ─── Lookup helpers ───────────────────────────────────────────────────────────

// Returns the array of session configs for a given phase/user/week.
// Each element is { percentage, reps, sets, finisher? } — index into the
// array using the session's position within the week (0-based).
// Not valid for 'mixed' (use getMixedWeekConfig). Transition always returns
// week_1 regardless of weekNumber passed.
// Throws if the combination doesn't exist so callers handle gaps explicitly
// rather than silently receiving undefined.
function getWeekConfig(phase, userKey, weekNumber) {
  const phaseConfig = PHASE_CONFIG[phase];
  if (!phaseConfig) throw new Error(`Unknown phase: ${phase}`);

  if (phase === "transition") {
    return phaseConfig.week_1;
  }

  const userConfig = phaseConfig[userKey];
  if (!userConfig) {
    throw new Error(`No config for phase "${phase}" for user "${userKey}"`);
  }

  const weekKey = `week_${weekNumber}`;
  const week = userConfig[weekKey];
  if (!week) {
    throw new Error(`No ${weekKey} config for ${phase}/${userKey}`);
  }

  return week;
}

// Returns a single session's config from a week array, by session index
// (0-based — session 1 of the week is index 0).
function getSessionConfig(phase, userKey, weekNumber, sessionIndex) {
  const week = getWeekConfig(phase, userKey, weekNumber);
  const session = week[sessionIndex];
  if (!session) {
    throw new Error(
      `No session at index ${sessionIndex} for ${phase}/${userKey}/week_${weekNumber} (week has ${week.length} session(s))`,
    );
  }
  return session;
}

// Returns { mxs: [...], h: [...] } for the Mixed phase at a given user/week.
// Mixed is structurally different from every other phase (two parallel
// session tracks per week), so it gets its own lookup function rather than
// overloading getWeekConfig().
function getMixedWeekConfig(userKey, weekNumber) {
  const userConfig = PHASE_CONFIG.mixed[userKey];
  if (!userConfig) {
    throw new Error(`No mixed config for user "${userKey}"`);
  }

  const weekKey = `week_${weekNumber}`;
  const week = userConfig[weekKey];
  if (!week) {
    throw new Error(`No ${weekKey} config for mixed/${userKey}`);
  }

  return week;
}

module.exports = {
  PHASE_CONFIG,
  getWeekConfig,
  getSessionConfig,
  getMixedWeekConfig,
};
