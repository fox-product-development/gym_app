# GymApp — Project Knowledge File

Last updated: June 2026

---

## 1. Project Overview

GymApp is a multi-user web-based gym tracking application. It uses AI (Claude) to select exercises per training phase, tracks performance, provides weekly coaching reports, and manages progressive overload via periodic 1RM retesting. Training logic follows Tudor Bompa's periodisation methodology from _Serious Strength Training_. Accessible via web browser and bookmarked on iPhone.

---

## 2. Tech Stack

| Layer         | Technology                                 | Notes                                                                       |
| ------------- | ------------------------------------------ | --------------------------------------------------------------------------- |
| Frontend      | React Native with Expo (web export)        | Deployed to Vercel                                                          |
| Navigation    | Expo Router (file-based)                   | One file = one screen                                                       |
| Backend / API | Node.js + Express                          | Deployed to Railway                                                         |
| Database      | PostgreSQL                                 | Hosted on Railway                                                           |
| AI            | Anthropic Claude API (`claude-sonnet-4-6`) | Used for exercise selection, gym session swap, extra session, Sunday report |
| Auth          | JWT tokens                                 | Stored in localStorage; invite-only registration via approved emails        |
| Styling       | Inline React Native styles                 | All colours from `constants/theme.ts`                                       |
| Email         | Resend                                     | Weekly report delivery                                                      |
| Deployment    | Vercel (frontend) + Railway (backend + DB) | Auto-deploys on push to main                                                |

---

## 3. Repository Structure

```
gym_app/
├── app/                        ← Expo Router screens
│   ├── (tabs)/
│   │   ├── index.tsx           ← Dashboard
│   │   ├── week.tsx            ← This Week
│   │   ├── log.tsx             ← Body Comp / Diet / Mood
│   │   ├── progress.tsx        ← Exercise History
│   │   └── settings.tsx        ← Settings
│   ├── _layout.tsx             ← Root layout, auth check
│   ├── login.tsx               ← Login screen
│   ├── register.tsx            ← Registration screen
│   ├── gym-settings.tsx        ← Gym, equipment, plate, exercise management
│   └── session.tsx             ← Active Session screen (includes 1RM test mode)
├── constants/
│   └── theme.ts                ← Design tokens (colours, fonts, spacing)
├── services/
│   └── api.ts                  ← Central API service layer
└── backend/
    ├── index.js                ← Express server entry point + node-cron scheduler
    ├── middleware.js            ← JWT auth middleware
    ├── weightCalc.js           ← Plate-pool weight enumeration for loadable equipment
    ├── email.js                ← Resend integration for weekly reports
    ├── cron.js                 ← Sunday phase advancement + report generation
    ├── cycleConfig.js          ← Per-user phase sequencing (replaces DB cycles table)
    ├── phaseConfig.js          ← Per-phase, per-user, per-week loading values
    ├── prompts/
    │   └── sundayReport.js     ← System prompt and user prompt builder for weekly report
    ├── routes/
    │   ├── auth.js             ← Register, login (approved email check)
    │   ├── user.js             ← Profile
    │   ├── sessions.js         ← Sessions CRUD, set logging, 1RM test completion
    │   ├── bodycomp.js         ← Body composition + image extraction
    │   ├── onerepmax.js        ← 1RM history
    │   ├── ai.js               ← All Claude API calls (phase gen, gym swap, extra session)
    │   ├── gyms.js             ← Gym, equipment, plate, exercise CRUD
    │   ├── diet.js             ← Diet logging + image extraction
    │   ├── mood.js             ← Mood/energy logging
    │   ├── cardio.js           ← Cardio logging
    │   └── report.js           ← Manual report generation
    ├── scripts/
    │   ├── reset-testuser.js   ← Reset test user (user ID 3)
    │   └── populate-testuser.js ← Populate test user data
    └── db/
        ├── index.js            ← PostgreSQL connection pool
        └── schema.js           ← Table definitions (run with --fresh to reset)
```

---

## 4. Design System

All design tokens live in `constants/theme.ts`.

| Token              | Value                    | Usage                                            |
| ------------------ | ------------------------ | ------------------------------------------------ |
| `Colors.bg`        | `#0A1226`                | Screen background                                |
| `Colors.card`      | `#131D38`                | Card background                                  |
| `Colors.card2`     | `#1A2645`                | Secondary card / active states                   |
| `Colors.accent`    | `#FF7763`                | Primary action colour (coral)                    |
| `Colors.accentDim` | `rgba(255,119,99,0.16)`  | Accent background tint                           |
| `Colors.accentInk` | `#1A0A06`                | Text on accent backgrounds                       |
| `Colors.text`      | `#ffffff`                | Primary text                                     |
| `Colors.sec`       | `rgba(255,255,255,0.6)`  | Secondary text                                   |
| `Colors.ter`       | `rgba(255,255,255,0.35)` | Tertiary / label text                            |
| `Colors.warn`      | `#F2B564`                | Warning colour                                   |
| `Colors.line`      | `rgba(255,255,255,0.06)` | Dividers                                         |
| `Colors.line2`     | `rgba(255,255,255,0.10)` | Slightly stronger divider/border (active states) |
| `Colors.qua`       | `rgba(255,255,255,0.18)` | Quaternary text (placeholder/empty values)       |
| `Colors.tabBg`     | `rgba(10,18,38,0.92)`    | Tab bar background                               |
| `Colors.green`     | `#4CAF82`                | Success/positive colour                          |

Font: Courier (monospace for numbers/labels), System (SF Pro on iOS) for body text.

---

## 5. Database Schema

### `users`

| Field                                | Type      | Notes                                                                                           |
| ------------------------------------ | --------- | ----------------------------------------------------------------------------------------------- |
| `id`                                 | SERIAL PK |                                                                                                 |
| `username`                           | TEXT      | Unique                                                                                          |
| `email`                              | TEXT      | Unique                                                                                          |
| `password`                           | TEXT      | bcrypt hashed                                                                                   |
| `is_admin`                           | BOOLEAN   |                                                                                                 |
| `current_phase`                      | TEXT      | anatomical_adaptation / hypertrophy / mixed / maximum_strength / muscle_definition / transition |
| `cycle_position`                     | INTEGER   | Index into CYCLE_CONFIG array in cycleConfig.js                                                 |
| `phase_week`                         | INTEGER   | 1-based, within current cycle entry                                                             |
| `phase_start_date`                   | DATE      | When the current phase started                                                                  |
| `agent_tone`                         | TEXT      | motivational / coaching / neutral / drill_sergeant                                              |
| `conditioning_exercises_per_session` | INTEGER   |                                                                                                 |
| `created_at`                         | TIMESTAMP |                                                                                                 |

### `approved_emails`

| Field      | Type      | Notes                       |
| ---------- | --------- | --------------------------- |
| `id`       | SERIAL PK |                             |
| `email`    | TEXT      | Unique                      |
| `used`     | BOOLEAN   | Set to true on registration |
| `added_at` | TIMESTAMP |                             |

### `gyms`

| Field        | Type       | Notes                                           |
| ------------ | ---------- | ----------------------------------------------- |
| `id`         | SERIAL PK  |                                                 |
| `user_id`    | INTEGER FK |                                                 |
| `gym_name`   | TEXT       |                                                 |
| `is_default` | BOOLEAN    | One default per user; used for phase generation |

### `equipment`

| Field            | Type       | Notes                                         |
| ---------------- | ---------- | --------------------------------------------- |
| `id`             | SERIAL PK  |                                               |
| `user_id`        | INTEGER FK |                                               |
| `gym_id`         | INTEGER FK |                                               |
| `equipment_name` | TEXT       |                                               |
| `type`           | TEXT       | loadable / fixed / machine / apparatus        |
| `unladen_weight` | NUMERIC    | Bar/handle weight for loadable equipment      |
| `increment`      | NUMERIC    | Weight step for fixed/machine                 |
| `max_weight`     | NUMERIC    | Maximum weight for fixed/machine              |
| `unit`           | TEXT       | kg or lbs — display suffix and increment unit |

### `plates`

| Field      | Type       | Notes                                             |
| ---------- | ---------- | ------------------------------------------------- |
| `id`       | SERIAL PK  |                                                   |
| `user_id`  | INTEGER FK |                                                   |
| `gym_id`   | INTEGER FK |                                                   |
| `weight`   | NUMERIC    | Weight per plate (unitless — unit from equipment) |
| `quantity` | INTEGER    | Total count of this plate size                    |

### `conditioning`

Shared conditioning exercise library (gym_id nullable — most apply to all gyms).

| Field      | Type       | Notes                                                     |
| ---------- | ---------- | --------------------------------------------------------- |
| `id`       | SERIAL PK  |                                                           |
| `exercise` | TEXT       |                                                           |
| `category` | TEXT       | cardio / core / mobility / trx                            |
| `metric`   | TEXT       | time / reps                                               |
| `target`   | INTEGER    | Default target (seconds for time, count for reps)         |
| `sets`     | INTEGER    | Default 3                                                 |
| `gym_id`   | INTEGER FK | NULL = available at all gyms; specific ID = that gym only |

### `programmes`

One row per phase run.

| Field         | Type       | Notes                                             |
| ------------- | ---------- | ------------------------------------------------- |
| `id`          | SERIAL PK  |                                                   |
| `user_id`     | INTEGER FK |                                                   |
| `phase`       | TEXT       | Same CHECK as users.current_phase                 |
| `total_weeks` | INTEGER    | How many weeks this phase runs (from cycleConfig) |
| `week_start`  | DATE       |                                                   |
| `created_at`  | TIMESTAMP  |                                                   |

### `sessions`

One row per training session (planned or completed).

| Field          | Type       | Notes                                                                  |
| -------------- | ---------- | ---------------------------------------------------------------------- |
| `id`           | SERIAL PK  |                                                                        |
| `programme_id` | INTEGER FK |                                                                        |
| `user_id`      | INTEGER FK |                                                                        |
| `gym_id`       | INTEGER FK | References gyms table                                                  |
| `session_type` | TEXT       | full_body / upper / lower / mixed_mxs / mixed_h_24 / mixed_h_6 / extra |
| `week_number`  | INTEGER    | Within the phase (1-6)                                                 |
| `is_1rm_test`  | BOOLEAN    | Flags session as 1RM testing session                                   |
| `status`       | TEXT       | planned / in_progress / complete                                       |
| `notes`        | TEXT       | Session-level notes                                                    |
| `started_at`   | TIMESTAMP  |                                                                        |
| `completed_at` | TIMESTAMP  |                                                                        |
| `created_at`   | TIMESTAMP  |                                                                        |

Note: `session_type` values depend on the phase. User 2's Mixed phase also uses `mixed_h_1` and `mixed_h_2` — the CHECK constraint on the live DB has been broadened to allow any text value (old enum constraint was dropped during redesign).

### `planned_exercises`

One row per exercise within a session. Includes both weight exercises and conditioning exercises (conditioning has `muscles_primary = 'Conditioning'`).

| Field             | Type       | Notes                                                          |
| ----------------- | ---------- | -------------------------------------------------------------- |
| `id`              | SERIAL PK  |                                                                |
| `session_id`      | INTEGER FK |                                                                |
| `exercise_name`   | TEXT       |                                                                |
| `muscles_primary` | TEXT       | 'Conditioning' for conditioning exercises                      |
| `sub_component`   | TEXT       | e.g. "Sternal head", "Lower lat"                               |
| `order_index`     | INTEGER    | Display order                                                  |
| `target_sets`     | INTEGER    |                                                                |
| `target_reps`     | INTEGER    |                                                                |
| `target_weight`   | NUMERIC    | kg for weights; seconds for time-based conditioning            |
| `set_style`       | TEXT       | standard / drop                                                |
| `metric`          | TEXT       | time / reps (conditioning only)                                |
| `group_id`        | INTEGER    | MD weeks 4-6 nonstop grouping; NULL for all other phases/weeks |
| `finisher_weight` | NUMERIC    | Nullable — finisher set weight (phases with finisher loading)  |
| `finisher_reps`   | INTEGER    | Nullable — finisher set reps                                   |
| `finisher_sets`   | INTEGER    | Nullable — finisher set count                                  |
| `created_at`      | TIMESTAMP  |                                                                |

### `logged_sets`

One row per set actually completed during a session.

| Field           | Type       | Notes                 |
| --------------- | ---------- | --------------------- |
| `id`            | SERIAL PK  |                       |
| `session_id`    | INTEGER FK |                       |
| `exercise_name` | TEXT       |                       |
| `set_number`    | INTEGER    |                       |
| `drop_number`   | INTEGER    | Default 0             |
| `weight`        | NUMERIC    |                       |
| `reps`          | INTEGER    | Actual reps completed |
| `notes`         | TEXT       | Per-set notes         |
| `logged_at`     | TIMESTAMP  |                       |

### `one_rep_max_history`

Written ONLY by the 1RM test completion handler in sessions.js. Normal session set logging does not write here.

| Field            | Type       | Notes                         |
| ---------------- | ---------- | ----------------------------- |
| `id`             | SERIAL PK  |                               |
| `user_id`        | INTEGER FK |                               |
| `exercise_name`  | TEXT       |                               |
| `estimated_1rm`  | NUMERIC    | Epley: weight × (1 + reps/30) |
| `weight_used`    | NUMERIC    | Nullable                      |
| `reps_performed` | INTEGER    | Nullable                      |
| `logged_at`      | TIMESTAMP  |                               |

### `exercises`

One row per exercise per user per gym. Linked to specific equipment via `equipment_id`.

| Field               | Type       | Notes                                                   |
| ------------------- | ---------- | ------------------------------------------------------- |
| `id`                | SERIAL PK  |                                                         |
| `user_id`           | INTEGER FK |                                                         |
| `gym_id`            | INTEGER FK |                                                         |
| `equipment_id`      | INTEGER FK | References equipment — drives weight validation         |
| `exercise`          | TEXT       |                                                         |
| `muscles_primary`   | TEXT       |                                                         |
| `muscles_secondary` | TEXT       |                                                         |
| `type`              | TEXT       | Compound / Isolation                                    |
| `sub_component`     | TEXT       |                                                         |
| `emg_score`         | INTEGER    | 1–5                                                     |
| `active`            | BOOLEAN    | Default true; inactive exercises excluded from planning |
| `target_weight`     | NUMERIC    | Legacy/informational — not used for weight calculation  |
| `created_at`        | TIMESTAMP  |                                                         |

### `body_composition`

| Field            | Type         | Notes                         |
| ---------------- | ------------ | ----------------------------- |
| `id`             | SERIAL PK    |                               |
| `user_id`        | INTEGER FK   |                               |
| `weight_kg`      | NUMERIC      |                               |
| `muscle_mass_kg` | NUMERIC      |                               |
| `body_fat_pct`   | NUMERIC(4,1) | Optional                      |
| `logged_at`      | DATE         |                               |
| `source`         | TEXT         | manual / apple_health / image |

### `weekly_feedback`

| Field                      | Type       | Notes                      |
| -------------------------- | ---------- | -------------------------- |
| `id`                       | SERIAL PK  |                            |
| `user_id`                  | INTEGER FK |                            |
| `week_start_date`          | DATE       | Monday of the week covered |
| `ai_summary`               | TEXT       | Full plain text report     |
| `phase_change_recommended` | BOOLEAN    |                            |
| `phase_change_suggestion`  | TEXT       |                            |
| `created_at`               | TIMESTAMP  |                            |

### `diet_logs`

| Field             | Type       | Notes                   |
| ----------------- | ---------- | ----------------------- |
| `id`              | SERIAL PK  |                         |
| `user_id`         | INTEGER FK |                         |
| `logged_at`       | DATE       | Unique per user per day |
| `calories_kcal`   | NUMERIC    |                         |
| `fat_g`           | NUMERIC    |                         |
| `saturated_fat_g` | NUMERIC    |                         |
| `carbs_g`         | NUMERIC    |                         |
| `sugar_g`         | NUMERIC    |                         |
| `fibre_g`         | NUMERIC    |                         |
| `protein_g`       | NUMERIC    |                         |
| `salt_g`          | NUMERIC    |                         |

### `mood_logs`

| Field       | Type       | Notes                   |
| ----------- | ---------- | ----------------------- |
| `id`        | SERIAL PK  |                         |
| `user_id`   | INTEGER FK |                         |
| `logged_at` | DATE       | Unique per user per day |
| `mood`      | INTEGER    | 1–5                     |
| `energy`    | INTEGER    | 1–5                     |
| `notes`     | TEXT       |                         |

### `cardio_logs`

| Field              | Type       | Notes |
| ------------------ | ---------- | ----- |
| `id`               | SERIAL PK  |       |
| `user_id`          | INTEGER FK |       |
| `logged_at`        | DATE       |       |
| `activity_type`    | TEXT       |       |
| `duration_minutes` | INTEGER    |       |
| `distance_km`      | NUMERIC    |       |
| `notes`            | TEXT       |       |

---

## 6. Training Logic

### Phase Sequencing

Phase sequencing is defined in `cycleConfig.js`, not the database. Each user has their own cycle array keyed by `user1`, `user2`, etc. The `cycle_position` column on the users table is an index into this array. When a phase completes (phase_week reaches the entry's `weeks` value), cycle_position increments and wraps to 0 at the end.

There are no blocks. The AI selects exercises ONCE per phase, and every week within that phase reuses those exercises with different loading values from `phaseConfig.js`.

There are no rest weeks as a separate mechanism. Transition entries in the cycle config serve this purpose — they inherit exercises from the prior phase and apply reduced loading.

### User Cycles

**User 1:** 52-week annual cycle (14 entries):
AA → H → Mixed → MxS → T → MD → T → AA → H → Mixed → MxS → T → H(temp) → T

**User 2:** 18-entry, 52-week non-bulk cycle modelled on Bompa Figure 2.6. No standalone MxS phases.

### Phase Session Types

Each phase has its own session structure defined in `PHASE_SESSION_TEMPLATES` in `ai.js`. Session types are phase-specific, not the old compound/isolation model:

| Phase                 | Session types                               | Sessions/week |
| --------------------- | ------------------------------------------- | ------------- |
| Anatomical Adaptation | full_body ×4 (same exercises)               | 4             |
| Hypertrophy           | lower, upper, lower, upper                  | 4             |
| Mixed (user 1)        | mixed_mxs, mixed_h_24, mixed_mxs, mixed_h_6 | 4             |
| Mixed (user 2)        | mixed_h_1, mixed_h_2, mixed_mxs, mixed_h_6  | 4             |
| Maximum Strength      | full_body ×3 (same exercises)               | 3             |
| Muscle Definition     | full_body ×4 (same exercises)               | 4             |
| Transition            | Inherits prior phase's session types        | 3             |

### Mixed Phase — User-Keyed Templates

Unlike all other phases, Mixed has genuinely different session structures per user:

**User 1:** 2 MxS + 2 H sessions. mixed_h_24 and mixed_h_6 share 3 exercises by AI instruction.

**User 2:** 1 MxS + 3 H sessions. Session 4 (mixed_h_6) is NOT AI-selected — it is built server-side by `buildUser2MixedH6()` as a deterministic copy of specific exercises from Sessions 1 and 2, following Table 12.2's Day 6 column via `h6ReuseMap`.

### Weight Calculation

The server calculates all weights — the AI only selects exercises. The weight pipeline is:

1. `buildWeightLookup()` fetches the most recent 1RM per exercise from `one_rep_max_history`
2. `calculateExerciseWeight()` multiplies 1RM × the session config's percentage (from `phaseConfig.js`). Returns 0 if no 1RM exists.
3. `enrichExercisesForSession()` applies sets, reps, and weight per exercise from the session config, including finisher sets where the config defines them
4. `validateAndCorrectWeights()` snaps weights to physically achievable values:
   - **Loadable equipment** (barbells, EZ bars, plate-loaded dumbbells): calls `getValidWeightsForEquipment()` from `weightCalc.js` to enumerate all achievable weights from the plate pool, then snaps to the nearest one. Results are cached per equipment_id.
   - **Fixed/machine equipment**: rounds to the nearest increment value
   - Both paths apply `max_weight` cap

### Hamstring Load Reduction

Hamstrings receive a flat −10 percentage-point load reduction plus 1 fewer rep per set. This is a static drop applied in `enrichExercisesForSession()`, not a multiplier. The reduction is skipped during Muscle Definition to preserve nonstop pairing rep counts.

### 1RM Testing Schedule

1RM retesting is the sole progressive overload mechanism. Tests are scheduled every 3 weeks — week 1 of every phase, and week 4 for 6-week phases. Within a test week, the first occurrence of each distinct session type is flagged as `is_1rm_test = true`. Transition phases never test.

When a 1RM test session is completed, `recalculateFromOneRmTest` in `sessions.js` writes new 1RM values to `one_rep_max_history` and recalculates target weights for all remaining sessions in the current programme.

### Muscle Definition — Nonstop Grouping

MD weeks 4-6 use `group_id` on planned_exercises to assign exercises into nonstop-execution groups:

- Week 4: 4 pairs (groups 1-4, 2 exercises each)
- Week 5: 2 groups of 4 (groups 1-2)
- Week 6: 1 group of 8 (group 1, all exercises)

Weeks 1-3 have no grouping (group_id = NULL).

### Finisher Sets

Some phase/week configs in `phaseConfig.js` include a finisher block (additional sets at a different percentage/reps after the main sets). These are stored as three nullable columns on `planned_exercises`: `finisher_weight`, `finisher_reps`, `finisher_sets`.

### Gym Setup

Each user has one or more gyms in the `gyms` table with one marked as default. Phase generation uses the default gym. Session gym swap allows switching to any gym — the AI regenerates exercises for the selected gym.

Exercises are stored in the `exercises` table per user per gym, linked to specific equipment via `equipment_id`. The `buildGymCSV` function JOINs exercises to equipment and includes `equipment_name` per exercise row in the AI prompt.

---

## 7. AI Routes

All Claude API calls are in `backend/routes/ai.js`. Model: `claude-sonnet-4-6`.

### POST /ai/generate-phase

- Called ONCE when a new phase starts (triggered by cron.js)
- Accepts either a valid JWT (frontend) or `x-cron-secret` header (cron job)
- AI selects exercises for the entire phase in a single call
- Server generates every week's sessions from those exercises using phaseConfig loading values
- For user2's Mixed phase, mixed_h_6 is built server-side (not AI-selected)
- Transition phases that are NOT pre-selecting MD exercises inherit from the prior programme (no AI call)
- Transition phases preceding MD pre-select MD exercises at transition loading
- Includes conditioning exercises from the `conditioning` table
- `validateAndCorrectWeights` runs on all exercises before saving
- Max tokens: 2500

### POST /ai/generate-gym-session

- Called when user confirms gym swap at session start
- Takes `session_id` and `gym_id`
- AI selects exercises for that one session at the swap gym
- Server applies that week's phaseConfig loading
- `validateAndCorrectWeights` runs before saving
- Marks session as in_progress immediately
- Max tokens: 1500

### POST /ai/extra-session

- Called from Extra Session UI on week screen
- Takes `gym_id` and optional `session_type`
- AI selects exercises based on undertrained muscle groups and recovery needs
- Server applies current week's phaseConfig loading
- `validateAndCorrectWeights` runs before saving
- Creates session with session_type = 'extra', starts immediately
- Max tokens: 1500

### POST /ai/exercise-metadata

- Takes `exercise_name`, returns AI-generated metadata (muscles, type, sub-component, EMG score)
- Used by the add-exercise flow in gym settings

### POST /ai/suggest-exercises

- Takes `gym_id`, returns 15 suggested exercises with `equipment_id` values
- AI receives the gym's equipment list and assigns exercises to specific equipment
- Max tokens: 3000

### GET /ai/weekly-feedback

- Returns the most recent Sunday report for the user

### POST /ai/test-advance-phase

- Cron-secret only — not callable via JWT
- Wraps cron.js's `runPhaseAdvancementForUser` for testing

### POST /report/generate (in report.js)

- Manual report generation endpoint
- Optional `week_start_date` to regenerate a past week's report
- Calls `generateReportForUser` from cron.js

### POST /bodycomp/extract-from-image

- Accepts base64-encoded scale screenshot
- Claude extracts weight, muscle mass, and body fat %
- Returns values for frontend confirmation before saving

### cron.js (Sunday 10:30PM UTC — node-cron, runs inside Express server)

Phase advancement logic runs first, then report generation:

1. Read all users
2. For each user, call `advancePhaseWeek`:
   - If `phase_week < entry.weeks`: increment phase_week
   - If `phase_week >= entry.weeks`: advance to next cycle entry, reset phase_week to 1, trigger phase generation via internal HTTP call to `/ai/generate-phase`
3. Generate weekly coaching report for each user (Claude API call with structured prompt)
4. Store report in `weekly_feedback` table
5. Email report to user via Resend

---

## 8. Exercise Selection Rules (for AI context)

The AI applies these rules in priority order when selecting exercises for a phase:

1. **Sub-component coverage** — avoid repeating the same sub-component used in the athlete's previous phase
2. **Progressive overload** — favour exercises with stronger historical performance
3. **Recency** — deprioritise exercises from the immediately preceding phase unless EMG gap is 2+ points
4. **EMG score** (1–5) — prefer higher scores when other factors are equal
5. **Tiebreaker** — table order in the exercise library

**Exercise ordering rule:** Do not place exercises targeting the same primary muscle group consecutively. Alternate between upper and lower body where possible.

**Conditioning selection:** At least 1 cardio category and 1 core category per session. Exercise names must match the conditioning library exactly.

---

## 9. API Endpoints Summary

| Method | Path                         | Description                                       |
| ------ | ---------------------------- | ------------------------------------------------- |
| POST   | /auth/register               | Create account (approved email required)          |
| POST   | /auth/login                  | Login, returns JWT                                |
| GET    | /user/profile                | Get user profile                                  |
| PATCH  | /user/profile                | Update profile (agent_tone, conditioning count)   |
| GET    | /sessions/week               | Get sessions for current phase_week               |
| GET    | /sessions/:id                | Get single session with exercises and logged sets |
| POST   | /sessions                    | Create a session                                  |
| PATCH  | /sessions/:id/start          | Start a session                                   |
| POST   | /sessions/:id/sets           | Log a set                                         |
| PATCH  | /sessions/:id/complete       | Complete a session (triggers 1RM recalc if test)  |
| PATCH  | /sessions/:id/reopen         | Reopen a completed session                        |
| POST   | /bodycomp                    | Log body composition entry                        |
| GET    | /bodycomp                    | Get body comp history                             |
| POST   | /bodycomp/extract-from-image | Extract body comp values from scale screenshot    |
| GET    | /onerepmax                   | Get latest 1RM for all exercises                  |
| GET    | /onerepmax/:exercise         | Get full 1RM history for one exercise             |
| POST   | /ai/generate-phase           | Generate a training phase                         |
| POST   | /ai/generate-gym-session     | Regenerate session for a different gym            |
| POST   | /ai/extra-session            | Generate and start extra session                  |
| POST   | /ai/exercise-metadata        | AI lookup for exercise metadata                   |
| POST   | /ai/suggest-exercises        | AI suggests exercises for a gym                   |
| GET    | /ai/weekly-feedback          | Get latest Sunday report                          |
| POST   | /ai/test-advance-phase       | Test phase advancement (cron-secret only)         |
| POST   | /report/generate             | Manually generate a weekly report                 |
| POST   | /diet                        | Log diet entry                                    |
| GET    | /diet                        | Get diet history                                  |
| POST   | /diet/extract-from-image     | Extract diet data from food label photo           |
| POST   | /mood                        | Log mood entry                                    |
| GET    | /mood                        | Get mood history                                  |
| POST   | /cardio                      | Log cardio entry                                  |
| GET    | /cardio                      | Get cardio history                                |
| PUT    | /cardio/:id                  | Update cardio entry                               |
| DELETE | /cardio/:id                  | Delete cardio entry                               |
| POST   | /cardio/extract-from-image   | Extract cardio from screenshot                    |
| GET    | /gyms                        | Get user's gyms                                   |
| POST   | /gyms                        | Create a gym                                      |
| PATCH  | /gyms/:id                    | Update gym (name, default)                        |
| DELETE | /gyms/:id                    | Delete gym                                        |
| GET    | /gyms/:gymId/equipment       | Get equipment for a gym                           |
| POST   | /gyms/:gymId/equipment       | Add equipment                                     |
| PATCH  | /gyms/:gymId/equipment/:id   | Update equipment                                  |
| DELETE | /gyms/:gymId/equipment/:id   | Delete equipment                                  |
| GET    | /gyms/:gymId/plates          | Get plates for a gym                              |
| POST   | /gyms/:gymId/plates          | Add plate size                                    |
| PATCH  | /gyms/:gymId/plates          | Batch update plate quantities                     |
| DELETE | /gyms/:gymId/plates/:id      | Delete plate size                                 |
| GET    | /gyms/:gymId/exercises       | Get exercises for a gym                           |
| POST   | /gyms/:gymId/exercises       | Add exercise (with equipment_id)                  |
| PATCH  | /gyms/:gymId/exercises/:id   | Update exercise                                   |
| DELETE | /gyms/:gymId/exercises/:id   | Delete exercise                                   |

---

## 10. Environment Variables

### Backend (Railway)

| Variable            | Description                                       |
| ------------------- | ------------------------------------------------- |
| `DATABASE_URL`      | PostgreSQL connection string (Railway internal)   |
| `JWT_SECRET`        | Secret key for JWT signing                        |
| `ANTHROPIC_API_KEY` | Claude API key                                    |
| `CRON_SECRET`       | Secret key for internal cron → API authentication |
| `RESEND_API_KEY`    | API key for Resend email service                  |
| `PORT`              | Set automatically by Railway                      |

---

## 11. Current State (June 2026)

- Multi-user support live — two active users plus test user (user ID 3)
- Domain live at gym.activitycoach.co.uk
- Bompa redesign complete: cycleConfig drives phase sequencing, phaseConfig drives loading, AI selects exercises once per phase, server calculates all weights
- Phase-specific session types replace compound/isolation model
- 1RM retesting every 3 weeks as sole progressive overload mechanism
- Mixed phase fully implemented with user-keyed templates
- Muscle Definition nonstop grouping (weeks 4-6) with group_id
- Finisher sets supported via nullable columns on planned_exercises
- Transition phases inherit exercises from prior phase at reduced loading
- Weight validation covers both plate-based (loadable) and fixed-increment equipment
- Conditioning exercises system active (22 exercises across cardio, core, mobility, TRX)
- Equipment-driven weight constraints via equipment_id FK
- Sunday coaching reports with causal narrative, per-user agent tone, emailed via Resend
- Activity Coach bridge removed (app decommissioned)

### Code review backlog (bugs)

1. `ai.js` `validateAndCorrectWeights`: trailing underscore bug from `_kg` rename (`increment_` and `max_weight_`) — weight snapping and max cap never run — **may be resolved by the June 22 rewrite; verify**
2. `ai.js` `generate-gym-session`: `phase_week` is undefined in prompt — lives on users table, not sessions table
3. `session.tsx`: per-exercise notes captured in UI but never passed to `onLogSet` or sent to API
4. `session.tsx`: `sessionId` prop on `ExerciseBlock` declared but never used
5. `gym-settings.tsx`: equipment and plate deletion have no confirmation step
6. `session.tsx`: `Colors.line2` and `Colors.qua` used but not in documented theme tokens

### Non-urgent backlog

1. Update `schema.js` to allow NULL on `weight_used` and `reps_performed` in `one_rep_max_history` (DB already altered)

### Upcoming features

1. Extra session: add session type picker (isolation or compound) before gym selection
2. POST `/ai/propose-cycle`: reads goal sliders, proposes phase sequence (frontend `proposeCycle()` exists, route not implemented)
3. Sunday AI report: prompt too long, not pulling from session notes or exercise notes — needs streamlining

### Known issues

1. Extra session modal: cancel on frontend doesn't abort backend API call — session still created after navigating away
2. AI exercise ordering: similar muscle group exercises placed consecutively — need spacing rule enforcement
3. `mixedWeek.sessionOrder` in `ai.js` is module-level constant rather than user-keyed (working correctly by coincidence)
