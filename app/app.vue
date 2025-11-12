<script setup lang="ts">
import { useUser, useClerk, useCookie, useRouter } from "#imports";

// show nav only when signed in; provide sign-out behavior
const { isSignedIn } = useUser();
const clerk = (
  typeof useClerk === "function" ? (useClerk() as any) : null
) as any;
const onboardingCookie = useCookie("healthly-onboarded");
const router = useRouter();

const handleSignOut = async () => {
  try {
    if (clerk && typeof clerk.signOut === "function") {
      await clerk.signOut();
    } else if (process.client && (window as any).Clerk?.signOut) {
      await (window as any).Clerk.signOut();
    }
  } catch (e) {
    if (process.dev) console.warn("Sign out failed:", e);
  } finally {
    // clear onboarding cookie so next sign-in re-checks server profile
    try {
      onboardingCookie.value = "false";
    } catch (e) {}
    router.push("/");
  }
};
</script>

<template>
  <div id="app">
    <header v-if="isSignedIn" class="site-header">
      <div class="site-brand">
        <NuxtLink to="/dashboard" class="brand-link">Healthly</NuxtLink>
      </div>
      <nav class="site-nav" aria-label="Main navigation">
        <NuxtLink
          to="/dashboard"
          class="nav-link"
          exact-active-class="nav-link--active"
          >Home</NuxtLink
        >
        <NuxtLink to="/trends" class="nav-link" active-class="nav-link--active"
          >Trends</NuxtLink
        >
        <NuxtLink to="/account" class="nav-link" active-class="nav-link--active"
          >Account</NuxtLink
        >
        <button class="nav-link btn-plain" @click="handleSignOut">
          Sign out
        </button>
      </nav>
    </header>

    <main>
      <NuxtPage />
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
  font-size: 1.1rem;
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
  background: linear-gradient(120deg, #4facfe, var(--brand-color));
  color: #071019;
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
