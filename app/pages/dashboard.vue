<script setup lang="ts">
import { computed, reactive, ref, onMounted, watch } from "vue";
import { useUser } from "#imports";

// Core reactive state (empty/default) — replace/populate from real user data when available
const dailyScore = ref(0);

const macros = ref<
  Array<{ label: string; consumed: number; goal: number; unit?: string }>
>([]); // Array of macros

const sleep = reactive({ hours: 0, quality: "", note: "" });

const water = reactive({ consumed: 0, goal: 0 });

const meals = ref<Array<{ time: string; name: string; calories: number }>>([]); // Array of meals

const activities = ref<
  Array<{ name: string; duration: string; calories: number }>
>([]); // Array of activities

const mealForm = reactive({
  time: "",
  name: "",
  calories: "",
});

const activityForm = reactive({
  name: "",
  duration: "",
  calories: "",
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

const waterRemaining = computed(() => {
  if (!water.goal) return 0;
  return Math.max(water.goal - water.consumed, 0);
});

const aiButtonLabel = computed(() =>
  aiStatus.value === "Idle" ? "Let AI suggest a meal" : aiStatus.value
);

const addMeal = () => {
  if (!mealForm.time || !mealForm.name || !mealForm.calories) {
    return;
  }
  meals.value.push({
    time: mealForm.time,
    name: mealForm.name,
    calories: Number(mealForm.calories),
  });
  mealForm.time = "";
  mealForm.name = "";
  mealForm.calories = "";
};

const addActivity = () => {
  if (!activityForm.name || !activityForm.duration || !activityForm.calories) {
    return;
  }
  activities.value.push({
    name: activityForm.name,
    duration: activityForm.duration,
    calories: Number(activityForm.calories),
  });
  activityForm.name = "";
  activityForm.duration = "";
  activityForm.calories = "";
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
        <ClientOnly>
          <VChart class="dial-chart" :option="gaugeOption" autoresize />
        </ClientOnly>
        <p class="dial-card__note">
          Score blends activity, hydration, and sleep data. Keep trending above
          85% for steady recovery.
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
                  {{ macro.consumed }} / {{ macro.goal }}{{ macro.unit }}
                </p>
              </div>
              <span
                class="macro-pill"
                :class="{ 'macro-pill--hit': macro.consumed >= macro.goal }"
              >
                {{ macro.consumed >= macro.goal ? "Hit" : "Tracking" }}
              </span>
            </div>
            <div class="progress">
              <span
                :style="{
                  width: `${Math.min(
                    (macro.consumed / macro.goal) * 100,
                    100
                  )}%`,
                }"
              ></span>
            </div>
          </li>
        </ul>
      </article>
    </section>

    <section class="stats-grid">
      <article class="card sleep-card">
        <header>
          <p class="card__eyebrow">Sleep</p>
          <h3>{{ sleep.hours }} hrs</h3>
        </header>
        <p class="card__sub">{{ sleep.quality }}</p>
        <p>{{ sleep.note }}</p>
      </article>

      <article class="card water-card">
        <header>
          <p class="card__eyebrow">Hydration</p>
          <h3>{{ water.consumed }} / {{ water.goal }} oz</h3>
        </header>
        <div class="progress progress--thick">
          <span :style="{ width: `${waterPercent}%` }"></span>
        </div>
        <p class="card__sub">{{ waterRemaining }} oz remaining today</p>
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
        <button
          class="btn btn--secondary"
          type="button"
          :disabled="aiStatus !== 'Idle'"
          @click="handleAISuggestions"
        >
          {{ aiButtonLabel }}
        </button>
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
            <p class="meals-list__time">{{ meal.time }}</p>
            <div>
              <p class="meals-list__name">{{ meal.name }}</p>
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
              v-model="mealForm.calories"
              type="number"
              min="0"
              placeholder="Calories"
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
            :key="`${activity.name}-${activity.duration}`"
          >
            <div>
              <p class="activity-list__name">{{ activity.name }}</p>
              <p class="activity-list__meta">{{ activity.duration }}</p>
            </div>
            <p class="activity-list__calories">{{ activity.calories }} cal</p>
          </li>
        </ul>
        <form class="form" @submit.prevent="addActivity">
          <div class="form__row">
            <input
              v-model="activityForm.name"
              type="text"
              placeholder="Activity name"
              required
            />
          </div>
          <div class="form__row">
            <input
              v-model="activityForm.duration"
              type="text"
              placeholder="Duration e.g. 25 min"
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

.btn--secondary {
  background: rgba(255, 255, 255, 0.08);
  color: #f8f7f4;
  border: 1px solid rgba(255, 255, 255, 0.16);
}

.btn:hover:not(:disabled) {
  transform: translateY(-2px);
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
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
  min-height: 420px;
}

.dial-chart {
  width: 100%;
  height: 280px;
}

.dial-card__note {
  margin: 0;
  color: #c5c2bc;
  font-size: 0.95rem;
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

.progress--thick {
  height: 12px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.25rem;
}

.sleep-card,
.water-card,
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

.meals-list__time,
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

input {
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

input:focus {
  outline: 2px solid #ff8367;
  outline-offset: 1px;
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
}
</style>
