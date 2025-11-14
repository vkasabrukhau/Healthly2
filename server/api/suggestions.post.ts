import { defineEventHandler, readBody, createError } from "h3";
import { useRuntimeConfig } from "#imports";
import { loadMealsDataset, MealRow } from "../utils/meals";
import { requireAuthenticatedUser } from "./utils/require-auth";

type SuggestionFilters = {
  location: string;
  mealSection: string;
  category: string;
  calories?: number | null;
  maxFat?: number | null;
  minProtein?: number | null;
  maxCarbs?: number | null;
  maxSugar?: number | null;
  maxSodium?: number | null;
};

type UserContext = Record<string, any>;

type SuggestionRequest = {
  userId?: string;
  filters: SuggestionFilters;
  userContext: UserContext;
};

type LlmSuggestion = {
  title: string;
  description?: string;
  timeOfDay?: string;
  tag?: string;
  density?: string;
  sourceItem?: string;
  location?: string | null;
  servingSize?: string | null;
  macros: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    sugar: number;
    sodium: number;
  };
};

const normalizeKey = (value?: string | null) =>
  (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function findMealMatch(name: string | undefined, meals: MealRow[]) {
  if (!name) return null;
  const target = normalizeKey(name);
  if (!target) return null;
  return (
    meals.find((row) => normalizeKey(row.item_name) === target) ||
    meals.find((row) => target.includes(normalizeKey(row.item_name))) ||
    meals.find((row) => normalizeKey(row.item_name).includes(target))
  );
}

function matchesFilters(row: MealRow, filters: SuggestionFilters) {
  const {
    location,
    mealSection,
    category,
    calories,
    maxFat,
    minProtein,
    maxCarbs,
    maxSugar,
    maxSodium,
  } = filters;

  if (location && row.location !== location) return false;
  if (mealSection && row.meal_section !== mealSection) return false;
  if (category && row.category !== category) return false;

  if (typeof calories === "number" && row.calories > calories) return false;
  if (typeof maxFat === "number" && row.fat_g > maxFat) return false;
  if (typeof minProtein === "number" && row.protein_g < minProtein)
    return false;
  if (typeof maxCarbs === "number" && row.carb_g > maxCarbs) return false;
  if (typeof maxSugar === "number" && row.sugar_g > maxSugar) return false;
  if (typeof maxSodium === "number" && row.sodium_mg > maxSodium) return false;

  return true;
}

function buildPrompt(
  filters: SuggestionFilters,
  userContext: UserContext,
  meals: MealRow[]
) {
  const instructions = `You are a nutritionist giving advisory to a person on what they should be eating.
You have been provided a data set with foods and their macro breakdowns. Return a JSON array containing exactly 8 suggestions.
Each suggestion must include: Food Name, Location, Calories, Total Fat, Protein,	Total Carbohydrate,	Total Sugars, Total Sodium. ALL details MUST come from the provided CSV file.
Use only the foods provided in the dataset subset. If a meal uses multiple components, combine them into a single entry and aggregate the macros. For example with items like the Ginger and Soy Rice Bowls follow bowl making guidelines to combine items.
User info and filters will be provided in JSON. Respond with JSON ONLY (no prose).`;

  return `${instructions}
User Context:
${JSON.stringify(userContext)}

User Filters:
${JSON.stringify(filters)}

Dataset (narrowed):
${JSON.stringify(meals.slice(0, 40))}`;
}

function extractJsonArray(raw: string) {
  const first = raw.indexOf("[");
  const last = raw.lastIndexOf("]");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error("Model response did not contain a JSON array");
  }
  return raw.slice(first, last + 1);
}

function sanitizeSuggestions(payload: any, meals: MealRow[]): LlmSuggestion[] {
  if (!Array.isArray(payload)) return [];
  return payload
    .map((entry) => {
      const macros = entry?.macros || {};
      const suggestion: LlmSuggestion = {
        title: entry?.title || entry?.name || "Meal suggestion",
        description: entry?.description || entry?.summary || "",
        timeOfDay: entry?.timeOfDay,
        tag: entry?.tag || entry?.context,
        density: entry?.density,
        sourceItem: entry?.sourceItem || entry?.source || null,
        location: entry?.location || null,
        servingSize: entry?.servingSize || null,
        macros: {
          calories: Number(macros.calories) || 0,
          protein: Number(macros.protein) || 0,
          carbs: Number(macros.carbs) || 0,
          fat: Number(macros.fat) || 0,
          sugar: Number(macros.sugar) || 0,
          sodium: Number(macros.sodium) || 0,
        },
      };
      const match =
        findMealMatch(suggestion.sourceItem, meals) ||
        findMealMatch(suggestion.title, meals);
      if (match) {
        suggestion.location = match.location || suggestion.location || null;
        suggestion.servingSize =
          match.serving_size || suggestion.servingSize || null;
        suggestion.macros = {
          calories: Number(match.calories) || suggestion.macros.calories,
          protein: Number(match.protein_g) || suggestion.macros.protein,
          carbs: Number(match.carb_g) || suggestion.macros.carbs,
          fat: Number(match.fat_g) || suggestion.macros.fat,
          sugar: Number(match.sugar_g) || suggestion.macros.sugar,
          sodium: Number(match.sodium_mg) || suggestion.macros.sodium,
        };
      }
      return suggestion;
    })
    .filter((entry) => entry.title && entry.macros);
}

export default defineEventHandler(async (event) => {
  const body = await readBody<SuggestionRequest>(event);
  if (!body?.filters || !body?.userContext) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing filters or user context",
    });
  }

  const userId =
    body.userId ||
    body.userContext?.userId ||
    (event.context?.auth as { userId?: string } | undefined)?.userId;

  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: "Missing userId" });
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
  const narrowed = meals.filter((row) => matchesFilters(row, body.filters));
  if (!narrowed.length) {
    throw createError({
      statusCode: 404,
      statusMessage: "No meals matched filters",
    });
  }

  const prompt = buildPrompt(body.filters, body.userContext, narrowed);

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
        messages: [
          {
            role: "system",
            content:
              "You are a nutritionist who responds with JSON only. Follow the provided instructions exactly.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
      }),
    }
  );

  if (!completion.ok) {
    const errorPayload = await completion.text();
    throw createError({
      statusCode: completion.status,
      statusMessage: "Failed to fetch suggestions",
      data: errorPayload,
    });
  }

  const completionJson = await completion.json();
  const rawContent =
    completionJson?.choices?.[0]?.message?.content ||
    completionJson?.choices?.[0]?.message?.content?.[0]?.text ||
    "";

  let suggestions: LlmSuggestion[] = [];
  try {
    const jsonText = extractJsonArray(rawContent);
    const parsed = JSON.parse(jsonText);
    suggestions = sanitizeSuggestions(parsed, narrowed);
  } catch (err) {
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to parse model response",
      data: rawContent,
    });
  }

  return { suggestions, filters: body.filters };
});
