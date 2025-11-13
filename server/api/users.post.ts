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
    await collection.updateOne(
      { userId },
      {
        $set: {
          firstName: (firstName as string).trim(),
          lastName: (lastName as string).trim(),
          dob: (parsedDob as Date).toISOString(),
          age: age as number,
          exerciseLevel,
          exerciseFrequency,
          photoDataUrl,
          mealPlanMode: (body as any).mealPlanMode ?? undefined,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );
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
