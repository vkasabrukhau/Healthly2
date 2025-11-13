export default defineNuxtRouteMiddleware(async (to) => {
  const onboardingCookie = useCookie("healthly-onboarded", {
    default: () => "false",
  });

  // If cookie says onboarding already completed, skip.
  if (onboardingCookie.value === "true") return;

  // If we're already heading to the onboarding page, allow it (avoid redirect loop).
  if (to.path && to.path.startsWith("/onboarding")) return;

  // If user not signed in yet, don't force onboarding here — let auth flow handle sign-in.
  const { user } = useUser ? useUser() : { user: null };
  const _u = user as any;
  const userId = _u?.value?.id || _u?.value?.userId || null;
  if (!userId) return;

  // Check server-side whether a profile exists for this user. If so, mark cookie and continue.
  try {
    const resp = await $fetch<{ exists: boolean }>(
      `/api/users/${encodeURIComponent(userId)}`
    );
    if (resp && resp.exists) {
      onboardingCookie.value = "true";
      return;
    }
  } catch (e) {
    // If the check fails, fall back to client-side onboarding redirect rather than blocking.
    // Continue to redirect to onboarding below.
    // (We intentionally don't throw here.)
    // Optionally log the error in dev.
    if (process.dev) console.warn("Onboarding check failed:", e);
  }

  const redirect = encodeURIComponent(to.fullPath);
  return navigateTo(`/onboarding?redirect=${redirect}`);
});
