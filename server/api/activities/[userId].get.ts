import { getCollection } from "../../utils/mongo";

type ActivityDoc = {
  userId: string;
  type: string;
  duration: string;
  date: string;
  dayKey: string;
  calories: number;
  status: "Completed" | "Planned";
  plannedAt?: Date;
  completedAt?: Date;
};

export default defineEventHandler(async (event) => {
  // Read userId from route params first, fall back to query param for
  // defensive debugging (some clients might send it differently).
  // Some route files use different param names (e.g. [activityId]) and Nitro
  // may match that route for the same path. Accept either `userId` or
  // `activityId` from params to be resilient.
  const params = (event.context.params || {}) as Record<string, any>;
  let userId = params.userId as string | undefined;
  const activityIdParam = params.activityId as string | undefined;
  if (!userId && activityIdParam) {
    // If the param was named activityId but the value looks like a user id,
    // treat it as userId. This keeps the GET handler usable regardless of
    // which dynamic route file Nitro resolved.
    userId = activityIdParam;
  }
  const query = getQuery(event);
  if (!userId && typeof query.userId === "string") {
    userId = query.userId;
  }

  // If userId is still missing, log the incoming context to help debug why
  // the path param was not populated (useful in dev). Then return the same
  // 400 error to the client.
  if (!userId) {
    if (process.dev) {
      // eslint-disable-next-line no-console
      console.error("[debug] Missing userId in activities GET", {
        params: event.context.params,
        query,
        url: getRequestURL(event),
      });
    }
    throw createError({ statusCode: 400, statusMessage: "Missing userId" });
  }

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

  const collection = await getCollection<ActivityDoc>("activities");
  const docs = await collection
    .find({ userId, dayKey })
    .sort({ date: 1 })
    .toArray();

  const items = docs.map(({ _id, ...rest }) => ({
    id: (_id as any)?.toString?.() ?? undefined,
    ...rest,
  }));

  return { items };
});
