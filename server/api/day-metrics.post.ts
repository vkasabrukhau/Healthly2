import { getCollection } from "../utils/mongo";
import { requireAuthenticatedUser } from "./utils/require-auth";

type DayMetricsPayload = {
  userId?: string;
  date?: string;
  metrics?: Record<string, number>;
  completionPercent?: number;
};

export default defineEventHandler(async (event) => {
  const body = await readBody<DayMetricsPayload>(event);
  const userId = body.userId;
  const date =
    body.date ||
    new Date().toISOString().slice(0, 10); /* default to today if unspecified */

  if (!userId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing userId",
    });
  }

  await requireAuthenticatedUser(event, userId);

  const collection = await getCollection("user");
  const now = new Date();

  const setOps: Record<string, any> = {
    updatedAt: now,
  };
  const pushOps: Record<string, any> = {};

  if (body.metrics) {
    setOps.dayMetrics = {
      date,
      metrics: body.metrics,
      completionPercent: body.completionPercent ?? null,
    };
    setOps[`dayMetricsByDate.${date}`] = {
      metrics: body.metrics,
      completionPercent: body.completionPercent ?? null,
    };
  }

  if (
    typeof body.completionPercent === "number" &&
    !Number.isNaN(body.completionPercent)
  ) {
    setOps["dayMetrics.completionPercent"] = body.completionPercent;
    setOps[`dayMetricsByDate.${date}.completionPercent`] =
      body.completionPercent;
    pushOps.macroCompletionHistory = {
      date,
      percent: body.completionPercent,
      recordedAt: now,
    };
  }

  const update: Record<string, any> = {};
  if (Object.keys(setOps).length) update.$set = setOps;
  if (Object.keys(pushOps).length) update.$push = pushOps;

  if (!Object.keys(update).length) {
    return { ok: true, noop: true };
  }

  await collection.updateOne({ userId }, update, { upsert: true });

  return { ok: true };
});
