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
  location: "",
  mealSection: "",
  category: "",
  calories: "",
  maxFat: "",
  minProtein: "",
  maxCarbs: "",
  maxSugar: "",
  maxSodium: "",
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
const metadataError = ref("");
const metadataLoading = ref(false);
const filterOptions = reactive({
  locations: [] as string[],
  mealSections: [] as string[],
  categories: [] as string[],
});

// Make filters optional — only require an authenticated user to generate
const isFormValid = computed(() => !!userId.value);

const shouldDisableGenerate = computed(
  () =>
    (!isFormValid.value && suggestions.value.length === 0) ||
    isSubmitting.value ||
    loadingProfile.value
);

function resetForm() {
  Object.assign(form, { ...formDefaults });
}

function buildFiltersPayload() {
  return {
    location:
      form.location && form.location !== "__all__" ? form.location : null,
    mealSection:
      form.mealSection && form.mealSection !== "__all__"
        ? form.mealSection
        : null,
    category:
      form.category && form.category !== "__all__" ? form.category : null,
    calories: form.calories ? Number(form.calories) : null,
    maxFat: form.maxFat ? Number(form.maxFat) : null,
    minProtein: form.minProtein ? Number(form.minProtein) : null,
    maxCarbs: form.maxCarbs ? Number(form.maxCarbs) : null,
    maxSugar: form.maxSugar ? Number(form.maxSugar) : null,
    maxSodium: form.maxSodium ? Number(form.maxSodium) : null,
  };
}

function buildFiltersSummary(filters: Record<string, any>) {
  const loc = filters.location === "__all__" ? null : filters.location;
  const sec = filters.mealSection === "__all__" ? null : filters.mealSection;
  const cat = filters.category === "__all__" ? null : filters.category;
  const parts = [
    loc && `Location: ${loc}`,
    sec && `Section: ${sec}`,
    cat && `Category: ${cat}`,
    filters.calories && `≈ ${filters.calories} kcal`,
    filters.maxFat && `≤ ${filters.maxFat}g fat`,
    filters.minProtein && `≥ ${filters.minProtein}g protein`,
    filters.maxCarbs && `≤ ${filters.maxCarbs}g carbs`,
    filters.maxSugar && `≤ ${filters.maxSugar}g sugar`,
    filters.maxSodium && `≤ ${filters.maxSodium}mg sodium`,
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
    requestedItemType: filters.category,
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
      err?.statusMessage ||
      err?.message ||
      "Failed to load profile information.";
  } finally {
    loadingProfile.value = false;
  }
}

async function fetchMetadata() {
  metadataLoading.value = true;
  metadataError.value = "";
  try {
    const resp: any = await $fetch("/api/suggestions/metadata");
    filterOptions.locations = resp?.locations ?? [];
    filterOptions.mealSections = resp?.mealSections ?? [];
    filterOptions.categories = resp?.categories ?? [];
  } catch (err: any) {
    metadataError.value =
      err?.statusMessage || err?.message || "Failed to load filter options.";
  } finally {
    metadataLoading.value = false;
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
    // Normalize suggestion payload to match server requirements
    const diningEstablishment =
      suggestion.location ||
      lastFilters.value?.location ||
      suggestion.sourceItem ||
      "AI suggestion";

    const macros = suggestion.macros || {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      sugar: 0,
      sodium: 0,
    };

    const calories = Number(macros.calories) || 0;

    // Ensure required fields are present before attempting to log
    if (!suggestion.title) {
      throw new Error("Suggestion missing title/item name");
    }

    await $fetch("/api/foods", {
      method: "POST",
      body: {
        userId: userId.value,
        itemName: suggestion.title,
        diningEstablishment,
        dateConsumed: todayKey,
        time,
        calories,
        macros: {
          protein: Number(macros.protein) || 0,
          carbs: Number(macros.carbs) || 0,
          fat: Number(macros.fat) || 0,
          sugar: Number(macros.sugar) || 0,
          sodium: Number(macros.sodium) || 0,
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
      err?.statusMessage ||
      err?.message ||
      "Failed to log meal. Please try again.";
  } finally {
    addingMealId.value = null;
  }
};

onMounted(() => {
  if (userLoaded?.value && userId.value) {
    fetchProfile(userId.value);
  }
  fetchMetadata();
});
</script>

<template>
  <div class="page">
    <header class="intro">
      <div>
        <p class="eyebrow">AI suggestions</p>
        <h1>Dial in your next meal with the cafeteria dataset.</h1>
        <p>
          Provide a few details and we’ll narrow the Duke dining dataset before
          sending it to the nutrition model on OpenRouter. You’ll receive eight
          JSON suggestions that match your macros, time of day, and workout
          context.
        </p>
        <p class="note">
          Suggestions use the OpenRouter model you configured. Each request
          filters the CSV dataset on-device first to reduce hallucinations.
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
          Fill out each selector before requesting. Filters reset automatically
          after each run.
        </p>
      </header>
      <form class="suggestion-form" @submit.prevent="handleSubmit">
        <div class="suggestion-form-grid">
          <div class="form-group">
            <label for="location">Location</label>
            <div class="control-field">
              <span class="control-icon">🏬</span>
              <template
                v-if="filterOptions.locations && filterOptions.locations.length"
              >
                <select id="location" v-model="form.location">
                  <option value="__all__">All locations</option>
                  <option value="" disabled>Select location</option>
                  <option
                    v-for="loc in filterOptions.locations"
                    :key="loc"
                    :value="loc"
                  >
                    {{ loc }}
                  </option>
                </select>
              </template>
              <template v-else>
                <input
                  id="location"
                  v-model="form.location"
                  type="text"
                  placeholder="e.g. Bella Union"
                />
              </template>
            </div>
          </div>

          <div class="form-group">
            <label for="mealSection">Meal section</label>
            <div class="control-field">
              <span class="control-icon">📋</span>
              <template
                v-if="
                  filterOptions.mealSections &&
                  filterOptions.mealSections.length
                "
              >
                <select id="mealSection" v-model="form.mealSection">
                  <option value="__all__">All sections</option>
                  <option value="" disabled>Select section</option>
                  <option
                    v-for="sec in filterOptions.mealSections"
                    :key="sec"
                    :value="sec"
                  >
                    {{ sec }}
                  </option>
                </select>
              </template>
              <template v-else>
                <input
                  id="mealSection"
                  v-model="form.mealSection"
                  type="text"
                  placeholder="e.g. Espresso Drinks"
                />
              </template>
            </div>
          </div>

          <div class="form-group">
            <label for="category">Category</label>
            <div class="control-field">
              <span class="control-icon">🥗</span>
              <template
                v-if="
                  filterOptions.categories && filterOptions.categories.length
                "
              >
                <select id="category" v-model="form.category">
                  <option value="__all__">All categories</option>
                  <option value="" disabled>Select category</option>
                  <option
                    v-for="cat in filterOptions.categories"
                    :key="cat"
                    :value="cat"
                  >
                    {{ cat }}
                  </option>
                </select>
              </template>
              <template v-else>
                <input
                  id="category"
                  v-model="form.category"
                  type="text"
                  placeholder="e.g. Smoothies"
                />
              </template>
            </div>
          </div>

          <div class="form-group">
            <label for="calories">Calories (target)</label>
            <div class="control-field">
              <span class="control-icon">🔥</span>
              <input
                id="calories"
                v-model="form.calories"
                type="number"
                min="0"
                placeholder="e.g. 450"
              />
            </div>
          </div>

          <div class="form-group">
            <label for="maxFat">Max fat (g)</label>
            <div class="control-field">
              <span class="control-icon">🧈</span>
              <input
                id="maxFat"
                v-model="form.maxFat"
                type="number"
                min="0"
                placeholder="e.g. 20"
              />
            </div>
          </div>

          <div class="form-group">
            <label for="minProtein">Min protein (g)</label>
            <div class="control-field">
              <span class="control-icon">💪</span>
              <input
                id="minProtein"
                v-model="form.minProtein"
                type="number"
                min="0"
                placeholder="e.g. 20"
              />
            </div>
          </div>

          <div class="form-group">
            <label for="maxCarbs">Max carbs (g)</label>
            <div class="control-field">
              <span class="control-icon">🍞</span>
              <input
                id="maxCarbs"
                v-model="form.maxCarbs"
                type="number"
                min="0"
                placeholder="e.g. 40"
              />
            </div>
          </div>

          <div class="form-group">
            <label for="maxSugar">Max sugar (g)</label>
            <div class="control-field">
              <span class="control-icon">🍯</span>
              <input
                id="maxSugar"
                v-model="form.maxSugar"
                type="number"
                min="0"
                placeholder="e.g. 20"
              />
            </div>
          </div>

          <div class="form-group">
            <label for="maxSodium">Max sodium (mg)</label>
            <div class="control-field">
              <span class="control-icon">🧂</span>
              <input
                id="maxSodium"
                v-model="form.maxSodium"
                type="number"
                min="0"
                placeholder="e.g. 500"
              />
            </div>
          </div>
        </div>
        <div class="form-actions">
          <button
            class="btn btn--primary"
            type="submit"
            :disabled="shouldDisableGenerate"
          >
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
        <article
          v-for="meal in suggestions"
          :key="meal.title"
          class="result-card"
        >
          <div class="result-card__header">
            <p class="result-card__tag">
              {{ meal.tag || "AI recommendation" }} ·
              {{ meal.density || "Balanced" }}
            </p>
            <p class="result-card__time">
              {{ meal.timeOfDay || "Anytime" }} ·
              {{ lastFilters?.mealType || "Meal" }}
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
      <p v-if="errorMessage && !isSubmitting" class="error">
        {{ errorMessage }}
      </p>
    </section>
  </div>
</template>

<style scoped src="./suggestions.css"></style>
