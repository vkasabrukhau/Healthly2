import { getCollection } from "../utils/mongo";
import { requireAuthenticatedUser } from "./utils/require-auth";

type WeightDoc = {
  userId: string;
  dayKey: string;
  weight: number; // in pounds
  createdAt: Date;
  updatedAt: Date;
};

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    userId?: string;
    date?: string;
    weight?: number;
  }>(event);

  const { userId, date, weight } = body;
  if (!userId || typeof weight !== "number" || Number.isNaN(weight)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing weight fields",
    });
  }

  const parsedDate = new Date(date || new Date());
  if (Number.isNaN(parsedDate.getTime())) {
    throw createError({ statusCode: 400, statusMessage: "Invalid date" });
  }
  const dayKey = parsedDate.toISOString().slice(0, 10);

  // Only allow weight entries for the current day (finalized at end of day)
  const todayKey = new Date().toISOString().slice(0, 10);
  if (dayKey !== todayKey) {
    throw createError({
      statusCode: 403,
      statusMessage: "Can only record weight for the current day",
    });
  }

  // Ensure caller is authenticated and owns the profile
  await requireAuthenticatedUser(event, userId);

  const collection = await getCollection<WeightDoc>("weight");
  const now = new Date();

  await collection.updateOne(
    { userId, dayKey },
    {
      $set: { weight: Number(weight), updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  // Also update the user's current weight on their profile so the app can
  // show the "weight for the day" as the user's current weight (not just
  // historical data).
  try {
    const users = await getCollection("user");
    await users.updateOne(
      { userId },
      {
        $set: { currentWeight: Number(weight), updatedAt: now },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );
  } catch (err) {
    // Don't fail the whole request if the user update failed; log for dev
    // and continue — weight historical data is preserved.
    // eslint-disable-next-line no-console
    console.error("Failed to update user's current weight", err);
  }

  return { ok: true };
});
