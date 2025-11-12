<script setup lang="ts">
import { computed, reactive, ref, onMounted } from "vue";
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
  return u?.id || u?.userId || null;
});

const form = reactive({
  firstName: "",
  lastName: "",
  dob: "",
  exerciseLevel: exerciseLevels[1].value,
  exerciseFrequency: frequencyOptions[1].value,
  photoDataUrl: "",
});

const attemptedSubmit = ref(false);
const photoName = ref<string>("");
const photoError = ref("");
const isSubmitting = ref(false);

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
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dobDate.getDate())) {
    years -= 1;
  }
  return years >= 0 ? years.toString() : "--";
});

const levelLabel = computed(
  () => exerciseLevels.find((option) => option.value === form.exerciseLevel)?.label
);

const frequencyLabel = computed(
  () => frequencyOptions.find((option) => option.value === form.exerciseFrequency)?.label
);

const isFormComplete = computed(
  () =>
    Boolean(
      form.firstName &&
        form.lastName &&
        form.dob &&
        age.value !== "--" &&
        form.exerciseLevel &&
        form.exerciseFrequency &&
        form.photoDataUrl &&
        !photoError.value
    )
);

const isUserReady = computed(() => Boolean(clerkUserId.value));
const canSubmit = computed(() => isFormComplete.value && isUserReady.value && !isSubmitting.value);

onMounted(() => {
  if (onboardingCookie.value === "true") {
    router.replace(redirectTarget.value);
  }
});

const handlePhotoChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) {
    form.photoDataUrl = "";
    photoName.value = "";
    photoError.value = "";
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    photoError.value = "Please choose an image under 2 MB.";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    form.photoDataUrl = reader.result as string;
    photoName.value = file.name;
    photoError.value = "";
  };
  reader.readAsDataURL(file);
};

const handleSubmit = async () => {
  attemptedSubmit.value = true;
  if (!canSubmit.value) {
    return;
  }

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
    localStorage.setItem("healthly-onboarding-profile", JSON.stringify(payload));
  }

  try {
    await $fetch("/api/users", {
      method: "POST",
      body: {
        userId,
        firstName: form.firstName,
        lastName: form.lastName,
        dob: form.dob,
        age: Number(age.value),
        exerciseLevel: form.exerciseLevel,
        exerciseFrequency: form.exerciseFrequency,
        photoDataUrl: form.photoDataUrl,
      },
    });
  } catch (error) {
    console.error("Failed to persist onboarding profile", error);
  } finally {
    isSubmitting.value = false;
  }

  onboardingCookie.value = "true";
  router.push(redirectTarget.value);
};
</script>

<template>
  <div class="onboarding-page">
    <section class="intro">
      <p class="eyebrow">Welcome to Healthly</p>
      <h1>Let’s get to know you</h1>
      <p>
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
            <label class="dob-field">
              <span>Date of birth</span>
              <input v-model="form.dob" type="date" required />
              <small v-if="attemptedSubmit && (!form.dob || age === '--')"
                >Provide a valid date of birth.</small
              >
            </label>
            <div class="age-pill">
              <p>Age</p>
              <strong>{{ age }}</strong>
            </div>
          </div>

          <div class="photo-upload">
            <label class="upload-label">
              <span>Profile photo</span>
              <input type="file" accept="image/*" @change="handlePhotoChange" />
              <small v-if="photoName">{{ photoName }}</small>
              <small v-if="attemptedSubmit && !form.photoDataUrl"
                >Please upload a photo so we can identify your profile.</small
              >
              <small v-if="photoError" class="error">{{ photoError }}</small>
            </label>
            <div class="photo-preview" :class="{ 'photo-preview--empty': !form.photoDataUrl }">
              <img v-if="form.photoDataUrl" :src="form.photoDataUrl" alt="Profile preview" />
              <p v-else>Preview will appear here.</p>
            </div>
          </div>

          <div class="selectors">
            <label>
              <span>Average exercise level</span>
              <select v-model="form.exerciseLevel">
                <option v-for="option in exerciseLevels" :key="option.value" :value="option.value">
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
          </div>

          <button
            class="btn btn--primary"
            type="submit"
            :disabled="!canSubmit"
          >
            {{ isSubmitting ? "Saving…" : "Finish onboarding" }}
          </button>
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
            <p class="label">Exercise level</p>
            <p class="value">{{ levelLabel || "—" }}</p>
          </li>
          <li>
            <p class="label">Frequency</p>
            <p class="value">{{ frequencyLabel || "—" }}</p>
          </li>
        </ul>
        <p class="card__sub">
          You can update these details later inside account settings. We only use
          them to tailor suggestions.
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
:global(body) {
  font-family: "Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont,
    "Segoe UI", sans-serif;
  background: #05070a;
  color: #f8f7f4;
}

:global(*),
:global(*::before),
:global(*::after) {
  box-sizing: border-box;
}

.onboarding-page {
  min-height: 100vh;
  padding: 64px clamp(1.25rem, 5vw, 5rem);
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
  width: min(1200px, 100%);
  margin: 0 auto;
}

.intro {
  max-width: 720px;
}

.intro h1 {
  font-size: clamp(2.3rem, 4vw, 3.5rem);
  margin-bottom: 0.5rem;
}

.intro p {
  color: #c4c0b8;
  margin: 0;
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.28em;
  font-size: 0.75rem;
  color: #ffb08f;
  margin-bottom: 0.5rem;
}

.onboarding-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 1.5rem;
  align-items: start;
}

.card {
  border-radius: 28px;
  padding: 2rem;
  background: rgba(12, 14, 19, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 100%;
  min-width: 0;
}

.form-card form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}

.form-grid label,
.selectors label,
.upload-label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

label span {
  display: block;
  margin-bottom: 0.35rem;
  font-size: 0.9rem;
  color: #dcd9d3;
}

input,
select {
  width: 100%;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.04);
  color: #f8f7f4;
  padding: 0.85rem 1rem;
  font-size: 0.95rem;
}

input:focus,
select:focus {
  outline: 2px solid #ff8367;
  outline-offset: 1px;
}

.dob-field {
  position: relative;
}

.age-pill {
  border-radius: 20px;
  border: 1px dashed rgba(255, 255, 255, 0.2);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 0.25rem;
}

.age-pill p {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-size: 0.7rem;
  color: #b4b0a8;
}

.age-pill strong {
  font-size: 2rem;
}

.photo-upload {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
  align-items: stretch;
}

.upload-label input[type="file"] {
  border: 1px dashed rgba(255, 255, 255, 0.3);
  padding: 0.75rem;
  width: 100%;
}

.photo-preview {
  min-height: 220px;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  width: 100%;
}

.photo-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-preview--empty {
  border-style: dashed;
}

.selectors {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}

.btn {
  border-radius: 999px;
  padding: 0.95rem 1.5rem;
  font-weight: 600;
  border: none;
  cursor: pointer;
  width: fit-content;
}

.btn--primary {
  background: linear-gradient(120deg, #ff8367, #ffc083);
  color: #111215;
  box-shadow: 0 12px 32px rgba(255, 131, 103, 0.35);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.summary-card ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.summary-card .label {
  margin: 0;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: #b4b0a8;
}

.summary-card .value {
  margin: 0.15rem 0 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.card__sub {
  margin: 0;
  color: #a7a39b;
}

small {
  display: block;
  margin-top: 0.35rem;
  color: rgba(255, 255, 255, 0.7);
  min-height: 1rem;
}

.error {
  color: #ff9f9f;
}

@media (max-width: 960px) {
  .onboarding-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .photo-upload,
  .selectors,
  .form-grid {
    grid-template-columns: 1fr;
  }

  .onboarding-page {
    padding: 48px 1.25rem;
  }

  .btn {
    width: 100%;
    text-align: center;
  }
}
</style>
