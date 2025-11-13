import { ObjectId } from "mongodb";
import { getCollection } from "../../utils/mongo";

const VALID_STATUSES = new Set(["Completed", "Planned"]);

export default defineEventHandler(async (event) => {
  const { activityId } = event.context.params as { activityId?: string };
  if (!activityId) {
    throw createError({ statusCode: 400, statusMessage: "Missing activityId" });
  }

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(activityId);
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: "Invalid activityId" });
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
    result = await collection.findOneAndUpdate({ _id: objectId }, updateOps, {
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
