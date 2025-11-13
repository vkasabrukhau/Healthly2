import { getCollection } from "../../utils/mongo";
import { requireAuthenticatedUser } from "../utils/require-auth";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ userId?: string; reason?: string }>(event);
  const userId = body.userId || (event.context.params as any)?.userId;
  if (!userId)
    throw createError({ statusCode: 400, statusMessage: "Missing userId" });

  await requireAuthenticatedUser(event, userId);

  const users = await getCollection("user");
  const userDoc: any = await users.findOne({ userId });
  if (!userDoc)
    throw createError({ statusCode: 404, statusMessage: "User not found" });

  // Build payload for OpenRouter from existing profile
  const payloadBody: any = {
    firstName: userDoc.firstName,
    lastName: userDoc.lastName,
    age: userDoc.age,
    dob: userDoc.dob,
    exerciseLevel: userDoc.exerciseLevel,
    exerciseFrequency: userDoc.exerciseFrequency,
    mealPlanMode: userDoc.mealPlanMode,
    heightCm: userDoc.heightCm ?? null,
    weight: userDoc.currentWeight ?? null,
    waterGoal: userDoc.waterGoal ?? null,
  };

  try {
    const { generateMacroGoalsForOnboarding } = await import(
      "../utils/openrouter"
    );
    const baseline = await generateMacroGoalsForOnboarding({
      userId,
      body: payloadBody,
    });
    if (!baseline) {
      return {
        ok: false,
        message: "Baseline generation failed or returned incomplete data",
      };
    }

    await users.updateOne(
      { userId },
      { $set: { baselineMetrics: baseline, updatedAt: new Date() } }
    );
    return { ok: true, baseline };
  } catch (err) {
    if (process.dev) console.error("Regenerate baseline failed", err);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to regenerate baseline",
    });
  }
});
