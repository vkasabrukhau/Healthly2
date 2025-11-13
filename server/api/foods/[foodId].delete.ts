import { ObjectId } from "mongodb";
import { getCollection } from "~/server/utils/mongo";

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
  const result = await collection.deleteOne({ _id: objectId });
  if (!result.deletedCount) {
    throw createError({ statusCode: 404, statusMessage: "Meal not found" });
  }

  return { ok: true };
});
