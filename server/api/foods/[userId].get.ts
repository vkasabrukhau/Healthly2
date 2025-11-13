import { getCollection } from "../../utils/mongo";
import { requireAuthenticatedUser } from "../utils/require-auth";

type FoodDoc = {
  userId: string;
  itemName: string;
  calories: number;
  diningEstablishment: string;
  macros: {
    protein: number;
    carbs: number;
    fat: number;
    sugar?: number;
    sodium?: number;
  };
  dateConsumed: string;
  dayKey: string;
  time?: string;
  portion?: string;
  mealClass?: string;
};

export default defineEventHandler(async (event) => {
  // Defensive param handling: Nitro may resolve the dynamic segment using a
  // different name (for example another file in the same folder uses
  // `[foodId]`), so accept either `userId` or `foodId` (or fallback to
  // query.userId). Also log the incoming context in dev so we can trace
  // why the client request didn't populate the expected param name.
  const params = (event.context.params || {}) as Record<string, any>;
  let userId = params.userId as string | undefined;
  const foodIdParam = params.foodId as string | undefined;
  if (!userId && foodIdParam) {
    userId = foodIdParam;
  }
  const query = getQuery(event);

  if (!userId && typeof query.userId === "string") {
    userId = query.userId;
  }

  if (!userId) {
    if (process.dev) {
      // eslint-disable-next-line no-console
      console.error("[debug] Missing userId in foods GET", {
        params: event.context.params,
        query,
        url: getRequestURL(event),
      });
    }
    throw createError({ statusCode: 400, statusMessage: "Missing userId" });
  }

  // Ensure caller is authenticated and is requesting their own data
  await requireAuthenticatedUser(event, userId);

  const dateParam =
    (query.date as string) || new Date().toISOString().slice(0, 10);
  const normalizedDate = new Date(dateParam);
  if (Number.isNaN(normalizedDate.getTime())) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid date parameter",
    });
  }
  const dayKey = normalizedDate.toISOString().slice(0, 10);

  const collection = await getCollection<FoodDoc>("foods");
  const docs = await collection
    .find({ userId, dayKey })
    .sort({ dateConsumed: 1 })
    .toArray();

  const items = docs.map(({ _id, ...rest }) => ({
    id: (_id as any)?.toString?.() ?? undefined,
    ...rest,
  }));

  return { items };
});
