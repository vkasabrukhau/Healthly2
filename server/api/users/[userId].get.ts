import { getCollection } from "../../utils/mongo";

export default defineEventHandler(async (event) => {
  const { userId } = event.context.params as { userId?: string };

  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: "Missing userId" });
  }

  const collection = await getCollection("user");
  const doc = await collection.findOne({ userId });

  return { exists: !!doc, profile: doc ?? null };
});
