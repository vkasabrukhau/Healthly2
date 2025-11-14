import { defineEventHandler, readBody, createError } from "h3";
import { useRuntimeConfig } from "#imports";
import { getCollection } from "../../utils/mongo";
import {
  loadMealsDataset,
  MealRow,
  findMealMatchByName,
  normalizeMealKey,
} from "../../utils/meals";
import { requireAuthenticatedUser } from "../utils/require-auth";

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
  time: string;
  portion?: string | null;
  mealClass?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type DukeMealRequest = {
  userId?: string;
  location?: string;
  description?: string;
};

const MAX_MEALS_IN_PROMPT = 60;

const buildSelectionPrompt = (
  location: string,
  description: string,
  meals: MealRow[]
) => {
  const trimmedDescription = description.trim();
  return `You are helping map a Duke Dining meal description to the exact entry in a dataset.
Return a JSON object with these keys:
{
  "item_name": "<the exact item_name from the dataset>",
  "confidence": <number between 0 and 1>,
  "reason": "short explanation"
}
Choose only from the provided dataset. If nothing matches, set item_name to null.

User location: ${location}
Description: ${trimmedDescription}

Dataset sample:
${JSON.stringify(meals.slice(0, MAX_MEALS_IN_PROMPT))}`;
};

const extractJsonObject = (raw: string) => {
  const trimmed = raw.trim();
  const withoutFence = trimmed.startsWith("```")
    ? trimmed.replace(/^```[^\n]*\n/, "").replace(/```$/, "").trim()
    : trimmed;
  const firstBrace = withoutFence.indexOf("{");
  const lastBrace = withoutFence.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Model response missing JSON object");
  }
  return withoutFence.slice(firstBrace, lastBrace + 1);
};

export default defineEventHandler(async (event) => {
  const body = await readBody<DukeMealRequest>(event);
  const { userId, location, description } = body;

  if (!userId || !location || !description) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required Duke dining fields",
    });
  }

  await requireAuthenticatedUser(event, userId);

  const config = useRuntimeConfig();
  if (!config.OPENROUTER_API_KEY || !config.OPENROUTER_MODEL) {
    throw createError({
      statusCode: 500,
      statusMessage: "OpenRouter API key/model not configured",
    });
  }

  const meals = await loadMealsDataset();
  const normalizedLocation = normalizeMealKey(location);
  const locationMatches = meals.filter((row) =>
    normalizedLocation
      ? normalizeMealKey(row.location).includes(normalizedLocation) ||
        normalizedLocation.includes(normalizeMealKey(row.location))
      : false
  );
  const candidatePool = locationMatches.length ? locationMatches : meals;

  const prompt = buildSelectionPrompt(location, description, candidatePool);

  const completion = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: config.OPENROUTER_MODEL,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "You match Duke Dining meal descriptions to dataset entries. Respond with JSON only.",
          },
          { role: "user", content: prompt },
        ],
      }),
    }
  );

  if (!completion.ok) {
    const payload = await completion.text();
    throw createError({
      statusCode: completion.status,
      statusMessage: "Failed to resolve Duke meal",
      data: payload,
    });
  }

  const completionJson = await completion.json();
  const rawContent =
    completionJson?.choices?.[0]?.message?.content ||
    completionJson?.choices?.[0]?.message?.content?.[0]?.text ||
    "";

  let selectionName: string | null = null;
  try {
    const jsonText = extractJsonObject(rawContent);
    const parsed = JSON.parse(jsonText);
    const selection = Array.isArray(parsed) ? parsed[0] : parsed;
    selectionName =
      selection?.item_name || selection?.name || selection?.title || null;
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to parse selection response",
      data: rawContent,
    });
  }

  if (!selectionName) {
    throw createError({
      statusCode: 404,
      statusMessage: "Model did not return a meal name",
    });
  }

  const matchedMeal =
    findMealMatchByName(selectionName, candidatePool) ||
    findMealMatchByName(description, candidatePool) ||
    findMealMatchByName(selectionName, meals);

  if (!matchedMeal) {
    throw createError({
      statusCode: 404,
      statusMessage: "Unable to map description to dataset entry",
    });
  }

  const now = new Date();
  const isoDate = now.toISOString();
  const dayKey = isoDate.slice(0, 10);
  const time = now.toTimeString().slice(0, 5);

  const macroPayload: MacroBreakdown = {
    protein: Number(matchedMeal.protein_g) || 0,
    carbs: Number(matchedMeal.carb_g) || 0,
    fat: Number(matchedMeal.fat_g) || 0,
    sugar: Number(matchedMeal.sugar_g) || 0,
    sodium: Number(matchedMeal.sodium_mg) || 0,
  };

  const doc: FoodDoc = {
    userId,
    itemName: matchedMeal.item_name,
    calories: Number(matchedMeal.calories) || 0,
    diningEstablishment: matchedMeal.location || location,
    macros: macroPayload,
    dateConsumed: isoDate,
    dayKey,
    time,
    portion: matchedMeal.serving_size || null,
    mealClass: null,
    createdAt: now,
    updatedAt: now,
  };

  const collection = await getCollection<FoodDoc>("foods");
  const result = await collection.insertOne(doc);

  return {
    insertedId: result.insertedId,
    meal: doc,
  };
});
