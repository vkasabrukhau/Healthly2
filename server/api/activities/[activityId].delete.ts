import { ObjectId } from "mongodb";
import { getCollection } from "~/server/utils/mongo";

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
  const result = await collection.deleteOne({ _id: objectId });
  if (!result.deletedCount) {
    throw createError({ statusCode: 404, statusMessage: "Activity not found" });
  }

  return { ok: true };
});
