<script setup lang="ts">
const route = useRoute()

const links = [
  { label: 'Home', to: '/' },
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Account', to: '/account' },
  { label: 'Suggestions', to: '/suggestions' }
]
</script>

<template>
  <div class="layout">
    <header class="nav">
      <NuxtLink class="nav__brand" to="/">
        Healthly
      </NuxtLink>
      <nav class="nav__links" aria-label="Primary">
        <NuxtLink
          v-for="link in links"
          :key="link.to"
          class="nav__link"
          :class="{ 'nav__link--active': route.path === link.to }"
          :to="link.to"
        >
          {{ link.label }}
        </NuxtLink>
      </nav>
      <NuxtLink class="nav__cta" :to="{ path: '/sign-in', query: { redirect_url: '/dashboard' } }">
        Sign in
      </NuxtLink>
    </header>

    <main>
      <slot />
    </main>
  </div>
</template>

<style scoped>
.layout {
  min-height: 100vh;
  background: #05070a;
}

.nav {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem clamp(1rem, 4vw, 4rem);
  background: rgba(5, 7, 10, 0.8);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(14px);
  z-index: 20;
}

.nav__brand {
  font-weight: 700;
  font-size: 1.1rem;
  color: #ffb08f;
  text-decoration: none;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.nav__links {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.nav__link {
  color: rgba(248, 247, 244, 0.78);
  text-decoration: none;
  padding: 0.5rem 0.75rem;
  border-radius: 999px;
  transition: background 0.2s ease;
  font-size: 0.95rem;
}

.nav__link--active,
.nav__link:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.nav__cta {
  border-radius: 999px;
  padding: 0.6rem 1.2rem;
  text-decoration: none;
  color: #05070a;
  background: linear-gradient(120deg, #ff8367, #ffc083);
  font-weight: 600;
  box-shadow: 0 12px 24px rgba(255, 131, 103, 0.25);
}

@media (max-width: 720px) {
  .nav {
    flex-direction: column;
  }

  .nav__links {
    justify-content: center;
  }
}
</style>
