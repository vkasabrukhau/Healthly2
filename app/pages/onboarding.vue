<script setup lang="ts">
import { computed, reactive, ref, onMounted, watch } from "vue";
import { useCookie, useRoute, useRouter, useSeoMeta, useUser } from "#imports";

useSeoMeta({
  title: "Healthly | Complete onboarding",
  description:
    "Confirm your basic profile so Healthly can personalize exercise and nutrition guidance from day one.",
});

const exerciseLevels = [
  {
    label: "Light · walks & gentle mobility",
    value: "light",
    description: "1-2 casual sessions per week",
  },
  {
    label: "Moderate · mix of strength & cardio",
    value: "moderate",
    description: "3-4 structured workouts per week",
  },
  {
    label: "High · athletic or competitive",
    value: "high",
    description: "5+ intense sessions per week",
  },
];

const frequencyOptions = [
  { label: "1-2x per week", value: "1-2" },
  { label: "3-4x per week", value: "3-4" },
  { label: "5-6x per week", value: "5-6" },
  { label: "Daily", value: "daily" },
];

const router = useRouter();
const route = useRoute();
const { user } = useUser();

const onboardingCookie = useCookie("healthly-onboarded", {
  default: () => "false",
});

const clerkUserId = computed(() => {
  const u = user.value as any;
  return u?.id || u?.userId || u?.sub || u?.user_id || null;
});

const maintenanceOptions = [
  {
    value: "sedentary",
    label: "Sedentary — 1400–1700 kcal",
    hint: "Little or no exercise; desk job",
  },
  {
    value: "light",
    label: "Light activity — 1700–2000 kcal",
    hint: "Light exercise 1–3x/week",
  },
  {
    value: "moderate",
    label: "Moderate — 2000–2400 kcal",
    hint: "Exercise 3–5x/week",
  },
  {
    value: "active",
    label: "Active — 2400–2800 kcal",
    hint: "Hard exercise 6–7x/week or physical job",
  },
  {
    value: "very_active",
    label: "Very active — 2800+ kcal",
    hint: "Athlete-level training",
  },
];

const form = reactive({
  firstName: "",
  lastName: "",
  dob: "",
  weightLbs: "",
  heightFeet: "",
  heightInches: "",
  maintenance:
    maintenanceOptions?.[1]?.value ?? maintenanceOptions?.[0]?.value ?? "",
  exerciseLevel: exerciseLevels?.[1]?.value ?? exerciseLevels?.[0]?.value ?? "",
  exerciseFrequency:
    frequencyOptions?.[1]?.value ?? frequencyOptions?.[0]?.value ?? "",
  mealPlanMode: "maintain",
});

const attemptedSubmit = ref(false);
const isSubmitting = ref(false);
const clerkError = ref("");

const redirectTarget = computed(() => {
  const raw = Array.isArray(route.query.redirect)
    ? route.query.redirect[0]
    : route.query.redirect;
  return raw ? decodeURIComponent(raw) : "/dashboard";
});

const age = computed(() => {
  if (!form.dob) return "--";
  const dobDate = new Date(form.dob);
  if (Number.isNaN(dobDate.getTime())) return "--";
  const now = new Date();
  let years = now.getFullYear() - dobDate.getFullYear();
  const monthDiff = now.getMonth() - dobDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dobDate.getDate()))
    years -= 1;
  return years >= 0 ? years.toString() : "--";
});

const heightCm = computed(() => {
  const f = Number(form.heightFeet) || 0;
  const i = Number(form.heightInches) || 0;
  const cm = f * 30.48 + i * 2.54;
  return cm > 0 ? Math.round(cm * 10) / 10 : null;
});

const levelLabel = computed(
  () => exerciseLevels.find((o) => o.value === form.exerciseLevel)?.label
);
const frequencyLabel = computed(
  () => frequencyOptions.find((o) => o.value === form.exerciseFrequency)?.label
);

const isFormComplete = computed(() =>
  Boolean(
    form.firstName &&
      form.lastName &&
      form.dob &&
      age.value !== "--" &&
      form.weightLbs &&
      form.heightFeet &&
      form.maintenance &&
      form.exerciseLevel &&
      form.exerciseFrequency
  )
);
const isUserReady = computed(() => Boolean(clerkUserId.value));
const canSubmit = computed(
  () => isFormComplete.value && isUserReady.value && !isSubmitting.value
);

onMounted(async () => {
  if (onboardingCookie.value === "true") {
    router.replace(redirectTarget.value);
    return;
  }

  const uid = clerkUserId.value;
  if (uid) {
    const cu = (user.value as any) || {};
    form.firstName = form.firstName || cu?.firstName || cu?.given_name || "";
    form.lastName = form.lastName || cu?.lastName || cu?.family_name || "";

    try {
      const resp = await $fetch(`/api/users/${encodeURIComponent(uid)}`);
      if (resp && resp.exists) {
        onboardingCookie.value = "true";
        router.replace(redirectTarget.value);
        return;
      }
    } catch (e) {
      if (process.dev) console.warn("Onboarding server check failed:", e);
    }
  }
});

watch(
  () => (user.value as any)?.id || (user.value as any)?.userId,
  async (uid) => {
    if (!uid) return;
    const cu = (user.value as any) || {};
    form.firstName = form.firstName || cu?.firstName || cu?.given_name || "";
    form.lastName = form.lastName || cu?.lastName || cu?.family_name || "";
    try {
      const resp = await $fetch(`/api/users/${encodeURIComponent(uid)}`);
      if (resp && resp.exists) {
        onboardingCookie.value = "true";
        router.replace(redirectTarget.value);
      }
    } catch (e) {
      if (process.dev)
        console.warn("Onboarding server check failed (watch):", e);
    }
  },
  { immediate: true }
);

const handleSubmit = async () => {
  attemptedSubmit.value = true;
  if (!canSubmit.value) return;
  const userId = clerkUserId.value;
  if (!userId) {
    console.error("Unable to persist profile without a Clerk user ID");
    return;
  }

  isSubmitting.value = true;

  if (process.client) {
    const payload = {
      ...form,
      age: age.value,
      levelLabel: levelLabel.value,
      frequencyLabel: frequencyLabel.value,
    };
    localStorage.setItem(
      "healthly-onboarding-profile",
      JSON.stringify(payload)
    );
  }

  // Persist profile to Mongo first
  try {
    await $fetch("/api/users", {
      method: "POST",
      body: {
        userId,
        firstName: form.firstName,
        lastName: form.lastName,
        dob: form.dob,
        age: Number(age.value),
        // onboarding now collects pounds (lbs) as the canonical input
        weight: Number(form.weightLbs),
        heightCm: heightCm.value ?? null,
        maintenance: form.maintenance,
        exerciseLevel: form.exerciseLevel,
        exerciseFrequency: form.exerciseFrequency,
        mealPlanMode: form.mealPlanMode,
      },
    });
  } catch (error) {
    console.error("Failed to persist onboarding profile", error);
    clerkError.value = "Failed to save profile. Please try again.";
    isSubmitting.value = false;
    return;
  }

  // Now attempt to sync with Clerk; if that partial sync fails, allow onboarding to
  // complete but record the error so it can be retried later.
  try {
    const resp: any = await $fetch("/api/clerk/update-user", {
      method: "POST",
      body: {
        userId,
        firstName: form.firstName,
        lastName: form.lastName,
      },
    });
    if (!(resp && resp.clerkUpdated)) {
      clerkError.value =
        resp?.error || "Failed to sync with authentication provider.";
      if (process.dev) console.warn("Clerk sync partial failure:", resp?.error);
    }
  } catch (e) {
    console.error("Failed to update Clerk profile", e);
    clerkError.value =
      "Failed to update authentication profile. Please try again later.";
  }

  // Mark onboarding complete (cookie) so user can proceed regardless of Clerk sync.
  onboardingCookie.value = "true";
  isSubmitting.value = false;
  router.push(redirectTarget.value);
};
</script>
<template>
  <div class="onboarding-page">
    <section class="intro">
      <h1>Complete your profile</h1>
      <p class="lead">
        Confirm a few details so we can personalize targets, remind you of the
        right habits, and show the insights that matter the first time you log
        in.
      </p>
    </section>

    <div class="onboarding-grid">
      <section class="card form-card">
        <h2>Profile basics</h2>
        <form @submit.prevent="handleSubmit">
          <div class="form-grid">
            <label>
              <span>First name</span>
              <input
                v-model.trim="form.firstName"
                type="text"
                autocomplete="given-name"
                required
              />
              <small v-if="attemptedSubmit && !form.firstName"
                >Enter your first name.</small
              >
            </label>
            <label>
              <span>Last name</span>
              <input
                v-model.trim="form.lastName"
                type="text"
                autocomplete="family-name"
                required
              />
              <small v-if="attemptedSubmit && !form.lastName"
                >Enter your last name.</small
              >
            </label>
            <label>
              <span>Weight (lbs)</span>
              <input
                v-model.number="form.weightLbs"
                type="number"
                min="40"
                max="1100"
                step="0.1"
                placeholder="e.g. 160.0"
                required
              />
              <small v-if="attemptedSubmit && !form.weightLbs"
                >Enter your weight in pounds (lbs).</small
              >
            </label>
            <label>
              <span>Height</span>
              <div style="display: flex; gap: 0.5rem">
                <input
                  v-model.number="form.heightFeet"
                  type="number"
                  min="3"
                  max="8"
                  step="1"
                  placeholder="ft"
                  style="width: 5.5rem"
                  required
                />
                <input
                  v-model.number="form.heightInches"
                  type="number"
                  min="0"
                  max="11"
                  step="1"
                  placeholder="in"
                  style="width: 5.5rem"
                />
              </div>
              <small v-if="attemptedSubmit && !form.heightFeet">
                Enter your height in feet and inches.
              </small>
            </label>
            <label>
              <span>Estimated maintenance calories</span>
              <select v-model="form.maintenance">
                <option
                  v-for="opt in maintenanceOptions"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </option>
              </select>
              <small class="muted"
                >Examples: choose the range that best matches your typical
                activity level.</small
              >
            </label>
            <label class="dob-field">
              <span>Date of birth</span>
              <input v-model="form.dob" type="date" required />
              <small v-if="attemptedSubmit && (!form.dob || age === '--')"
                >Provide a valid date of birth.</small
              >
            </label>
          </div>

          <!-- Profile photo is intentionally omitted during onboarding. Users can add or change their photo later in Account settings. -->

          <div class="selectors">
            <label>
              <span>Average exercise level</span>
              <select v-model="form.exerciseLevel">
                <option
                  v-for="option in exerciseLevels"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>
            <label>
              <span>Weekly frequency</span>
              <select v-model="form.exerciseFrequency">
                <option
                  v-for="option in frequencyOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>
            <label>
              <span>Meal plan mode</span>
              <div style="display: flex; gap: 0.5rem">
                <label style="display: flex; align-items: center; gap: 0.4rem">
                  <input type="radio" v-model="form.mealPlanMode" value="cut" />
                  <small>Cut</small>
                </label>
                <label style="display: flex; align-items: center; gap: 0.4rem">
                  <input
                    type="radio"
                    v-model="form.mealPlanMode"
                    value="maintain"
                  />
                  <small>Maintain</small>
                </label>
                <label style="display: flex; align-items: center; gap: 0.4rem">
                  <input
                    type="radio"
                    v-model="form.mealPlanMode"
                    value="bulk"
                  />
                  <small>Bulk</small>
                </label>
              </div>
            </label>
          </div>

          <button class="btn btn--primary" type="submit" :disabled="!canSubmit">
            {{ isSubmitting ? "Saving…" : "Finish onboarding" }}
          </button>
          <p v-if="clerkError" class="error" style="margin-top: 0.5rem">
            {{ clerkError }}
          </p>
        </form>
      </section>

      <section class="card summary-card">
        <p class="eyebrow">Confirmation</p>
        <h2>Here’s what we’ll save</h2>
        <ul>
          <li>
            <p class="label">Name</p>
            <p class="value">
              {{ form.firstName || "—" }} {{ form.lastName || "" }}
            </p>
          </li>
          <li>
            <p class="label">Birth date</p>
            <p class="value">{{ form.dob || "—" }}</p>
          </li>
          <li>
            <p class="label">Age</p>
            <p class="value">{{ age }}</p>
          </li>
          <li>
            <p class="label">Weight</p>
            <p class="value">
              {{ form.weightLbs ? form.weightLbs + " lbs" : "—" }}
            </p>
          </li>
          <li>
            <p class="label">Height</p>
            <p class="value">
              {{
                form.heightFeet
                  ? form.heightFeet + " ft " + (form.heightInches || 0) + " in"
                  : "—"
              }}
              <span v-if="heightCm"> — {{ heightCm }} cm</span>
            </p>
          </li>
          <li>
            <p class="label">Maintenance</p>
            <p class="value">
              {{
                maintenanceOptions.find((o) => o.value === form.maintenance)
                  ?.label || "—"
              }}
            </p>
          </li>
          <li>
            <p class="label">Exercise level</p>
            <p class="value">{{ levelLabel || "—" }}</p>
          </li>
          <li>
            <p class="label">Frequency</p>
            <p class="value">{{ frequencyLabel || "—" }}</p>
          </li>
          <li>
            <p class="label">Exercise level</p>
            <p class="value">{{ levelLabel || "—" }}</p>
          </li>
          <li>
            <p class="label">Frequency</p>
            <p class="value">{{ frequencyLabel || "—" }}</p>
          </li>
        </ul>
        <p class="card__sub">
          You can update these details later inside account settings. We only
          use them to tailor suggestions.
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped src="./onboarding.css"></style>

