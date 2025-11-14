import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { defineEventHandler, readBody, createError } from "h3";
import { useRuntimeConfig } from "#imports";
import { requireAuthenticatedUser } from "./utils/require-auth";

type SuggestionFilters = {
  timeOfDay: string;
  mealType: string;
  density: string;
  workoutTiming: string;
  dietPreference: "Any" | "Vegetarian" | "Vegan";
  maxCalories?: number | null;
  location?: string;
};

type UserContext = Record<string, any>;

type SuggestionRequest = {
  userId?: string;
  filters: SuggestionFilters;
  userContext: UserContext;
};

type MealRow = {
  location: string;
  meal_section: string;
  category: string;
  item_name: string;
  serving_size: string;
  ingredients: string;
  kcal_est: number;
  fat_g: number;
  carb_g: number;
  protein_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
  is_component: boolean;
  is_vegetarian: boolean;
  is_vegan: boolean;
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

let cachedMeals: MealRow[] | null = null;

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

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function parseBoolean(value: string) {
  return value?.toLowerCase?.() === "true";
}

async function loadMealsDataset() {
  if (cachedMeals) return cachedMeals;
  const csvPath = join(process.cwd(), "public", "duke_meals_compact.csv");
  const text = await readFile(csvPath, "utf8");
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length);
  const headers = parseCsvLine(lines[0]);
  const rows: MealRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (!values.length) continue;
    const row: Record<string, any> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx];
    });
    rows.push({
      location: row.location,
      meal_section: row.meal_section,
      category: row.category,
      item_name: row.item_name,
      serving_size: row.serving_size,
      ingredients: row.ingredients,
      kcal_est: Number(row.kcal_est) || 0,
      fat_g: Number(row.fat_g) || 0,
      carb_g: Number(row.carb_g) || 0,
      protein_g: Number(row.protein_g) || 0,
      fiber_g: Number(row.fiber_g) || 0,
      sugar_g: Number(row.sugar_g) || 0,
      sodium_mg: Number(row.sodium_mg) || 0,
      is_component: parseBoolean(row.is_component),
      is_vegetarian: parseBoolean(row.is_vegetarian),
      is_vegan: parseBoolean(row.is_vegan),
    });
  }
  cachedMeals = rows;
  return rows;
}

function matchesFilters(row: MealRow, filters: SuggestionFilters) {
  const { mealType, density, dietPreference, timeOfDay, workoutTiming, maxCalories, location } =
    filters;

  if (location && row.location !== location) return false;

  if (dietPreference === "Vegetarian" && !row.is_vegetarian) return false;
  if (dietPreference === "Vegan" && !row.is_vegan) return false;

  if (typeof maxCalories === "number" && row.kcal_est > maxCalories) return false;

  const highDensity = row.kcal_est >= 400 || row.protein_g >= 25;
  if (density === "High" && !highDensity) return false;
  if (density === "Low" && highDensity) return false;

  if (mealType === "Meal" && row.kcal_est < 250) return false;
  if (mealType === "Snack" && row.kcal_est > 350) return false;
  if (mealType === "Drink" && !row.category.toLowerCase().includes("drink")) return false;

  if (timeOfDay) {
    const map: Record<string, string[]> = {
      Morning: ["Breakfast", "Bakery", "Coffee", "Smoothie"],
      Midday: ["Lunch", "Salad", "Grill", "Sandwich"],
      Afternoon: ["Lunch", "Snack", "Coffee"],
      Evening: ["Dinner", "Entree", "Grill", "Bowls"],
      Night: ["Snack", "Late", "Pizza"],
    };
    const keywords = map[timeOfDay] || [];
    if (
      keywords.length &&
      !keywords.some(
        (keyword) =>
          row.category.toLowerCase().includes(keyword.toLowerCase()) ||
          row.meal_section.toLowerCase().includes(keyword.toLowerCase())
      )
    ) {
      return false;
    }
  }

  if (workoutTiming === "Pre-workout" && row.carb_g < row.protein_g) return false;
  if (workoutTiming === "Post-workout" && row.protein_g < 15) return false;

  return true;
}

function buildPrompt(filters: SuggestionFilters, userContext: UserContext, meals: MealRow[]) {
  const instructions = `You are a nutritionist giving advisory to a person on what they should be eating.
You have been provided a data set with foods and their macro breakdowns. Return a JSON array containing exactly 8 suggestions.
Each suggestion must include: title, description, sourceItem (matching the dataset item_name), justification, and macros object with calories, protein, carbs, fat, sugar, sodium numbers.
Use only the foods provided in the dataset subset. If a meal uses multiple components, combine them into a single entry and aggregate the macros.
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
        suggestion.servingSize = match.serving_size || suggestion.servingSize || null;
        suggestion.macros = {
          calories: Number(match.kcal_est) || suggestion.macros.calories,
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

  const completion = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
  });

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
