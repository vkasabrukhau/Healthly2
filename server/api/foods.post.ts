import { getCollection } from "../utils/mongo";

type MacroBreakdown = {
  protein: number;
  carbs: number;
  fat: number;
};

type FoodDoc = {
  userId: string;
  itemName: string;
  calories: number;
  diningEstablishment: string;
  macros: MacroBreakdown;
  dateConsumed: string;
  createdAt: Date;
  updatedAt: Date;
};

export default defineEventHandler(async (event) => {
  const body = await readBody<Partial<FoodDoc>>(event);
  const { userId, itemName, calories, diningEstablishment, macros, dateConsumed } = body;

  if (!userId || !itemName || !diningEstablishment || !dateConsumed) {
    throw createError({ statusCode: 400, statusMessage: "Missing required food fields" });
  }

  if (typeof calories !== "number" || Number.isNaN(calories)) {
    throw createError({ statusCode: 400, statusMessage: "Calories must be a number" });
  }

  const parsedDate = new Date(dateConsumed);
  if (Number.isNaN(parsedDate.getTime())) {
    throw createError({ statusCode: 400, statusMessage: "Invalid date consumed" });
  }

  const macroPayload: MacroBreakdown = {
    protein: Number(macros?.protein ?? 0),
    carbs: Number(macros?.carbs ?? 0),
    fat: Number(macros?.fat ?? 0),
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
    createdAt: now,
    updatedAt: now,
  };

  const result = await collection.insertOne(doc);
  return { insertedId: result.insertedId };
});
