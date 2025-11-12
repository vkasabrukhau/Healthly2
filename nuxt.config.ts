// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  modules: ["@clerk/nuxt", "nuxt-echarts"],
  runtimeConfig: {
    mongoUri: process.env.MONGODB_URI,
    mongoDbName: process.env.MONGODB_DB || "healthly",
  },
});
