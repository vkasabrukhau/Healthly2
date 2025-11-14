import { defineEventHandler } from "h3";
import { loadMealsDataset } from "../../utils/meals";

export default defineEventHandler(async () => {
  const meals = await loadMealsDataset();
  const unique = <T>(values: T[]) =>
    Array.from(new Set(values.filter((v) => typeof v === "string" && v.trim().length))) as string[];

  const locations = unique(meals.map((m) => m.location));
  const mealSections = unique(meals.map((m) => m.meal_section));
  const categories = unique(meals.map((m) => m.category));

  return { locations, mealSections, categories };
});
