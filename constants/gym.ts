// constants/gyms.ts
// Hardcoded exercise libraries for Work Gym and Home Gym.
// This is the single source of truth for all exercise data.
// Used by AI prompts, session generation, and exercise selection logic.

export type ExerciseType = "Compound" | "Isolation";

export interface Exercise {
  exercise: string;
  muscles_primary: string;
  muscles_secondary: string;
  type: ExerciseType;
  sub_component: string;
  emg_score: number;
}

export interface GymLibrary {
  id: "work" | "home";
  name: string;
  exercises: Exercise[];
}

// ─── Home Gym ─────────────────────────────────────────────────────────────────

export const HOME_GYM: GymLibrary = {
  id: "home",
  name: "Home Gym",
  exercises: [
    // Back
    {
      exercise: "Dumbbell Bent Over Row",
      muscles_primary: "Back",
      muscles_secondary: "Biceps/Rear Delts",
      type: "Compound",
      sub_component: "Lat/Mid-trap",
      emg_score: 4,
    },
    {
      exercise: "EZ Bar Bent Over Row",
      muscles_primary: "Back",
      muscles_secondary: "Biceps/Rear Delts",
      type: "Compound",
      sub_component: "Lat/Mid-trap",
      emg_score: 3,
    },
    {
      exercise: "Single Arm Dumbbell Row",
      muscles_primary: "Back",
      muscles_secondary: "Biceps",
      type: "Compound",
      sub_component: "Lower lat",
      emg_score: 3,
    },
    // Biceps
    {
      exercise: "Dumbbell Curl",
      muscles_primary: "Biceps",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Short head",
      emg_score: 3,
    },
    {
      exercise: "Dumbbell Hammer Curl",
      muscles_primary: "Biceps",
      muscles_secondary: "Brachialis",
      type: "Isolation",
      sub_component: "Brachialis/Long head",
      emg_score: 2,
    },
    {
      exercise: "EZ Bar Curl",
      muscles_primary: "Biceps",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Long head",
      emg_score: 4,
    },
    // Chest
    {
      exercise: "Dumbbell Bench Press",
      muscles_primary: "Chest",
      muscles_secondary: "Shoulders/Triceps",
      type: "Compound",
      sub_component: "Sternal head",
      emg_score: 4,
    },
    {
      exercise: "Push Up",
      muscles_primary: "Chest",
      muscles_secondary: "Shoulders/Triceps",
      type: "Compound",
      sub_component: "Sternal/Clavicular head",
      emg_score: 2,
    },
    // Core
    {
      exercise: "Dead Bug",
      muscles_primary: "Core",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Deep stabilisers",
      emg_score: 3,
    },
    {
      exercise: "Leg Raise",
      muscles_primary: "Core",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Lower abs",
      emg_score: 4,
    },
    {
      exercise: "Lying Knee Raise",
      muscles_primary: "Core",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Lower abs",
      emg_score: 1,
    },
    {
      exercise: "Plank",
      muscles_primary: "Core",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Deep stabilisers",
      emg_score: 3,
    },
    {
      exercise: "Side Plank",
      muscles_primary: "Core",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Obliques",
      emg_score: 3,
    },
    // Forearms
    {
      exercise: "Reverse Wrist Curl (Dumbbell)",
      muscles_primary: "Forearms",
      muscles_secondary: "Brachialis",
      type: "Isolation",
      sub_component: "Extensors",
      emg_score: 2,
    },
    {
      exercise: "Wrist Curl (Dumbbell)",
      muscles_primary: "Forearms",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Flexors",
      emg_score: 2,
    },
    // Glutes
    {
      exercise: "Glute Bridge",
      muscles_primary: "Glutes",
      muscles_secondary: "Hamstrings",
      type: "Isolation",
      sub_component: "Glutes",
      emg_score: 2,
    },
    // Lower Back
    {
      exercise: "Dumbbell Stiff Leg Deadlift",
      muscles_primary: "Lower Back",
      muscles_secondary: "Hamstrings/Glutes",
      type: "Compound",
      sub_component: "Hamstring/Glute",
      emg_score: 3,
    },
    {
      exercise: "Romanian Deadlift (Dumbbell)",
      muscles_primary: "Lower Back",
      muscles_secondary: "Hamstrings/Glutes",
      type: "Compound",
      sub_component: "Hip hinge/Hamstring emphasis",
      emg_score: 4,
    },
    // Quads
    {
      exercise: "Dumbbell Goblet Squat",
      muscles_primary: "Quads",
      muscles_secondary: "Glutes",
      type: "Compound",
      sub_component: "Quads/Glutes",
      emg_score: 4,
    },
    {
      exercise: "Dumbbell Lunge",
      muscles_primary: "Quads",
      muscles_secondary: "Glutes/Hamstrings",
      type: "Compound",
      sub_component: "Quads/Glutes",
      emg_score: 3,
    },
    {
      exercise: "Dumbbell Step Back Lunge",
      muscles_primary: "Quads",
      muscles_secondary: "Glutes/Hamstrings",
      type: "Compound",
      sub_component: "Glutes/Hamstrings",
      emg_score: 2,
    },
    // Shoulders
    {
      exercise: "Dumbbell Lateral Raise",
      muscles_primary: "Shoulders",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Lateral delt",
      emg_score: 2,
    },
    {
      exercise: "Dumbbell Rear Delt Fly",
      muscles_primary: "Shoulders",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Rear delt",
      emg_score: 2,
    },
    {
      exercise: "Dumbbell Shoulder Press",
      muscles_primary: "Shoulders",
      muscles_secondary: "Triceps",
      type: "Compound",
      sub_component: "Anterior/Lateral delt",
      emg_score: 4,
    },
    {
      exercise: "EZ Bar Overhead Press",
      muscles_primary: "Shoulders",
      muscles_secondary: "Triceps",
      type: "Compound",
      sub_component: "Anterior/Lateral delt",
      emg_score: 4,
    },
    // Triceps
    {
      exercise: "Dumbbell Overhead Tricep Extension",
      muscles_primary: "Triceps",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Long head",
      emg_score: 3,
    },
    {
      exercise: "EZ Bar Skull Crusher",
      muscles_primary: "Triceps",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Long head",
      emg_score: 3,
    },
  ],
};

// ─── Work Gym ─────────────────────────────────────────────────────────────────

export const WORK_GYM: GymLibrary = {
  id: "work",
  name: "Work Gym",
  exercises: [
    // Back
    {
      exercise: "Barbell Bent Over Row",
      muscles_primary: "Back",
      muscles_secondary: "Biceps/Rear Delts",
      type: "Compound",
      sub_component: "Lat/Mid-trap",
      emg_score: 5,
    },
    {
      exercise: "Dumbbell Bent Over Row",
      muscles_primary: "Back",
      muscles_secondary: "Biceps/Rear Delts",
      type: "Compound",
      sub_component: "Lat/Mid-trap",
      emg_score: 4,
    },
    {
      exercise: "Landmine Row",
      muscles_primary: "Back",
      muscles_secondary: "Biceps",
      type: "Compound",
      sub_component: "Different pull angle",
      emg_score: 3,
    },
    {
      exercise: "Single Arm Dumbbell Row",
      muscles_primary: "Back",
      muscles_secondary: "Biceps",
      type: "Compound",
      sub_component: "Lower lat",
      emg_score: 3,
    },
    // Biceps
    {
      exercise: "Barbell Curl",
      muscles_primary: "Biceps",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Long head",
      emg_score: 4,
    },
    {
      exercise: "Cable Curl",
      muscles_primary: "Biceps",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Short head",
      emg_score: 3,
    },
    {
      exercise: "Dumbbell Curl",
      muscles_primary: "Biceps",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Short head",
      emg_score: 3,
    },
    {
      exercise: "Hammer Curl",
      muscles_primary: "Biceps",
      muscles_secondary: "Brachialis",
      type: "Isolation",
      sub_component: "Brachialis/Long head",
      emg_score: 2,
    },
    // Calves
    {
      exercise: "Standing Calf Raise",
      muscles_primary: "Calves",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Gastrocnemius",
      emg_score: 2,
    },
    // Chest
    {
      exercise: "Barbell Bench Press",
      muscles_primary: "Chest",
      muscles_secondary: "Shoulders/Triceps",
      type: "Compound",
      sub_component: "Sternal head",
      emg_score: 5,
    },
    {
      exercise: "Decline Dumbbell Press",
      muscles_primary: "Chest",
      muscles_secondary: "Triceps",
      type: "Compound",
      sub_component: "Lower/Sternal head",
      emg_score: 3,
    },
    {
      exercise: "Dumbbell Bench Press",
      muscles_primary: "Chest",
      muscles_secondary: "Shoulders/Triceps",
      type: "Compound",
      sub_component: "Sternal/Clavicular head",
      emg_score: 4,
    },
    {
      exercise: "Incline Barbell Press",
      muscles_primary: "Chest",
      muscles_secondary: "Shoulders/Triceps",
      type: "Compound",
      sub_component: "Upper/Clavicular head",
      emg_score: 4,
    },
    {
      exercise: "Incline Dumbbell Press",
      muscles_primary: "Chest",
      muscles_secondary: "Shoulders/Triceps",
      type: "Compound",
      sub_component: "Upper/Clavicular head",
      emg_score: 3,
    },
    // Core
    {
      exercise: "Bench Situp",
      muscles_primary: "Core",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Upper abs",
      emg_score: 1,
    },
    {
      exercise: "Cable Crunch",
      muscles_primary: "Core",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Upper abs",
      emg_score: 4,
    },
    {
      exercise: "Cable Woodchop",
      muscles_primary: "Core",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Obliques/Core",
      emg_score: 3,
    },
    {
      exercise: "Dead Bug",
      muscles_primary: "Core",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Deep stabilisers",
      emg_score: 3,
    },
    {
      exercise: "Incline Russian Twist",
      muscles_primary: "Core",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Obliques",
      emg_score: 3,
    },
    {
      exercise: "Incline Situp",
      muscles_primary: "Core",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Upper abs",
      emg_score: 2,
    },
    {
      exercise: "Leg Raise",
      muscles_primary: "Core",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Lower abs",
      emg_score: 4,
    },
    {
      exercise: "Lying Knee Raise",
      muscles_primary: "Core",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Lower abs",
      emg_score: 1,
    },
    {
      exercise: "Plank",
      muscles_primary: "Core",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Deep stabilisers",
      emg_score: 3,
    },
    {
      exercise: "Side Plank",
      muscles_primary: "Core",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Obliques",
      emg_score: 3,
    },
    {
      exercise: "TRX Knee Tuck",
      muscles_primary: "Core",
      muscles_secondary: "Hip Flexors",
      type: "Isolation",
      sub_component: "Lower abs",
      emg_score: 4,
    },
    {
      exercise: "TRX Pike",
      muscles_primary: "Core",
      muscles_secondary: "Core",
      type: "Isolation",
      sub_component: "Lower abs/Core",
      emg_score: 4,
    },
    {
      exercise: "TRX Side Knee Tuck",
      muscles_primary: "Core",
      muscles_secondary: "Abs",
      type: "Isolation",
      sub_component: "Obliques/Lower abs",
      emg_score: 3,
    },
    // Forearms
    {
      exercise: "Reverse Wrist Curl",
      muscles_primary: "Forearms",
      muscles_secondary: "Brachialis",
      type: "Isolation",
      sub_component: "Extensors",
      emg_score: 2,
    },
    {
      exercise: "Wrist Curl (Barbell)",
      muscles_primary: "Forearms",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Flexors",
      emg_score: 2,
    },
    // Hamstrings
    {
      exercise: "Leg Curl Machine",
      muscles_primary: "Hamstrings",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Hamstrings",
      emg_score: 3,
    },
    // Lower Back
    {
      exercise: "Barbell Deadlift",
      muscles_primary: "Lower Back",
      muscles_secondary: "Glutes/Hamstrings",
      type: "Compound",
      sub_component: "Full posterior chain",
      emg_score: 5,
    },
    {
      exercise: "Romanian Deadlift",
      muscles_primary: "Lower Back",
      muscles_secondary: "Hamstrings/Glutes",
      type: "Compound",
      sub_component: "Hip hinge/Hamstring emphasis",
      emg_score: 4,
    },
    // Quads
    {
      exercise: "Barbell Squat",
      muscles_primary: "Quads",
      muscles_secondary: "Glutes/Hamstrings",
      type: "Compound",
      sub_component: "Quads/Glutes",
      emg_score: 5,
    },
    {
      exercise: "Leg Extension Machine",
      muscles_primary: "Quads",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Quads",
      emg_score: 3,
    },
    {
      exercise: "Leg Press Machine",
      muscles_primary: "Quads",
      muscles_secondary: "Glutes/Hamstrings",
      type: "Compound",
      sub_component: "Quads/Glutes — different loading angle",
      emg_score: 4,
    },
    // Shoulders
    {
      exercise: "Cable Lateral Raise",
      muscles_primary: "Shoulders",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Lateral delt",
      emg_score: 2,
    },
    {
      exercise: "Dumbbell Lateral Raise",
      muscles_primary: "Shoulders",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Lateral delt",
      emg_score: 2,
    },
    {
      exercise: "Dumbbell Rear Delt Fly",
      muscles_primary: "Shoulders",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Rear delt/Rhomboids",
      emg_score: 2,
    },
    {
      exercise: "Dumbbell Shoulder Press",
      muscles_primary: "Shoulders",
      muscles_secondary: "Triceps",
      type: "Compound",
      sub_component: "Anterior delt/Stabilisers",
      emg_score: 4,
    },
    {
      exercise: "Face Pull",
      muscles_primary: "Shoulders",
      muscles_secondary: "Upper Back/Rotator Cuff",
      type: "Isolation",
      sub_component: "Rear delt/Rotator cuff",
      emg_score: 3,
    },
    {
      exercise: "Overhead Barbell Press",
      muscles_primary: "Shoulders",
      muscles_secondary: "Triceps/Upper Chest",
      type: "Compound",
      sub_component: "Anterior/Lateral delt",
      emg_score: 5,
    },
    // Triceps
    {
      exercise: "Overhead Tricep Extension",
      muscles_primary: "Triceps",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Long head",
      emg_score: 4,
    },
    {
      exercise: "Skull Crusher",
      muscles_primary: "Triceps",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Long head/Medial head",
      emg_score: 4,
    },
    {
      exercise: "Tricep Pushdown (Cable)",
      muscles_primary: "Triceps",
      muscles_secondary: "None",
      type: "Isolation",
      sub_component: "Lateral head",
      emg_score: 4,
    },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getGymLibrary(gym: "work" | "home"): GymLibrary {
  return gym === "work" ? WORK_GYM : HOME_GYM;
}

export function getExercisesByMuscle(
  gym: "work" | "home",
  muscle: string,
): Exercise[] {
  return getGymLibrary(gym).exercises.filter(
    (e) => e.muscles_primary.toLowerCase() === muscle.toLowerCase(),
  );
}

export function getCompoundExercises(gym: "work" | "home"): Exercise[] {
  return getGymLibrary(gym).exercises.filter((e) => e.type === "Compound");
}

export function getIsolationExercises(gym: "work" | "home"): Exercise[] {
  return getGymLibrary(gym).exercises.filter((e) => e.type === "Isolation");
}

// Returns the full library as a CSV string for insertion into AI prompts
export function gymLibraryToCSV(gym: "work" | "home"): string {
  const library = getGymLibrary(gym);
  const header =
    "exercise,muscles_primary,muscles_secondary,type,sub_component,emg_score";
  const rows = library.exercises.map(
    (e) =>
      `${e.exercise},${e.muscles_primary},${e.muscles_secondary},${e.type},${e.sub_component},${e.emg_score}`,
  );
  return [header, ...rows].join("\n");
}
