<script setup lang="ts">
import { computed, reactive, ref, onMounted, watch } from "vue";
import { useUser } from "#imports";

definePageMeta({
  middleware: [
    // cast the named middleware to the NavigationGuard type so TS accepts the string name
    "require-onboarding" as unknown as import("vue-router").NavigationGuard,
  ],
});

// Core reactive state (empty/default) — replace/populate from real user data when available
type MacroEntry = {
  label: string;
  consumed: number;
  goal: number;
  unit: string;
};

type MacroBreakdown = {
  protein: number;
  carbs: number;
  fat: number;
};

type MealEntry = {
  time: string;
  name: string;
  calories: number;
  location: string;
  date: string;
  macros: MacroBreakdown;
};

type ActivityStatus = "Completed" | "Planned";

type ActivityEntry = {
  type: string;
  duration: string;
  date: string;
  calories: number;
  status: ActivityStatus;
};

const dailyScore = ref(84);

const macros = ref<MacroEntry[]>([
  { label: "Saturated Fat", consumed: 12, goal: 20, unit: "g" },
  { label: "Trans Fat", consumed: 1, goal: 2, unit: "g" },
  { label: "Total Fat", consumed: 48, goal: 70, unit: "g" },
  { label: "Cholesterol", consumed: 180, goal: 300, unit: "mg" },
  { label: "Sodium", consumed: 2100, goal: 2300, unit: "mg" },
  { label: "Carbs", consumed: 180, goal: 260, unit: "g" },
  { label: "Protein", consumed: 92, goal: 120, unit: "g" },
  { label: "Calcium", consumed: 850, goal: 1000, unit: "mg" },
  { label: "Iron", consumed: 14, goal: 18, unit: "mg" },
  { label: "Potassium", consumed: 3400, goal: 4700, unit: "mg" },
  { label: "Calories", consumed: 1780, goal: 2200, unit: "kcal" },
]);

const sleep = reactive({
  hours: 7.4,
  quality: "Restorative",
  note: "Fell asleep quickly after evening stretch routine.",
});

const water = reactive({ consumed: 72, goal: 90 });

const today = new Date().toISOString().slice(0, 10);
const meals = ref<MealEntry[]>([
  {
    time: "08:10",
    date: today,
    name: "Greek yogurt parfait",
    calories: 320,
    location: "Campus dining",
    macros: { protein: 24, carbs: 38, fat: 9 },
  },
  {
    time: "12:35",
    date: today,
    name: "Roasted salmon bowl",
    calories: 610,
    location: "Fresh Kitchen",
    macros: { protein: 42, carbs: 48, fat: 22 },
  },
  {
    time: "15:10",
    date: today,
    name: "Protein shake",
    calories: 240,
    location: "Rec center bar",
    macros: { protein: 30, carbs: 22, fat: 6 },
  },
]);

const activities = ref<ActivityEntry[]>([
  {
    type: "Tempo run",
    duration: "32 min",
    date: new Date().toISOString().slice(0, 10),
    calories: 310,
    status: "Completed",
  },
  {
    type: "Mobility flow",
    duration: "18 min",
    date: new Date(Date.now() + 3600 * 1000 * 5).toISOString().slice(0, 10),
    calories: 90,
    status: "Planned",
  },
]);

const mealForm = reactive({
  time: "",
  name: "",
  calories: "",
  location: "",
  date: "",
  protein: "",
  carbs: "",
  fat: "",
});

const activityForm = reactive({
  type: "",
  duration: "",
  date: "",
  calories: "",
  status: "Completed" as ActivityStatus,
});

const aiStatus = ref("Idle");

// Clerk user info and a time-of-day greeting based on the client's local time
const { user, isLoaded: userLoaded } = useUser();
const firstName = computed(() => {
  const u = user.value as any;
  return (
    u?.firstName ||
    u?.first_name ||
    u?.given_name ||
    u?.name?.split?.(" ")?.[0] ||
    "Friend"
  );
});

const userId = computed(() => {
  const u = user.value as any;
  return u?.id || u?.userId || null;
});

const greeting = ref("Welcome back");

function computeGreetingForHour(hour: number) {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 21) return "Good evening";
  return "Good night";
}

function updateGreeting() {
  try {
    const now = new Date();
    const hour = now.getHours();
    greeting.value = `${computeGreetingForHour(hour)}, ${firstName.value}`;
  } catch (e) {
    greeting.value = `Welcome back, ${firstName.value}`;
  }
}

// Update when user info is available and on client mount so local time is used
onMounted(() => {
  updateGreeting();
});
watch(
  () => user.value,
  () => {
    if (userLoaded && userLoaded.value) updateGreeting();
  }
);

const gaugeOption = computed(() => ({
  tooltip: {
    formatter: "{b}: {c}%",
  },
  series: [
    {
      type: "gauge",
      startAngle: 220,
      endAngle: -40,
      min: 0,
      max: 100,
      radius: "90%",
      progress: {
        show: true,
        width: 12,
        roundCap: true,
        itemStyle: {
          color: "#ff8367",
        },
      },
      axisLine: {
        lineStyle: {
          width: 12,
          color: [[1, "rgba(255, 255, 255, 0.12)"]],
        },
      },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      pointer: {
        show: true,
        length: "70%",
        width: 5,
      },
      detail: {
        valueAnimation: true,
        fontSize: 36,
        offsetCenter: [0, "60%"],
        color: "#f8f7f4",
        formatter: "{value}%",
      },
      data: [{ value: dailyScore.value, name: "Today’s score" }],
    },
  ],
}));

const waterPercent = computed(() => {
  if (!water.goal) return 0;
  return Math.min(100, Math.round((water.consumed / water.goal) * 100));
});

const aiButtonLabel = computed(() =>
  aiStatus.value === "Idle" ? "Let AI suggest a meal" : aiStatus.value
);

const addMeal = async () => {
  if (
    !mealForm.time ||
    !mealForm.name ||
    !mealForm.calories ||
    !mealForm.location ||
    !mealForm.date
  ) {
    return;
  }

  const macros: MacroBreakdown = {
    protein: Number(mealForm.protein) || 0,
    carbs: Number(mealForm.carbs) || 0,
    fat: Number(mealForm.fat) || 0,
  };

  const entry: MealEntry = {
    time: mealForm.time,
    name: mealForm.name,
    calories: Number(mealForm.calories),
    location: mealForm.location,
    date: mealForm.date,
    macros,
  };

  meals.value.push(entry);

  if (userId.value) {
    try {
      await $fetch("/api/foods", {
        method: "POST",
        body: {
          userId: userId.value,
          itemName: entry.name,
          calories: entry.calories,
          diningEstablishment: entry.location,
          macros: entry.macros,
          dateConsumed: entry.date,
        },
      });
    } catch (error) {
      console.error("Failed to persist food entry", error);
    }
  }

  mealForm.time = "";
  mealForm.name = "";
  mealForm.calories = "";
  mealForm.location = "";
  mealForm.date = "";
  mealForm.protein = "";
  mealForm.carbs = "";
  mealForm.fat = "";
};

const addActivity = async () => {
  if (
    !activityForm.type ||
    !activityForm.duration ||
    !activityForm.calories ||
    !activityForm.date
  ) {
    return;
  }
  activities.value.push({
    type: activityForm.type,
    duration: activityForm.duration,
    date: activityForm.date,
    calories: Number(activityForm.calories),
    status: activityForm.status,
  });

  if (userId.value) {
    try {
      await $fetch("/api/activities", {
        method: "POST",
        body: {
          userId: userId.value,
          type: activityForm.type,
          duration: activityForm.duration,
          date: activityForm.date,
          calories: Number(activityForm.calories),
          status: activityForm.status,
        },
      });
    } catch (error) {
      console.error("Failed to persist activity", error);
    }
  }
  activityForm.type = "";
  activityForm.duration = "";
  activityForm.date = "";
  activityForm.calories = "";
  activityForm.status = "Completed";
};

const macroPercent = (macro: MacroEntry) =>
  Math.min(100, Math.round((macro.consumed / macro.goal) * 100));

const macroDialStyle = (macro: MacroEntry) => {
  const percent = macroPercent(macro);
  return {
    background: `conic-gradient(#ff8367 0% ${percent}%, rgba(255, 255, 255, 0.12) ${percent}% 100%)`,
  };
};

const handleAISuggestions = () => {
  aiStatus.value = "Suggestion queued…";
  setTimeout(() => {
    aiStatus.value = "Idle";
  }, 1500);
};

useSeoMeta({
  title: "Healthly | Dashboard",
  description:
    "Review your authenticated Healthly dashboard data and log meals, water, and activity.",
});
</script>

<template>
  <div class="page">
    <header class="intro">
      <div>
        <h1>{{ greeting }}</h1>
      </div>
    </header>

    <section class="dashboard-grid">
      <article class="card dial-card">
        <header>
          <p class="card__eyebrow">Daily dial</p>
          <h2>Today’s score</h2>
        </header>
        <div class="dial-card__body">
          <ClientOnly>
            <VChart class="dial-chart" :option="gaugeOption" autoresize />
          </ClientOnly>
          <div class="dial-metrics">
            <div class="mini-stat">
              <p class="mini-stat__label">Sleep</p>
              <p class="mini-stat__value">{{ sleep.hours }} hrs</p>
              <p class="mini-stat__sub">{{ sleep.quality }}</p>
            </div>
            <div class="mini-stat">
              <p class="mini-stat__label">Hydration</p>
              <p class="mini-stat__value">{{ waterPercent }}%</p>
              <p class="mini-stat__sub">
                {{ water.consumed }} / {{ water.goal }} oz
              </p>
            </div>
          </div>
        </div>
        <p class="dial-card__note">
          Score blends activity, hydration, and sleep data. Keep trending above
          85% for steady recovery.
          <br />
          <span class="dial-card__note--muted">{{ sleep.note }}</span>
        </p>
      </article>

      <article class="card macros-card">
        <header>
          <p class="card__eyebrow">Macros</p>
          <h2>Fuel targets</h2>
        </header>
        <ul>
          <li v-for="macro in macros" :key="macro.label">
            <div class="macro-row">
              <div>
                <p class="macro-row__label">{{ macro.label }}</p>
                <p class="macro-row__value">
                  {{ macro.consumed }} / {{ macro.goal }} {{ macro.unit }}
                </p>
              </div>
              <div class="macro-status">
                <span class="macro-status__percent"
                  >{{ macroPercent(macro) }}%</span
                >
                <span
                  class="macro-pill"
                  :class="{ 'macro-pill--hit': macro.consumed >= macro.goal }"
                >
                  {{ macro.consumed >= macro.goal ? "Hit" : "Tracking" }}
                </span>
              </div>
            </div>
            <div class="progress macro-progress">
              <span :style="{ width: `${macroPercent(macro)}%` }"></span>
            </div>
            <div class="macro-dial" :style="macroDialStyle(macro)">
              <span>{{ macroPercent(macro) }}%</span>
            </div>
          </li>
        </ul>
      </article>
    </section>

    <section class="stats-grid">
      <article class="card ai-card">
        <header>
          <p class="card__eyebrow">AI copilot</p>
          <h3>Need inspiration?</h3>
        </header>
        <p>
          Meals, hydration cues, and activity pairings come together via AI
          suggestions.
        </p>
        <button
          class="btn btn--secondary"
          type="button"
          :disabled="aiStatus !== 'Idle'"
          @click="handleAISuggestions"
        >
          {{ aiButtonLabel }}
        </button>
        <NuxtLink class="btn btn--blue-coral btn--stack" to="/suggestions">
          Open suggestions page
        </NuxtLink>
      </article>
    </section>

    <section class="split-grid">
      <article class="card meals-card">
        <header>
          <div>
            <p class="card__eyebrow">Meals</p>
            <h2>Logged today</h2>
          </div>
        </header>
        <ul class="meals-list">
          <li v-for="meal in meals" :key="`${meal.time}-${meal.name}`">
            <div class="meals-list__info">
              <p class="meals-list__time">{{ meal.time }}</p>
              <p class="meals-list__name">{{ meal.name }}</p>
              <p class="meals-list__meta">
                {{ meal.date }} · {{ meal.location }}
              </p>
              <p class="meals-list__macros">
                {{ meal.macros.protein }}P / {{ meal.macros.carbs }}C /
                {{ meal.macros.fat }}F
              </p>
            </div>
            <div class="meals-list__stats">
              <p class="meals-list__calories">{{ meal.calories }} cal</p>
            </div>
          </li>
        </ul>
        <form class="form" @submit.prevent="addMeal">
          <div class="form__row">
            <input
              v-model="mealForm.time"
              type="time"
              aria-label="Meal time"
              required
            />
            <input
              v-model="mealForm.date"
              type="date"
              aria-label="Date consumed"
              required
            />
          </div>
          <div class="form__row">
            <input
              v-model="mealForm.calories"
              type="number"
              min="0"
              placeholder="Calories"
              required
            />
            <input
              v-model="mealForm.location"
              type="text"
              placeholder="Dining establishment"
              required
            />
          </div>
          <div class="form__row">
            <input
              v-model="mealForm.name"
              type="text"
              placeholder="Meal description"
              required
            />
          </div>
          <div class="form__row">
            <input
              v-model="mealForm.protein"
              type="number"
              min="0"
              placeholder="Protein (g)"
            />
            <input
              v-model="mealForm.carbs"
              type="number"
              min="0"
              placeholder="Carbs (g)"
            />
            <input
              v-model="mealForm.fat"
              type="number"
              min="0"
              placeholder="Fat (g)"
            />
          </div>
          <button class="btn btn--primary" type="submit">Add meal</button>
        </form>
      </article>

      <article class="card activity-card">
        <header>
          <p class="card__eyebrow">Activity</p>
          <h2>Movement log</h2>
        </header>
        <ul class="activity-list">
          <li
            v-for="activity in activities"
            :key="`${activity.type}-${activity.date}-${activity.duration}`"
          >
            <div>
              <p class="activity-list__name">{{ activity.type }}</p>
              <p class="activity-list__meta">
                {{ activity.date }} · {{ activity.duration }}
              </p>
            </div>
            <div class="activity-list__details">
              <span
                class="activity-pill"
                :class="{
                  'activity-pill--planned': activity.status === 'Planned',
                }"
              >
                {{ activity.status }}
              </span>
              <p class="activity-list__calories">{{ activity.calories }} cal</p>
            </div>
          </li>
        </ul>
        <form class="form" @submit.prevent="addActivity">
          <div class="form__row">
            <input
              v-model="activityForm.type"
              type="text"
              placeholder="Activity type"
              required
            />
            <input
              v-model="activityForm.duration"
              type="text"
              placeholder="Duration e.g. 25 min"
              required
            />
          </div>
          <div class="form__row">
            <input
              v-model="activityForm.date"
              type="date"
              aria-label="Activity date"
              required
            />
            <input
              v-model="activityForm.calories"
              type="number"
              min="0"
              placeholder="Calories"
              required
            />
          </div>
          <div class="form__row form__row--compact">
            <select v-model="activityForm.status" aria-label="Completion state">
              <option value="Completed">Completed</option>
              <option value="Planned">Planned</option>
            </select>
          </div>
          <button class="btn btn--primary" type="submit">Log activity</button>
        </form>
      </article>
    </section>
  </div>
</template>

<style scoped>
:global(body) {
  font-family: "Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont,
    "Segoe UI", sans-serif;
  margin: 0;
  background: #05070a;
  color: #f8f7f4;
}

.page {
  min-height: 100vh;
  padding: 64px clamp(1.25rem, 5vw, 5rem) 96px;
  display: flex;
  flex-direction: column;
  gap: 56px;
}

.intro {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  align-items: center;
  justify-content: space-between;
}

.intro h1 {
  margin: 0.5rem 0 1rem;
  font-size: clamp(2.2rem, 5vw, 3.8rem);
}

.intro p {
  margin: 0;
  max-width: 640px;
  color: #d9d7d2;
}

.eyebrow,
.card__eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.28em;
  font-size: 0.75rem;
  color: #ffb08f;
  margin: 0 0 0.5rem;
}

.btn {
  border-radius: 999px;
  padding: 0.9rem 1.6rem;
  font-weight: 600;
  border: 1px solid transparent;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn--primary {
  background: linear-gradient(120deg, #ff8367, #ffc083);
  color: #111215;
  box-shadow: 0 12px 32px rgba(255, 131, 103, 0.35);
}

.btn--blue-coral {
  background: linear-gradient(120deg, #4facfe, #ff8367);
  color: #ffffff;
  box-shadow: 0 12px 32px rgba(79, 172, 254, 0.18);
  border: 1px solid transparent;
  text-decoration: none;
}

.btn--blue-coral:focus,
.btn--blue-coral:active {
  outline: none;
}

.btn--secondary {
  background: rgba(255, 255, 255, 0.08);
  color: #f8f7f4;
  border: 1px solid rgba(255, 255, 255, 0.16);
}

.btn:hover:not(:disabled) {
  transform: translateY(-2px);
}

.btn--stack {
  text-align: center;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  align-items: stretch;
}

@media (min-width: 960px) {
  .dashboard-grid {
    grid-template-columns: 1fr 2fr;
  }

  .dial-card {
    max-width: 440px;
  }
}

.card {
  border-radius: 28px;
  padding: 2rem;
  background: rgba(12, 14, 19, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.dial-card {
  min-height: 360px;
}

.dial-chart {
  width: 100%;
  height: 280px;
}

.dial-card__body {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.dial-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.75rem;
}

.mini-stat {
  padding: 0.9rem 1.1rem;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.mini-stat__label {
  margin: 0;
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #ffb08f;
}

.mini-stat__value {
  margin: 0.35rem 0 0;
  font-size: 1.6rem;
  font-weight: 600;
}

.mini-stat__sub {
  margin: 0.2rem 0 0;
  color: #b8b4ad;
}

.dial-card__note {
  margin: 0;
  color: #c5c2bc;
  font-size: 0.95rem;
}

.dial-card__note--muted {
  color: #a7a39b;
  font-size: 0.9rem;
}

.macros-card ul,
.meals-list,
.activity-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* Reserve vertical space for dynamic lists so inserting/removing items doesn't
   cause the card to resize unexpectedly. Allow scrolling when content grows. */
.meals-list,
.activity-list {
  min-height: 180px; /* room for ~3 items */
  max-height: 420px; /* prevent runaway growth */
  overflow: auto;
}

.macros-card ul {
  min-height: 140px; /* room for a few macro rows */
  max-height: 420px;
  overflow: auto;
}

.macro-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.macro-status {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.macro-status__percent {
  font-weight: 600;
  color: #ffc083;
}

.macro-row__label {
  margin: 0;
  font-size: 1rem;
}

.macro-row__value {
  margin: 0.2rem 0 0;
  color: #aea9a0;
}

.macro-pill {
  border-radius: 999px;
  padding: 0.3rem 0.85rem;
  font-size: 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.macro-pill--hit {
  background: rgba(157, 228, 197, 0.1);
  border-color: rgba(157, 228, 197, 0.6);
  color: #9de4c5;
}

.progress {
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.progress span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #ff8367, #ffc083);
}

.macro-progress {
  margin-top: 0.4rem;
}

.macro-dial {
  display: none;
  width: 90px;
  height: 90px;
  border-radius: 50%;
  align-items: center;
  justify-content: center;
  color: #f8f7f4;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.08);
  margin-top: 0.75rem;
}

.progress--thick {
  height: 12px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.25rem;
}

.ai-card {
  gap: 0.5rem;
}

.card__sub {
  margin: 0;
  color: #b8b4ad;
}

.split-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
}

.meals-list li,
.activity-list li {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.activity-list__details {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.meals-list__time,
.meals-list__meta,
.activity-list__meta {
  margin: 0;
  font-size: 0.85rem;
  color: #a7a39b;
}

.meals-list__name,
.activity-list__name {
  margin: 0;
  font-size: 1rem;
}

.meals-list__calories,
.activity-list__calories {
  margin: 0;
  color: #ffc083;
  font-weight: 600;
}

.meals-list__macros {
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
  color: #c5c2bc;
}

.meals-list__info {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.meals-list__stats {
  text-align: right;
}

.activity-pill {
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.activity-pill--planned {
  border-color: rgba(79, 172, 254, 0.8);
  color: #4facfe;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 1rem;
}

/* Skeleton / placeholder helper so you can show reserved slots while data loads */
.skeleton {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.03),
    rgba(255, 255, 255, 0.06)
  );
  border-radius: 8px;
  height: 48px;
}

.form__row {
  display: flex;
  gap: 0.75rem;
}

.form__row--compact {
  align-items: stretch;
}

input,
select {
  width: 100%;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.04);
  color: #f8f7f4;
  padding: 0.85rem 1rem;
  font-size: 0.95rem;
}

input::placeholder {
  color: rgba(248, 247, 244, 0.6);
}

input:focus,
select:focus {
  outline: 2px solid #ff8367;
  outline-offset: 1px;
}

select {
  appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, #f8f7f4 50%),
    linear-gradient(135deg, #f8f7f4 50%, transparent 50%);
  background-position: calc(100% - 20px) calc(50% - 3px),
    calc(100% - 15px) calc(50% - 3px);
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
  padding-right: 2.5rem;
}

@media (max-width: 640px) {
  .form__row {
    flex-direction: column;
  }

  .intro {
    flex-direction: column;
    align-items: flex-start;
  }

  .btn {
    width: 100%;
    text-align: center;
  }

  .macro-progress {
    display: none;
  }

  .macro-dial {
    display: flex;
    margin-left: auto;
  }
}
</style>
