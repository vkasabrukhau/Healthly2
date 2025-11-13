<script setup lang="ts">
import { computed, watch, ref } from "vue";
import { useCookie, useRoute, useRouter, useUser } from "#imports";

const route = useRoute();
const router = useRouter();
const onboardingCookie = useCookie("healthly-onboarded");
const { user, isSignedIn } = useUser();

const pageReady = ref(true);

const showNav = computed(
  () =>
    isSignedIn.value &&
    route.path !== "/" &&
    !route.path.startsWith("/onboarding")
);

watch(
  () => isSignedIn.value,
  (signedIn) => {
    if (!signedIn) {
      onboardingCookie.value = "false";
      router.replace("/");
      pageReady.value = true;
    }
  }
);

// When a user signs in (client-side), check their server profile and route to
// onboarding if they don't have one. This ensures SSO users without profiles
// get the onboarding flow immediately after signing in.
// When sign-in occurs, run the onboarding server check before rendering the
// page. This prevents a brief flash where the dashboard shows before the
// client-side redirect to onboarding executes.
watch(
  () => isSignedIn.value,
  async (signedIn) => {
    if (!signedIn) return;
    // Only run this client-side after Clerk has populated user data.
    if (process.server) return;
    const uid = (user.value as any)?.id || (user.value as any)?.userId || null;
    if (!uid) return;

    // Block rendering while we check the server for an existing profile.
    pageReady.value = false;
    try {
      const resp = await $fetch(`/api/users/${encodeURIComponent(uid)}`);
      if (resp && resp.exists) {
        onboardingCookie.value = "true";
        pageReady.value = true;
        return;
      }
      // If no profile exists, route to onboarding and keep the page blocked briefly.
      const redirect = encodeURIComponent(
        router.currentRoute.value.fullPath || "/dashboard"
      );
      await router.replace(`/onboarding?redirect=${redirect}`);
    } catch (e) {
      if (process.dev)
        console.warn("Onboarding server check on sign-in failed:", e);
    } finally {
      // Allow rendering after check/redirect completes.
      pageReady.value = true;
    }
  }
);

const displayName = computed(() => {
  const value = user.value as any;
  return (
    value?.fullName ||
    value?.firstName ||
    value?.given_name ||
    value?.username ||
    "Member"
  );
});

const clerkId = computed(() => (user.value as any)?.id || "--");

const userButtonAppearance = {
  elements: {
    userButtonOuterIdentifier: { color: "#dfe9ff" },
  },
};
</script>

<template>
  <div id="app">
    <header v-if="showNav" class="site-header">
      <div class="site-brand">
        <NuxtLink to="/dashboard" class="brand-link">
          <img src="/ioshealth.png" alt="Healthly" class="brand-icon" />
          <span class="brand-text">Healthly</span>
        </NuxtLink>
      </div>
      <nav class="site-nav" aria-label="Main navigation">
        <NuxtLink
          to="/dashboard"
          class="nav-link"
          exact-active-class="nav-link--active"
          >Dashboard</NuxtLink
        >
        <NuxtLink to="/trends" class="nav-link" active-class="nav-link--active"
          >Trends</NuxtLink
        >
        <NuxtLink
          to="/suggestions"
          class="nav-link"
          active-class="nav-link--active"
          >Suggestions</NuxtLink
        >
        <NuxtLink to="/account" class="nav-link" active-class="nav-link--active"
          >Account</NuxtLink
        >
      </nav>
      <div class="user-module" aria-live="polite">
        <div class="user-meta">
          <p class="user-meta__name">{{ displayName }}</p>
        </div>
        <ClientOnly>
          <UserButton
            :after-sign-out-url="'/'"
            :appearance="userButtonAppearance"
          />
        </ClientOnly>
      </div>
    </header>

    <main>
      <div v-if="!pageReady" class="page-blocker" aria-hidden="true"></div>
      <NuxtPage v-else />
    </main>
  </div>
</template>

<style>
:root {
  --brand-color: #ff8367;
  --muted: rgba(255, 255, 255, 0.7);
}
.site-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px clamp(1rem, 4vw, 2rem);
  background: rgba(5, 7, 10, 0.85);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  position: sticky;
  top: 0;
  z-index: 50;
}
.site-brand .brand-link {
  font-weight: 700;
  color: white;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.1rem;
}
.brand-icon {
  width: 28px;
  height: 28px;
  object-fit: contain;
  display: inline-block;
}
.brand-text {
  line-height: 1;
}
.site-nav {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}
.nav-link,
.btn-plain {
  color: var(--muted);
  text-decoration: none;
  padding: 8px 12px;
  border-radius: 999px;
  transition: background 0.15s ease, color 0.15s ease;
  background: transparent;
  border: none;
}
.nav-link:hover,
.btn-plain:hover {
  background: rgba(255, 255, 255, 0.02);
  color: white;
}
.nav-link--active {
  background: linear-gradient(120deg, #4f9cff, #3b6fe1);
  color: #fff;
  font-weight: 600;
}
.user-module {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.user-meta {
  text-align: right;
}

.user-meta__name {
  margin: 0;
  font-weight: 600;
  color: #f8f7f4;
}

.user-meta__id {
  margin: 0;
  font-size: 0.8rem;
  color: var(--muted);
}
main {
  min-height: calc(100vh - 64px);
}
@media (max-width: 640px) {
  .site-nav {
    gap: 0.5rem;
  }
}
</style>
