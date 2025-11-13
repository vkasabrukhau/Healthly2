import { getCollection } from "../../utils/mongo";
import { requireAuthenticatedUser } from "../utils/require-auth";

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    userId?: string;
    date?: string;
    activities?: Array<any>;
  }>(event);
  const userId = body.userId || (event.context.params as any)?.userId;
  if (!userId)
    throw createError({ statusCode: 400, statusMessage: "Missing userId" });

  await requireAuthenticatedUser(event, userId);

  const users = await getCollection("user");
  const userDoc: any = await users.findOne({ userId });
  if (!userDoc)
    throw createError({ statusCode: 404, statusMessage: "User not found" });

  // Only allow generation for today's date (we only adjust today's metrics)
  const day = body.date || new Date().toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  if (day !== today) {
    throw createError({
      statusCode: 400,
      statusMessage: "Can only generate day metrics for today",
    });
  }

  // If there are no activities logged, don't call OpenRouter — caller should avoid invoking.
  const activities = Array.isArray(body.activities) ? body.activities : [];
  if (activities.length === 0) {
    return {
      ok: false,
      message: "No activities provided; skipping generation",
    };
  }

  try {
    const { generateDayMetricsForActivities } = await import(
      "../utils/openrouter"
    );
    const baseline = userDoc?.baselineMetrics ?? null;

    // Prepare payload for OpenRouter helper and log a concise preview in dev.
    const payloadForGen = {
      userId,
      body: {
        weight: userDoc?.currentWeight ?? null,
        heightCm: userDoc?.heightCm ?? null,
        age: userDoc?.age ?? null,
        exerciseLevel: userDoc?.exerciseLevel ?? null,
        waterGoal: userDoc?.waterGoal ?? null,
        mealPlanMode: userDoc?.mealPlanMode ?? null,
        baseline,
        activities,
      },
    };

    if (process.dev) {
      try {
        // Log a small preview so developers can see what information the
        // OpenRouter helper will receive without dumping huge payloads.
        const activitiesPreview = Array.isArray(activities)
          ? activities.slice(0, 5).map((a) => ({
              type: a.type,
              duration: a.duration,
              calories: a.calories,
              status: a.status,
            }))
          : [];
        // eslint-disable-next-line no-console
        console.info("[OpenRouter] generate-day-metrics payload preview", {
          userId,
          date: day,
          baseline: baseline ? baseline : null,
          activitiesCount: activities.length,
          activitiesPreview,
          // include the structured body so developers can inspect keys
          bodyKeys: Object.keys(payloadForGen.body),
        });
      } catch (e) {
        // ignore logging errors
      }
    }

    const result = await generateDayMetricsForActivities(payloadForGen);

    if (!result) {
      return {
        ok: false,
        message: "Generation failed or returned incomplete data",
      };
    }

    // Persist dayMetrics under the user doc
    await users.updateOne(
      { userId },
      {
        $set: {
          dayMetrics: { date: day, metrics: result },
          updatedAt: new Date(),
        },
      }
    );

    return { ok: true, metrics: result };
  } catch (err) {
    if (process.dev) console.error("Generate day metrics failed", err);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to generate day metrics",
    });
  }
});
