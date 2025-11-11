<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

const form = reactive({
  timeOfDay: '',
  mealType: '',
  density: '',
  workoutTiming: ''
})

const hasSubmitted = ref(false)

const suggestedMeals = [
  {
    title: 'Citrus protein smoothie',
    timeOfDay: 'Morning',
    tag: 'Pre-workout',
    density: 'Low',
    description: 'Spinach, citrus, and pea protein keep energy light yet steady.'
  },
  {
    title: 'Tahini grain bowl',
    timeOfDay: 'Afternoon',
    tag: 'No workout',
    density: 'High',
    description: 'Farro, roasted veg, and tahini dressing for a sustained focus block.'
  },
  {
    title: 'Matcha + almond snack',
    timeOfDay: 'Midday',
    tag: 'Post-workout',
    density: 'Low',
    description: 'Protein-balanced pick-me-up paired with recovery-friendly fats.'
  }
]

const selectionSummary = computed(() => {
  if (!hasSubmitted.value) {
    return null
  }
  const parts = [
    form.timeOfDay && `Time: ${form.timeOfDay}`,
    form.mealType && `Type: ${form.mealType}`,
    form.density && `Density: ${form.density}`,
    form.workoutTiming && `Workout: ${form.workoutTiming}`
  ].filter(Boolean)
  return parts.join(' · ')
})

const handleSubmit = () => {
  hasSubmitted.value = true
}
</script>

<template>
  <div class="page">
    <header class="intro">
      <div>
        <p class="eyebrow">AI suggestions</p>
        <h1>Tell us what you need right now.</h1>
        <p>
          Choose the parameters for your next bite or sip. The AI engine will tailor ideas for your
          timeline, density, and workout pairing. (Preview mode shown—no live calls yet.)
        </p>
      </div>
      <NuxtLink class="btn btn--secondary" to="/dashboard">
        Back to dashboard
      </NuxtLink>
    </header>

    <section class="card form-card">
      <form class="suggestion-form" @submit.prevent="handleSubmit">
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
          <label for="mealType">Type of meal</label>
          <select id="mealType" v-model="form.mealType" required>
            <option value="" disabled>Select</option>
            <option>Meal</option>
            <option>Snack</option>
            <option>Coffee</option>
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

        <button class="btn btn--primary" type="submit">
          Suggest meals
        </button>
      </form>
    </section>

    <section v-if="hasSubmitted" class="card results-card">
      <header>
        <p class="eyebrow">Suggested meals</p>
        <p class="summary" v-if="selectionSummary">{{ selectionSummary }}</p>
      </header>
      <div class="results-grid">
        <article v-for="meal in suggestedMeals" :key="meal.title" class="result-card">
          <p class="result-card__tag">{{ meal.tag }} · {{ meal.density }} density</p>
          <h3>{{ meal.title }}</h3>
          <p class="result-card__time">{{ meal.timeOfDay }} · {{ form.mealType || 'Meal type' }}</p>
          <p>{{ meal.description }}</p>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
:global(body) {
  font-family: 'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  margin: 0;
  background: #05070a;
  color: #f8f7f4;
}

.page {
  min-height: 100vh;
  padding: 64px clamp(1.5rem, 6vw, 6rem) 96px;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.intro {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  justify-content: space-between;
  align-items: center;
}

.intro h1 {
  margin: 0.4rem 0 0.8rem;
  font-size: clamp(2rem, 5vw, 3.5rem);
}

.intro p {
  margin: 0;
  max-width: 640px;
  color: #d9d7d2;
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.28em;
  font-size: 0.75rem;
  color: #ffb08f;
  margin: 0 0 0.5rem;
}

.card {
  border-radius: 28px;
  padding: clamp(1.5rem, 4vw, 3rem);
  background: rgba(12, 14, 19, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.suggestion-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
  align-items: end;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

label {
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.85);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

select {
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.05);
  color: #f8f7f4;
  padding: 0.9rem 1rem;
  font-size: 1rem;
  appearance: none;
}

.btn {
  border-radius: 999px;
  padding: 0.95rem 1.6rem;
  font-weight: 600;
  border: 1px solid transparent;
  cursor: pointer;
  justify-self: start;
}

.btn--primary {
  background: linear-gradient(120deg, #ff8367, #ffc083);
  color: #111215;
}

.btn--secondary {
  background: rgba(255, 255, 255, 0.08);
  color: #f8f7f4;
  text-decoration: none;
  border: 1px solid rgba(255, 255, 255, 0.2);
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
}

.result-card {
  border-radius: 20px;
  padding: 1.5rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.result-card__tag {
  margin: 0;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.75);
  text-transform: uppercase;
  letter-spacing: 0.2em;
}

.result-card h3 {
  margin: 0;
}

.result-card__time {
  margin: 0;
  color: #ffc083;
  font-weight: 600;
}

.summary {
  margin: 0;
  color: #c7c3ba;
}

@media (max-width: 640px) {
  .suggestion-form {
    grid-template-columns: 1fr;
  }

  .btn {
    width: 100%;
    text-align: center;
  }
}
</style>
