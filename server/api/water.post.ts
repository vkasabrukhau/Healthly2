import { getCollection } from "../utils/mongo";

type WaterDoc = {
  userId: string;
  dayKey: string;
  consumed: number;
  goal: number;
  createdAt: Date;
  updatedAt: Date;
};

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    userId?: string;
    date?: string;
    consumed?: number;
    goal?: number;
  }>(event);

  const { userId, date, consumed, goal } = body;

  if (!userId || typeof consumed !== "number" || typeof goal !== "number") {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing water fields",
    });
  }

  const parsedDate = new Date(date || new Date());
  if (Number.isNaN(parsedDate.getTime())) {
    throw createError({ statusCode: 400, statusMessage: "Invalid date" });
  }
  const dayKey = parsedDate.toISOString().slice(0, 10);

  const collection = await getCollection<WaterDoc>("water");
  const now = new Date();

  await collection.updateOne(
    { userId, dayKey },
    {
      $set: {
        consumed,
        goal,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  return { ok: true };
});
