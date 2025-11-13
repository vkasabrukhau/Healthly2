import { getCollection } from "../../utils/mongo";
import { requireAuthenticatedUser } from "../utils/require-auth";

type WeightDoc = {
  userId: string;
  dayKey: string;
  weight: number;
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

  // Ensure caller is authenticated and requesting their own data
  await requireAuthenticatedUser(event, userId);

  const weightCollection = await getCollection<WeightDoc>("weight");
  // historical entry for the requested day
  const entry = await weightCollection.findOne({ userId, dayKey });

  // also fetch previous day for comparison
  const prev = new Date(normalizedDate);
  prev.setDate(prev.getDate() - 1);
  const prevKey = prev.toISOString().slice(0, 10);
  const previous = await weightCollection.findOne({ userId, dayKey: prevKey });

  // fetch the user's current weight from their profile. Per product rule,
  // "weight for the day" should be the user's currentWeight, not historical
  // documents. If currentWeight is not set, fall back to any entry for today.
  const users = await getCollection("user");
  const userDoc = await users.findOne({ userId });
  const todayWeight =
    (userDoc as any)?.currentWeight ?? (entry ? entry.weight : null);

  return { today: todayWeight, entry, previous };
});
