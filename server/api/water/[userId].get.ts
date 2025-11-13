import { getCollection } from "../../utils/mongo";

type WaterDoc = {
  userId: string;
  dayKey: string;
  consumed: number;
  goal: number;
};

export default defineEventHandler(async (event) => {
  const { userId } = event.context.params as { userId?: string };
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: "Missing userId" });
  }

  const query = getQuery(event);
  const dateParam =
    (query.date as string) || new Date().toISOString().slice(0, 10);
  const normalizedDate = new Date(dateParam);
  if (Number.isNaN(normalizedDate.getTime())) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid date parameter",
    });
  }
  const dayKey = normalizedDate.toISOString().slice(0, 10);

  const collection = await getCollection<WaterDoc>("water");
  const doc = await collection.findOne({ userId, dayKey });

  return { entry: doc };
});
