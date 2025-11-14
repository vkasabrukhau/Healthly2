import { defineEventHandler, readBody, createError } from "h3";
import { getCollection } from "../utils/mongo";
import { calculateBaselineMacros } from "../utils/nutrition";
import { requireAuthenticatedUser } from "./utils/require-auth";

type UserProfileDoc = {
  userId: string;
  firstName: string;
  lastName: string;
  dob: string;
  age: number;
  exerciseLevel: string;
  exerciseFrequency: string;
  exerciseMinutesPerWeek?: number;
  exerciseFreqPerWeek?: number;
  photoDataUrl?: string;
  mealPlanMode?: "cut" | "maintain" | "bulk";
  currentWeight?: number;
  weightKg?: number;
  heightCm?: number;
  gender?: string;
  waterGoal?: number;
  baselineMacros?: Record<string, number>;
  dayMetrics?: {
    date: string;
    metrics: Record<string, number>;
    completionPercent?: number | null;
  };
  dayMetricsByDate?: Record<
    string,
    { metrics: Record<string, number>; completionPercent?: number | null }
  >;
  macroCompletionHistory?: Array<{
    date: string;
    percent: number;
    recordedAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
};

const KG_PER_LB = 0.45359237;

function parseExerciseFrequency(value?: string | number | null) {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return Math.max(value, 0);
  }
  if (typeof value === "string") {
    if (value.includes("-")) {
      const [min, max] = value
        .split("-")
        .map((part) => Number(part.trim()))
        .filter((n) => !Number.isNaN(n));
      if (min != null && max != null) return (min + max) / 2;
    }
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return Math.max(numeric, 0);
  }
  return 0;
}

function normalizeGender(value?: string | null) {
  if (!value) return "female";
  return value.toLowerCase().startsWith("m") ? "male" : "female";
}

export default defineEventHandler(async (event) => {
  const body = await readBody<Partial<UserProfileDoc>>(event);
  const {
    userId,
    firstName,
    lastName,
    dob,
    gender,
    age,
    exerciseLevel,
    exerciseFrequency,
    photoDataUrl,
  } = body;

  const hasFullProfile =
    !!userId && !!firstName && !!lastName && !!dob && typeof age === "number";

  let parsedDob: Date | null = null;
  if (hasFullProfile) {
    if (!exerciseLevel || !exerciseFrequency) {
      throw createError({
        statusCode: 400,
        statusMessage: "Exercise info required",
      });
    }
    parsedDob = new Date(dob as string);
    if (Number.isNaN(parsedDob.getTime())) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid date of birth",
      });
    }
  }

  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: "Missing userId" });
  }
  await requireAuthenticatedUser(event, userId);

  const collection = await getCollection<UserProfileDoc>("user");
  const now = new Date();

  if (hasFullProfile) {
    const rawWeightKg = (body as any).weightKg;
    const rawWeight = (body as any).weight;
    let initialWeight: number | undefined;
    if (typeof rawWeight === "number" && !Number.isNaN(rawWeight)) {
      initialWeight = Number(rawWeight);
    } else if (typeof rawWeightKg === "number" && !Number.isNaN(rawWeightKg)) {
      initialWeight = Math.round(rawWeightKg * 2.2046226218 * 10) / 10;
    }
    const weightKg =
      typeof rawWeightKg === "number" && !Number.isNaN(rawWeightKg)
        ? rawWeightKg
        : typeof initialWeight === "number"
        ? Math.round(initialWeight * KG_PER_LB * 10) / 10
        : undefined;
    const heightCmValue =
      typeof (body as any).heightCm === "number"
        ? (body as any).heightCm
        : Number((body as any).heightCm) || undefined;
    const exerciseMinutesPerWeek =
      Number((body as any).exerciseMinutesPerWeek) || 0;
    const exerciseFreqPerWeek = parseExerciseFrequency(
      (body as any).exerciseSessionsPerWeek ?? exerciseFrequency
    );
    const goal = ((body as any).mealPlanMode as any) || "maintain";

    const setObj: any = {
      firstName: (firstName as string).trim(),
      lastName: (lastName as string).trim(),
      gender: (gender as string) || undefined,
      dob: (parsedDob as Date).toISOString(),
      age: age as number,
      exerciseLevel,
      exerciseFrequency,
      exerciseMinutesPerWeek,
      exerciseFreqPerWeek,
      heightCm: heightCmValue,
      photoDataUrl,
      mealPlanMode: (body as any).mealPlanMode ?? undefined,
      waterGoal: (body as any).waterGoal ?? undefined,
      updatedAt: now,
    };
    if (typeof initialWeight === "number") {
      setObj.currentWeight = initialWeight;
    }
    if (typeof weightKg === "number") {
      setObj.weightKg = Math.round(weightKg * 10) / 10;
    }

    const canComputeBaseline =
      typeof weightKg === "number" &&
      typeof heightCmValue === "number" &&
      typeof age === "number";

    if (canComputeBaseline) {
      const baselineMacros = calculateBaselineMacros({
        age: age as number,
        gender: normalizeGender(gender as string),
        heightCm: heightCmValue as number,
        weightKg: weightKg as number,
        exerciseFreqPerWeek,
        exerciseMinutesPerWeek,
        goal,
      });
      setObj.baselineMacros = baselineMacros;
      const today = new Date().toISOString().slice(0, 10);
      setObj.dayMetrics = {
        date: today,
        metrics: baselineMacros,
      };
      setObj.dayMetricsByDate = {
        [today]: {
          metrics: baselineMacros,
        },
      };
    }

    await collection.updateOne(
      { userId },
      { $set: setObj, $setOnInsert: { createdAt: now } },
      { upsert: true }
    );

    if (typeof initialWeight === "number") {
      try {
        const weightCol = await getCollection("weight");
        const dayKey = new Date().toISOString().slice(0, 10);
        await weightCol.updateOne(
          { userId, dayKey },
          {
            $set: {
              weight: initialWeight,
              updatedAt: now,
            },
            $setOnInsert: { createdAt: now },
          },
          { upsert: true }
        );

        // Mirror the initial weight into the per-entry history collection so
        // downstream weight lookups have a consistent source of truth.
        const weightHistoryCol = await getCollection("weight_history");
        await weightHistoryCol.insertOne({
          userId,
          dayKey,
          weight: initialWeight,
          recordedAt: now,
        });
      } catch (e) {
        if (process.dev) console.error("Failed to seed initial weight", e);
      }
    }

    return { ok: true };
  }

  const partial: Partial<UserProfileDoc> = {};
  if ((body as any).mealPlanMode)
    partial.mealPlanMode = (body as any).mealPlanMode;
  if ((body as any).waterGoal != null)
    partial.waterGoal = Number((body as any).waterGoal);

  if (Object.keys(partial).length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required onboarding data or partial fields",
    });
  }

  await collection.updateOne(
    { userId },
    { $set: { ...partial, updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true }
  );

  return { ok: true };
});
