# GymApp — Project Knowledge File

Last updated: June 2026

---

## 1. Project Overview

GymApp is a multi-user web-based gym tracking application. It uses AI (Claude) to generate training blocks, track performance, provide weekly feedback, and manage progressive overload across periodisation phases. Accessible via web browser and bookmarked on iPhone.

---

## 2. Tech Stack

| Layer         | Technology                                 | Notes                                                                     |
| ------------- | ------------------------------------------ | ------------------------------------------------------------------------- |
| Frontend      | React Native with Expo (web export)        | Deployed to Vercel                                                        |
| Navigation    | Expo Router (file-based)                   | One file = one screen                                                     |
| Backend / API | Node.js + Express                          | Deployed to Railway                                                       |
| Database      | PostgreSQL                                 | Hosted on Railway                                                         |
| AI            | Anthropic Claude API (`claude-sonnet-4-6`) | Used for block generation, gym session swap, extra session, Sunday report |
| Auth          | JWT tokens                                 | Stored in localStorage; invite-only registration via approved emails      |
| Styling       | Inline React Native styles                 | All colours from `constants/theme.ts`                                     |
| Email         | Resend                                     | Weekly report delivery                                                    |
| Deployment    | Vercel (frontend) + Railway (backend + DB) | Auto-deploys on push to main                                              |

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
│   ├── _layout.tsx             ← Root layout, auth check, onboarding redirect
│   ├── login.tsx               ← Login screen
│   ├── register.tsx            ← Registration screen
│   ├── onboarding.tsx          ← 4-step onboarding / goal redefine flow
│   ├── gym-settings.tsx        ← Gym, equipment, plate, exercise management
│   └── session.tsx             ← Active Session screen
├── constants/
│   ├── theme.ts                ← Design tokens (colours, fonts, spacing)
│   └── gyms.ts                 ← Legacy exercise libraries (no longer used)
├── services/
│   └── api.ts                  ← Central API service layer
└── backend/
    ├── index.js                ← Express server entry point + node-cron scheduler
    ├── middleware.js            ← JWT auth middleware
    ├── weightCalc.js           ← DB-driven weight calculation (replaces validWeights.js)
    ├── email.js                ← Resend integration for weekly reports
    ├── cron.js                 ← Sunday report + phase advancement + block generation
    ├── routes/
    │   ├── auth.js             ← Register, login (approved email check)
    │   ├── user.js             ← Profile (includes exercise/session count settings)
    │   ├── sessions.js         ← Sessions CRUD, set logging, PO detection, replan
    │   ├── bodycomp.js         ← Body composition + image extraction
    │   ├── onerepmax.js        ← 1RM history
    │   ├── ai.js               ← All Claude API calls
    │   ├── gyms.js             ← Gym, equipment, plate, exercise CRUD
    │   ├── diet.js             ← Diet logging + image extraction
    │   ├── mood.js             ← Mood/energy logging
    │   ├── cardio.js           ← Cardio logging
    │   └── report.js           ← Manual report generation
    └── db/
        ├── index.js            ← PostgreSQL connection pool
        └── schema.js           ← Table definitions (run with --fresh to reset)
```

---

## 4. Design System

All design tokens live in `constants/theme.ts`.

| Token              | Value                    | Usage                          |
| ------------------ | ------------------------ | ------------------------------ |
| `Colors.bg`        | `#0A1226`                | Screen background              |
| `Colors.card`      | `#131D38`                | Card background                |
| `Colors.card2`     | `#1A2645`                | Secondary card / active states |
| `Colors.accent`    | `#FF7763`                | Primary action colour (coral)  |
| `Colors.accentDim` | `rgba(255,119,99,0.16)`  | Accent background tint         |
| `Colors.accentInk` | `#1A0A06`                | Text on accent backgrounds     |
| `Colors.text`      | `#ffffff`                | Primary text                   |
| `Colors.sec`       | `rgba(255,255,255,0.6)`  | Secondary text                 |
| `Colors.ter`       | `rgba(255,255,255,0.35)` | Tertiary / label text          |
| `Colors.warn`      | `#F2B564`                | Warning colour                 |
| `Colors.line`      | `rgba(255,255,255,0.06)` | Dividers                       |

Font: Courier (monospace for numbers/labels), System (SF Pro on iOS) for body text.

---

## 5. Database Schema

### `users`

| Field                                | Type      | Notes                                                                      |
| ------------------------------------ | --------- | -------------------------------------------------------------------------- |
| `id`                                 | SERIAL PK |                                                                            |
| `username`                           | TEXT      | Unique                                                                     |
| `email`                              | TEXT      |                                                                            |
| `password`                           | TEXT      | bcrypt hashed                                                              |
| `is_admin`                           | BOOLEAN   |                                                                            |
| `current_phase`                      | TEXT      | anatomical_adaptation / hypertrophy / maximum_strength / muscle_definition |
| `current_block`                      | INTEGER   | 1 or 2                                                                     |
| `phase_week`                         | INTEGER   | 1–7 within current phase (week 7 = rest week)                              |
| `phase_start_date`                   | DATE      | When the current phase started                                             |
| `phase_cycle`                        | TEXT      |                                                                            |
| `agent_tone`                         | TEXT      | motivational / coaching / neutral / drill_sergeant                         |
| `training_level`                     | TEXT      | new / amateur / serious / professional                                     |
| `weekly_sessions`                    | INTEGER   |                                                                            |
| `weight_exercises_per_session`       | INTEGER   | Default 6                                                                  |
| `conditioning_exercises_per_session` | INTEGER   | Default 3                                                                  |
| `goal_size`                          | INTEGER   | 1–5 star rating                                                            |
| `goal_strength`                      | INTEGER   | 1–5 star rating                                                            |
| `goal_definition`                    | INTEGER   | 1–5 star rating                                                            |
| `goal_fitness`                       | INTEGER   | 1–5 star rating                                                            |
| `goal_description`                   | TEXT      | Free text — used as "Athlete notes" in AI prompts                          |

### `gyms`

| Field        | Type       | Notes                                           |
| ------------ | ---------- | ----------------------------------------------- |
| `id`         | SERIAL PK  |                                                 |
| `user_id`    | INTEGER FK |                                                 |
| `gym_name`   | TEXT       |                                                 |
| `is_default` | BOOLEAN    | One default per user; used for block generation |

### `equipment`

| Field               | Type       | Notes                                    |
| ------------------- | ---------- | ---------------------------------------- |
| `id`                | SERIAL PK  |                                          |
| `user_id`           | INTEGER FK |                                          |
| `gym_id`            | INTEGER FK |                                          |
| `equipment_name`    | TEXT       |                                          |
| `type`              | TEXT       | loadable / fixed / machine / apparatus   |
| `unladen_weight_kg` | NUMERIC    | Bar/handle weight for loadable equipment |
| `increment_kg`      | NUMERIC    | Weight increment for fixed/machine       |
| `max_weight_kg`     | NUMERIC    | Maximum weight for fixed/machine         |

### `plates`

| Field       | Type       | Notes                          |
| ----------- | ---------- | ------------------------------ |
| `id`        | SERIAL PK  |                                |
| `user_id`   | INTEGER FK |                                |
| `gym_id`    | INTEGER FK |                                |
| `weight_kg` | NUMERIC    |                                |
| `quantity`  | INTEGER    | Total count of this plate size |

### `conditioning`

Shared conditioning exercise library (not per-user).

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

One row per AI-generated 3-week block.

| Field          | Type       | Notes  |
| -------------- | ---------- | ------ |
| `id`           | SERIAL PK  |        |
| `user_id`      | INTEGER FK |        |
| `phase`        | TEXT       |        |
| `block_number` | INTEGER    | 1 or 2 |
| `week_start`   | DATE       |        |

### `sessions`

One row per training session (planned or completed).

| Field          | Type       | Notes                                   |
| -------------- | ---------- | --------------------------------------- |
| `id`           | SERIAL PK  |                                         |
| `programme_id` | INTEGER FK |                                         |
| `user_id`      | INTEGER FK |                                         |
| `gym_id`       | INTEGER FK | References gyms table                   |
| `session_type` | TEXT       | compound / isolation / extra            |
| `occurrence`   | INTEGER    | 1 = first compound, 2 = repeat compound |
| `week_number`  | INTEGER    | Within the block (1–7)                  |
| `gym`          | TEXT       | Legacy text column — being phased out   |
| `status`       | TEXT       | planned / in_progress / complete        |
| `notes`        | TEXT       | Session-level notes                     |
| `started_at`   | TIMESTAMP  |                                         |
| `completed_at` | TIMESTAMP  |                                         |

### `planned_exercises`

One row per exercise within a session. Includes both weight exercises and conditioning exercises (conditioning has `muscles_primary = 'Conditioning'`).

| Field             | Type       | Notes                                               |
| ----------------- | ---------- | --------------------------------------------------- |
| `id`              | SERIAL PK  |                                                     |
| `session_id`      | INTEGER FK |                                                     |
| `exercise_name`   | TEXT       |                                                     |
| `muscles_primary` | TEXT       | 'Conditioning' for conditioning exercises           |
| `sub_component`   | TEXT       | e.g. "Sternal head", "Lower lat"                    |
| `order_index`     | INTEGER    | Display order                                       |
| `target_sets`     | INTEGER    |                                                     |
| `target_reps`     | INTEGER    |                                                     |
| `target_weight`   | NUMERIC    | kg for weights; seconds for time-based conditioning |
| `range_exceeded`  | BOOLEAN    | True when all sets hit max reps for the phase       |
| `set_style`       | TEXT       | standard / drop                                     |

### `logged_sets`

One row per set actually completed during a session.

| Field           | Type       | Notes                 |
| --------------- | ---------- | --------------------- |
| `id`            | SERIAL PK  |                       |
| `session_id`    | INTEGER FK |                       |
| `exercise_name` | TEXT       |                       |
| `set_number`    | INTEGER    |                       |
| `drop_number`   | INTEGER    |                       |
| `weight`        | NUMERIC    | kg                    |
| `reps`          | INTEGER    | Actual reps completed |
| `notes`         | TEXT       | Per-set notes         |

### `one_rep_max_history`

Calculated from first set of each exercise per session. Informational only — not used for planning.

| Field            | Type       | Notes                         |
| ---------------- | ---------- | ----------------------------- |
| `id`             | SERIAL PK  |                               |
| `user_id`        | INTEGER FK |                               |
| `exercise_name`  | TEXT       |                               |
| `estimated_1rm`  | NUMERIC    | Epley: weight × (1 + reps/30) |
| `weight_used`    | NUMERIC    |                               |
| `reps_performed` | INTEGER    |                               |
| `logged_at`      | TIMESTAMP  |                               |

### `exercises`

One row per exercise per user per gym. Stores target weight maintained by the progressive overload system.

| Field               | Type       | Notes                                                   |
| ------------------- | ---------- | ------------------------------------------------------- |
| `id`                | SERIAL PK  |                                                         |
| `user_id`           | INTEGER FK |                                                         |
| `gym_id`            | INTEGER FK | References gyms table                                   |
| `equipment_id`      | INTEGER FK | References equipment table — drives weight limits       |
| `exercise`          | TEXT       |                                                         |
| `muscles_primary`   | TEXT       |                                                         |
| `muscles_secondary` | TEXT       |                                                         |
| `type`              | TEXT       | Compound / Isolation                                    |
| `equipment_type`    | TEXT       | Legacy — being phased out in favour of equipment_id     |
| `sub_component`     | TEXT       |                                                         |
| `emg_score`         | INTEGER    | 1–5                                                     |
| `active`            | BOOLEAN    | Default true; inactive exercises excluded from planning |
| `target_weight_kg`  | NUMERIC    | NULL until first block; maintained by PO system         |

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

### `diet_logs`

| Field             | Type       | Notes |
| ----------------- | ---------- | ----- |
| `id`              | SERIAL PK  |       |
| `user_id`         | INTEGER FK |       |
| `logged_at`       | DATE       |       |
| `calories_kcal`   | NUMERIC    |       |
| `fat_g`           | NUMERIC    |       |
| `saturated_fat_g` | NUMERIC    |       |
| `carbs_g`         | NUMERIC    |       |
| `sugar_g`         | NUMERIC    |       |
| `fibre_g`         | NUMERIC    |       |
| `protein_g`       | NUMERIC    |       |
| `salt_g`          | NUMERIC    |       |

### `mood_logs`

| Field       | Type       | Notes |
| ----------- | ---------- | ----- |
| `id`        | SERIAL PK  |       |
| `user_id`   | INTEGER FK |       |
| `logged_at` | DATE       |       |
| `mood`      | INTEGER    | 1–5   |
| `energy`    | INTEGER    | 1–5   |
| `notes`     | TEXT       |       |

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

### `approved_emails`

| Field   | Type      | Notes                       |
| ------- | --------- | --------------------------- |
| `id`    | SERIAL PK |                             |
| `email` | TEXT      | Unique                      |
| `used`  | BOOLEAN   | Set to true on registration |

---

## 6. Training Logic

### Phase Cycle (automatic, Sunday cron job)

1. Anatomical Adaptation — 7 weeks (weeks 1–6 training, week 7 rest)
2. Hypertrophy — 7 weeks
3. Maximum Strength — 7 weeks
4. Muscle Definition — 7 weeks
5. → Repeats from Anatomical Adaptation

Week 7 is always a rest week within each phase. There is no separate rest phase. Rest week sessions use the same exercises as Week 6 at 3 sets × 12 reps × 45% of target weight.

### Phase Rep/Set Schemes

| Phase                 | Sets | Target Reps | Minimum Reps |
| --------------------- | ---- | ----------- | ------------ |
| Anatomical Adaptation | 3    | 20          | 15           |
| Hypertrophy           | 4    | 12          | 8            |
| Maximum Strength      | 4    | 6           | 3            |
| Muscle Definition     | 1    | 40          | 30           |
| Rest Week             | 3    | 12          | —            |

### Weekly Training Pattern

Sessions alternate Compound → Isolation, taking as many as the user's `weekly_sessions` setting allows:

- 3 sessions: C → I → C
- 4 sessions: C → I → C → I
- 5 sessions: C → I → C → I → C

Sessions are not mapped to specific days of the week — the user trains when their schedule allows.

### Block Structure

- Each phase has 2 blocks of 3 weeks each, plus a rest week at week 7
- Block 1: Weeks 1–3 (generated at week 1)
- Block 2: Weeks 4–6 (generated at week 4 by Sunday cron)
- Rest week: Week 7 (sessions created by Sunday cron, copying Week 6 exercises at reduced load)
- No exercise from Block 1 may appear in Block 2

### Session Structure

Each session consists of N weight exercises followed by M conditioning exercises, both configurable per user.

**Compound session weight exercises (base 6, wildcards flex with user setting):**

- 1 × Back, 1 × Chest, 1 × Lower Back, 1 × Quads, 1 × Shoulders
- Additional slots are Wildcards, guided by `goal_description`
- At 5 exercises, the Wildcard is removed; at 7+, extra Wildcards are added

**Isolation session weight exercises (base 6, wildcards flex with user setting):**

- Core (always position 1), Biceps, Triceps, Shoulders, Forearms
- Wildcard slots from {Core, Calves, Hamstrings} and then any undertrained muscle

**Conditioning exercises (appended after weight exercises):**

- Selected from the `conditioning` table
- AI picks at least 1 cardio and 1 core category, remainder guided by goals and phase
- For time-based exercises (metric = time): `target_weight` stores seconds (e.g. Plank 60 = 60 seconds)
- For rep-based exercises: `target_weight` = 0

### Progressive Overload Rules

- **range_exceeded flag:** Set to true on a planned_exercises row when all sets for that exercise hit maximum reps for the current phase
- **Weight increase:** Next valid increment based on equipment constraints via `weightCalc.js`:
  - Fixed/machine equipment: current weight + `increment_kg`, capped at `max_weight_kg`
  - Loadable equipment: calculates all achievable plate combinations from the `plates` table, finds the next weight above current
- **No cascade:** PO only updates the triggering exercise, not related exercises
- **No automatic decrease:** Missing minimum reps does not trigger an automatic weight reduction
- **Athlete notes:** If `goal_description` contains explicit avoidance instructions (e.g. "avoid legs"), the AI excludes those exercises from session planning. Vague soreness mentions are ignored — the Sunday report nudges the user to add explicit avoidance notes if patterns are detected.

### 1RM Estimation

- Epley formula: `weight × (1 + reps / 30)`
- Only calculated on set_number = 1 per exercise per session (first set is most stable — least fatigue)
- Stored in one_rep_max_history for reference and AI context
- Not used for target weight calculation — target_weight_kg in exercises table is the source of truth

### Target Weight System

- target_weight_kg in the exercises table is the single source of truth for planning
- Set by the AI on first block generation (using 1RM % or conservative estimate if no history)
- Updated by the PO system (next valid increment on range_exceeded)
- Phase percentages used for initial weight setting:
  - Anatomical Adaptation: 60% of 1RM
  - Hypertrophy: 67% of 1RM
  - Maximum Strength: 80% of 1RM
  - Muscle Definition: 55% of 1RM

### Weight Validation

`validateAndCorrectWeights` runs after every AI-generated session plan before saving to the database. For each exercise it looks up the linked equipment via `equipment_id` and enforces:

- Increment rounding (weight must be a multiple of `increment_kg`)
- Max weight cap (weight must not exceed `max_weight_kg`)
- For loadable equipment without increment/max, the AI prompt includes valid weight lists generated from the plate pool

### Gym Setup

Each user has one or more gyms in the `gyms` table with one marked as default. Block generation uses the user's default gym. Session gym swap allows switching to any gym — the AI regenerates exercises for the selected gym.

Exercises are stored in the `exercises` table per user per gym, linked to specific equipment via `equipment_id`. The `buildGymCSV` function JOINs exercises to equipment and includes `equipment_name`, `increment_kg`, and `max_weight_kg` per exercise row in the AI prompt.

### Onboarding

4-step flow for new users (also used for "Redefine Goals" from settings):

1. Goals — star ratings for Size, Strength, Definition, General Fitness
2. Training level — New / Amateur / Serious / Professional
3. Session structure — sessions per week, weight exercises per session, conditioning exercises per session (with suggested defaults by level)
4. Anything else — free text notes (becomes "Athlete notes" in AI prompts)

---

## 7. AI Routes

All Claude API calls are in `backend/routes/ai.js`. Model: `claude-sonnet-4-6`.

### POST /ai/generate-block

- Called at Week 1 and Week 4 of each phase (triggered by Sunday cron or manually)
- Accepts either a valid JWT (frontend) or `x-cron-secret` header (cron job internal call)
- Generates compound and isolation session plans for 3 weeks
- Uses user's default gym from the `gyms` table
- Reads exercise library from exercises table (JOINed to equipment for weight constraints)
- Includes conditioning exercises from the `conditioning` table
- Uses full context: phase, block, session history, 1RM history, body comp, diet, mood, cardio, athlete notes, previous block exercises
- `validateAndCorrectWeights` runs on the AI response before saving
- Returns JSON, writes 9 sessions to the database (3 weeks × compound occ1 + compound occ2 + isolation)
- Max tokens: 2000

### POST /ai/generate-gym-session

- Called when user confirms gym swap at session start
- Takes `session_id` and `gym_id`
- Generates a single compound or isolation session for the selected gym
- Deletes existing planned exercises and replaces with alternatives for the selected gym
- Includes conditioning exercises
- `validateAndCorrectWeights` runs before saving
- Marks session as in_progress immediately
- Max tokens: 1500

### POST /ai/generate-missing

- Called by the replan endpoint to regenerate specific weeks
- Takes `programme_id`, `weeks_needed` array, and `existing_plan` as baseline
- Uses existing plan as baseline — only changes exercises where avoidance notes or quantity changes require it
- `validateAndCorrectWeights` runs before saving
- Max tokens: 2000

### POST /ai/extra-session

- Called from Extra Session UI on week screen
- Takes `gym_id` parameter
- Generates exercises with target weights using full context
- Includes conditioning exercises
- `validateAndCorrectWeights` runs before saving
- Creates session in database with session_type = 'extra', starts it immediately
- Returns session_id for direct navigation to session screen
- Max tokens: 1500

### POST /ai/exercise-metadata

- Takes `exercise_name`, returns AI-generated metadata (muscles, type, sub-component, EMG score)
- Used by the add-exercise flow in gym settings

### POST /ai/suggest-exercises

- Takes `gym_id`, returns 15 suggested exercises with `equipment_id` values
- AI receives the gym's equipment list with IDs and assigns exercises to specific equipment
- Backend validates returned equipment IDs exist at the gym
- Max tokens: 3000

### GET /ai/weekly-feedback

- Returns the most recent Sunday report for the user

### POST /bodycomp/extract-from-image

- Accepts base64-encoded scale screenshot
- Sends to Claude to extract weight, muscle mass, and body fat %
- Returns extracted values as JSON — does not save anything
- Frontend pre-fills the manual entry form for confirmation before saving

### cron.js (Sunday 10:30PM UTC — node-cron, runs inside Express server)

Phase advancement logic runs first, then report generation:

1. If phase_week = 7 → advance to next phase, reset to week 1 block 1, trigger Block 1 generation
2. Else increment phase_week by 1
3. If new phase_week = 4 → set current_block = 2, trigger Block 2 generation via internal HTTP call to /ai/generate-block using CRON_SECRET
4. If new phase_week = 7 → create rest week sessions (copy Week 6 exercises at 3×12@45% of target weight)
5. Read 4 weeks of session history, body comp, 1RM history, diet, mood, cardio, and range_exceeded flags
6. Send to Claude with structured report prompt (causal narrative, Stop/Start/Continue structure, per-user agent tone)
7. Store plain text response in weekly_feedback table
8. Email report to user via Resend

---

## 8. Exercise Selection Rules (for AI context)

The AI applies these rules in priority order when selecting exercises for a block:

1. **Athlete notes** — if explicit avoidance instructions exist (e.g. "avoid", "do not", "exclude"), strictly exclude those exercises. Ignore vague mentions of discomfort. Tolerate spelling mistakes.
2. **Sub-component coverage** — exclude sub-components used in the previous block
3. **Progressive overload response** — favour exercises with stronger historical PO performance; apply dampening after 2 consecutive block selections
4. **Recency** — deprioritise exercises from the last block unless EMG gap is 2+ points
5. **EMG score** (1–5) — prefer higher scores when other factors are equal
6. **Tiebreaker** — table order in the exercise library

**Block exclusion rule:** No exercise from Block 1 may appear in Block 2, across both session types.

**Conditioning selection:** At least 1 cardio category and 1 core category per session. Remaining slots guided by goals and phase. For time-based exercises, `weight_kg` equals the target seconds. For rep-based, `weight_kg` = 0.

---

## 9. API Endpoints Summary

| Method | Path                         | Description                                       |
| ------ | ---------------------------- | ------------------------------------------------- |
| POST   | /auth/register               | Create account (approved email required)          |
| POST   | /auth/login                  | Login, returns JWT                                |
| GET    | /user/profile                | Get user profile                                  |
| PATCH  | /user/profile                | Update profile / onboarding settings              |
| GET    | /sessions/week               | Get sessions for current phase_week               |
| GET    | /sessions/:id                | Get single session with exercises and logged sets |
| POST   | /sessions                    | Create a session                                  |
| POST   | /sessions/replan             | Delete planned sessions and regenerate            |
| PATCH  | /sessions/:id/start          | Start a session                                   |
| POST   | /sessions/:id/sets           | Log a set (1RM on first set, PO detection)        |
| PATCH  | /sessions/:id/complete       | Complete a session                                |
| POST   | /bodycomp                    | Log body composition entry                        |
| GET    | /bodycomp                    | Get body comp history                             |
| POST   | /bodycomp/extract-from-image | Extract body comp values from scale screenshot    |
| GET    | /onerepmax                   | Get latest 1RM for all exercises                  |
| GET    | /onerepmax/:exercise         | Get full 1RM history for one exercise             |
| POST   | /ai/generate-block           | Generate a training block                         |
| POST   | /ai/generate-gym-session     | Regenerate session for a different gym            |
| POST   | /ai/generate-missing         | Regenerate specific weeks (used by replan)        |
| POST   | /ai/extra-session            | Generate and start extra session                  |
| POST   | /ai/exercise-metadata        | AI lookup for exercise metadata                   |
| POST   | /ai/suggest-exercises        | AI suggests exercises for a gym                   |
| GET    | /ai/weekly-feedback          | Get latest Sunday report                          |
| POST   | /report/generate             | Manually generate a weekly report                 |
| POST   | /diet                        | Log diet entry                                    |
| GET    | /diet                        | Get diet history                                  |
| POST   | /diet/extract-from-image     | Extract diet data from food label photo           |
| POST   | /mood                        | Log mood entry                                    |
| GET    | /mood                        | Get mood history                                  |
| POST   | /cardio                      | Log cardio entry                                  |
| GET    | /cardio                      | Get cardio history                                |
| DELETE | /cardio/:id                  | Delete cardio entry                               |
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

- Multi-user support live — two active users
- Domain live at gym.activitycoach.co.uk
- All screens built and wired to real data
- Conditioning exercises system active (22 exercises across cardio, core, mobility, TRX)
- Equipment-driven weight constraints via `equipment_id` FK
- PO system rewritten: increment-based (not percentage), no cascade, uses `weightCalc.js`
- Session replanning feature live in settings
- Onboarding includes session structure step (sessions, weight exercises, conditioning)
- AI prompts include athlete notes for explicit exercise avoidance

### Remaining backlog

- Conditioning display fix — Plank shows 60kg instead of 60s (code deployed but may be browser cache; `muscles_primary = 'Conditioning'` confirmed in DB)
- Drop `equipment_type` text column from exercises table (legacy, replaced by `equipment_id`)
- Drop `gym` text column from sessions table (legacy, replaced by `gym_id`)
- Account creation not redirecting to onboarding flow
- Exercise kebab menu z-index — dropdown hidden behind sibling rows across muscle groups; needs converting from absolute positioning to a Modal
- Sunday report — should reference conditioning exercises and include athlete notes nudge pattern
- Per-exercise progressive overload toggle (opt-in, not automatic)
- Manual target weight editing at exercise level
- Activity Coach link on dashboard

### Completed backlog

- ~~Multi-user support~~ — invite-only registration, per-user gym/equipment/exercises, onboarding flow, agent tone settings
- ~~Conditioning exercises~~ — separate `conditioning` table, appended to all sessions, category-aware AI selection
- ~~Session structure settings~~ — `weight_exercises_per_session` and `conditioning_exercises_per_session` on users table, configurable in onboarding
- ~~Replan sessions~~ — button in settings with two-step modal, deletes planned sessions and regenerates via `/ai/generate-missing`
- ~~Equipment system~~ — `equipment_id` FK on exercises, `max_weight_kg` on equipment, equipment edit modal, equipment picker on add-exercise
- ~~Suggest exercises with equipment~~ — AI returns `equipment_id` per exercise, validated against gym's equipment
- ~~DB-driven weight validation~~ — `weightCalc.js` replaces `validWeights.js`, calculates valid weights from plate pool for loadable equipment
- ~~PO rewrite~~ — increment-based progression, no cascade, uses `getNextValidWeight` from `weightCalc.js`
- ~~Gym system overhaul~~ — `gym_id` FK on sessions, default gym per user, dynamic gym selection in all AI routes, removed all hardcoded "work"/"home" references
- ~~Domain setup (gym.activitycoach.co.uk)~~ — done
- ~~Weight conventions and loadable weight constraints~~ — AI prompts updated with equipment-specific weight guidance
- ~~Body fat % field~~ — added body_fat_pct column to body_composition table
- ~~Image-to-body-comp logging~~ — "Log from photo" button on Body Comp screen
- ~~Extra session UI~~ — Generate Extra Session button with dynamic gym picker
- ~~Phase advancement~~ — Sunday cron (10:30PM UTC) increments phase_week weekly
- ~~Diet, mood, cardio logging~~ — three-tab log screen, cardio on week screen
- ~~Sunday report redesign~~ — causal narrative, Stop/Start/Continue, per-user agent tone, emailed via Resend
