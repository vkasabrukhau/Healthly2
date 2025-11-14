import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type MealRow = {
  location: string;
  meal_section: string;
  category: string;
  item_name: string;
  serving_size: string;
  ingredients: string;
  calories: number;
  fat_g: number;
  carb_g: number;
  protein_g: number;
  sugar_g: number;
  sodium_mg: number;
};

let cachedMeals: MealRow[] | null = null;

export const normalizeMealKey = (value?: string | null) =>
  (value || "")
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export function findMealMatchByName(name: string | undefined, meals: MealRow[]) {
  if (!name) return null;
  const target = normalizeMealKey(name);
  if (!target) return null;
  return (
    meals.find((row) => normalizeMealKey(row.item_name) === target) ||
    meals.find((row) => target.includes(normalizeMealKey(row.item_name))) ||
    meals.find((row) => normalizeMealKey(row.item_name).includes(target)) ||
    null
  );
}

const toNumber = (input: any) => {
  if (typeof input !== "string") {
    const num = Number(input);
    return Number.isFinite(num) ? num : 0;
  }
  const cleaned = input.replace(/[^0-9.\-]/g, "");
  if (!cleaned.length) return 0;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
};

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

export async function loadMealsDataset() {
  if (cachedMeals) return cachedMeals;
  const csvPath = join(process.cwd(), "public", "duke_meals_compact.csv");
  const text = await readFile(csvPath, "utf8");
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length);
  if (!lines.length) return [];
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
      calories: toNumber(row.Calories ?? row.kcal_est),
      fat_g: toNumber(row["Total Fat"] ?? row.fat_g),
      carb_g: toNumber(row["Total Carbohydrate"] ?? row.carb_g),
      protein_g: toNumber(row.Protein ?? row.protein_g),
      sugar_g: toNumber(row["Total Sugars"] ?? row.sugar_g),
      sodium_mg: toNumber(row["Total Sodium"] ?? row.sodium_mg),
    });
  }
  cachedMeals = rows;
  return rows;
}
