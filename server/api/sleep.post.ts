import { getCollection } from "../utils/mongo";

type SleepDoc = {
  userId: string;
  dayKey: string;
  hours: number;
  quality: string;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
};

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    userId?: string;
    date?: string;
    hours?: number;
    quality?: string;
    note?: string;
  }>(event);

  const { userId, date, hours, quality, note } = body;

  if (!userId || typeof hours !== "number" || !quality) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing sleep fields",
    });
  }

  const parsedDate = new Date(date || new Date());
  if (Number.isNaN(parsedDate.getTime())) {
    throw createError({ statusCode: 400, statusMessage: "Invalid date" });
  }
  const dayKey = parsedDate.toISOString().slice(0, 10);

  // Only allow sleep entries for the current day
  const todayKey = new Date().toISOString().slice(0, 10);
  if (dayKey !== todayKey) {
    throw createError({
      statusCode: 403,
      statusMessage: "Can only modify sleep for the current day",
    });
  }

  const collection = await getCollection<SleepDoc>("sleep");
  const now = new Date();

  await collection.updateOne(
    { userId, dayKey },
    {
      $set: {
        hours,
        quality,
        note,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  return { ok: true };
});
