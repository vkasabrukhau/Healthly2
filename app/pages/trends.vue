<script setup lang="ts">
import { ref, computed } from "vue";
import { useHead } from "#imports";

definePageMeta({
  middleware: [
    // cast the named middleware to the NavigationGuard type so TS accepts the string name
    "require-onboarding" as unknown as import("vue-router").NavigationGuard,
  ],
});

// Range control + synthetic demo data generator so charts feel alive in preview
const range = ref<"week" | "month">("week");

function makeLabels(days: number) {
  const out: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function jitter(base: number, variance = 1) {
  return Math.round((base + (Math.random() - 0.5) * variance) * 10) / 10;
}

const labels = ref<string[]>(makeLabels(7));
const weightData = ref<number[]>([
  176, 175.2, 175.0, 174.5, 174.8, 174.2, 173.9,
]);
const sleepData = ref<number[]>([7.2, 6.8, 7.5, 8.0, 6.9, 7.1, 7.6]);
const foodCompletion = ref<number[]>([78, 82, 90, 75, 88, 93, 85]);
const waterCompletion = ref<number[]>([60, 70, 55, 80, 65, 72, 68]);

const mealPlanMode = ref<"cut" | "maintain" | "bulk">("maintain");

function setRange(r: "week" | "month") {
  range.value = r;
  const days = r === "week" ? 7 : 30;
  labels.value = makeLabels(days);
  const baseWeight = 174.5 + (r === "month" ? 1.5 : 0);
  weightData.value = Array.from({ length: days }, (_, i) =>
    jitter(baseWeight - i * 0.02, 0.8)
  );
  sleepData.value = Array.from({ length: days }, () => jitter(7.2, 1.2));
  foodCompletion.value = Array.from({ length: days }, () =>
    Math.max(40, Math.min(100, Math.round(jitter(80, 25))))
  );
  waterCompletion.value = Array.from({ length: days }, () =>
    Math.max(20, Math.min(100, Math.round(jitter(70, 30))))
  );
}

function randomize() {
  weightData.value = weightData.value.map((v) => jitter(v, 0.6));
  sleepData.value = sleepData.value.map((v) => jitter(v, 0.6));
  foodCompletion.value = foodCompletion.value.map(() =>
    Math.max(30, Math.min(100, Math.round(Math.random() * 100)))
  );
  waterCompletion.value = waterCompletion.value.map(() =>
    Math.max(20, Math.min(100, Math.round(Math.random() * 100)))
  );
}

// start with week data
setRange("week");

const weightOption = computed(() => ({
  xAxis: { type: "category", data: labels.value },
  yAxis: { type: "value", name: "lb" },
  series: [
    {
      type: "line",
      data: weightData.value,
      smooth: true,
      name: "Weight",
      areaStyle: {},
    },
  ],
  tooltip: { trigger: "axis" },
}));

const sleepOption = computed(() => ({
  xAxis: { type: "category", data: labels.value },
  yAxis: { type: "value", name: "hrs" },
  series: [
    {
      type: "line",
      data: sleepData.value,
      smooth: true,
      name: "Sleep",
      areaStyle: {},
    },
  ],
  tooltip: { trigger: "axis" },
}));

const foodOption = computed(() => ({
  xAxis: { type: "category", data: labels.value },
  yAxis: { type: "value", max: 100 },
  series: [
    {
      type: "bar",
      data: foodCompletion.value,
      name: "Food Goal %",
      itemStyle: { color: "#ff8367" },
    },
  ],
  tooltip: { trigger: "axis", formatter: "{b0}: {c0}%" },
}));

const waterOption = computed(() => ({
  xAxis: { type: "category", data: labels.value },
  yAxis: { type: "value", max: 100 },
  series: [
    {
      type: "bar",
      data: waterCompletion.value,
      name: "Drink Goal %",
      itemStyle: { color: "#4facfe" },
    },
  ],
  tooltip: { trigger: "axis", formatter: "{b0}: {c0}%" },
}));

useHead({ title: "Healthly | Trends" });
</script>

<template>
  <div class="page trends-page">
    <header class="intro">
      <div>
        <h1>Health trends</h1>
        <p class="card__sub">
          Track recent weight, sleep, and goal completion.
        </p>
      </div>

      <div class="mealplan-control">
        <p class="card__eyebrow">Meal plan mode</p>
        <div class="plan-buttons">
          <button
            :class="['btn', { active: mealPlanMode === 'cut' }]"
            @click="mealPlanMode = 'cut'"
          >
            Cut
          </button>
          <button
            :class="['btn', { active: mealPlanMode === 'maintain' }]"
            @click="mealPlanMode = 'maintain'"
          >
            Maintain
          </button>
          <button
            :class="['btn', { active: mealPlanMode === 'bulk' }]"
            @click="mealPlanMode = 'bulk'"
          >
            Bulk
          </button>
        </div>
      </div>
    </header>

    <section class="trends-grid">
      <article class="card chart-card">
        <header>
          <p class="card__eyebrow">Weight</p>
          <h2>Body weight</h2>
        </header>
        <ClientOnly>
          <VChart :option="weightOption" autoresize class="trend-chart" />
        </ClientOnly>
      </article>

      <article class="card chart-card">
        <header>
          <p class="card__eyebrow">Sleep</p>
          <h2>Sleep trend</h2>
        </header>
        <ClientOnly>
          <VChart :option="sleepOption" autoresize class="trend-chart" />
        </ClientOnly>
      </article>

      <article class="card chart-card">
        <header>
          <p class="card__eyebrow">Food</p>
          <h2>Food goal completion</h2>
        </header>
        <ClientOnly>
          <VChart :option="foodOption" autoresize class="trend-chart" />
        </ClientOnly>
      </article>

      <article class="card chart-card">
        <header>
          <p class="card__eyebrow">Hydration</p>
          <h2>Drinking goal completion</h2>
        </header>
        <ClientOnly>
          <VChart :option="waterOption" autoresize class="trend-chart" />
        </ClientOnly>
      </article>
    </section>
  </div>
</template>

<style scoped>
.trends-page .intro {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.plan-buttons {
  display: flex;
  gap: 0.5rem;
}

.plan-buttons .btn {
  padding: 0.5rem 0.9rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: #f8f7f4;
}

.plan-buttons .btn.active {
  background: linear-gradient(120deg, #4facfe, #ff8367);
  color: white;
  box-shadow: 0 8px 20px rgba(79, 172, 254, 0.12);
}

.trends-grid {
  margin-top: 1.25rem;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.25rem;
}

.trend-chart {
  width: 100%;
  height: 260px;
}

.chart-card {
  min-height: 360px;
}

@media (max-width: 640px) {
  .trends-page .intro {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
