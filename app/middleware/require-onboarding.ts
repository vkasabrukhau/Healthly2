export default defineNuxtRouteMiddleware((to) => {
  const onboardingCookie = useCookie("healthly-onboarded", {
    default: () => "false",
  });

  if (onboardingCookie.value === "true") {
    return;
  }

  const redirect = encodeURIComponent(to.fullPath);
  return navigateTo(`/onboarding?redirect=${redirect}`);
});
