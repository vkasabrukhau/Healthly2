import { defineEventHandler } from "h3";
import { loadMealsDataset } from "../../utils/meals";

export default defineEventHandler(async () => {
  const meals = await loadMealsDataset();
  const unique = <T>(values: T[]) =>
    Array.from(
      new Set(values.filter((v) => typeof v === "string" && v.trim().length))
    ) as string[];

  const locationSectionMap = new Map<string, Set<string>>();
  const sectionLocationMap = new Map<string, Set<string>>();

  meals.forEach((meal) => {
    const location = (meal.location || "").trim();
    const section = (meal.meal_section || "").trim();
    if (location) {
      if (!locationSectionMap.has(location)) {
        locationSectionMap.set(location, new Set());
      }
      if (section) {
        locationSectionMap.get(location)?.add(section);
      }
    }
    if (section) {
      if (!sectionLocationMap.has(section)) {
        sectionLocationMap.set(section, new Set());
      }
      if (location) {
        sectionLocationMap.get(section)?.add(location);
      }
    }
  });

  const locations = unique(meals.map((m) => m.location));
  const mealSections = unique(meals.map((m) => m.meal_section));
  const categories = unique(meals.map((m) => m.category));

  const serializeMap = (input: Map<string, Set<string>>) => {
    const out: Record<string, string[]> = {};
    input.forEach((set, key) => {
      out[key] = Array.from(set).sort();
    });
    return out;
  };

  return {
    locations,
    mealSections,
    categories,
    locationSections: serializeMap(locationSectionMap),
    sectionLocations: serializeMap(sectionLocationMap),
  };
});
