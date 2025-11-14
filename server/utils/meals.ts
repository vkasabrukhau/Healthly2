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
      calories: Number(row.Calories) || Number(row.kcal_est) || 0,
      fat_g: Number(row["Total Fat"]) || Number(row.fat_g) || 0,
      carb_g: Number(row["Total Carbohydrate"]) || Number(row.carb_g) || 0,
      protein_g: Number(row.Protein) || Number(row.protein_g) || 0,
      sugar_g: Number(row["Total Sugars"]) || Number(row.sugar_g) || 0,
      sodium_mg: Number(row["Total Sodium"]) || Number(row.sodium_mg) || 0,
    });
  }
  cachedMeals = rows;
  return rows;
}
