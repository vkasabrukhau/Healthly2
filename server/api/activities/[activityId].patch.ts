import { ObjectId } from "mongodb";
import { getCollection } from "../../utils/mongo";

const VALID_STATUSES = new Set(["Completed", "Planned"]);

export default defineEventHandler(async (event) => {
  const { activityId } = event.context.params as { activityId?: string };
  if (!activityId) {
    throw createError({ statusCode: 400, statusMessage: "Missing activityId" });
  }

  // Accept either a BSON ObjectId string or a plain string id. If the
  // activityId is not a valid ObjectId, fall back to using the string as the
  // filter. This makes the endpoint more resilient to mixed id formats.
  let objectId: ObjectId | null = null;
  try {
    objectId = new ObjectId(activityId);
  } catch (error) {
    objectId = null;
  }

  const body = await readBody<Record<string, any>>(event);
  let status = body?.status;

  if (typeof status !== "string") {
    throw createError({ statusCode: 400, statusMessage: "Invalid status" });
  }

  status = status.trim();
  if (!VALID_STATUSES.has(status)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid status" });
  }

  const collection = await getCollection("activities");
  const now = new Date();

  // Fetch the activity and ensure it belongs to today before allowing updates
  // Try to locate the existing activity by ObjectId first; if that failed,
  // try to find by the raw string key (some older entries may have string ids).
  const filter: any = objectId ? { _id: objectId } : { _id: activityId };
  const existing = await collection.findOne(filter);
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: "Activity not found" });
  }
  const todayKey = new Date().toISOString().slice(0, 10);
  if (existing.dayKey !== todayKey) {
    throw createError({
      statusCode: 403,
      statusMessage: "Cannot modify activities from previous days",
    });
  }

  // Build a compound update so we can set updatedAt and conditionally set/unset completedAt
  const updateOps: any = { $set: { status, updatedAt: now } };
  if (status === "Completed") {
    updateOps.$set.completedAt = now;
  } else {
    // If switching away from Completed, remove completedAt to keep document consistent
    updateOps.$unset = { completedAt: "" };
  }

  let result;
  try {
    result = await collection.findOneAndUpdate(filter, updateOps, {
      returnDocument: "after",
    });
  } catch (err) {
    // Log the error server-side to help debugging
    // eslint-disable-next-line no-console
    console.error("Failed to update activity", { activityId, err });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to update activity",
    });
  }

  if (!result?.value) {
    throw createError({ statusCode: 404, statusMessage: "Activity not found" });
  }

  return { activity: result.value };
});
