import { getCollection } from "../../utils/mongo";
import { requireAuthenticatedUser } from "../utils/require-auth";
type SleepDoc = {
  userId: string;
  dayKey: string;
  hours: number;
  quality: string;
  note?: string;
};

export default defineEventHandler(async (event) => {
  const { userId } = event.context.params as { userId?: string };
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: "Missing userId" });
  }

  // Ensure the caller is authenticated and requesting their own sleep entry
  await requireAuthenticatedUser(event, userId);

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

  const collection = await getCollection<SleepDoc>("sleep");
  const doc = await collection.findOne({ userId, dayKey });

  return { entry: doc };
});
