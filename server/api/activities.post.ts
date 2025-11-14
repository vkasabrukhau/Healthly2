import { defineEventHandler, readBody, createError } from "h3";
import { getCollection } from "../utils/mongo";
import { adjustMacrosForWorkouts } from "../utils/nutrition";
import { requireAuthenticatedUser } from "./utils/require-auth";

type ActivityDoc = {
  userId: string;
  type: string;
  duration: string;
  durationMinutes?: number;
  workoutType?: string;
  intensity?: "low" | "moderate" | "high";
  caloriesBurned?: number;
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
const KG_PER_LB = 0.45359237;

function parseDurationMinutes(duration?: string | number | null) {
  if (typeof duration === "number" && !Number.isNaN(duration)) return duration;
  if (typeof duration === "string") {
    const match = duration.match(/(\d+(?:\.\d+)?)/);
    if (match) return Number(match[1]);
  }
  return 0;
}

export default defineEventHandler(async (event) => {
  const body = await readBody<
    Partial<ActivityDoc> & {
      date?: string;
    }
  >(event);

  const {
    userId,
    type,
    duration,
    durationMinutes,
    workoutType,
    intensity,
    caloriesBurned,
    date,
    calories,
    status,
  } = body;

  if (!userId || !type || !duration || !date) {
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

  const todayKey = new Date().toISOString().slice(0, 10);
  if (dayKey !== todayKey) {
    throw createError({
      statusCode: 403,
      statusMessage: "Can only create activities for the current day",
    });
  }

  await requireAuthenticatedUser(event, userId);

  const collection = await getCollection<ActivityDoc>("activities");
  const now = new Date();
  const minutesValue =
    typeof durationMinutes === "number"
      ? durationMinutes
      : parseDurationMinutes(duration);
  const caloriesValue =
    typeof caloriesBurned === "number" && caloriesBurned > 0
      ? caloriesBurned
      : typeof calories === "number" && calories > 0
      ? calories
      : 0;

  const doc: ActivityDoc = {
    userId,
    type: type.trim(),
    duration: duration.trim(),
    durationMinutes: minutesValue,
    workoutType: workoutType || type,
    intensity: intensity || "moderate",
    caloriesBurned: caloriesValue || undefined,
    date: parsedDate.toISOString(),
    dayKey,
    calories: caloriesValue,
    status,
    plannedAt: now,
    completedAt: status === "Completed" ? now : undefined,
    createdAt: now,
    updatedAt: now,
  };

  const result = await collection.insertOne(doc);

  try {
    const userCollection = await getCollection("user");
    const userDoc: any = await userCollection.findOne({ userId });
    const baseline = userDoc?.baselineMacros;

    if (baseline) {
      const weightKg =
        typeof userDoc.weightKg === "number"
          ? userDoc.weightKg
          : typeof userDoc.currentWeight === "number"
          ? Math.round(userDoc.currentWeight * KG_PER_LB * 10) / 10
          : null;

      if (weightKg) {
        const todaysActivities = await collection
          .find({ userId, dayKey })
          .toArray();

        const workouts = todaysActivities.map((activity) => ({
          workoutType: activity.workoutType || activity.type,
          durationMinutes:
            activity.durationMinutes || parseDurationMinutes(activity.duration),
          intensity: activity.intensity || "moderate",
          caloriesBurned: activity.caloriesBurned || activity.calories,
        }));

        const goal =
          userDoc.mealPlanMode === "cut" ||
          userDoc.mealPlanMode === "bulk" ||
          userDoc.mealPlanMode === "maintain"
            ? userDoc.mealPlanMode
            : "maintain";

        const adjusted = adjustMacrosForWorkouts(
          baseline,
          workouts,
          weightKg,
          goal
        );

        await userCollection.updateOne(
          { userId },
          {
            $set: {
              dayMetrics: {
                date: dayKey,
                metrics: {
                  calories: adjusted.calories,
                  protein: adjusted.protein,
                  carbs: adjusted.carbs,
                  fat: adjusted.fat,
                  sugar: adjusted.sugar,
                  sodium: adjusted.sodium,
                },
                completionPercent:
                  userDoc.dayMetrics?.date === dayKey
                    ? userDoc.dayMetrics?.completionPercent ?? null
                    : null,
              },
              [`dayMetricsByDate.${dayKey}`]: {
                metrics: {
                  calories: adjusted.calories,
                  protein: adjusted.protein,
                  carbs: adjusted.carbs,
                  fat: adjusted.fat,
                  sugar: adjusted.sugar,
                  sodium: adjusted.sodium,
                },
                completionPercent:
                  userDoc.dayMetricsByDate?.[dayKey]?.completionPercent ??
                  (userDoc.dayMetrics?.date === dayKey
                    ? userDoc.dayMetrics?.completionPercent ?? null
                    : null),
              },
              updatedAt: new Date(),
            },
          }
        );
      }
    }
  } catch (err) {
    if (process.dev) console.error("Failed to adjust day metrics", err);
  }

  return { insertedId: result.insertedId };
});
