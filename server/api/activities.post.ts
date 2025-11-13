import { getCollection } from "../utils/mongo";
import { requireAuthenticatedUser } from "./utils/require-auth";

type ActivityDoc = {
  userId: string;
  type: string;
  duration: string;
  date: string;
  calories: number;
  status: "Completed" | "Planned";
  dayKey: string;
  plannedAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

const VALID_STATUSES = new Set(["Completed", "Planned"]);

export default defineEventHandler(async (event) => {
  const body = await readBody<
    Partial<ActivityDoc> & { date?: string; activitiesToday?: any[] }
  >(event);
  const { userId, type, duration, date, calories, status, activitiesToday } =
    body;

  if (!userId || !type || !duration || !date || typeof calories !== "number") {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required activity fields",
    });
  }

  if (!status || !VALID_STATUSES.has(status)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid activity status",
    });
  }

  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) {
    throw createError({ statusCode: 400, statusMessage: "Invalid date" });
  }
  const dayKey = parsedDate.toISOString().slice(0, 10);

  // Only allow creating activities for the current day
  const todayKey = new Date().toISOString().slice(0, 10);
  if (dayKey !== todayKey) {
    throw createError({
      statusCode: 403,
      statusMessage: "Can only create activities for the current day",
    });
  }

  // Ensure the caller is authenticated and can only create activities for
  // their own account.
  await requireAuthenticatedUser(event, userId);

  const collection = await getCollection<ActivityDoc>("activities");
  const now = new Date();
  const doc: ActivityDoc = {
    userId,
    type: type.trim(),
    duration: duration.trim(),
    date: parsedDate.toISOString(),
    dayKey,
    calories,
    status,
    plannedAt: now,
    completedAt: status === "Completed" ? now : undefined,
    createdAt: now,
    updatedAt: now,
  };

  const result = await collection.insertOne(doc);
  // If the client provided the full list of today's activities, attempt to
  // generate updated day-level metrics (server-side atomic) and persist them
  // so the dashboard reflects the new targets immediately. Only do this for
  // today's date and when activitiesToday is a non-empty array.
  try {
    if (Array.isArray(activitiesToday) && activitiesToday.length > 0) {
      const { generateDayMetricsForActivities } = await import(
        "./utils/openrouter"
      );
      // Fetch user baseline to provide context for generation
      const userCol = await getCollection("user");
      const userDoc: any = await userCol.findOne({ userId });
      const baseline = userDoc?.baselineMetrics ?? null;

      const generated = await generateDayMetricsForActivities({
        userId,
        body: {
          baseline,
          activities: activitiesToday,
        },
      });

      if (generated) {
        try {
          await userCol.updateOne(
            { userId },
            {
              $set: {
                dayMetrics: { date: dayKey, metrics: generated },
                updatedAt: new Date(),
              },
            },
            { upsert: true }
          );
        } catch (e) {
          if (process.dev)
            console.error("Failed to persist generated dayMetrics", e);
        }
      }
    }
  } catch (e) {
    if (process.dev)
      console.error("Error generating day metrics after activity insert", e);
  }

  return { insertedId: result.insertedId };
});
