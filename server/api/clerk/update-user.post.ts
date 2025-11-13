import { H3Event } from "h3";

export default defineEventHandler(async (event: H3Event) => {
  const body = await readBody<{
    userId: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  }>(event);
  const { userId, firstName, lastName, email } = body;

  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: "Missing userId" });
  }

  const clerkKey =
    process.env.CLERK_SECRET_KEY ||
    process.env.NUXT_CLERK_SECRET_KEY ||
    process.env.NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!clerkKey) {
    throw createError({
      statusCode: 500,
      statusMessage: "Clerk secret key not configured on server",
    });
  }

  const base = "https://api.clerk.com/v1";
  const headers = {
    Authorization: `Bearer ${clerkKey}`,
    "Content-Type": "application/json",
  };

  let clerkUpdated = false;
  try {
    // Update basic name fields on the Clerk user
    const patchBody: Record<string, any> = {};
    if (firstName) patchBody.first_name = firstName;
    if (lastName) patchBody.last_name = lastName;

    if (Object.keys(patchBody).length > 0) {
      await $fetch(`${base}/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers,
        body: patchBody,
      });
    }

    // If an email is provided, attempt to add it as an email address for the user.
    // Clerk's API requires creating an email address resource for the user.
    if (email) {
      try {
        await $fetch(
          `${base}/users/${encodeURIComponent(userId)}/email_addresses`,
          {
            method: "POST",
            headers,
            body: { email_address: email },
          }
        );
      } catch (e: any) {
        // If adding the email fails, capture the reason and continue without throwing.
        // A 404 here usually means the user id wasn't found or the endpoint isn't available.
        if (process.dev) console.warn("Clerk: failed to add email address", e);
        // Return partial success: name may have been patched above but email wasn't added.
        return {
          ok: true,
          clerkUpdated: false,
          error: e?.message || String(e),
        };
      }
    }

    clerkUpdated = true;
  } catch (err) {
    if (process.dev) console.warn("Clerk update failed:", err);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to update Clerk user",
    });
  }

  return { ok: true, clerkUpdated };
});
