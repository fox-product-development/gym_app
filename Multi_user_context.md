# GymApp — Multi-User & Configuration Design Document

Drafted: June 2026  
Status: Design complete — awaiting implementation

---

## Overview

This document captures all design decisions made for the GymApp multi-user expansion. It covers registration, gym and equipment configuration, exercise management, agent planning configuration, and tone settings. It is intended to sit alongside `GYMAPP_PROJECT_KNOWLEDGE.md` and be referenced when implementation begins.

---

## 1. Registration — Invite by Approved Email

### Decision

Registration is invite-only via a pre-approved email list. The system is not open to public registration.

### How it works

- Admin maintains a list of approved email addresses in the database
- Registration form collects: Email, Username, Password
- On submit, two checks run in sequence:
  1. Is this email on the approved list?
  2. Is this username available?
- If both pass, the account is created
- If either fails, a specific error is shown

### Admin management

- Settings screen (admin only) has an "Approved emails" section
- Admin types an email address and taps Add — it is written to the approved list immediately
- No token generation, no expiry, no link sharing risk
- Admin can also remove emails from the list (prevents future registration but does not affect existing accounts)

### Database addition

New table: `approved_emails`

| Field      | Type      | Notes                                           |
| ---------- | --------- | ----------------------------------------------- |
| `id`       | SERIAL PK |                                                 |
| `email`    | TEXT      | Unique, lowercase                               |
| `added_at` | TIMESTAMP |                                                 |
| `used`     | BOOLEAN   | True once an account is created with this email |

---

## 2. Gym Configuration

### Decision

Gyms are user-scoped. Each user defines their own gyms independently. There is no shared gym library. Duplication across users is acceptable given the expected user count of under 5.

### Database additions

New table: `gyms`

| Field        | Type       | Notes                       |
| ------------ | ---------- | --------------------------- |
| `id`         | SERIAL PK  |                             |
| `user_id`    | INTEGER FK |                             |
| `gym_name`   | TEXT       | e.g. "Home Gym", "Work Gym" |
| `is_default` | BOOLEAN    | Only one default per user   |
| `created_at` | TIMESTAMP  |                             |

### Default gym behaviour

- The default gym drives block generation — all blocks are planned for the user's default gym
- Default can be changed in settings
- Only one gym can be marked as default at a time

### Adding a gym

Simple text input: Enter gym name → saved to `gyms` table.

---

## 3. Equipment Configuration

### Decision

Equipment is user-scoped and gym-scoped. Each piece of equipment belongs to a specific user's specific gym.

### Equipment types

| Type        | Description                                      | Weight entry                                  |
| ----------- | ------------------------------------------------ | --------------------------------------------- |
| `loadable`  | Barbell, EZ bar, dumbbells with removable plates | Unladen weight + draws from shared plate pool |
| `fixed`     | Pre-weighted dumbbells, fixed barbells           | Increment value                               |
| `machine`   | Cable stack, leg press, chest press              | Increment value                               |
| `apparatus` | Bench, rack, pull-up bar                         | No weight                                     |

### Plate pool

Plates are pooled per gym, not per piece of equipment. A gym has one plate inventory shared across all loadable equipment.

### Database additions

New table: `equipment`

| Field               | Type       | Notes                                                        |
| ------------------- | ---------- | ------------------------------------------------------------ |
| `id`                | SERIAL PK  |                                                              |
| `user_id`           | INTEGER FK |                                                              |
| `gym_id`            | INTEGER FK |                                                              |
| `equipment_name`    | TEXT       |                                                              |
| `type`              | TEXT       | loadable / fixed / machine / apparatus                       |
| `unladen_weight_kg` | NUMERIC    | For loadable equipment only, null otherwise                  |
| `increment_kg`      | NUMERIC    | For fixed and machine types, null for loadable and apparatus |

New table: `plates`

| Field       | Type       | Notes                                     |
| ----------- | ---------- | ----------------------------------------- |
| `id`        | SERIAL PK  |                                           |
| `user_id`   | INTEGER FK |                                           |
| `gym_id`    | INTEGER FK |                                           |
| `weight_kg` | NUMERIC    | Weight of one plate                       |
| `quantity`  | INTEGER    | How many of this plate size are available |

### Weight calculation logic

- **Loadable equipment:** Valid weights are calculated from all achievable combinations using the gym's plate pool, split equally each side, plus the unladen bar weight. The progressive overload system picks the next valid weight above the current target.
- **Fixed and machine equipment:** Valid weights are the increment value applied repeatedly from the minimum. The PO system rounds up to the nearest valid increment.
- **Apparatus:** No weight calculation — excluded from all weight logic.

### Add equipment modal flow

1. Enter equipment name
2. Select gym (from user's gym list)
3. Select type: Loadable / Fixed / Machine / Apparatus
4. If Loadable: Enter unladen weight (kg)
5. If Fixed or Machine: Enter increment (kg)
6. Apparatus: done

### Plate editing

Plate quantities are edited inline with +/− controls on the gym settings screen. Changes are held in local state and a "Save changes" bar appears at the bottom when any modification is made. Changes are only written to the database on explicit Save. Discard reverts to the last saved state.

---

## 4. Exercise Configuration

### Decision

Exercises are user-scoped and gym-scoped. Each user maintains their own exercise list per gym. No shared library.

### Gym settings screen — Exercise tab

- Exercises listed grouped by type (Compound / Isolation) then by muscle group
- Each row shows: checkbox (active/inactive), exercise name, muscle meta, EMG score as dot indicators, kebab menu
- Checkbox toggles whether the AI includes the exercise in planning — does not delete it
- Kebab menu: Edit / Remove

### Checkbox behaviour

- Checked = included in AI planning
- Unchecked = excluded from AI planning (e.g. temporary injury break)
- Unchecked exercises are dimmed in the list but remain in the database

### Edit exercise

Opens the same modal as Add Exercise, prepopulated with existing values. All fields editable.

### Remove exercise — three step flow

1. Tap kebab → Remove
2. First modal: "This will permanently delete [Exercise Name] and all its logged history. This cannot be undone." → Continue or Cancel
3. Second modal: "This will delete [Exercise Name] and all related data. Progress charts will no longer show any data for this exercise." → Delete exercise and all data (red) or Cancel
4. On confirm: exercise row deleted from `exercises` table, all associated `logged_sets` and `one_rep_max_history` records for that exercise also deleted

### Editable fields

- Exercise name
- Muscles primary
- Sub-component
- Type (Compound / Isolation)
- EMG score (1–5)

### Adding a new exercise — AI-assisted flow

1. Tap Add exercise
2. Enter exercise name
3. AI call: Claude receives the exercise name and returns JSON with muscles_primary, muscles_secondary, type, sub_component, emg_score
4. User reviews pre-filled fields, adjusts if needed
5. Confirm → saved to `exercises` table

### Suggest exercises

- Button on the exercise tab: "Suggest exercises"
- AI checks the gym's equipment list and generates a set of appropriate exercises with all metadata pre-filled
- Exercises already in the user's list are excluded from suggestions
- Results shown in a modal grouped by Compound / Isolation then muscle group
- All suggested exercises are checked by default
- User unchecks any they don't want
- Tap Add selected → all checked exercises written to the database in one operation

---

## 5. Gym Settings Screen — UI

### Layout

- Full screen
- Dropdown at top to select active gym (also contains Add new gym option)
- Two tabs below: Equipment | Exercises
- Swipe or tap to switch between tabs

### Equipment tab sections

1. **Apparatus** — list of apparatus items, kebab menu per row for edit
2. **Equipment** — list with name, type badge, unladen weight or increment, kebab menu
3. **Plates** — list of plate sizes with quantity, inline +/− editing, Add plate size button at bottom
4. **Add equipment** button at bottom of tab

### Exercises tab

- Grouped list: Compound section then Isolation section, each alphabetical by muscle group
- Each row: checkbox, name, muscle/type meta, EMG dot indicator, kebab menu
- Add exercise button at bottom
- Suggest exercises button at bottom

### Save bar (equipment tab)

- Appears at bottom when any plate quantity is changed
- Shows "Unsaved changes" notice in warning colour
- Save changes button (writes to DB)
- Discard button (reverts local state)

---

## 6. Session Gym Swap

### Current behaviour

Work Gym → Home Gym toggle at session start.

### Multi-user behaviour

- On tapping Start on any session, user is offered a list of their other gyms to swap to
- If user has only one gym: no swap option shown
- If user has two gyms: same behaviour as current (effectively a toggle)
- If user has three or more gyms: picker list of available gyms
- Selecting a different gym triggers AI to regenerate that session's exercises for the selected gym
- The swap is irreversible for that session

---

## 7. Agent Planning Configuration — Goal Profile

### When it runs

- On first registration (mandatory before accessing the app)
- Via "Redefine goals" in settings (with warning modals)

### Goal input — star ratings (1–5)

Four goals, each rated independently 1–5 stars:

- Size
- Strength
- Definition
- General fitness

Star rating approach used (not multi-select, not slider) to avoid implying any option is negative at low ratings.

### Training level — single select

- New
- Amateur
- Serious
- Professional

### Weekly sessions

- Pre-filled suggestion based on training level:
  - New → 3
  - Amateur → 3–4
  - Serious → 4–5
  - Professional → 5+
- User can adjust up or down with a +/− input

### Free text field

"Describe what you want from this app" — open text box for preferences the structured questions don't capture (e.g. "preference on upper body", "no leg exercises due to injury").

### Redefine goals — warning flow

1. Tap "Redefine goals" in settings
2. First modal: "Changing your goals will recalculate your training cycle. Your current block will complete as planned before any changes take effect." → Continue or Cancel
3. Goal input screens (same flow as registration, prepopulated with current values)
4. AI generates new phase cycle
5. Preview modal: shows the new cycle sequence → Confirm or Go back
6. On confirm: `phase_cycle` field updated immediately in database

---

## 8. Personalised Phase Cycle

### Decision

The phase cycle is AI-generated per user based on their goal ratings. It is not a fixed 4-phase rotation.

### Principles

- **Anatomical Adaptation always anchors** the cycle — non-negotiable foundation phase
- **Hypertrophy acts as a bridge** — appears based on size/strength ratings
- **Definition and Strength** phases get more or fewer blocks based on their star ratings
- The cycle repeats after completion

### Example cycles

High Definition / Low Size and Strength (5★ Definition, 1★ Size, 1★ Strength):

> AA 2 blocks → Definition 2 blocks → AA 1 block → Hypertrophy 1 block → Definition 2 blocks → repeat

High Strength / Low Definition (5★ Strength, 1★ Definition):

> AA 2 blocks → Strength 2 blocks → AA 1 block → Hypertrophy 1 block → Strength 2 blocks → repeat

### Database changes

New field on `users` table: `phase_cycle` — JSON array storing the AI-generated sequence of phases and block counts.

Example value:

```json
[
  { "phase": "anatomical_adaptation", "blocks": 2 },
  { "phase": "muscle_definition", "blocks": 2 },
  { "phase": "anatomical_adaptation", "blocks": 1 },
  { "phase": "hypertrophy", "blocks": 1 },
  { "phase": "muscle_definition", "blocks": 2 }
]
```

### Cycle update behaviour

- `phase_cycle` is updated immediately when goals are redefined
- Because the cron only reads `phase_cycle` when generating a new block, and the current block must complete before a new one is generated, the update is safe to apply immediately — no pending/staged field needed
- The new cycle takes effect naturally at the next block generation

### Sunday cron changes

The cron reads `phase_cycle` per user rather than advancing through a hardcoded rotation. Each user's advancement is independent.

---

## 9. Agent Tone Setting

### Decision

Preset labels — not a slider, not star ratings. All options are positive and describe a style rather than implying quality at any level.

### Options (single select)

- **Motivational** — encouraging, celebratory, pushes you to hit targets
- **Neutral** — factual, balanced, no fluff
- **Coaching** — instructional, explains the why behind recommendations
- **Drill Sergeant** — direct, no nonsense, high expectations

### Implementation

Selected tone maps to a predefined prompt block that is prepended to every AI call. Stored as a user preference field.

### Database addition

New field on `users` table: `agent_tone` — TEXT, one of: motivational / neutral / coaching / drill_sergeant. Default: neutral.

---

## 10. Summary of Database Changes

### New tables

| Table             | Purpose                          |
| ----------------- | -------------------------------- |
| `approved_emails` | Invite-only registration control |
| `gyms`            | User-scoped gym definitions      |
| `equipment`       | User and gym scoped equipment    |
| `plates`          | Plate inventory per gym          |

### Modified tables

| Table       | New fields                                                                                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `users`     | `agent_tone` TEXT, `phase_cycle` JSONB, `goal_size` INTEGER (1–5), `goal_strength` INTEGER (1–5), `goal_definition` INTEGER (1–5), `goal_fitness` INTEGER (1–5), `training_level` TEXT, `weekly_sessions` INTEGER, `goal_description` TEXT |
| `exercises` | `gym_id` INTEGER FK (replaces hardcoded gym TEXT field), `active` BOOLEAN (default true, driven by checkbox)                                                                                                                               |

---

## 11. Implementation Notes

- The `exercises` table currently uses a `gym` TEXT field (work/home). This should be migrated to reference `gym_id` from the new `gyms` table
- Progressive overload increment logic currently hardcoded in the backend must be rewritten to read from the `equipment` and `plates` tables
- The cron job currently processes a single user — must be updated to loop through all users independently
- AI prompts for block generation must be updated to include: gym equipment list, plate inventory, equipment types and increments, goal profile, tone setting, and personalised phase cycle
- The home gym swap logic must be generalised from a hardcoded two-gym toggle to a user's gym list picker

---

## 12. Out of Scope for This Phase

- Activity Coach merger / shared login — retired in favour of feature migration (see sections 13–16)
- Admin panel beyond approved email management
- More than one default gym per user
- Kung Fu feature — to be spun out into its own dedicated app

---

## 13. Diet Logging

### Decision

Migrate diet logging from Activity Coach into the Gym App so the Sunday report agent has full macro context alongside training data. Activity Coach diet logging to be retired once migration is complete and data is transferred.

### What is logged

Full macro breakdown extracted from Nutra Check screenshots via Claude vision:

- Calories (kcal)
- Fat (g)
- Saturated fat (g)
- Carbohydrates (g)
- Sugar (g)
- Fibre (g)
- Protein (g)
- Salt (g)

### UI — Body Comp screen changes

The existing Body Comp screen (log.tsx) currently has a single view for weight. A tab bar is added at the top with three tabs:

- **Weight** — existing functionality, unchanged
- **Diet** — screenshot upload + macro charts
- **Mood** — see section 14

### Diet tab

- Screenshot upload button — sends image to Claude vision, extracts macro values, pre-fills form for confirmation before saving (same pattern as existing body comp image extraction)
- Charts showing key nutrient intake over time — at minimum: calories, protein, and sugar as the most training-relevant. Additional macros available but not charted on day one to keep build scope contained. Charts to be added iteratively once data volume makes them meaningful.

### Database addition

New table: `diet_logs`

| Field             | Type       | Notes             |
| ----------------- | ---------- | ----------------- |
| `id`              | SERIAL PK  |                   |
| `user_id`         | INTEGER FK |                   |
| `logged_at`       | DATE       | One entry per day |
| `calories_kcal`   | NUMERIC    |                   |
| `fat_g`           | NUMERIC    |                   |
| `saturated_fat_g` | NUMERIC    |                   |
| `carbs_g`         | NUMERIC    |                   |
| `sugar_g`         | NUMERIC    |                   |
| `fibre_g`         | NUMERIC    |                   |
| `protein_g`       | NUMERIC    |                   |
| `salt_g`          | NUMERIC    |                   |
| `source`          | TEXT       | manual / image    |

### Data migration

Existing diet data from Activity Coach `diet_logs` table to be transferred into the new GymApp `diet_logs` table. Currently Activity Coach only stores calories — remaining macro fields will be null for historical entries. No data loss, nulls are handled gracefully by the agent.

---

## 14. Mood and Energy Logging

### Decision

Migrate mood and energy logging from Activity Coach into the Gym App. Enables the Sunday report agent to correlate session type with mood and energy outcomes.

### What is logged

- **Mood** — star rating 1–5
- **Energy** — star rating 1–5
- **Notes** — optional free text

One entry per day.

### UI — Body Comp screen, Mood tab

- Two star rating inputs: Mood and Energy
- Optional free text notes field
- Save button
- Simple trend chart showing mood and energy over time (same iterative approach as diet charts)

### Database addition

New table: `mood_logs`

| Field       | Type       | Notes             |
| ----------- | ---------- | ----------------- |
| `id`        | SERIAL PK  |                   |
| `user_id`   | INTEGER FK |                   |
| `logged_at` | DATE       | One entry per day |
| `mood`      | INTEGER    | 1–5               |
| `energy`    | INTEGER    | 1–5               |
| `notes`     | TEXT       | Optional          |

### Data migration

Existing mood data from Activity Coach `mood_logs` table to be transferred into the new GymApp `mood_logs` table. Schema is identical so migration is straightforward.

---

## 15. Cardio Logging

### Decision

Add a lightweight cardio logging option on the Week screen, accessible at any time — not tied to a gym session. Cardio events are stored with enough detail to be meaningful to the agent without cluttering the session UI.

### UI — Week screen

- "+ Log cardio" button placed below "Generate Extra Session" on the week screen
- Tapping opens a simple modal: activity type, duration (minutes), optional notes
- Logged cardio events for the current week are displayed as a summary list on the week screen alongside sessions

### What is logged

- Activity type (e.g. running, cycling, swimming — free text or from a short preset list)
- Duration in minutes
- Optional distance (km)
- Optional notes
- Date (defaults to today)

### Database addition

New table: `cardio_logs`

| Field              | Type       | Notes                 |
| ------------------ | ---------- | --------------------- |
| `id`               | SERIAL PK  |                       |
| `user_id`          | INTEGER FK |                       |
| `logged_at`        | DATE       |                       |
| `activity_type`    | TEXT       | e.g. running, cycling |
| `duration_minutes` | INTEGER    |                       |
| `distance_km`      | NUMERIC    | Optional              |
| `notes`            | TEXT       | Optional              |

### Data migration

Relevant non-gym activity data from Activity Coach `activities` table to be reviewed and transferred. Gym sessions are already in the GymApp `sessions` table via the bridge and are excluded from this migration.

---

## 16. Sunday Report Redesign and Email Delivery

### Decision

The Sunday report is the highest value output of all data capture. It must be redesigned as a last step, after diet, mood, and cardio data are in place and populated. Implementing the new prompt before the data exists would produce incomplete results.

### Report philosophy

The report must not be a parallel summary of each data category. It must reason across all data to find causal connections — how each data point may have influenced others — and present a coherent narrative of the week.

### Structure

**1. Headline sentence**
A single sentence written by the agent capturing the character of the week before any detail. Sets tone. Not a template — genuinely written per week.

**2. Looking back — causal narrative**
The agent receives all data for the week in a single prompt context (sessions, sets, progressive overload, diet logs, mood logs, energy logs, cardio events, body comp) and is instructed to find the threads between them rather than summarise each category in isolation.

Example reasoning the agent should perform:

- Low energy Monday → preceded by high cardio Sunday and low protein Saturday → likely contributed to below-target compound session performance
- Mood spike mid-week → followed rest day and higher calorie day → worth noting the pattern
- Progressive overload achieved on X exercises → nutrition was on target those days

**3. Week ahead — Stop / Start / Continue**
Three clearly labelled sections, each containing 2–4 specific, evidence-based actions. Generic advice without a link back to observed data is explicitly excluded from the prompt instructions.

- **Stop** — things the data suggests are working against the user's goals (e.g. "Stop high cardio the evening before a morning compound session — energy scores were lower the following day on two occasions this week")
- **Start** — new behaviours the data suggests would help (e.g. "Start increasing daily protein — you hit your session targets on the three days protein exceeded 140g, and missed on the two days it was under 100g")
- **Continue** — things that are clearly working (e.g. "Continue pushing progressive overload on back exercises — consistent range_exceeded flags and stable mood scores suggest recovery is good")

### Tone

Report respects the user's `agent_tone` setting (motivational / neutral / coaching / drill_sergeant). The structure remains the same — tone affects the language used throughout.

### Email delivery

- Report is generated Sunday by the existing cron job
- Stored as plain text in `weekly_feedback` table (existing behaviour unchanged)
- Additionally sent by email via Resend integration (ported from Activity Coach)
- Recipient email address read from `approved_emails` table linked to the user's account — no additional data storage needed
- Email format: clean and readable, not a heavily designed HTML template. Structured sections with clear headings. Should feel like a letter from a coach, not a generated report.

### Implementation order

This section is explicitly to be implemented last. Correct order:

1. Diet logging (schema + UI + data migration)
2. Mood and energy logging (schema + UI + data migration)
3. Cardio logging (schema + UI)
4. Sunday report redesign and email (prompt + Resend integration)

---

## 17. Updated Summary of Database Changes

### New tables (all phases)

| Table             | Purpose                          |
| ----------------- | -------------------------------- |
| `approved_emails` | Invite-only registration control |
| `gyms`            | User-scoped gym definitions      |
| `equipment`       | User and gym scoped equipment    |
| `plates`          | Plate inventory per gym          |
| `diet_logs`       | Daily macro intake logging       |
| `mood_logs`       | Daily mood and energy ratings    |
| `cardio_logs`     | Non-gym cardio activity logging  |

### Modified tables

| Table       | New fields                                                                                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `users`     | `agent_tone` TEXT, `phase_cycle` JSONB, `goal_size` INTEGER (1–5), `goal_strength` INTEGER (1–5), `goal_definition` INTEGER (1–5), `goal_fitness` INTEGER (1–5), `training_level` TEXT, `weekly_sessions` INTEGER, `goal_description` TEXT |
| `exercises` | `gym_id` INTEGER FK (replaces hardcoded gym TEXT field), `active` BOOLEAN (default true)                                                                                                                                                   |
