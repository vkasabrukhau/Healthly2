export async function requireAuthenticatedUser(
  event: any,
  expectedUserId?: string
) {
  // Clerk middleware attaches an `auth` function to event.context which
  // returns the current auth object when invoked. If it's missing or the
  // auth object doesn't contain a user id, reject the request.
  const authFn = (event.context || {}).auth as any;
  if (typeof authFn !== "function") {
    throw createError({ statusCode: 401, statusMessage: "Not authenticated" });
  }

  const authObj = await authFn();
  if (!authObj) {
    throw createError({ statusCode: 401, statusMessage: "Not authenticated" });
  }

  // Extract a robust user id from several possible Clerk shapes
  const clerkUserId =
    authObj.userId ||
    authObj.user?.id ||
    authObj.sub ||
    authObj.id ||
    authObj.user_id ||
    null;

  if (!clerkUserId) {
    throw createError({ statusCode: 401, statusMessage: "Not authenticated" });
  }

  if (expectedUserId && String(expectedUserId) !== String(clerkUserId)) {
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  }

  return clerkUserId;
}
