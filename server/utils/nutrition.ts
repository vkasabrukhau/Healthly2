type Goal = "cut" | "maintain" | "bulk";
type Gender = "male" | "female";

export type BaselineInput = {
  age: number;
  gender: Gender;
  heightCm: number;
  weightKg: number;
  exerciseFreqPerWeek: number;
  exerciseMinutesPerWeek?: number;
  goal: Goal;
};

export type MacroTargets = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar: number;
  sodium: number;
};

export type WorkoutEntry = {
  workoutType: string;
  durationMinutes: number;
  intensity?: "low" | "moderate" | "high";
  caloriesBurned?: number;
};

const ACTIVITY_FACTORS = [
  { max: 0, factor: 1.2 },
  { max: 3, factor: 1.375 },
  { max: 5, factor: 1.55 },
  { max: 7, factor: 1.725 },
];

const MET_LOOKUP: Record<string, number> = {
  walking: 3,
  endurance_low: 7,
  endurance_high: 11,
  strength: 5,
  hiit: 12,
  mixed: 6,
};

function clampNumber(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function calculateActivityFactor(freqPerWeek: number) {
  const freq = Number.isFinite(freqPerWeek) ? Math.max(freqPerWeek, 0) : 0;
  for (const entry of ACTIVITY_FACTORS) {
    if (freq <= entry.max) return entry.factor;
  }
  return 1.9;
}

export function calculateBMR({ age, gender, heightCm, weightKg }: BaselineInput) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return gender === "male" ? base + 5 : base - 161;
}

export function calculateBaselineMacros(input: BaselineInput): MacroTargets {
  const bmr = calculateBMR(input);
  const activityFactor = calculateActivityFactor(input.exerciseFreqPerWeek);
  const tdee = bmr * activityFactor;

  let targetCalories = tdee;
  if (input.goal === "cut") targetCalories -= 250;
  if (input.goal === "bulk") targetCalories += 250;
  targetCalories = Math.max(targetCalories, 1200); // safety floor

  let proteinPerKg = 1.6;
  if (input.goal === "cut") proteinPerKg = 2.0;
  if (input.goal === "bulk") proteinPerKg = 1.4;

  const protein = proteinPerKg * input.weightKg;
  const proteinKcal = protein * 4;

  const fatKcal = targetCalories * 0.25;
  const fat = fatKcal / 9;

  const carbKcal = Math.max(targetCalories - (proteinKcal + fatKcal), 0);
  const carbs = carbKcal / 4;

  const sugar = (targetCalories * 0.05) / 4;
  const sodium = 2300;

  const round = (n: number) => Math.round(n * 10) / 10;

  return {
    calories: Math.round(targetCalories),
    protein: round(protein),
    carbs: round(carbs),
    fat: round(fat),
    sugar: round(sugar),
    sodium,
  };
}

function deriveMetFromWorkout(entry: WorkoutEntry) {
  const type = entry.workoutType?.toLowerCase() || "";
  const intensity = entry.intensity || "moderate";
  if (type.includes("walk")) return MET_LOOKUP.walking;
  if (type.includes("strength") || type.includes("lift"))
    return MET_LOOKUP.strength;
  if (type.includes("hiit")) return MET_LOOKUP.hiit;
  if (type.includes("endurance") || type.includes("run") || type.includes("cycle")) {
    return intensity === "high" ? MET_LOOKUP.endurance_high : MET_LOOKUP.endurance_low;
  }
  if (type.includes("mixed"))
    return MET_LOOKUP.mixed;
  return intensity === "high" ? 8 : 5;
}

export function estimateWorkoutCalories(
  entry: WorkoutEntry,
  weightKg: number
): number {
  if (entry.caloriesBurned && entry.caloriesBurned > 0) {
    return entry.caloriesBurned;
  }
  const hours = Math.max(entry.durationMinutes, 0) / 60;
  const met = deriveMetFromWorkout(entry);
  return met * weightKg * hours;
}

export function adjustMacrosForWorkouts(
  baseline: MacroTargets,
  workouts: WorkoutEntry[],
  weightKg: number,
  goal: Goal
) {
  const totalWorkoutCalories = workouts.reduce(
    (sum, workout) => sum + estimateWorkoutCalories(workout, weightKg),
    0
  );

  // optionally eat back 100% of workout calories
  const adjustedCalories = Math.round(baseline.calories + totalWorkoutCalories);

  let protein = baseline.protein;
  let carb = baseline.carbs;
  const fat = baseline.fat;
  let sodium = baseline.sodium;

  for (const workout of workouts) {
    if (
      (workout.workoutType === "strength" ||
        workout.workoutType === "mixed" ||
        workout.workoutType?.toLowerCase().includes("strength")) &&
      workout.durationMinutes >= 45
    ) {
      protein += 15;
    }
    const isEndurance =
      workout.workoutType === "endurance" ||
      workout.workoutType?.toLowerCase().includes("endurance") ||
      workout.workoutType?.toLowerCase().includes("run") ||
      workout.workoutType?.toLowerCase().includes("cycle");
    if (isEndurance && workout.durationMinutes >= 60) {
      carb += 0.7 * weightKg;
    }
    if (workout.durationMinutes >= 60) {
      sodium += 500 * (workout.durationMinutes / 60);
    }
  }

  const proteinKcal = protein * 4;
  const fatKcal = fat * 9;
  const carbKcal = Math.max(adjustedCalories - (proteinKcal + fatKcal), 0);
  const baseCarb = carbKcal / 4;

  const carbs = Math.max(baseCarb, 0) + Math.max(carb - baseline.carbs, 0);

  return {
    calories: adjustedCalories,
    protein: Math.round(protein * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    sugar: baseline.sugar,
    sodium: Math.round(sodium),
    meta: {
      totalWorkoutCalories: Math.round(totalWorkoutCalories),
      goal,
    },
  };
}
