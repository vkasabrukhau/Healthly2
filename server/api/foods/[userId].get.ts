import { getCollection } from "../../utils/mongo";

type FoodDoc = {
  userId: string;
  itemName: string;
  calories: number;
  diningEstablishment: string;
  macros: { protein: number; carbs: number; fat: number };
  dateConsumed: string;
  dayKey: string;
  time?: string;
};

export default defineEventHandler(async (event) => {
  const { userId } = event.context.params as { userId?: string };
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: "Missing userId" });
  }

  const query = getQuery(event);
  const dateParam = (query.date as string) || new Date().toISOString().slice(0, 10);
  const normalizedDate = new Date(dateParam);
  if (Number.isNaN(normalizedDate.getTime())) {
    throw createError({ statusCode: 400, statusMessage: "Invalid date parameter" });
  }
  const dayKey = normalizedDate.toISOString().slice(0, 10);

  const collection = await getCollection<FoodDoc>("foods");
  const docs = await collection
    .find({ userId, dayKey })
    .sort({ dateConsumed: 1 })
    .toArray();

  const items = docs.map(({ _id, ...rest }) => ({
    id: (_id as any)?.toString?.() ?? undefined,
    ...rest,
  }));

  return { items };
});
