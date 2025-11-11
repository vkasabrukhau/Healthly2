<script setup lang="ts">
// Components are automatically imported
</script>

<template>
  <!-- Protect the dashboard page. Do not render any sign-in UI for signed-out users;
       instead immediately redirect to Clerk's sign-in flow and return to /dashboard
       after a successful sign-in. -->
  <Protect>
    <template #default>
      <header>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </header>

      <main>
        <NuxtPage />
      </main>
    </template>
    <template #fallback>
      <RedirectToSignIn :afterSignInUrl="'/dashboard'" />
    </template>
  </Protect>
</template>

<style scoped>
.dashboard {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 2rem;
  background: radial-gradient(
      circle at top,
      rgba(255, 131, 103, 0.25),
      transparent 60%
    ),
    #05070a;
  color: #f7f5f1;
}

.dashboard__card {
  max-width: 560px;
  width: 100%;
  padding: 2.5rem;
  border-radius: 28px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(10, 12, 16, 0.9);
  display: flex;
  flex-direction: column;
  gap: 1rem;
  text-align: center;
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.25em;
  font-size: 0.75rem;
  color: #ffb08f;
}

h1 {
  margin: 0;
}

p {
  margin: 0;
  color: #d7d5cf;
}

.btn {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  border-radius: 999px;
  padding: 0.9rem 1.5rem;
  font-weight: 600;
  background: linear-gradient(120deg, #ff8367, #ffc083);
  color: #111215;
  text-decoration: none;
  border: 1px solid transparent;
  margin-top: 0.5rem;
}

.link {
  color: #ffb08f;
  text-decoration: none;
}

.link:hover {
  text-decoration: underline;
}
</style>
