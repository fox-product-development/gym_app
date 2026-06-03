# GymApp — Project Knowledge File

Last updated: May 2026

---

## 1. Project Overview

GymApp is a personal web-based gym tracking application. It uses AI (Claude) to generate training blocks, track performance, provide weekly feedback, and manage progressive overload across periodisation phases. It is a single-user personal app built for one user, accessible via web browser and bookmarked on iPhone.

---

## 2. Tech Stack

| Layer         | Technology                                 | Notes                                                                  |
| ------------- | ------------------------------------------ | ---------------------------------------------------------------------- |
| Frontend      | React Native with Expo (web export)        | Deployed to Vercel                                                     |
| Navigation    | Expo Router (file-based)                   | One file = one screen                                                  |
| Backend / API | Node.js + Express                          | Deployed to Railway                                                    |
| Database      | PostgreSQL                                 | Hosted on Railway                                                      |
| AI            | Anthropic Claude API (`claude-sonnet-4-6`) | Used for block generation, home gym swap, extra session, Sunday report |
| Auth          | JWT tokens                                 | Stored in localStorage                                                 |
| Styling       | Inline React Native styles                 | All colours from `constants/theme.ts`                                  |
| Deployment    | Vercel (frontend) + Railway (backend + DB) | Auto-deploys on push to main                                           |

---

## 3. Repository Structure

```
gym_app/
├── app/                        ← Expo Router screens
│   ├── (tabs)/
│   │   ├── index.tsx           ← Dashboard
│   │   ├── week.tsx            ← This Week
│   │   ├── log.tsx             ← Body Comp
│   │   ├── progress.tsx        ← Exercise History
│   │   └── settings.tsx        ← Settings
│   ├── _layout.tsx             ← Root layout, auth check
│   ├── login.tsx               ← Login screen
│   └── session.tsx             ← Active Session screen
├── constants/
│   ├── theme.ts                ← Design tokens (colours, fonts, spacing)
│   └── gyms.ts                 ← Hardcoded exercise libraries (fallback only — live data in exercises table)
├── services/
│   └── api.ts                  ← Central API service layer
└── backend/
    ├── index.js                ← Express server entry point + node-cron scheduler
    ├── middleware.js            ← JWT auth middleware
    ├── cron.js                 ← Sunday report + phase advancement + block generation
    ├── routes/
    │   ├── auth.js             ← Register, login
    │   ├── user.js             ← Profile
    │   ├── sessions.js         ← Sessions CRUD, set logging, PO detection
    │   ├── bodycomp.js         ← Body composition + image extraction
    │   ├── onerepmax.js        ← 1RM history
    │   └── ai.js               ← All Claude API calls
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

Single row — one user app.

| Field              | Type      | Notes                                                                      |
| ------------------ | --------- | -------------------------------------------------------------------------- |
| `id`               | SERIAL PK |                                                                            |
| `username`         | TEXT      | Unique                                                                     |
| `password`         | TEXT      | bcrypt hashed                                                              |
| `current_phase`    | TEXT      | anatomical_adaptation / hypertrophy / maximum_strength / muscle_definition |
| `current_block`    | INTEGER   | 1 or 2                                                                     |
| `phase_week`       | INTEGER   | 1–7 within current phase (week 7 = rest week)                              |
| `phase_start_date` | DATE      | When the current phase started                                             |

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
| `session_type` | TEXT       | compound / isolation / extra            |
| `occurrence`   | INTEGER    | 1 = first compound, 2 = repeat compound |
| `week_number`  | INTEGER    | Within the block (1–7)                  |
| `gym`          | TEXT       | work / home                             |
| `status`       | TEXT       | planned / in_progress / complete        |
| `notes`        | TEXT       | Session-level notes                     |
| `started_at`   | TIMESTAMP  |                                         |
| `completed_at` | TIMESTAMP  |                                         |

### `planned_exercises`

One row per exercise within a session.

| Field             | Type       | Notes                                         |
| ----------------- | ---------- | --------------------------------------------- |
| `id`              | SERIAL PK  |                                               |
| `session_id`      | INTEGER FK |                                               |
| `exercise_name`   | TEXT       |                                               |
| `muscles_primary` | TEXT       |                                               |
| `sub_component`   | TEXT       | e.g. "Sternal head", "Lower lat"              |
| `order_index`     | INTEGER    | Display order                                 |
| `target_sets`     | INTEGER    |                                               |
| `target_reps`     | INTEGER    |                                               |
| `target_weight`   | NUMERIC    | kg                                            |
| `range_exceeded`  | BOOLEAN    | True when all sets hit max reps for the phase |

### `logged_sets`

One row per set actually completed during a session.

| Field           | Type       | Notes                 |
| --------------- | ---------- | --------------------- |
| `id`            | SERIAL PK  |                       |
| `session_id`    | INTEGER FK |                       |
| `exercise_name` | TEXT       |                       |
| `set_number`    | INTEGER    |                       |
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

One row per exercise per user per gym. Replaces hardcoded library arrays. Stores target weight maintained by the progressive overload system.

| Field               | Type       | Notes                                           |
| ------------------- | ---------- | ----------------------------------------------- |
| `id`                | SERIAL PK  |                                                 |
| `user_id`           | INTEGER FK |                                                 |
| `gym`               | TEXT       | work / home                                     |
| `exercise`          | TEXT       |                                                 |
| `muscles_primary`   | TEXT       |                                                 |
| `muscles_secondary` | TEXT       |                                                 |
| `type`              | TEXT       | Compound / Isolation                            |
| `sub_component`     | TEXT       |                                                 |
| `emg_score`         | INTEGER    | 1–5                                             |
| `target_weight_kg`  | NUMERIC    | NULL until first block; maintained by PO system |

### `body_composition`

One row per day (manual entry or image extraction).

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

One row per Sunday AI report.

| Field                      | Type       | Notes                      |
| -------------------------- | ---------- | -------------------------- |
| `id`                       | SERIAL PK  |                            |
| `user_id`                  | INTEGER FK |                            |
| `week_start_date`          | DATE       | Monday of the week covered |
| `ai_summary`               | TEXT       | Full plain text report     |
| `phase_change_recommended` | BOOLEAN    |                            |
| `phase_change_suggestion`  | TEXT       |                            |

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

- Day 1: Compound session
- Day 2: Isolation session
- Day 3: Compound session (same plan as Day 1)

Sessions are not mapped to specific days of the week — the user trains when their schedule allows.

### Block Structure

- Each phase has 2 blocks of 3 weeks each, plus a rest week at week 7
- Block 1: Weeks 1–3 (generated at week 1)
- Block 2: Weeks 4–6 (generated at week 4 by Sunday cron)
- Rest week: Week 7 (sessions created by Sunday cron, copying Week 6 exercises at reduced load)
- No exercise from Block 1 may appear in Block 2

### Session Structure

**Compound session (6 exercises):**

- 1 × Back
- 1 × Chest
- 1 × Lower Back
- 1 × Quads
- 1 × Shoulders
- 1 × Wildcard (least represented muscle group)

**Isolation session (6 exercises):**

- Core (always position 1)
- Biceps
- Triceps
- Shoulders
- Forearms
- Wildcard from {Core, Calves, Hamstrings} (always position 6)

### Progressive Overload Rules

- **range_exceeded flag:** Set to true on a planned_exercises row when all sets for that exercise hit maximum reps for the current phase
- **Weight increase:** +5% applied to target_weight_kg in the exercises table, rounded up to nearest valid increment for the equipment type
- **Cascade:** Same +5% applied to all exercises sharing the same muscles_primary (both gyms)
- **Replanning:** Sunday cron detects range_exceeded flags and the updated target weights are used automatically when the next week's sessions are planned
- **No automatic decrease:** Missing minimum reps does not trigger an automatic weight reduction — revisit if needed

### 1RM Estimation

- Epley formula: `weight × (1 + reps / 30)`
- Only calculated on set_number = 1 per exercise per session (first set is most stable — least fatigue)
- Stored in one_rep_max_history for reference and AI context
- Not used for target weight calculation — target_weight_kg in exercises table is the source of truth

### Target Weight System

- target_weight_kg in the exercises table is the single source of truth for planning
- Set by the AI on first block generation (using 1RM % or conservative estimate if no history)
- Updated by the PO system (+5% on range_exceeded, cascaded to same muscle group)
- Phase percentages used for initial weight setting:
  - Anatomical Adaptation: 60% of 1RM
  - Hypertrophy: 67% of 1RM
  - Maximum Strength: 80% of 1RM
  - Muscle Definition: 55% of 1RM

### Gym Setup

**Default:** Work Gym (full barbell + cable rack) — all blocks generated for Work Gym.

**Home Gym swap:** When tapping Start on any session, user can switch to Home Gym. This triggers the AI to regenerate that session's exercises using the Home Gym library with the same selection logic. The switch is irreversible for that session.

Exercise library previously hardcoded in `constants/gyms.ts` and `backend/routes/ai.js`. Now stored in the `exercises` database table per user, with `target_weight_kg` maintained by the progressive overload system. The hardcoded arrays remain as a fallback in `ai.js` if the table is empty.

---

## 7. AI Routes

All Claude API calls are in `backend/routes/ai.js`. Model: `claude-sonnet-4-6`.

### POST /ai/generate-block

- Called at Week 1 and Week 4 of each phase (triggered by Sunday cron or manually)
- Accepts either a valid JWT (frontend) or `x-cron-secret` header (cron job internal call)
- Generates compound and isolation session plans for 3 weeks
- Always generates for Work Gym
- Reads exercise library from exercises table (with target_weight_kg); falls back to hardcoded arrays if empty
- Uses full context: phase, block, session history, 1RM history, body comp, previous block exercises
- Returns JSON, writes 9 sessions to the database (3 weeks × compound occ1 + compound occ2 + isolation)
- Max tokens: 2000

### POST /ai/generate-home-session

- Called when user confirms Home Gym swap at session start
- Takes `session_id`
- Uses same full context as block generation
- Generates a single compound or isolation session for Home Gym
- Deletes existing planned exercises and replaces with Home Gym alternatives
- Marks session as in_progress immediately
- Max tokens: 1500

### POST /ai/extra-session

- Called from Extra Session UI on week screen
- Takes `gym` parameter
- Generates 6 exercises with target weights using full context (phase, 1RM, session history, body comp)
- Creates session in database with session_type = 'extra', starts it immediately
- Returns session_id for direct navigation to session screen
- Max tokens: 1500

### GET /ai/weekly-feedback

- Returns the most recent Sunday report for the user

### POST /bodycomp/extract-from-image

- Accepts base64-encoded scale screenshot
- Sends to Claude to extract weight, muscle mass, and body fat %
- Returns extracted values as JSON — does not save anything
- Frontend pre-fills the manual entry form for confirmation before saving

### cron.js (Sunday 8PM — node-cron, runs inside Express server)

Phase advancement logic runs first, then report generation:

1. If phase_week = 7 → advance to next phase, reset to week 1 block 1, trigger Block 1 generation
2. Else increment phase_week by 1
3. If new phase_week = 4 → set current_block = 2, trigger Block 2 generation via internal HTTP call to /ai/generate-block using CRON_SECRET
4. If new phase_week = 7 → create rest week sessions (copy Week 6 exercises at 3×12@45% of target weight)
5. Read 4 weeks of session history, body comp, 1RM history, and range_exceeded flags
6. Send to Claude with structured report prompt
7. Store plain text response in weekly_feedback table

---

## 8. Exercise Selection Rules (for AI context)

The AI applies these rules in priority order when selecting exercises for a block:

1. **Sub-component coverage** — exclude sub-components used in the previous block
2. **Progressive overload response** — favour exercises with stronger historical PO performance; apply dampening after 2 consecutive block selections
3. **Recency** — deprioritise exercises from the last block unless EMG gap is 2+ points
4. **EMG score** (1–5) — prefer higher scores when other factors are equal
5. **Tiebreaker** — table order in the exercise library

**Block exclusion rule:** No exercise from Block 1 may appear in Block 2, across both session types.

---

## 9. API Endpoints Summary

| Method | Path                         | Description                                       |
| ------ | ---------------------------- | ------------------------------------------------- |
| POST   | /auth/register               | Create account                                    |
| POST   | /auth/login                  | Login, returns JWT                                |
| GET    | /user/profile                | Get user profile                                  |
| GET    | /sessions/week               | Get sessions for current phase_week               |
| GET    | /sessions/:id                | Get single session with exercises and logged sets |
| POST   | /sessions                    | Create a session                                  |
| PATCH  | /sessions/:id/start          | Start a session                                   |
| POST   | /sessions/:id/sets           | Log a set (1RM on first set, PO detection)        |
| PATCH  | /sessions/:id/complete       | Complete a session                                |
| POST   | /bodycomp                    | Log body composition entry                        |
| GET    | /bodycomp                    | Get body comp history                             |
| POST   | /bodycomp/extract-from-image | Extract body comp values from scale screenshot    |
| GET    | /onerepmax                   | Get latest 1RM for all exercises                  |
| GET    | /onerepmax/:exercise         | Get full 1RM history for one exercise             |
| POST   | /ai/generate-block           | Generate a training block                         |
| POST   | /ai/generate-home-session    | Regenerate session for Home Gym                   |
| POST   | /ai/extra-session            | Generate and start extra session                  |
| GET    | /ai/weekly-feedback          | Get latest Sunday report                          |

---

## 10. Environment Variables

### Backend (Railway)

| Variable            | Description                                       |
| ------------------- | ------------------------------------------------- |
| `DATABASE_URL`      | PostgreSQL connection string (Railway internal)   |
| `JWT_SECRET`        | Secret key for JWT signing                        |
| `ANTHROPIC_API_KEY` | Claude API key                                    |
| `CRON_SECRET`       | Secret key for internal cron → API authentication |
| `PORT`              | Set automatically by Railway                      |

### Local development (.env in backend/)

| Variable            | Description                                       |
| ------------------- | ------------------------------------------------- |
| `DATABASE_URL`      | Railway public PostgreSQL URL (for local testing) |
| `JWT_SECRET`        | Same value as Railway                             |
| `ANTHROPIC_API_KEY` | Same value as Railway                             |
| `CRON_SECRET`       | Same value as Railway                             |
| `PORT`              | 3000                                              |

---

## 11. Current State (June 2026)

- User is on Anatomical Adaptation, Block 2, Week 4
- Phase started: 11th May 2026
- Programme 5 is the active block 2 programme
- All 6 screens built and wired to real data
- Domain live at gym.activitycoach.co.uk

### Remaining backlog

- Progressive overload display — surface range_exceeded flag visually during session logging
- Push Up and bodyweight exercises — flag as rest week only or exclude from regular blocks
- Week number mismatch fix (Option A) — update generate-block in ai.js to store absolute phase week numbers (weeks 4–6 for block 2) so the fix is in code not just applied via SQL
- Block generation JSON failure — investigate why Claude returned plain text instead of JSON on Sunday 1st June cron run; fix before next Sunday
- Multi-user support — unique workout plans per user (planned for next development session)

### Completed backlog

- ~~Domain setup (gym.activitycoach.co.uk)~~ — done
- ~~Weight conventions and loadable weight constraints~~ — AI prompts updated for both gyms with correct bar weights, increment rules, plate inventory, and dumbbell per-dumbbell convention; session display updated to label dumbbell weights clearly
- ~~Body fat % field~~ — added body_fat_pct column to body_composition table; surfaced on Body Comp screen alongside weight and muscle mass
- ~~Image-to-body-comp logging~~ — "Log from photo" button on Body Comp screen; sends scale screenshot to Claude API, extracts weight, muscle mass, and body fat %, pre-fills form for confirmation before saving
- ~~Extra session UI~~ — Generate Extra Session button on week screen; gym picker and confirm modal; AI selects 6 best exercises with target weights; creates and starts session immediately; navigates to session screen
- ~~Progressive overload system~~ — exercises table created with target_weight_kg per user; range_exceeded flag on planned_exercises; +5% weight increase cascaded to same muscle group on PO; 1RM now informational only; Sunday cron handles replanning
- ~~Phase advancement~~ — Sunday cron increments phase_week weekly; Block 2 generated at week 4; rest week sessions created at week 7 (3×12@45%); phase advances automatically after rest week
- ~~Railway cron job~~ — node-cron scheduler running inside Express server; Sunday 8PM; CRON_SECRET used for internal block generation calls
- ~~Valid weights and increment rounding~~ — validWeights.js created as single source of truth; cable/machine corrected to 2.26kg (5lb) increments; sessions.js now uses nextValidWeight() from validWeights.js using equipment_type column
- ~~Body fat chart on dashboard~~ — added below muscle mass graph; colour scheme: bodyweight = white, muscle mass = Colors.green (#4CAF82), body fat = Colors.accent (orange); Colors.green added to theme.ts
- ~~Manual report generation~~ — backend/routes/report.js added; POST /report/generate checks for existing report before generating; Generate Report button added to dashboard AI report card for missing or stale reports
