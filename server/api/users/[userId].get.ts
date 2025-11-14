import { getCollection } from "../../utils/mongo";
import { requireAuthenticatedUser } from "../utils/require-auth";

export default defineEventHandler(async (event) => {
  const { userId } = event.context.params as { userId?: string };
  const query = getQuery(event);
  const requestedDate =
    typeof query?.date === "string"
      ? query.date
      : Array.isArray(query?.date)
      ? query?.date[0]
      : undefined;

  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: "Missing userId" });
  }

  await requireAuthenticatedUser(event, userId);

  const collection = await getCollection("user");
  const doc: any = await collection.findOne({ userId });

  if (doc && requestedDate && doc.baselineMacros) {
    const history = doc.dayMetricsByDate || {};
    const existing = history[requestedDate];
    if (existing) {
      doc.dayMetrics = {
        date: requestedDate,
        metrics: existing.metrics,
        completionPercent: existing.completionPercent ?? null,
      };
    } else {
      const baselineEntry = {
        metrics: doc.baselineMacros,
        completionPercent: null,
      };
      history[requestedDate] = baselineEntry;
      doc.dayMetrics = {
        date: requestedDate,
        metrics: baselineEntry.metrics,
        completionPercent: null,
      };
      await collection.updateOne(
        { userId },
        {
          $set: {
            dayMetrics: doc.dayMetrics,
            [`dayMetricsByDate.${requestedDate}`]: baselineEntry,
            updatedAt: new Date(),
          },
        }
      );
      doc.dayMetricsByDate = history;
    }
  }

  return { exists: !!doc, profile: doc ?? null };
});
