<script setup lang="ts">
import { computed, reactive, ref, onMounted, watch } from "vue";
import { useUser } from "#imports";
// Ensure echarts runtime pieces are registered so VChart can render on this page
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { GaugeChart } from "echarts/charts";
import * as echartsComponents from "echarts/components";

// Register renderer, charts and all exported components defensively (cast to any
// to accommodate variations between echarts package versions).
use([
  CanvasRenderer,
  GaugeChart,
  ...Object.values(echartsComponents as any),
] as any);

definePageMeta({
  middleware: [
    // cast the named middleware to the NavigationGuard type so TS accepts the string name
    "require-onboarding" as unknown as import("vue-router").NavigationGuard,
  ],
});

// Core reactive state (empty/default) — replace/populate from real user data when available
type MacroKey = "calories" | "protein" | "carbs" | "fat" | "sugar" | "sodium";

type MacroEntry = {
  key: MacroKey;
  label: string;
  consumed: number;
  goal: number;
  unit: string;
};

type MacroBreakdown = {
  protein: number;
  carbs: number;
  fat: number;
  sugar: number;
  sodium: number;
};

type DayMetricsDoc = {
  date: string;
  metrics: Record<string, number> | null;
  completionPercent?: number | null;
};

type MealEntry = {
  id?: string;
  time: string;
  name: string;
  calories: number;
  location: string;
  date: string;
  macros: MacroBreakdown;
  portion: string;
  mealClass: string;
};

type ActivityStatus = "Completed" | "Planned";

type ActivityEntry = {
  id?: string;
  type: string;
  duration: string;
  date: string;
  calories: number;
  status: ActivityStatus;
  plannedAt?: string;
  completedAt?: string;
};

// Baseline metrics provided by the server (persisted `baselineMetrics` on the user)
const baseline = ref<Record<string, number> | null>(null);

// Base macro goals derived from baseline when available, otherwise fall back to sane defaults.
const baseMacroGoals = computed<
  Array<{ key: MacroKey; label: string; goal: number; unit: string }>
>(() => {
  const b = baseline.value;
  return [
    {
      key: "calories",
      label: "Calories",
      goal: Number(b?.calories ?? 2200),
      unit: "kcal",
    },
    {
      key: "protein",
      label: "Protein",
      goal: Number(b?.protein ?? 120),
      unit: "g",
    },
    { key: "carbs", label: "Carbs", goal: Number(b?.carbs ?? 260), unit: "g" },
    { key: "fat", label: "Fat", goal: Number(b?.fat ?? 70), unit: "g" },
    { key: "sugar", label: "Sugar", goal: Number(b?.sugar ?? 55), unit: "g" },
    {
      key: "sodium",
      label: "Sodium",
      goal: Number(b?.sodium ?? 2300),
      unit: "mg",
    },
  ];
});

// Day-specific metrics for the currently selected day (only today's metrics are auto-generated)
const dayMetrics = ref<DayMetricsDoc | null>(null);

function metricsToGoals(
  metrics: Record<string, number> | null
): Array<{ key: MacroKey; label: string; goal: number; unit: string }> {
  const m = metrics ?? {};
  return [
    {
      key: "calories",
      label: "Calories",
      goal: Number(m?.calories ?? 2200),
      unit: "kcal",
    },
    {
      key: "protein",
      label: "Protein",
      goal: Number(m?.protein ?? 120),
      unit: "g",
    },
    { key: "carbs", label: "Carbs", goal: Number(m?.carbs ?? 260), unit: "g" },
    { key: "fat", label: "Fat", goal: Number(m?.fat ?? 70), unit: "g" },
    { key: "sugar", label: "Sugar", goal: Number(m?.sugar ?? 55), unit: "g" },
    {
      key: "sodium",
      label: "Sodium",
      goal: Number(m?.sodium ?? 2300),
      unit: "mg",
    },
  ];
}

const macros = computed<MacroEntry[]>(() => {
  const totals = meals.value.reduce(
    (acc, meal) => {
      acc.calories += meal.calories || 0;
      acc.protein += meal.macros?.protein || 0;
      acc.carbs += meal.macros?.carbs || 0;
      acc.fat += meal.macros?.fat || 0;
      acc.sugar += meal.macros?.sugar || 0;
      acc.sodium += meal.macros?.sodium || 0;
      return acc;
    },
    {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      sugar: 0,
      sodium: 0,
    } as Record<MacroKey, number>
  );

  // If the user has day-specific metrics for today, prefer them for the dashboard
  const useDay =
    isToday.value && !!dayMetrics.value && !!dayMetrics.value.metrics;
  const activeGoals = useDay
    ? metricsToGoals(dayMetrics.value!.metrics)
    : baseMacroGoals.value;
  return activeGoals.map((goal) => ({
    ...goal,
    consumed: Number(totals[goal.key as MacroKey].toFixed(1)),
  }));
});

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

const weight = reactive({
  today: null as number | null,
  yesterday: null as number | null,
});
const weightForm = reactive({ weight: "" });
const isWeightLoading = ref(false);

const getToday = () => new Date().toISOString().slice(0, 10);
const todayRef = ref(getToday());
const selectedDate = ref(todayRef.value);
// Only allow submissions for today's date
const isToday = computed(() => selectedDate.value === todayRef.value);
const meals = ref<MealEntry[]>([]);
const activities = ref<ActivityEntry[]>([]);
const mealPlanMode = ref<"cut" | "maintain" | "bulk">("maintain");
// When the profile is loaded from the server we assign `mealPlanMode` programmatically.
// Use this flag to suppress the watch that persists the value (and triggers regeneration)
// so that loading the existing value from MongoDB doesn't cause an OpenRouter call.
const suppressMealPlanPersist = ref(false);

const mealForm = reactive({
  time: "",
  name: "",
  calories: "",
  location: "",
  portion: "",
  mealClass: "",
  protein: "",
  carbs: "",
  fat: "",
  sugar: "",
  sodium: "",
});

const mealFormStage = ref<"source" | "details">("source");
const mealFormSource = ref<"duke" | "custom" | null>(null);

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

const completionSavedAt = ref<Date | null>(null);
const lastSavedCompletionPercent = ref<number | null>(null);

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

// Compute a robust user id from several possible Clerk shapes. Some Clerk
// payloads use `id`, others `userId` or `sub` depending on server/client/context.
const userId = computed(() => {
  const u = user.value as any;
  return (
    u?.id ||
    u?.userId ||
    u?.sub ||
    u?.user_id ||
    // fallback to `primaryEmailAddress` id if Clerk returns nested shape
    (u?.primaryEmailAddress && u?.primaryEmailAddress?.id) ||
    null
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
// Debugging: log user payload changes so we can see which property holds the id
watch(
  () => user.value,
  (val) => {
    if (process.dev) {
      // eslint-disable-next-line no-console
      console.info("[debug] useUser payload:", val);
      // eslint-disable-next-line no-console
      console.info("[debug] computed userId:", userId.value);
    }
  },
  { immediate: true }
);

// Load the persisted profile (baseline metrics) when we get a userId
watch(
  () => userId.value,
  (uid) => {
    if (uid) {
      fetchUserProfile();
    } else {
      baseline.value = null;
    }
  },
  { immediate: true }
);
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
      // hide the caption label so only the numeric detail is shown
      data: [{ value: dailyScore.value, name: "" }],
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
    return todayRef.value;
  }
  return parsed.toISOString().slice(0, 10);
};

const isMealsLoading = ref(false);
const isActivitiesLoading = ref(false);

const fetchMealsForDay = async () => {
  if (!userId.value || !selectedDate.value) return;
  isMealsLoading.value = true;
  try {
    const url = `/api/foods/${userId.value}`;
    if (process.dev) {
      // eslint-disable-next-line no-console
      console.info("[debug] fetchMealsForDay ->", {
        url,
        date: selectedDate.value,
        userId: userId.value,
      });
    }
    const response = await $fetch(url, {
      params: { date: selectedDate.value },
    });
    const items = Array.isArray((response as any)?.items)
      ? (response as any).items
      : [];
    if (process.dev) {
      // eslint-disable-next-line no-console
      console.info("[debug] fetchMealsForDay response items", items.length);
    }

    meals.value = items.map((item: any) => ({
      id: item.id || item._id?.toString?.(),
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
        sugar: Number(item.macros?.sugar ?? 0),
        sodium: Number(item.macros?.sodium ?? 0),
      },
      portion: item.portion || "",
      mealClass: item.mealClass || "",
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
    const url = `/api/activities/${userId.value}`;
    if (process.dev) {
      // eslint-disable-next-line no-console
      console.info("[debug] fetchActivitiesForDay ->", {
        url,
        date: selectedDate.value,
        userId: userId.value,
      });
    }
    const response = await $fetch(url, {
      params: { date: selectedDate.value },
    });
    const items = Array.isArray((response as any)?.items)
      ? (response as any).items
      : [];
    if (process.dev) {
      // eslint-disable-next-line no-console
      console.info(
        "[debug] fetchActivitiesForDay response items",
        items.length
      );
    }
    activities.value = items.map((item: any) => ({
      id: item.id || item._id?.toString?.(),
      type: item.type || "Activity",
      duration: item.duration || "",
      date: item.dayKey || normalizeDayString(item.date || selectedDate.value),
      calories: Number(item.calories) || 0,
      status: item.status === "Planned" ? "Planned" : "Completed",
      plannedAt: item.plannedAt,
      completedAt: item.completedAt,
    }));
    try {
      await fetchUserProfile(selectedDate.value);
    } catch (refreshErr) {
      if (process.dev)
        console.warn("Failed to refresh profile after activities", refreshErr);
    }
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

// Fetch the persistent user profile (macro baselines + water goal)
async function fetchUserProfile(dateOverride?: string) {
  if (!userId.value) return;
  const dateParam = dateOverride || selectedDate.value;
  try {
    if (process.dev)
      console.info(
        "[debug] fetchUserProfile ->",
        userId.value,
        "date",
        dateParam
      );
    const resp: any = await $fetch(`/api/users/${userId.value}`, {
      params: { date: dateParam as unknown as number },
    });
    const profile = resp?.profile ?? null;
    baseline.value = profile?.baselineMacros ?? null;

    if (profile?.dayMetrics) {
      dayMetrics.value = profile.dayMetrics;
    } else if (baseline.value) {
      dayMetrics.value = {
        date: dateParam,
        metrics: baseline.value,
        completionPercent: null,
      };
    } else {
      dayMetrics.value = null;
    }

    if (
      dayMetrics.value &&
      dayMetrics.value.date === todayRef.value &&
      typeof dayMetrics.value.completionPercent === "number"
    ) {
      completionSavedAt.value = new Date();
      lastSavedCompletionPercent.value = dayMetrics.value.completionPercent;
    } else if (dateParam === todayRef.value) {
      completionSavedAt.value = null;
      lastSavedCompletionPercent.value = null;
    }

    if (
      typeof profile?.waterGoal === "number" &&
      (!water.goal || water.goal === 0)
    ) {
      water.goal = Number(profile.waterGoal);
      waterForm.goal = water.goal ? String(water.goal) : "";
    }
  } catch (err) {
    if (process.dev) console.error("Failed to load user profile", err);
    baseline.value = null;
  }
}

// Load weight for selected day and previous day (for delta comparison)

watch(
  () => selectedDate.value,
  (val) => {
    if (!val) {
      selectedDate.value = todayRef.value;
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
    if (process.dev) {
      // eslint-disable-next-line no-console
      console.info("[debug] watch triggered - uid/day", uid, day);
    }
    if (uid && day) {
      fetchUserProfile(day);
      fetchMealsForDay();
      fetchActivitiesForDay();
      fetchSleepForDay();
      fetchWaterForDay();
      fetchWeightForDay();
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
      weight.today = null;
      weight.yesterday = null;
      weightForm.weight = "";
    }
  },
  { immediate: true }
);

async function fetchWeightForDay() {
  if (!userId.value || !selectedDate.value) return;
  isWeightLoading.value = true;
  try {
    const response = await $fetch(`/api/weight/${userId.value}`, {
      params: { date: selectedDate.value },
    });
    const today = (response as any)?.today;
    const previous = (response as any)?.previous;
    // API returns today's weight as the user's currentWeight (preferred)
    if (typeof today === "number") {
      weight.today = Number(today);
    } else if ((response as any)?.entry) {
      // fallback to historical entry if currentWeight is not set
      weight.today = Number((response as any).entry.weight);
    } else {
      weight.today = null;
    }
    weight.yesterday = previous ? Number(previous.weight) : null;
    weightForm.weight = weight.today != null ? String(weight.today) : "";
  } catch (error) {
    if (process.dev) console.error("Failed to load weight", error);
  } finally {
    isWeightLoading.value = false;
  }
}

const addMeal = async () => {
  if (mealFormStage.value !== "details" || !mealFormSource.value) {
    return;
  }

  if (!isToday.value) {
    // protect client-side: disallow submitting for non-today dates
    if (process.dev)
      console.warn("Attempted to add meal for non-today date, blocked");
    return;
  }

  const isCustomMeal = mealFormSource.value === "custom";

  if (
    !mealForm.time ||
    !mealForm.name ||
    !mealForm.location ||
    (isCustomMeal && !mealForm.calories)
  ) {
    return;
  }

  const activeDate = selectedDate.value || todayRef.value;

  const macros: MacroBreakdown = {
    protein: Number(mealForm.protein) || 0,
    carbs: Number(mealForm.carbs) || 0,
    fat: Number(mealForm.fat) || 0,
    sugar: Number(mealForm.sugar) || 0,
    sodium: Number(mealForm.sodium) || 0,
  };

  const entry: MealEntry = {
    time: mealForm.time,
    name: mealForm.name,
    calories: Number(mealForm.calories) || 0,
    location: mealForm.location,
    date: activeDate,
    macros,
    portion: mealForm.portion,
    mealClass: mealForm.mealClass,
  };

  if (!userId.value) {
    return;
  }

  try {
    const res: any = await $fetch("/api/foods", {
      method: "POST",
      body: {
        userId: userId.value,
        itemName: entry.name,
        calories: entry.calories,
        diningEstablishment: entry.location,
        macros: entry.macros,
        dateConsumed: entry.date,
        time: entry.time,
        portion: entry.portion,
        mealClass: entry.mealClass,
      },
    });

    // Optimistically add the new meal to the UI so the list updates immediately.
    try {
      (entry as any).id = res?.insertedId?.toString?.() ?? res?.insertedId;
      meals.value = [entry, ...meals.value];
    } catch (e) {
      // ignore optimistic update errors
    }

    // Refresh the canonical list from the server to ensure ordering and fields
    await fetchMealsForDay();
  } catch (error) {
    console.error("Failed to persist food entry", error);
  }

  resetMealFormFlow();
};

const addActivity = async () => {
  if (!activityForm.type || !activityForm.duration || !activityForm.calories) {
    return;
  }

  if (!isToday.value) {
    if (process.dev)
      console.warn("Attempted to add activity for non-today date, blocked");
    return;
  }

  const activeDate = selectedDate.value || todayRef.value;

  if (!userId.value) {
    return;
  }

  try {
    const res: any = await $fetch("/api/activities", {
      method: "POST",
      body: {
        userId: userId.value,
        type: activityForm.type,
        duration: activityForm.duration,
        date: activeDate,
        calories: Number(activityForm.calories),
        status: activityForm.status,
        // Also include the full list of today's activities (including this new one)
        // so the server or downstream handlers receive the complete context.
        activitiesToday: [
          {
            type: activityForm.type,
            duration: activityForm.duration,
            calories: Number(activityForm.calories),
            status: activityForm.status,
          },
          // include existing activities (both Completed and Planned)
          ...(activities.value || []).map((a) => ({
            type: a.type,
            duration: a.duration,
            calories: a.calories,
            status: a.status,
          })),
        ],
      },
    });

    // Optimistically show the new activity in the UI
    try {
      const newActivity: ActivityEntry = {
        id: res?.insertedId?.toString?.() ?? res?.insertedId,
        type: activityForm.type,
        duration: activityForm.duration,
        date: activeDate,
        calories: Number(activityForm.calories),
        status: activityForm.status,
      };
      activities.value = [newActivity, ...activities.value];
    } catch (e) {
      // ignore optimistic update errors
    }

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
  if (!isToday.value) {
    if (process.dev)
      console.warn("Attempted to save sleep for non-today date, blocked");
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
  if (!isToday.value) {
    if (process.dev)
      console.warn("Attempted to save water for non-today date, blocked");
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

const saveWeight = async () => {
  if (!userId.value || !weightForm.weight) return;
  if (!isToday.value) {
    if (process.dev)
      console.warn("Attempted to save weight for non-today date, blocked");
    return;
  }
  try {
    await $fetch("/api/weight", {
      method: "POST",
      body: {
        userId: userId.value,
        date: selectedDate.value,
        weight: Number(weightForm.weight),
      },
    });
    await fetchWeightForDay();
  } catch (error) {
    console.error("Failed to save weight", error);
  }
};

const beginMealDetailsStep = () => {
  if (!mealFormSource.value) return;
  mealFormStage.value = "details";
};

const deleteMeal = async (meal: MealEntry) => {
  if (!meal.id) return;
  if (!isToday.value) {
    if (process.dev)
      console.warn("Attempted to delete meal for non-today date, blocked");
    return;
  }
  try {
    await $fetch(`/api/foods/${meal.id}`, { method: "DELETE" as any });
    await fetchMealsForDay();
  } catch (error) {
    console.error("Failed to delete meal", error);
  }
};

const deleteActivity = async (activity: ActivityEntry) => {
  if (!activity.id) return;
  if (!isToday.value) {
    if (process.dev)
      console.warn("Attempted to delete activity for non-today date, blocked");
    return;
  }
  // Prevent deletion of completed activities on the client side for a better UX.
  if (activity.status === "Completed") {
    if (process.dev)
      console.warn("Attempted to delete a completed activity, blocked");
    // Optionally surface a user-friendly message — keep non-intrusive here.
    return;
  }
  try {
    await $fetch(`/api/activities/${activity.id}`, { method: "DELETE" as any });
    await fetchActivitiesForDay();
  } catch (error) {
    console.error("Failed to delete activity", error);
  }
};

const toggleActivityStatus = async (activity: ActivityEntry) => {
  if (!activity.id) return;
  if (!isToday.value) {
    if (process.dev)
      console.warn("Attempted to update activity for non-today date, blocked");
    return;
  }
  const nextStatus = activity.status === "Completed" ? "Planned" : "Completed";
  try {
    await $fetch(`/api/activities/${activity.id}`, {
      method: "PATCH" as any,
      body: { status: nextStatus },
    });
    await fetchActivitiesForDay();
  } catch (error) {
    console.error("Failed to update activity status", error);
  }
};

const resetMealFormFlow = () => {
  mealFormStage.value = "source";
  mealFormSource.value = null;
  mealForm.time = "";
  mealForm.name = "";
  mealForm.calories = "";
  mealForm.location = "";
  mealForm.portion = "";
  mealForm.mealClass = "";
  mealForm.protein = "";
  mealForm.carbs = "";
  mealForm.fat = "";
  mealForm.sugar = "";
  mealForm.sodium = "";
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

// Load persisted user profile (including mealPlanMode) when we have the userId
watch(
  () => userId.value,
  async (uid) => {
    if (!uid) return;
    try {
      const resp: any = await $fetch(`/api/users/${encodeURIComponent(uid)}`);
      if (resp && resp.profile && resp.profile.mealPlanMode) {
        // Prevent the mealPlanMode watcher from persisting/regenerating
        // when we are just loading the existing value from MongoDB.
        suppressMealPlanPersist.value = true;
        mealPlanMode.value = resp.profile.mealPlanMode;
        // allow subsequent user-initiated changes to persist
        suppressMealPlanPersist.value = false;
      }
    } catch (err) {
      if (process.dev) console.warn("Failed to load user profile:", err);
    }
  },
  { immediate: true }
);

// Persist mealPlanMode when user changes it (simple immediate save)
watch(
  () => mealPlanMode.value,
  async (mode) => {
    // If we're intentionally assigning the value from the server, skip persisting.
    if (suppressMealPlanPersist.value) return;
    if (!userId.value) return;
    try {
      await $fetch("/api/users", {
        method: "POST",
        body: { userId: userId.value, mealPlanMode: mode },
      });
    } catch (err) {
      if (process.dev) console.warn("Failed to save mealPlanMode:", err);
    }
  }
);
</script>

<template>
  <SignedIn>
    <div class="page">
      <header class="intro">
        <div>
          <h1>{{ greeting }}</h1>
        </div>
        <div class="header-controls">
          <div class="day-selector">
            <label for="day-picker">Viewing date</label>
            <input id="day-picker" type="date" v-model="selectedDate" />
          </div>

          <div class="mealplan-control">
            <p class="mealplan-label">Meal plan mode</p>
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
            <!-- removed small metric tiles under the dial per design -->
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
            <li v-for="macro in macros" :key="macro.key">
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
            <h3 v-if="!isSleepLoading">
              <span class="sleep-hours">{{ sleep.hours }}</span>
              <span class="sleep-hours-label">hrs</span>
            </h3>
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
            <p class="list-placeholder" v-if="!isToday">
              You can only submit sleep entries for today's date.
            </p>
            <button
              class="btn btn--secondary"
              type="submit"
              :disabled="!isToday"
            >
              Save sleep
            </button>
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
            <p class="list-placeholder" v-if="!isToday">
              You can only submit hydration entries for today's date.
            </p>
            <button
              class="btn btn--secondary"
              type="submit"
              :disabled="!isToday"
            >
              Save hydration
            </button>
          </form>
        </article>

        <article class="card weight-card">
          <header>
            <p class="card__eyebrow">Weight</p>
            <h3 v-if="!isWeightLoading">
              <span class="weight-value">{{ weight.today ?? "—" }}</span>
              <span class="weight-unit">lbs</span>
            </h3>
            <h3 v-else>Loading…</h3>
          </header>
          <p class="card__sub">
            <template v-if="weight.yesterday != null && weight.today != null">
              <span
                :class="{
                  'delta-up': weight.today > weight.yesterday,
                  'delta-down': weight.today < weight.yesterday,
                }"
              >
                {{
                  weight.today > weight.yesterday
                    ? "▲"
                    : weight.today < weight.yesterday
                    ? "▼"
                    : "—"
                }}
                {{
                  Math.abs(
                    (weight.today || 0) - (weight.yesterday || 0)
                  ).toFixed(1)
                }}
                lbs vs yesterday
              </span>
            </template>
            <template v-else-if="weight.yesterday != null">
              Last recorded: {{ weight.yesterday }} lbs
            </template>
            <template v-else> No prior weight recorded </template>
          </p>
          <form class="form" @submit.prevent="saveWeight">
            <div class="form__row">
              <input
                v-model="weightForm.weight"
                type="number"
                step="0.1"
                min="0"
                placeholder="Today's weight"
                required
              />
            </div>
            <p class="list-placeholder" v-if="!isToday">
              You can only submit weight entries for today's date.
            </p>
            <button
              class="btn btn--secondary"
              type="submit"
              :disabled="!isToday"
            >
              Save weight
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
              <p class="list-placeholder" v-if="!isToday">
                Editing is disabled for previous dates.
              </p>
              <li
                v-for="meal in meals"
                :key="meal.id || `${meal.time}-${meal.name}-${meal.date}`"
              >
                <div class="meals-list__info">
                  <p class="meals-list__time">{{ meal.time }}</p>
                  <p class="meals-list__name">{{ meal.name }}</p>
                  <p class="meals-list__meta">
                    {{ meal.date }} · {{ meal.location }}
                  </p>
                  <p class="meals-list__meta" v-if="meal.mealClass">
                    Class: {{ meal.mealClass }} · Portion:
                    {{ meal.portion || "n/a" }}
                  </p>
                  <p class="meals-list__macros">
                    {{ meal.macros.protein }}P / {{ meal.macros.carbs }}C /
                    {{ meal.macros.fat }}F / {{ meal.macros.sugar }}S /
                    {{ meal.macros.sodium }}Na
                  </p>
                </div>
                <div class="meals-list__stats">
                  <p class="meals-list__calories">{{ meal.calories }} cal</p>
                  <button
                    v-if="meal.id && isToday"
                    type="button"
                    class="icon-button"
                    @click="deleteMeal(meal)"
                  >
                    ✕
                  </button>
                </div>
              </li>
            </template>
          </ul>
          <form class="form" @submit.prevent="addMeal">
            <div v-if="mealFormStage === 'source'" class="meal-source-step">
              <p class="meal-source-step__title">Where is this meal from?</p>
              <div class="meal-source-options">
                <button
                  type="button"
                  class="source-option"
                  :class="{ active: mealFormSource === 'duke' }"
                  @click="mealFormSource = 'duke'"
                >
                  Duke dining
                  <span>Minimal entry – nutrition auto-filled later</span>
                </button>
                <button
                  type="button"
                  class="source-option"
                  :class="{ active: mealFormSource === 'custom' }"
                  @click="mealFormSource = 'custom'"
                >
                  Non-Duke meal
                  <span>Provide macros & calories manually</span>
                </button>
              </div>
              <button
                type="button"
                class="btn btn--primary"
                :disabled="!mealFormSource"
                @click="beginMealDetailsStep"
              >
                Continue
              </button>
            </div>

            <template v-else>
              <div class="form__row meal-detail-header">
                <button
                  type="button"
                  class="btn btn--secondary btn--ghost"
                  @click="resetMealFormFlow"
                >
                  ← Change source
                </button>
              </div>

              <div v-if="mealFormSource === 'duke'" class="duke-form">
                <div class="form__row">
                  <input
                    v-model="mealForm.time"
                    type="time"
                    aria-label="Meal time"
                    required
                  />
                  <input
                    v-model="mealForm.location"
                    type="text"
                    placeholder="Dining hall"
                    required
                  />
                </div>
                <div class="form__row">
                  <textarea
                    v-model="mealForm.name"
                    rows="2"
                    placeholder="Describe what you picked up"
                    required
                  ></textarea>
                </div>
                <div class="form__row">
                  <input
                    v-model="mealForm.portion"
                    type="text"
                    placeholder="Portion size (optional)"
                  />
                  <select v-model="mealForm.mealClass" required>
                    <option value="" disabled>Select meal class</option>
                    <option>Breakfast</option>
                    <option>Lunch</option>
                    <option>Dinner</option>
                    <option>Snack</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>

              <div v-else class="custom-form">
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
                <div class="form__row form__row--date-note">
                  <input
                    v-model="mealForm.location"
                    type="text"
                    placeholder="Where was it prepared?"
                    required
                  />
                  <input
                    v-model="mealForm.portion"
                    type="text"
                    placeholder="Portion size / weight"
                  />
                </div>
                <div class="form__row">
                  <input
                    v-model="mealForm.name"
                    type="text"
                    placeholder="Meal description"
                    required
                  />
                  <select v-model="mealForm.mealClass" required>
                    <option value="" disabled>Select meal class</option>
                    <option>Breakfast</option>
                    <option>Lunch</option>
                    <option>Dinner</option>
                    <option>Snack</option>
                    <option>Other</option>
                  </select>
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
                <div class="form__row">
                  <input
                    v-model="mealForm.sugar"
                    type="number"
                    min="0"
                    placeholder="Sugar (g)"
                  />
                  <input
                    v-model="mealForm.sodium"
                    type="number"
                    min="0"
                    placeholder="Sodium (mg)"
                  />
                </div>
              </div>

              <div class="form__actions">
                <p class="list-placeholder" v-if="!isToday">
                  You can only submit meals for today's date.
                </p>
                <button
                  class="btn btn--primary"
                  type="submit"
                  aria-label="Add meal"
                  :disabled="!isToday"
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
            </template>
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
              <p class="list-placeholder" v-if="!isToday">
                Editing is disabled for previous dates.
              </p>
              <li
                v-for="activity in activities"
                :key="
                  activity.id ||
                  `${activity.type}-${activity.date}-${activity.duration}`
                "
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
                  <button
                    type="button"
                    class="chip-button"
                    v-if="activity.id && isToday"
                    @click="toggleActivityStatus(activity)"
                  >
                    {{
                      activity.status === "Planned"
                        ? "Mark done"
                        : "Mark planned"
                    }}
                  </button>
                  <button
                    v-if="activity.id && isToday"
                    type="button"
                    class="icon-button"
                    @click="deleteActivity(activity)"
                  >
                    ✕
                  </button>
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
              <p class="list-placeholder" v-if="!isToday">
                You can only submit activities for today's date.
              </p>
              <button
                class="btn btn--primary"
                type="submit"
                :disabled="!isToday"
              >
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

/* Make the native calendar icon visible on dark backgrounds (WebKit) */
input[type="date"]::-webkit-calendar-picker-indicator {
  filter: invert(1) brightness(2);
}

.mealplan-control {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.35rem;
  min-width: 220px;
}

.mealplan-label {
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-size: 0.7rem;
  color: #ffb08f; /* match viewing date label color */
}

.header-controls {
  display: flex;
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

/* Subtle blue hue for the selected plan button */
.plan-buttons .btn.active {
  background: linear-gradient(120deg, #4facfe, #3b82f6);
  color: white;
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.12);
  border-color: rgba(59, 130, 246, 0.2);
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

.btn--ghost {
  background: transparent;
  border-color: rgba(255, 255, 255, 0.12);
  color: #f8f7f4;
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
  gap: 1.25rem;
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
  /* Increase vertical space so macros are visible without scrolling on
     typical desktop viewports. Allow the list to expand naturally. */
  min-height: 220px;
  max-height: none;
  overflow: visible;
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

.weight-card .weight-value {
  font-size: 1.6rem;
  font-weight: 700;
}
.weight-card .weight-unit {
  margin-left: 0.35rem;
  color: #cfcac2;
}
.weight-card .delta-up {
  color: #9de4c5;
}
.weight-card .delta-down {
  color: #ff9a9a;
}

.progress--thick {
  height: 12px;
}

.stats-grid {
  display: grid;
  /* three equal columns so Sleep, Hydration and Weight sit in a single row;
     AI copilot will span the full width below */
  grid-template-columns: repeat(3, 1fr);
  gap: 1.25rem;
}

.ai-card {
  gap: 0.5rem;
  grid-column: 1 / -1; /* span full width under sleep + hydration */
}

/* Responsive: fall back to 2 columns on medium screens and 1 column on small screens */
@media (max-width: 1200px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
  .ai-card {
    grid-column: auto;
  }
}

/* Make sleep hours large and prominent */
.sleep-card header h3 {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}
.sleep-card .sleep-hours {
  font-size: 2.2rem;
  font-weight: 800;
  line-height: 1;
}
.sleep-card .sleep-hours-label {
  font-size: 1.1rem;
  color: #b8b4ad;
}

/* Bottom-justify hydration form */
.water-card {
  display: flex;
  flex-direction: column;
}
.water-card .form {
  margin-top: auto;
}

/* Bottom-justify weight form so input and button sit at the card bottom */
.weight-card {
  display: flex;
  flex-direction: column;
}
.weight-card .form {
  margin-top: auto;
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
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.activity-list__details {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  flex-wrap: wrap;
}

.activity-card .activity-list {
  flex-grow: 1;
}

.activity-card .form {
  margin-top: auto;
}

/* Reserve space for the meals and activity forms so adding extra inputs doesn't shift layout */
.meals-card .form {
  /* Reserve more vertical space for the full meal form (prevents jump when extra rows appear) */
  min-height: 360px;
}

.activity-card .form {
  min-height: 200px;
}

.form__row {
  margin-bottom: 10px;
}

/* Slightly increase horizontal gap between inputs for clearer spacing */

/* Use CSS grid for meal rows so inputs get equal widths and consistent gaps
   regardless of how many columns are present (2 or 3). This prevents
   uneven spacing caused by varying input types (time, number, text). */
.meals-card .form .form__row,
.custom-form .form__row {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 1.25rem;
  align-items: center;
  min-height: 48px; /* ensure consistent row height */
}

/* Ensure each input/select/textarea in those meal rows stretches to fill column */
.meals-card .form .form__row > *,
.custom-form .form__row > * {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

/* Make textarea a stable size so it doesn't change layout when toggled */
.duke-form textarea {
  min-height: 64px;
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
  gap: 1rem; /* increased vertical spacing between form rows */
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

.icon-button {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #f8f7f4;
  border-radius: 999px;
  padding: 0.2rem 0.6rem;
  cursor: pointer;
}

.chip-button {
  background: rgba(79, 156, 255, 0.18);
  border-radius: 999px;
  border: 1px solid rgba(79, 156, 255, 0.4);
  color: #dfe9ff;
  padding: 0.2rem 0.8rem;
  font-size: 0.85rem;
}

.meal-source-step {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.meal-source-step__title {
  margin: 0;
  font-weight: 600;
}

.meal-source-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.75rem;
}

.source-option {
  border-radius: 18px;
  padding: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.03);
  color: #f8f7f4;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  cursor: pointer;
}

.source-option span {
  font-size: 0.85rem;
  color: #b8b4ad;
}

.source-option.active {
  border-color: rgba(79, 156, 255, 0.8);
  background: rgba(79, 156, 255, 0.15);
}

.meal-detail-header {
  align-items: center;
  justify-content: space-between;
}

.duke-form textarea {
  width: 100%;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.04);
  color: #f8f7f4;
  padding: 0.85rem 1rem;
  font-size: 0.95rem;
  resize: vertical;
}

.duke-form textarea::placeholder {
  color: rgba(248, 247, 244, 0.6);
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
