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
//   session index 2, and mixed.user2.week_2 mxs entry, for examples.
//
// Source tables used per phase per user (see BOMPA_PROGRAMME_REFERENCE.md
// for the full book context):
//   AA            — Table 10.2, both users (identical table)
//   Hypertrophy   — Table 11.4 (user1, Advanced), Table 11.2 (user2, Entry)
//   Mixed         — Tables 12.4 + 12.5 (user1, Recreational H + MxS portions).
//                   Tables 12.2 + 12.3 (user2, Entry-level H + MxS portions).
//   MxS           — Table 13.2 (user1, Recreational). N/A for user2 — Bompa
//                   advises Entry-level athletes avoid MxS work; no table
//                   provided. See cycleConfig.js note re: user2's MxS slots.
//   MD            — Table 14.1 (user1, Recreational). user2 shares this same
//                   table — Bompa provides no Entry-level MD table and flags
//                   no specific concern for Entry-level athletes doing MD
//                   work (unlike MxS), so Mike has opted to reuse the
//                   Recreational values as-is for now rather than modify
//                   them without a source basis.
//
// "Session" here means session number within the week (1st, 2nd, 3rd...),
// NOT a calendar day. Which day of the week a session actually falls on is
// determined by the user's real-world schedule, not by this config.
//
// TABLE TRANSCRIPTION NOTE: where a Bompa table shows minor per-exercise
// variation within a week (e.g. one exercise's rep count differs slightly
// from the rest, or a rep-only row with no percentage), that variation is
// not captured here — PHASE_CONFIG stores one value per session for the
// week, matching the table's dominant/majority pattern. Hamstring-specific
// differences are excluded from this rule entirely, since hamstrings
// already get a dedicated flat adjustment elsewhere (-10 percentage points,
// -1 rep — see enrichExercisesForSession in ai.js) and should not also be
// reflected here.
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

// ─── Mixed values — user1 (Tables 12.4 H portion + 12.5 MxS portion) ────────
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

// ─── Mixed values — user2 (Tables 12.2 H portion + 12.3 MxS portion, Entry) ──
// H portion (Table 12.2): dominant pattern across both muscle-group tracks
// is LOW/MEDIUM/HIGH at 40/50/60%, 12 reps, 3 sets. Minor per-exercise
// variation in the source table (e.g. standing leg curl staying at 10 reps
// rather than stepping to 60%, back extension being rep-only) is not
// captured here — see file header TABLE TRANSCRIPTION NOTE.
//
// MxS portion (Table 12.3): only 1 MxS session/week (vs user1's 2), on Day
// 4 (weeks 1-2) / Day 5 (week 3). Week 2 has a genuine within-session split
// — 1 set at 70/8 followed by 2 sets at 80/6 — captured via the `finisher`
// field, consistent with how user1's maximum_strength week_2 session 3
// already handles a main+finisher split.
const mixedUser2 = {
  week_1: {
    mxs: [{ percentage: 0.7, reps: 7, sets: 3 }],
    h: [{ percentage: 0.4, reps: 12, sets: 3 }],
  },
  week_2: {
    mxs: [
      {
        percentage: 0.7,
        reps: 8,
        sets: 1,
        finisher: { percentage: 0.8, reps: 6, sets: 2 },
      },
    ],
    h: [{ percentage: 0.5, reps: 12, sets: 3 }],
  },
  week_3: {
    mxs: [{ percentage: 0.8, reps: 6, sets: 3 }],
    h: [{ percentage: 0.6, reps: 10, sets: 3 }],
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

// ─── Muscle Definition values — user1 (Table 14.1, Recreational) ───────────
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
  // user1 source: Table 12.4 (H portion) + Table 12.5 (MxS portion), both
  // Recreational. 2 MxS sessions + 2 H sessions per week. H portion uses
  // one value per week shared across both H session groups (Day 2 + Day 6
  // in the book matched exactly). MxS portion has genuine per-session
  // variation in week 2.
  //
  // user2 source: Table 12.2 (H portion) + Table 12.3 (MxS portion), both
  // Entry-level. 1 MxS session + 3 H sessions per week — a different split
  // from user1. See PHASE_SESSION_TEMPLATES.mixed in ai.js: the
  // sessionOrder there is currently fixed at module level for user1's 2+2
  // split and will need a user2-specific equivalent before user2 can
  // actually run a Mixed phase — flagged as a follow-up, not addressed
  // here.
  mixed: {
    poEnabled: true,
    user1: mixedUser1,
    user2: mixedUser2,
    user3: mixedUser1, // TEST ACCOUNT — mirrors user1
  },

  // ─── Maximum Strength ─────────────────────────────────────────────────────
  // user1 only. Source: Table 13.2 (Recreational). 3 sessions/week, genuine
  // per-session variation within each week. Week 2, session 3 has a real
  // within-session split: 3 sets at 80/6 followed by a 1-set finisher at
  // 90/3 — captured via the `finisher` field rather than a second top-level
  // session entry.
  //
  // N/A for user2 — Bompa advises Entry-level athletes avoid MxS work, and
  // provides no Entry-level table for this phase. user2's cycleConfig.js
  // still contains maximum_strength entries pending Mike's decision to swap
  // them to anatomical_adaptation; until that's applied, those cycle
  // positions will throw at lookup time for user2. See cycleConfig.js note.
  maximum_strength: {
    poEnabled: true,
    user1: maximumStrengthUser1,
    user3: maximumStrengthUser1, // TEST ACCOUNT — mirrors user1
  },

  // ─── Muscle Definition ────────────────────────────────────────────────────
  // user1 source: Table 14.1 (Recreational). One value per week, flat 30%
  // load throughout. Weeks 4-6 are a structural change (nonstop grouping),
  // not a loading change — group_id assignment happens in ai.js, not here.
  //
  // user2: shares user1's values (same object reference, not a copy).
  // Bompa provides no Entry-level MD table and flags no specific concern
  // for Entry-level athletes doing MD work (unlike MxS) — Mike has opted to
  // reuse the Recreational values as-is for now rather than introduce
  // unsourced modifications. Revisit if this doesn't suit user2 in
  // practice.
  muscle_definition: {
    poEnabled: true,
    user1: muscleDefinitionUser1,
    user2: muscleDefinitionUser1, // shares user1's values — see note above
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
