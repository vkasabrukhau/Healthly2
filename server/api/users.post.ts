import { getCollection } from "~/server/utils/mongo";

type UserProfileDoc = {
  userId: string;
  firstName: string;
  lastName: string;
  dob: string;
  age: number;
  exerciseLevel: string;
  exerciseFrequency: string;
  photoDataUrl?: string;
  createdAt: Date;
  updatedAt: Date;
};

export default defineEventHandler(async (event) => {
  const body = await readBody<Partial<UserProfileDoc>>(event);
  const { userId, firstName, lastName, dob, age, exerciseLevel, exerciseFrequency, photoDataUrl } = body;

  if (!userId || !firstName || !lastName || !dob || typeof age !== "number") {
    throw createError({ statusCode: 400, statusMessage: "Missing required onboarding data" });
  }

  if (!exerciseLevel || !exerciseFrequency) {
    throw createError({ statusCode: 400, statusMessage: "Exercise info required" });
  }

  const parsedDob = new Date(dob);
  if (Number.isNaN(parsedDob.getTime())) {
    throw createError({ statusCode: 400, statusMessage: "Invalid date of birth" });
  }

  const collection = await getCollection<UserProfileDoc>("users");
  const now = new Date();

  await collection.updateOne(
    { userId },
    {
      $set: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dob: parsedDob.toISOString(),
        age,
        exerciseLevel,
        exerciseFrequency,
        photoDataUrl,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  return { ok: true };
});
