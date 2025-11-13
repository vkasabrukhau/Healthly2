import { getCollection } from "../utils/mongo";
import { requireAuthenticatedUser } from "./utils/require-auth";

type UserProfileDoc = {
  userId: string;
  firstName: string;
  lastName: string;
  dob: string;
  age: number;
  exerciseLevel: string;
  exerciseFrequency: string;
  photoDataUrl?: string;
  mealPlanMode?: "cut" | "maintain" | "bulk";
  currentWeight?: number;
  createdAt: Date;
  updatedAt: Date;
};

export default defineEventHandler(async (event) => {
  const body = await readBody<Partial<UserProfileDoc>>(event);
  const {
    userId,
    firstName,
    lastName,
    dob,
    age,
    exerciseLevel,
    exerciseFrequency,
    photoDataUrl,
  } = body;

  // Determine whether this request contains the full onboarding profile
  // (in which case we must validate all required fields) or is a partial
  // update (for example only updating `mealPlanMode`).
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

  // Ensure the caller is authenticated and can only modify their own profile
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: "Missing userId" });
  }
  await requireAuthenticatedUser(event, userId);

  const collection = await getCollection<UserProfileDoc>("user");
  const now = new Date();

  if (hasFullProfile) {
    // Accept either `weight` (assumed pounds) or `weightKg` from onboarding.
    const rawWeightKg = (body as any).weightKg;
    const rawWeight = (body as any).weight;
    let initialWeight: number | undefined = undefined;
    if (typeof rawWeight === "number" && !Number.isNaN(rawWeight)) {
      // caller provided pounds
      initialWeight = Number(rawWeight);
    } else if (typeof rawWeightKg === "number" && !Number.isNaN(rawWeightKg)) {
      // caller provided kilograms; convert to pounds (1 kg = 2.2046226218 lb)
      initialWeight = Math.round(rawWeightKg * 2.2046226218 * 10) / 10;
    }

    const setObj: any = {
      firstName: (firstName as string).trim(),
      lastName: (lastName as string).trim(),
      dob: (parsedDob as Date).toISOString(),
      age: age as number,
      exerciseLevel,
      exerciseFrequency,
      photoDataUrl,
      mealPlanMode: (body as any).mealPlanMode ?? undefined,
      updatedAt: now,
    };
    if (typeof initialWeight === "number") {
      setObj.currentWeight = initialWeight;
    }

    await collection.updateOne(
      { userId },
      { $set: setObj, $setOnInsert: { createdAt: now } },
      { upsert: true }
    );

    // If an initial weight was provided during onboarding, also insert
    // a historical weight entry for today's dayKey so history is seeded.
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
      } catch (e) {
        // non-fatal: log in dev but don't fail onboarding
        if (process.dev) console.error("Failed to seed initial weight", e);
      }
    }

    return { ok: true };
  }

  // Partial update (e.g., only mealPlanMode)
  const partial: Partial<UserProfileDoc> = {};
  if ((body as any).mealPlanMode)
    partial.mealPlanMode = (body as any).mealPlanMode;

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
