import { getCollection } from "../utils/mongo";
import { requireAuthenticatedUser } from "./utils/require-auth";

type MacroBreakdown = {
  protein: number;
  carbs: number;
  fat: number;
  sugar: number;
  sodium: number;
};

type FoodDoc = {
  userId: string;
  itemName: string;
  calories: number;
  diningEstablishment: string;
  macros: MacroBreakdown;
  dateConsumed: string;
  dayKey: string;
  time?: string;
  portion?: string;
  mealClass?: string;
  createdAt: Date;
  updatedAt: Date;
};

export default defineEventHandler(async (event) => {
  const body = await readBody<
    Partial<FoodDoc> & {
      userId?: string;
      itemName?: string;
      diningEstablishment?: string;
      dateConsumed?: string;
      time?: string;
    }
  >(event);
  const {
    userId,
    itemName,
    calories,
    diningEstablishment,
    macros,
    dateConsumed,
    time,
    portion,
    mealClass,
  } = body;

  if (!userId || !itemName || !diningEstablishment || !dateConsumed) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required food fields",
    });
  }

  // Only the authenticated user may create meals for their account
  await requireAuthenticatedUser(event, userId);

  if (typeof calories !== "number" || Number.isNaN(calories)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Calories must be a number",
    });
  }

  const parsedDate = new Date(dateConsumed);
  if (Number.isNaN(parsedDate.getTime())) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid date consumed",
    });
  }
  const dayKey = parsedDate.toISOString().slice(0, 10);

  // Only allow creating meals for the current day
  const todayKey = new Date().toISOString().slice(0, 10);
  if (dayKey !== todayKey) {
    throw createError({
      statusCode: 403,
      statusMessage: "Can only create meals for the current day",
    });
  }

  const macroPayload: MacroBreakdown = {
    protein: Number(macros?.protein ?? 0),
    carbs: Number(macros?.carbs ?? 0),
    fat: Number(macros?.fat ?? 0),
    sugar: Number(macros?.sugar ?? 0),
    sodium: Number(macros?.sodium ?? 0),
  };

  const collection = await getCollection<FoodDoc>("foods");
  const now = new Date();
  const doc: FoodDoc = {
    userId,
    itemName: itemName.trim(),
    calories,
    diningEstablishment: diningEstablishment.trim(),
    macros: macroPayload,
    dateConsumed: parsedDate.toISOString(),
    dayKey,
    time: time?.trim(),
    portion: portion?.trim(),
    mealClass: mealClass?.trim(),
    createdAt: now,
    updatedAt: now,
  };

  const result = await collection.insertOne(doc);
  return { insertedId: result.insertedId };
});
