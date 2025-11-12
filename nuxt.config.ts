/// <reference types="node" />

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
const mongoDbName =
  process.env.MONGODB_DB || process.env.MONGO_DB || "healthly";

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  modules: ["@clerk/nuxt", "nuxt-echarts"],
  runtimeConfig: {
    // Server-only secrets
    mongoUri,
    mongoDbName,
    clerkSecretKey: process.env.CLERK_SECRET_KEY,
    openrouterKey: process.env.OPENROUTER_API_KEY,
    // Exposed to the client
    public: {
      clerkPublishableKey: process.env.NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    },
  },
});
