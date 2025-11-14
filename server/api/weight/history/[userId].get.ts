import { defineEventHandler, getQuery, createError } from "h3";
import { getCollection } from "../../../utils/mongo";
import { requireAuthenticatedUser } from "../../utils/require-auth";

type WeightHistoryDoc = {
  userId: string;
  dayKey: string;
  weight: number;
  recordedAt: Date;
};

export default defineEventHandler(async (event) => {
  const { userId } = event.context.params as { userId?: string };
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: "Missing userId" });
  }

  await requireAuthenticatedUser(event, userId);

  const query = getQuery(event);
  const daysParam = Number(query.days ?? 30);
  const limitDays = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : 30;

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (limitDays - 1));

  const collection = await getCollection<WeightHistoryDoc>("weight_history");
  const docs = await collection
    .find({
      userId,
      recordedAt: { $gte: since },
    })
    .sort({ recordedAt: 1 })
    .toArray();

  const history = docs.map((doc) => ({
    weight: Number(doc.weight),
    recordedAt: doc.recordedAt?.toISOString?.() ?? new Date().toISOString(),
    dayKey: doc.dayKey,
  }));

  return { history };
});
