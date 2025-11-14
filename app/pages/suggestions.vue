<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted } from "vue";
import { useRouter, useUser } from "#imports";

type SuggestionResult = {
  title: string;
  description?: string;
  tag?: string;
  timeOfDay?: string;
  density?: string;
  sourceItem?: string | null;
  location?: string | null;
  servingSize?: string | null;
  macros: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    sugar: number;
    sodium: number;
  };
};

const router = useRouter();
const { user, isLoaded: userLoaded } = useUser();

const userId = computed(() => {
  const u = user.value as any;
  return (
    u?.id ||
    u?.userId ||
    u?.sub ||
    u?.user_id ||
    (u?.primaryEmailAddress && u.primaryEmailAddress.id) ||
    null
  );
});

const formDefaults = {
  timeOfDay: "",
  mealType: "",
  density: "",
  workoutTiming: "",
  dietPreference: "Any",
  maxCalories: "",
  location: "",
};

const form = reactive({ ...formDefaults });

const isSubmitting = ref(false);
const hasSubmitted = ref(false);
const suggestions = ref<SuggestionResult[]>([]);
const errorMessage = ref("");
const filtersSummary = ref("");
const profile = ref<any>(null);
const loadingProfile = ref(false);
const profileError = ref("");
const addingMealId = ref<string | null>(null);
const lastFilters = ref<Record<string, any> | null>(null);

const requiredFields = ["timeOfDay", "mealType", "density", "workoutTiming"];
const isFormValid = computed(
  () => requiredFields.every((field) => form[field as keyof typeof form]) && !!userId.value
);

const shouldDisableGenerate = computed(
  () =>
    ((!isFormValid.value && suggestions.value.length === 0) ||
      isSubmitting.value ||
      loadingProfile.value)
);

function resetForm() {
  Object.assign(form, { ...formDefaults });
}

function buildFiltersPayload() {
  return {
    timeOfDay: form.timeOfDay,
    mealType: form.mealType,
    density: form.density,
    workoutTiming: form.workoutTiming,
    dietPreference: form.dietPreference || "Any",
    maxCalories: form.maxCalories ? Number(form.maxCalories) : null,
    location: form.location || undefined,
  };
}

function buildFiltersSummary(filters: Record<string, any>) {
  const parts = [
    filters.timeOfDay && `Time: ${filters.timeOfDay}`,
    filters.mealType && `Type: ${filters.mealType}`,
    filters.density && `Density: ${filters.density}`,
    filters.workoutTiming && `Workout: ${filters.workoutTiming}`,
    filters.dietPreference && filters.dietPreference !== "Any" && `Diet: ${filters.dietPreference}`,
    filters.maxCalories && `≤ ${filters.maxCalories} kcal`,
  ].filter(Boolean);
  return parts.join(" · ");
}

function buildUserContext(filters: Record<string, any>) {
  const profileData = profile.value || {};
  const macros = profileData?.baselineMacros || {};
  return {
    userId: userId.value,
    age: profileData?.age ?? null,
    gender: profileData?.gender ?? null,
    heightCm: profileData?.heightCm ?? null,
    currentWeight: profileData?.currentWeight ?? null,
    exerciseLevel: profileData?.exerciseLevel ?? null,
    exerciseFrequency: profileData?.exerciseFrequency ?? null,
    exercisePlanned: filters.workoutTiming,
    mealPlanMode: profileData?.mealPlanMode ?? null,
    waterGoal: profileData?.waterGoal ?? null,
    waterConsumed: profileData?.waterConsumed ?? null,
    requestedItemType: filters.mealType,
    macroGoals: {
      calories: macros.calories,
      protein: macros.protein,
      carbs: macros.carbs,
      fat: macros.fat,
      sugar: macros.sugar,
      sodium: macros.sodium,
    },
  };
}

async function fetchProfile(uid: string) {
  loadingProfile.value = true;
  profileError.value = "";
  try {
    const resp: any = await $fetch(`/api/users/${encodeURIComponent(uid)}`);
    profile.value = resp?.profile ?? null;
  } catch (err: any) {
    profileError.value =
      err?.statusMessage || err?.message || "Failed to load profile information.";
  } finally {
    loadingProfile.value = false;
  }
}

watch(
  () => userId.value,
  (uid) => {
    if (uid) {
      fetchProfile(uid);
    } else {
      profile.value = null;
    }
  },
  { immediate: true }
);

const handleSubmit = async () => {
  if (!userId.value || !isFormValid.value || isSubmitting.value) return;
  isSubmitting.value = true;
  errorMessage.value = "";
  try {
    const filters = buildFiltersPayload();
    const payload = {
      userId: userId.value,
      filters,
      userContext: buildUserContext(filters),
    };
    const response: any = await $fetch("/api/suggestions", {
      method: "POST",
      body: payload,
    });
    suggestions.value = response?.suggestions ?? [];
    lastFilters.value = filters;
    filtersSummary.value = buildFiltersSummary(filters);
    hasSubmitted.value = true;
    resetForm();
  } catch (err: any) {
    errorMessage.value =
      err?.data?.statusMessage ||
      err?.statusMessage ||
      err?.message ||
      "Failed to generate suggestions.";
  } finally {
    isSubmitting.value = false;
  }
};

const addSuggestionAsMeal = async (suggestion: SuggestionResult) => {
  if (!userId.value || addingMealId.value) return;
  addingMealId.value = suggestion.title;
  try {
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    const time = today.toTimeString().slice(0, 5);
    await $fetch("/api/foods", {
      method: "POST",
      body: {
        userId: userId.value,
        itemName: suggestion.title,
        description: suggestion.description,
        dateConsumed: todayKey,
        time,
        calories: suggestion.macros.calories,
        macros: {
          protein: suggestion.macros.protein,
          carbs: suggestion.macros.carbs,
          fat: suggestion.macros.fat,
          sugar: suggestion.macros.sugar,
          sodium: suggestion.macros.sodium,
        },
        portion: suggestion.sourceItem || "AI suggestion",
        mealClass:
          lastFilters.value?.mealType === "Snack"
            ? "Snack"
            : lastFilters.value?.mealType || "Meal",
      },
    });
    await router.push("/dashboard");
  } catch (err: any) {
    errorMessage.value =
      err?.statusMessage || err?.message || "Failed to log meal. Please try again.";
  } finally {
    addingMealId.value = null;
  }
};

onMounted(() => {
  if (userLoaded?.value && userId.value) {
    fetchProfile(userId.value);
  }
});
</script>

<template>
  <div class="page">
    <header class="intro">
      <div>
        <p class="eyebrow">AI suggestions</p>
        <h1>Dial in your next meal with the cafeteria dataset.</h1>
        <p>
          Provide a few details and we’ll narrow the Duke dining dataset before sending it to the
          nutrition model on OpenRouter. You’ll receive eight JSON suggestions that match your
          macros, time of day, and workout context.
        </p>
        <p class="note">
          Suggestions use the OpenRouter model you configured. Each request filters the CSV dataset
          on-device first to reduce hallucinations.
        </p>
      </div>
      <NuxtLink class="btn btn--secondary" to="/dashboard">
        Back to dashboard
      </NuxtLink>
    </header>

    <section class="card form-card">
      <header>
        <p class="eyebrow">Filters</p>
        <p class="summary">
          Fill out each selector before requesting. Filters reset automatically after each run.
        </p>
      </header>
      <form class="suggestion-form" @submit.prevent="handleSubmit">
        <div class="suggestion-form-grid">
        <div class="form-group">
          <label for="timeOfDay">Time of day</label>
          <select id="timeOfDay" v-model="form.timeOfDay" required>
            <option value="" disabled>Select</option>
            <option>Morning</option>
            <option>Midday</option>
            <option>Afternoon</option>
            <option>Evening</option>
            <option>Night</option>
          </select>
        </div>

        <div class="form-group">
          <label for="mealType">Meal type</label>
          <select id="mealType" v-model="form.mealType" required>
            <option value="" disabled>Select</option>
            <option>Meal</option>
            <option>Snack</option>
            <option>Drink</option>
          </select>
        </div>

        <div class="form-group">
          <label for="density">Density</label>
          <select id="density" v-model="form.density" required>
            <option value="" disabled>Select</option>
            <option>Low</option>
            <option>High</option>
          </select>
        </div>

        <div class="form-group">
          <label for="workoutTiming">Workout relation</label>
          <select id="workoutTiming" v-model="form.workoutTiming" required>
            <option value="" disabled>Select</option>
            <option>Pre-workout</option>
            <option>Post-workout</option>
            <option>No workout</option>
          </select>
        </div>

        <div class="form-group">
          <label for="dietPreference">Diet preference</label>
          <select id="dietPreference" v-model="form.dietPreference">
            <option>Any</option>
            <option>Vegetarian</option>
            <option>Vegan</option>
          </select>
        </div>

        <div class="form-group">
          <label for="maxCalories">Max calories (optional)</label>
          <input
            id="maxCalories"
            v-model="form.maxCalories"
            type="number"
            min="50"
            max="1200"
            placeholder="e.g. 500"
          />
        </div>

        <div class="form-group">
          <label for="location">Preferred location (optional)</label>
          <input
            id="location"
            v-model="form.location"
            type="text"
            placeholder="e.g. Bella Union"
          />
        </div>
        </div>
        <div class="form-actions">
          <button class="btn btn--primary" type="submit" :disabled="shouldDisableGenerate">
            {{ isSubmitting ? "Generating…" : "Generate suggestions" }}
          </button>
        </div>
      </form>
      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
    </section>

    <section v-if="hasSubmitted" class="card results-card">
      <header>
        <div>
          <p class="eyebrow">Suggested meals</p>
          <p class="summary" v-if="filtersSummary">{{ filtersSummary }}</p>
          <p class="summary" v-else>Review and log any meal you like.</p>
        </div>
      </header>

      <div v-if="isSubmitting" class="loading-overlay">
        <div class="loading-wave">
          <span v-for="wave in 5" :key="wave"></span>
        </div>
        <p>Fetching tailored ideas…</p>
      </div>

      <div v-else-if="suggestions.length" class="results-grid">
        <article v-for="meal in suggestions" :key="meal.title" class="result-card">
          <div class="result-card__header">
            <p class="result-card__tag">
              {{ meal.tag || "AI recommendation" }} · {{ meal.density || "Balanced" }}
            </p>
            <p class="result-card__time">
              {{ meal.timeOfDay || "Anytime" }} · {{ lastFilters?.mealType || "Meal" }}
            </p>
          </div>
          <h3>{{ meal.sourceItem || meal.title }}</h3>
          <p class="result-card__location" v-if="meal.location">
            {{ meal.location }}
            <span v-if="meal.servingSize"> · {{ meal.servingSize }}</span>
          </p>
          <p class="result-card__description">{{ meal.description }}</p>
          <dl class="result-card__macros">
            <div>
              <dt>Calories</dt>
              <dd>{{ Math.round(meal.macros.calories) }}</dd>
            </div>
            <div>
              <dt>Protein</dt>
              <dd>{{ Math.round(meal.macros.protein) }} g</dd>
            </div>
            <div>
              <dt>Carbs</dt>
              <dd>{{ Math.round(meal.macros.carbs) }} g</dd>
            </div>
            <div>
              <dt>Fat</dt>
              <dd>{{ Math.round(meal.macros.fat) }} g</dd>
            </div>
            <div>
              <dt>Sugar</dt>
              <dd>{{ Math.round(meal.macros.sugar) }} g</dd>
            </div>
            <div>
              <dt>Sodium</dt>
              <dd>{{ Math.round(meal.macros.sodium) }} mg</dd>
            </div>
          </dl>
          <div class="result-card__actions">
            <button
              class="btn btn--secondary"
              type="button"
              :disabled="addingMealId === meal.title || !userId"
              @click="addSuggestionAsMeal(meal)"
            >
              {{ addingMealId === meal.title ? "Logging…" : "Add to log" }}
            </button>
          </div>
        </article>
      </div>

      <p v-else-if="!suggestions.length && !isSubmitting" class="empty-state">
        No suggestions returned for those filters. Try again.
      </p>
      <p v-if="errorMessage && !isSubmitting" class="error">{{ errorMessage }}</p>
    </section>
  </div>
</template>

<style scoped src="./suggestions.css"></style>
