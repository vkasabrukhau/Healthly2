import { getCollection } from "../../utils/mongo";
import { requireAuthenticatedUser } from "../utils/require-auth";

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    userId?: string;
    date?: string;
    metrics?: any;
  }>(event);
  const userId = body.userId || (event.context.params as any)?.userId;
  if (!userId)
    throw createError({ statusCode: 400, statusMessage: "Missing userId" });

  await requireAuthenticatedUser(event, userId);

  if (!body.metrics)
    throw createError({ statusCode: 400, statusMessage: "Missing metrics" });
  const date = body.date || new Date().toISOString().slice(0, 10);

  try {
    const users = await getCollection("user");
    await users.updateOne(
      { userId },
      {
        $set: {
          dayMetrics: { date, metrics: body.metrics },
          updatedAt: new Date(),
        },
      }
    );
    return { ok: true };
  } catch (err) {
    if (process.dev) console.error("Failed to save dayMetrics", err);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to save day metrics",
    });
  }
});
