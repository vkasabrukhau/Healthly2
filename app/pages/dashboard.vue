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

// Only track essential macros: calories, protein, carbs, fat, sugar, salt
const macros = ref<MacroEntry[]>([
  { label: "Calories", consumed: 0, goal: 0, unit: "kcal" },
  { label: "Protein", consumed: 0, goal: 0, unit: "g" },
  { label: "Carbs", consumed: 0, goal: 0, unit: "g" },
  { label: "Fat", consumed: 0, goal: 0, unit: "g" },
  { label: "Sugar", consumed: 0, goal: 0, unit: "g" },
  { label: "Salt", consumed: 0, goal: 0, unit: "mg" },
]);

const sleep = reactive({
  hours: 0,
  quality: "",
  note: "",
});

const water = reactive({ consumed: 0, goal: 0 });

const sleepForm = reactive({
  hours: "",
  quality: "",
  note: "",
});

const waterForm = reactive({
  consumed: "",
  goal: "",
});

const today = new Date().toISOString().slice(0, 10);
const selectedDate = ref(today);
const meals = ref<MealEntry[]>([]);
const activities = ref<ActivityEntry[]>([]);

const mealForm = reactive({
  time: "",
  name: "",
  calories: "",
  location: "",
  protein: "",
  carbs: "",
  fat: "",
});

const activityForm = reactive({
  type: "",
  duration: "",
  calories: "",
  status: "Completed" as ActivityStatus,
});

const aiStatus = ref("Idle");

const macroPercent = (macro: MacroEntry) => {
  // Avoid divide-by-zero when goals are not yet set
  if (!macro.goal || macro.goal <= 0) return 0;
  return Math.min(100, Math.round((macro.consumed / macro.goal) * 100));
};

const macroDialStyle = (macro: MacroEntry) => {
  const percent = macroPercent(macro);
  return {
    background: `conic-gradient(#4f9cff 0% ${percent}%, rgba(255, 255, 255, 0.12) ${percent}% 100%)`,
  };
};

const macroCompletion = computed(() => {
  if (!macros.value.length) return 0;
  const avg =
    macros.value.reduce((sum, macro) => sum + macroPercent(macro), 0) /
    macros.value.length;
  return avg / 100;
});

const sleepQualityMultiplier = computed(() => {
  const label = (sleep.quality || "").toLowerCase();
  if (label.includes("restor")) return 1;
  if (label.includes("good")) return 0.95;
  if (label.includes("fair")) return 0.8;
  if (label.includes("poor")) return 0.6;
  return 0.85;
});

const sleepContribution = computed(() =>
  Math.min((sleep.hours / 8) * sleepQualityMultiplier.value, 1)
);

const exerciseCompletion = computed(() => {
  const completed = activities.value.filter(
    (a) => a.status === "Completed"
  ).length;
  return Math.min(completed / 2, 1);
});

const eatingCompletion = computed(() => Math.min(meals.value.length / 4, 1));

const dailyScore = computed(() => {
  const weighted =
    sleepContribution.value * 0.25 +
    macroCompletion.value * 0.35 +
    exerciseCompletion.value * 0.2 +
    eatingCompletion.value * 0.2;

  return Math.round(weighted * 100);
});

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
  tooltip: { formatter: "{b}: {c}" },
  series: [
    {
      type: "gauge",
      startAngle: 90,
      endAngle: -270,
      min: 0,
      max: 100,
      radius: "90%",
      pointer: { show: false },
      progress: {
        show: true,
        overlap: false,
        roundCap: true,
        clip: false,
        width: 14,
        itemStyle: {
          color: "#4f9cff",
        },
      },
      axisLine: {
        lineStyle: {
          width: 14,
          color: [[1, "rgba(255, 255, 255, 0.08)"]],
        },
      },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      detail: {
        valueAnimation: true,
        offsetCenter: [0, 0],
        fontSize: 42,
        color: "#f8f7f4",
        formatter: (val: number) => `${val}%`,
      },
      data: [{ value: dailyScore.value, name: "Today’s Index" }],
    },
  ],
}));

const waterPercent = computed(() => {
  if (!water.goal) return 0;
  return Math.min(100, Math.round((water.consumed / water.goal) * 100));
});

const normalizeDayString = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return today;
  }
  return parsed.toISOString().slice(0, 10);
};

const isMealsLoading = ref(false);
const isActivitiesLoading = ref(false);

const fetchMealsForDay = async () => {
  if (!userId.value || !selectedDate.value) return;
  isMealsLoading.value = true;
  try {
    const response = await $fetch(`/api/foods/${userId.value}`, {
      params: { date: selectedDate.value },
    });
    const items = Array.isArray((response as any)?.items)
      ? (response as any).items
      : [];
    meals.value = items.map((item: any) => ({
      time: item.time || "--:--",
      name: item.itemName || item.name || "Meal",
      calories: Number(item.calories) || 0,
      location: item.diningEstablishment || "Unknown",
      date:
        item.dayKey ||
        normalizeDayString(item.dateConsumed || selectedDate.value),
      macros: {
        protein: Number(item.macros?.protein ?? 0),
        carbs: Number(item.macros?.carbs ?? 0),
        fat: Number(item.macros?.fat ?? 0),
      },
    }));
  } catch (error) {
    if (process.dev) console.error("Failed to load meals", error);
    meals.value = [];
  } finally {
    isMealsLoading.value = false;
  }
};

const fetchActivitiesForDay = async () => {
  if (!userId.value || !selectedDate.value) return;
  isActivitiesLoading.value = true;
  try {
    const response = await $fetch(`/api/activities/${userId.value}`, {
      params: { date: selectedDate.value },
    });
    const items = Array.isArray((response as any)?.items)
      ? (response as any).items
      : [];
    activities.value = items.map((item: any) => ({
      type: item.type || "Activity",
      duration: item.duration || "",
      date: item.dayKey || normalizeDayString(item.date || selectedDate.value),
      calories: Number(item.calories) || 0,
      status: item.status === "Planned" ? "Planned" : "Completed",
    }));
  } catch (error) {
    if (process.dev) console.error("Failed to load activities", error);
    activities.value = [];
  } finally {
    isActivitiesLoading.value = false;
  }
};

// Sleep & water loaders (defined here so they're available to the watchers below)
const isSleepLoading = ref(false);
const isWaterLoading = ref(false);

const fetchSleepForDay = async () => {
  if (!userId.value || !selectedDate.value) return;
  isSleepLoading.value = true;
  try {
    const response = await $fetch(`/api/sleep/${userId.value}`, {
      params: { date: selectedDate.value },
    });
    const entry = (response as any)?.entry;
    if (entry) {
      sleep.hours = Number(entry.hours) || 0;
      sleep.quality = entry.quality || "";
      sleep.note = entry.note || "";
    } else {
      sleep.hours = 0;
      sleep.quality = "";
      sleep.note = "";
    }
    sleepForm.hours = sleep.hours ? String(sleep.hours) : "";
    sleepForm.quality = sleep.quality;
    sleepForm.note = sleep.note;
  } catch (error) {
    if (process.dev) console.error("Failed to load sleep", error);
  } finally {
    isSleepLoading.value = false;
  }
};

const fetchWaterForDay = async () => {
  if (!userId.value || !selectedDate.value) return;
  isWaterLoading.value = true;
  try {
    const response = await $fetch(`/api/water/${userId.value}`, {
      params: { date: selectedDate.value },
    });
    const entry = (response as any)?.entry;
    if (entry) {
      water.consumed = Number(entry.consumed) || 0;
      water.goal = Number(entry.goal) || 0;
    } else {
      water.consumed = 0;
      water.goal = 0;
    }
    waterForm.consumed = water.consumed ? String(water.consumed) : "";
    waterForm.goal = water.goal ? String(water.goal) : "";
  } catch (error) {
    if (process.dev) console.error("Failed to load water", error);
  } finally {
    isWaterLoading.value = false;
  }
};

watch(
  () => selectedDate.value,
  (val) => {
    if (!val) {
      selectedDate.value = today;
      return;
    }
    const normalized = normalizeDayString(val);
    if (normalized !== val) {
      selectedDate.value = normalized;
    }
  }
);

watch(
  () => [userId.value, selectedDate.value],
  ([uid, day]) => {
    if (uid && day) {
      fetchMealsForDay();
      fetchActivitiesForDay();
      fetchSleepForDay();
      fetchWaterForDay();
    } else {
      meals.value = [];
      activities.value = [];
      sleep.hours = 0;
      sleep.quality = "";
      sleep.note = "";
      sleepForm.hours = "";
      sleepForm.quality = "";
      sleepForm.note = "";
      water.consumed = 0;
      water.goal = 0;
      waterForm.consumed = "";
      waterForm.goal = "";
    }
  },
  { immediate: true }
);

const addMeal = async () => {
  if (
    !mealForm.time ||
    !mealForm.name ||
    !mealForm.calories ||
    !mealForm.location
  ) {
    return;
  }

  const activeDate = selectedDate.value || today;

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
    date: activeDate,
    macros,
  };

  if (!userId.value) {
    return;
  }

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
        time: entry.time,
      },
    });
    await fetchMealsForDay();
  } catch (error) {
    console.error("Failed to persist food entry", error);
  }

  mealForm.time = "";
  mealForm.name = "";
  mealForm.calories = "";
  mealForm.location = "";
  mealForm.protein = "";
  mealForm.carbs = "";
  mealForm.fat = "";
};

const addActivity = async () => {
  if (!activityForm.type || !activityForm.duration || !activityForm.calories) {
    return;
  }

  const activeDate = selectedDate.value || today;

  if (!userId.value) {
    return;
  }

  try {
    await $fetch("/api/activities", {
      method: "POST",
      body: {
        userId: userId.value,
        type: activityForm.type,
        duration: activityForm.duration,
        date: activeDate,
        calories: Number(activityForm.calories),
        status: activityForm.status,
      },
    });
    await fetchActivitiesForDay();
  } catch (error) {
    console.error("Failed to persist activity", error);
  }

  activityForm.type = "";
  activityForm.duration = "";
  activityForm.calories = "";
  activityForm.status = "Completed";
};

const saveSleep = async () => {
  if (!userId.value || !sleepForm.hours || !sleepForm.quality) {
    return;
  }
  try {
    await $fetch("/api/sleep", {
      method: "POST",
      body: {
        userId: userId.value,
        date: selectedDate.value,
        hours: Number(sleepForm.hours),
        quality: sleepForm.quality,
        note: sleepForm.note,
      },
    });
    await fetchSleepForDay();
  } catch (error) {
    console.error("Failed to save sleep", error);
  }
};

const saveWater = async () => {
  if (!userId.value || !waterForm.goal || !waterForm.consumed) {
    return;
  }
  try {
    await $fetch("/api/water", {
      method: "POST",
      body: {
        userId: userId.value,
        date: selectedDate.value,
        consumed: Number(waterForm.consumed),
        goal: Number(waterForm.goal),
      },
    });
    await fetchWaterForDay();
  } catch (error) {
    console.error("Failed to save water", error);
  }
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
  <SignedIn>
    <div class="page">
      <header class="intro">
        <div>
          <h1>{{ greeting }}</h1>
        </div>
        <div class="day-selector">
          <label for="day-picker">Viewing date</label>
          <input id="day-picker" type="date" v-model="selectedDate" />
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
            Index blends sleep quality, macro consistency, completed movement,
            and logged meals. Keep trending above 85% for steady recovery.
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
        <article class="card sleep-card">
          <header>
            <p class="card__eyebrow">Sleep</p>
            <h3 v-if="!isSleepLoading">{{ sleep.hours }} hrs</h3>
            <h3 v-else>Loading…</h3>
          </header>
          <p class="card__sub">
            {{ sleep.quality || "Add today’s quality when you’re ready." }}
          </p>
          <p>{{ sleep.note || "No note for this day yet." }}</p>
          <form class="form" @submit.prevent="saveSleep">
            <div class="form__row">
              <input
                v-model="sleepForm.hours"
                type="number"
                step="0.1"
                min="0"
                placeholder="Hours slept"
                required
              />
              <select v-model="sleepForm.quality" required>
                <option value="" disabled>Select quality</option>
                <option>Restorative</option>
                <option>Good</option>
                <option>Fair</option>
                <option>Poor</option>
              </select>
            </div>
            <div class="form__row">
              <input
                v-model="sleepForm.note"
                type="text"
                placeholder="Optional note"
              />
            </div>
            <button class="btn btn--secondary" type="submit">Save sleep</button>
          </form>
        </article>

        <article class="card water-card">
          <header>
            <p class="card__eyebrow">Hydration</p>
            <h3 v-if="!isWaterLoading">
              {{ water.consumed }} / {{ water.goal }} oz
            </h3>
            <h3 v-else>Loading…</h3>
          </header>
          <div class="progress progress--thick">
            <span :style="{ width: `${waterPercent}%` }"></span>
          </div>
          <p class="card__sub">
            <template v-if="water.goal">
              {{ Math.max(water.goal - water.consumed, 0) }} oz remaining
            </template>
            <template v-else>Set a target to view progress</template>
          </p>
          <form class="form" @submit.prevent="saveWater">
            <div class="form__row">
              <input
                v-model="waterForm.consumed"
                type="number"
                min="0"
                placeholder="Consumed (oz)"
                required
              />
              <input
                v-model="waterForm.goal"
                type="number"
                min="0"
                placeholder="Goal (oz)"
                required
              />
            </div>
            <button class="btn btn--secondary" type="submit">
              Save hydration
            </button>
          </form>
        </article>

        <article class="card ai-card">
          <header>
            <p class="card__eyebrow">AI copilot</p>
            <h3>Need inspiration?</h3>
          </header>
          <p>
            Meals, hydration cues, and activity pairings come together via AI
            suggestions.
          </p>
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
            <li v-if="isMealsLoading" class="list-placeholder">
              Loading meals for {{ selectedDate }}…
            </li>
            <li v-else-if="!meals.length" class="list-placeholder">
              No meals logged for {{ selectedDate }}.
            </li>
            <template v-else>
              <li
                v-for="meal in meals"
                :key="`${meal.time}-${meal.name}-${meal.date}`"
              >
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
            </template>
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
                v-model="mealForm.calories"
                type="number"
                min="0"
                placeholder="Calories"
                required
              />
            </div>
            <div class="form__row">
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
            <div class="form__actions">
              <button
                class="btn btn--primary"
                type="submit"
                aria-label="Add meal"
              >
                Add Meal
              </button>
              <NuxtLink
                to="/suggestions"
                class="btn btn--ai"
                aria-label="AI meal suggestions"
              >
                AI Meal Suggestions
              </NuxtLink>
            </div>
          </form>
        </article>

        <article class="card activity-card">
          <header>
            <p class="card__eyebrow">Activity</p>
            <h2>Movement log</h2>
          </header>
          <ul class="activity-list">
            <li v-if="isActivitiesLoading" class="list-placeholder">
              Loading activity for {{ selectedDate }}…
            </li>
            <li v-else-if="!activities.length" class="list-placeholder">
              No workouts logged for {{ selectedDate }}.
            </li>
            <template v-else>
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
                  <p class="activity-list__calories">
                    {{ activity.calories }} cal
                  </p>
                </div>
              </li>
            </template>
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
            <div class="form__row form__row--date-note">
              <input
                v-model="activityForm.calories"
                type="number"
                min="0"
                placeholder="Calories"
                required
              />
            </div>
            <div class="form__row form__row--compact">
              <select
                v-model="activityForm.status"
                aria-label="Completion state"
              >
                <option value="Completed">Completed</option>
                <option value="Planned">Planned</option>
              </select>
            </div>
            <div class="form__actions form__actions--single">
              <button class="btn btn--primary" type="submit">
                Log activity
              </button>
            </div>
          </form>
        </article>
      </section>
    </div>
  </SignedIn>

  <SignedOut>
    <!-- If the user is signed out, immediately redirect to Clerk hosted sign-in -->
    <RedirectToSignIn />
  </SignedOut>
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

.day-selector {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 220px;
}

.day-selector label {
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-size: 0.7rem;
  color: #ffb08f;
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
  background: linear-gradient(120deg, #4f9cff, #3b6fe1);
  color: #f5fbff;
  box-shadow: 0 12px 32px rgba(63, 121, 228, 0.35);
}

.btn--blue-coral {
  background: linear-gradient(120deg, #7acbff, #4f9cff);
  color: #041426;
  box-shadow: 0 12px 32px rgba(74, 169, 255, 0.25);
  border: 1px solid rgba(79, 156, 255, 0.4);
  text-decoration: none;
}

.btn--blue-coral:focus,
.btn--blue-coral:active {
  outline: none;
}

.btn--secondary {
  background: rgba(79, 156, 255, 0.15);
  color: #dfe9ff;
  border: 1px solid rgba(79, 156, 255, 0.4);
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

/* Make the meals and activity cards slightly more compact vertically */
.meals-card,
.activity-card {
  padding: 1.25rem;
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
  min-height: 120px; /* reduced to shrink card height */
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

.activity-card,
.meals-card {
  display: flex;
  flex-direction: column;
  height: 100%;
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

.activity-card .activity-list {
  flex-grow: 1;
}

.activity-card .form {
  margin-top: auto;
}

/* Ensure meals card behaves the same as activity: the list grows and the form
   is anchored to the bottom so there's no awkward gap under inputs */
.meals-card {
  min-height: 0; /* allow card to shrink below content if necessary */
}
.activity-card {
  min-height: 0;
}
.meals-card .meals-list {
  flex-grow: 1;
}
.meals-card .form {
  margin-top: auto;
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
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.form__row--date-note {
  align-items: stretch;
}

.form__actions {
  display: flex;
  flex-wrap: nowrap;
  gap: 0.5rem;
  justify-content: flex-start;
  margin-top: 0.25rem;
  align-items: center;
}

/* Make action buttons share the full row equally (50/50) */
.form__actions > * {
  flex: 1 1 0;
  min-width: 0; /* allow shrinking inside gap */
}
.form__actions .btn {
  width: 100%;
  height: 40px; /* match input height for visual alignment */
  padding: 0 0.75rem;
}

.date-note {
  border: 1px dashed rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  padding: 0.5rem 0.9rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 150px;
}

.date-note span {
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-size: 0.7rem;
  color: #b8b4ad;
}

.date-note strong {
  margin-top: 0.2rem;
  font-size: 1rem;
  color: #f8f7f4;
}

.list-placeholder {
  padding: 0.35rem 0;
  color: #a7a39b;
  font-style: italic;
  display: block;
  border-bottom: none;
}

.btn--ai {
  background: linear-gradient(
    120deg,
    #ff7a9a,
    #ffb86b
  ); /* standout warm gradient */
  color: #ffffff !important;
  box-shadow: 0 12px 32px rgba(255, 138, 121, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.06);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  text-decoration: none; /* remove underline */
}

.form__actions--single {
  justify-content: flex-end;
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
  gap: 0.5rem;
  align-items: center;
}

/* Ensure each input in a row shares available space and stretches to the same height
   so inputs across sibling cards align vertically */
.form__row > * {
  flex: 1 1 0;
  min-width: 0;
  display: block;
}

/* Consistent, slightly smaller input/select height to reduce vertical footprint */
input,
select {
  height: 40px;
}

.form__row--compact {
  align-items: stretch;
}

input,
select {
  width: 100%;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: #f8f7f4;
  padding: 0.45rem 0.75rem;
  font-size: 0.92rem;
  box-sizing: border-box;
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

  .day-selector {
    width: 100%;
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
