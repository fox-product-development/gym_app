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
│   └── gyms.ts                 ← Hardcoded exercise libraries for both gyms
├── services/
│   └── api.ts                  ← Central API service layer
└── backend/
    ├── index.js                ← Express server entry point
    ├── middleware.js            ← JWT auth middleware
    ├── cron.js                 ← Sunday report cron job
    ├── routes/
    │   ├── auth.js             ← Register, login
    │   ├── user.js             ← Profile
    │   ├── sessions.js         ← Sessions CRUD, set logging
    │   ├── bodycomp.js         ← Body composition
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

| Field              | Type      | Notes                                                                             |
| ------------------ | --------- | --------------------------------------------------------------------------------- |
| `id`               | SERIAL PK |                                                                                   |
| `username`         | TEXT      | Unique                                                                            |
| `password`         | TEXT      | bcrypt hashed                                                                     |
| `current_phase`    | TEXT      | anatomical_adaptation / hypertrophy / maximum_strength / muscle_definition / rest |
| `current_block`    | INTEGER   | 1 or 2                                                                            |
| `phase_week`       | INTEGER   | 1–6 within current phase                                                          |
| `phase_start_date` | DATE      | When the current phase started                                                    |

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
| `week_number`  | INTEGER    | Within the block (1–3)                  |
| `gym`          | TEXT       | work / home                             |
| `status`       | TEXT       | planned / in_progress / complete        |
| `notes`        | TEXT       | Session-level notes                     |
| `started_at`   | TIMESTAMP  |                                         |
| `completed_at` | TIMESTAMP  |                                         |

### `planned_exercises`

One row per exercise within a session.

| Field             | Type       | Notes                            |
| ----------------- | ---------- | -------------------------------- |
| `id`              | SERIAL PK  |                                  |
| `session_id`      | INTEGER FK |                                  |
| `exercise_name`   | TEXT       |                                  |
| `muscles_primary` | TEXT       |                                  |
| `sub_component`   | TEXT       | e.g. "Sternal head", "Lower lat" |
| `order_index`     | INTEGER    | Display order                    |
| `target_sets`     | INTEGER    |                                  |
| `target_reps`     | INTEGER    |                                  |
| `target_weight`   | NUMERIC    | kg                               |

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

Auto-populated when sets are logged with 3–10 reps. Uses Epley formula.

| Field            | Type       | Notes                         |
| ---------------- | ---------- | ----------------------------- |
| `id`             | SERIAL PK  |                               |
| `user_id`        | INTEGER FK |                               |
| `exercise_name`  | TEXT       |                               |
| `estimated_1rm`  | NUMERIC    | Epley: weight × (1 + reps/30) |
| `weight_used`    | NUMERIC    |                               |
| `reps_performed` | INTEGER    |                               |
| `logged_at`      | TIMESTAMP  |                               |

### `body_composition`

One row per day (manual entry).

| Field            | Type         | Notes          |
| ---------------- | ------------ | -------------- |
| `id`             | SERIAL PK    |                |
| `user_id`        | INTEGER FK   |                |
| `weight_kg`      | NUMERIC      |                |
| `muscle_mass_kg` | NUMERIC      |                |
| `body_fat_pct`   | NUMERIC(4,1) | Optional       |
| `logged_at`      | DATE         |                |
| `source`         | TEXT         | manual / image |

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

### Phase Cycle (automatic, no user selection)

1. Anatomical Adaptation — 6 weeks
2. Hypertrophy — 6 weeks
3. Maximum Strength — 6 weeks
4. Muscle Definition — 6 weeks
5. Rest Week — 1 week
6. → Repeats from Anatomical Adaptation

### Phase Rep/Set Schemes

| Phase                 | Sets | Target Reps | Minimum Reps |
| --------------------- | ---- | ----------- | ------------ |
| Anatomical Adaptation | 3    | 20          | 15           |
| Hypertrophy           | 4    | 12          | 8            |
| Maximum Strength      | 4    | 6           | 3            |
| Muscle Definition     | 1    | 40          | 30           |

### Weekly Training Pattern

- Day 1: Compound session
- Day 2: Isolation session
- Day 3: Compound session (same plan as Day 1)

Sessions are not mapped to specific days of the week — the user trains when their schedule allows.

### Block Structure

- Each phase has 2 blocks of 3 weeks each
- Block 1: Weeks 1–3 (AI generates on Week 1)
- Block 2: Weeks 4–6 (AI generates on Week 4)
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

- **Increase weight:** All sets hit target reps → +2.5kg compound, +1–2kg isolation
- **Decrease weight:** Any set below minimum reps → -2.5kg compound, -1–2kg isolation
- **Hold:** All sets above minimum but below target

### 1RM Estimation

- Epley formula: `weight × (1 + reps / 30)`
- Only applied when logged reps are in the 3–10 range
- Auto-calculated and stored every time a qualifying set is logged
- Not applied to isolation exercises in the weight calculation logic

### Gym Setup

**Default:** Work Gym (full barbell + cable rack) — all blocks generated for Work Gym.

**Home Gym swap:** When tapping Start on any session, user can switch to Home Gym. This triggers the AI to regenerate that session's exercises using the Home Gym library with the same selection logic. The switch is irreversible for that session.

Both gym libraries are hardcoded in `constants/gyms.ts` and duplicated in `backend/routes/ai.js` (backend cannot import TypeScript files).

---

## 7. AI Routes

All Claude API calls are in `backend/routes/ai.js`. Model: `claude-sonnet-4-6`.

### POST /ai/generate-block

- Called at Week 1 and Week 4 of each phase
- Generates compound and isolation session plans for 3 weeks
- Always generates for Work Gym
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

- Called from Extra Session UI
- Takes `gym` parameter
- Returns ranked list of exercises with one-line reasons
- Max tokens: 2000

### GET /ai/weekly-feedback

- Returns the most recent Sunday report for the user

### cron.js (Sunday 8PM)

- Reads 4 weeks of session history, body comp, and 1RM history
- Sends to Claude with structured report prompt
- Stores plain text response in `weekly_feedback` table
- Railway cron schedule: `0 20 * * 0`

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

| Method | Path                      | Description                                       |
| ------ | ------------------------- | ------------------------------------------------- |
| POST   | /auth/register            | Create account                                    |
| POST   | /auth/login               | Login, returns JWT                                |
| GET    | /user/profile             | Get user profile                                  |
| GET    | /sessions/week            | Get sessions for current phase_week               |
| GET    | /sessions/:id             | Get single session with exercises and logged sets |
| POST   | /sessions                 | Create a session                                  |
| PATCH  | /sessions/:id/start       | Start a session                                   |
| POST   | /sessions/:id/sets        | Log a set (auto-calculates 1RM)                   |
| PATCH  | /sessions/:id/complete    | Complete a session                                |
| POST   | /bodycomp                 | Log body composition entry                        |
| GET    | /bodycomp                 | Get body comp history                             |
| GET    | /onerepmax                | Get latest 1RM for all exercises                  |
| GET    | /onerepmax/:exercise      | Get full 1RM history for one exercise             |
| POST   | /ai/generate-block        | Generate a training block                         |
| POST   | /ai/generate-home-session | Regenerate session for Home Gym                   |
| POST   | /ai/extra-session         | Get ranked exercise list for extra session        |
| GET    | /ai/weekly-feedback       | Get latest Sunday report                          |

---

## 10. Environment Variables

### Backend (Railway)

| Variable            | Description                                     |
| ------------------- | ----------------------------------------------- |
| `DATABASE_URL`      | PostgreSQL connection string (Railway internal) |
| `JWT_SECRET`        | Secret key for JWT signing                      |
| `ANTHROPIC_API_KEY` | Claude API key                                  |
| `PORT`              | Set automatically by Railway                    |

### Local development (.env in backend/)

| Variable            | Description                                       |
| ------------------- | ------------------------------------------------- |
| `DATABASE_URL`      | Railway public PostgreSQL URL (for local testing) |
| `JWT_SECRET`        | Same value as Railway                             |
| `ANTHROPIC_API_KEY` | Same value as Railway                             |
| `PORT`              | 3000                                              |

---

## 11. Current State (May 2026)

- User is on Anatomical Adaptation, Block 1, Week 2
- Phase started: 11th May 2026
- All 6 screens built and wired to real data
- Block 1 sessions seeded with real exercise data
- App deployed at Vercel URL (gym.activitycoach.co.uk pending DNS)
- Backend deployed on Railway
- Domain live at gym.activitycoach.co.uk

### Remaining backlog

- Progressive overload flag — detect when all sets hit target and surface to user
- Phase advancement — auto-advance to next phase after week 6, trigger Block 2 at week 4
- Railway cron job schedule configuration
- Extra session UI

### Completed backlog

- ~~Domain setup (gym.activitycoach.co.uk)~~ — done
- Weight conventions and loadable weight constraints — AI prompts updated for both gyms with correct bar weights, increment rules, plate inventory, and dumbbell per-dumbbell convention; session display updated to label dumbbell weights clearly
- Body fat % field — added body_fat_pct column to body_composition table; surfaced on Body Comp screen alongside weight and muscle mass
- Image-to-body-comp logging — "Log from photo" button on Body Comp screen; sends scale screenshot to Claude API, extracts weight, muscle mass, and body fat %, pre-fills form for confirmation before saving
