import { getCollection } from "../../utils/mongo";

type ActivityDoc = {
  userId: string;
  type: string;
  duration: string;
  date: string;
  dayKey: string;
  calories: number;
  status: "Completed" | "Planned";
  plannedAt?: Date;
  completedAt?: Date;
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

  const collection = await getCollection<ActivityDoc>("activities");
  const docs = await collection
    .find({ userId, dayKey })
    .sort({ date: 1 })
    .toArray();

  const items = docs.map(({ _id, ...rest }) => ({
    id: (_id as any)?.toString?.() ?? undefined,
    ...rest,
  }));

  return { items };
});
