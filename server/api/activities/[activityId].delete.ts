import { ObjectId } from "mongodb";
import { getCollection } from "../../utils/mongo";

export default defineEventHandler(async (event) => {
  const { activityId } = event.context.params as { activityId?: string };
  if (!activityId) {
    throw createError({ statusCode: 400, statusMessage: "Missing activityId" });
  }

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(activityId);
  } catch {
    throw createError({ statusCode: 400, statusMessage: "Invalid activityId" });
  }

  const collection = await getCollection("activities");
  // Ensure the activity is for today before allowing deletion
  const found = await collection.findOne({ _id: objectId });
  if (!found) {
    throw createError({ statusCode: 404, statusMessage: "Activity not found" });
  }
  const todayKey = new Date().toISOString().slice(0, 10);
  if (found.dayKey !== todayKey) {
    throw createError({
      statusCode: 403,
      statusMessage: "Cannot delete activities from previous days",
    });
  }

  const result = await collection.deleteOne({ _id: objectId });
  if (!result.deletedCount) {
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to delete activity",
    });
  }

  return { ok: true };
});
