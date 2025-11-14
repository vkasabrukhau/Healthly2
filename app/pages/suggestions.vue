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

<style scoped src="./suggestions.css"></style>

