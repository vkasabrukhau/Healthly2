import { ObjectId } from "mongodb";
import { getCollection } from "../../utils/mongo";

export default defineEventHandler(async (event) => {
  const { foodId } = event.context.params as { foodId?: string };
  if (!foodId) {
    throw createError({ statusCode: 400, statusMessage: "Missing foodId" });
  }

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(foodId);
  } catch {
    throw createError({ statusCode: 400, statusMessage: "Invalid foodId" });
  }

  const collection = await getCollection("foods");
  // Ensure the meal is for today before allowing deletion
  const found = await collection.findOne({ _id: objectId });
  if (!found) {
    throw createError({ statusCode: 404, statusMessage: "Meal not found" });
  }
  const todayKey = new Date().toISOString().slice(0, 10);
  if (found.dayKey !== todayKey) {
    throw createError({
      statusCode: 403,
      statusMessage: "Cannot delete meals from previous days",
    });
  }

  const result = await collection.deleteOne({ _id: objectId });
  if (!result.deletedCount) {
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to delete meal",
    });
  }

  return { ok: true };
});
