import { getCollection } from "../../utils/mongo";
import { requireAuthenticatedUser } from "../utils/require-auth";

export default defineEventHandler(async (event) => {
  const { userId } = event.context.params as { userId?: string };

  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: "Missing userId" });
  }

  // Ensure the caller is authenticated and is requesting their own profile
  await requireAuthenticatedUser(event, userId);

  const collection = await getCollection("user");
  const doc = await collection.findOne({ userId });

  return { exists: !!doc, profile: doc ?? null };
});
