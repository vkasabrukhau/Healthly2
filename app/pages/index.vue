<script setup lang="ts">
import { computed, ref } from "vue";
import { TooltipComponent } from "echarts/components";

const heroRef = ref<HTMLElement | null>(null);
const accentPosition = ref({ x: 50, y: 50 });
const panelTilt = ref({ x: 0, y: 0 });

const heroStyle = computed(() => ({
  "--accent-x": `${accentPosition.value.x}%`,
  "--accent-y": `${accentPosition.value.y}%`,
}));

const panelStyle = computed(() => ({
  transform: `rotateX(${panelTilt.value.x}deg) rotateY(${panelTilt.value.y}deg)`,
  transition: "transform 160ms ease-out",
}));

const aiSuggestions = [
  {
    title: "Gentle movement reset",
    detail: "Take a 12 min fascia flow to reduce afternoon slump.",
    tag: "Energy",
  },
  {
    title: "Smart meal timing",
    detail: "Shift lunch 30 min earlier to stabilize glucose curve.",
    tag: "Nutrition",
  },
  {
    title: "Wind-down nudge",
    detail: "Dim screens at 9:20 PM to protect tonight’s sleep score.",
    tag: "Sleep",
  },
];

const planningFocus = [
  {
    title: "Hydration & water",
    metric: "64 oz logged",
    goal: "Target: 80 oz",
    description:
      "Auto-adjusted reminders keep your intake steady without nagging.",
    accent: "water",
  },
  {
    title: "Meals & nutrition",
    metric: "3 balanced meals",
    goal: "Target: 4 touchpoints",
    description: "Preview macros, ingredients, and mindful eating prompts.",
    accent: "meals",
  },
  {
    title: "Movement planning",
    metric: "2 focused blocks",
    goal: "Target: 5 per week",
    description:
      "Layer strength, cardio, and mobility into one adaptable view.",
    accent: "movement",
  },
  {
    title: "Recovery & calm",
    metric: "7h 25m sleep avg",
    goal: "Target: 7h 45m",
    description:
      "Track breath, rest, and low-effort wins so recovery stays protected.",
    accent: "recovery",
  },
];

const healthTrends = [
  {
    title: "Exercise consistency",
    value: "5 sessions",
    change: "+12% vs last week",
    description: "Mix of interval rows, yoga, and walk commutes.",
  },
  {
    title: "Sleep quality",
    value: "7h 20m",
    change: "+45m vs baseline",
    description: "Back-to-back REM streak thanks to steady lights-out.",
  },
  {
    title: "Mindful breaks",
    value: "3 per day",
    change: "+1 micro-rest",
    description: "Short pauses keep HRV balanced when days stack up.",
  },
];

const handlePointerMove = (event: PointerEvent) => {
  if (!heroRef.value) {
    return;
  }
  const rect = heroRef.value.getBoundingClientRect();
  const relativeX = ((event.clientX - rect.left) / rect.width) * 100;
  const relativeY = ((event.clientY - rect.top) / rect.height) * 100;
  accentPosition.value = {
    x: Math.min(Math.max(relativeX, 0), 100),
    y: Math.min(Math.max(relativeY, 0), 100),
  };
  panelTilt.value = {
    x: (0.5 - (event.clientY - rect.top) / rect.height) * 10,
    y: ((event.clientX - rect.left) / rect.width - 0.5) * 10,
  };
};

const handlePointerLeave = () => {
  accentPosition.value = { x: 50, y: 50 };
  panelTilt.value = { x: 0, y: 0 };
};

useSeoMeta({
  title: "Healthly | Explore the dashboard before signing in",
  description:
    "Adaptive wellness planning with AI guidance, hydration tracking, and trend insights—all previewable before Clerk authentication.",
});
</script>

<template>
  <div class="page">
    <section
      ref="heroRef"
      class="hero"
      :style="heroStyle"
      @pointermove="handlePointerMove"
      @pointerleave="handlePointerLeave"
    >
      <div class="hero__content">
        <h1>
          A tracker that integrates with your life and let's you be
          <span>YOU</span>
        </h1>
        <p class="lede">
          Healthly is meant to integrate easily with your school's dining hall
          system. The Gemini-enabled backend allows for adaptive dietary
          guidance. Navigating nutrition has never been easier and healthly is
          here to help.
        </p>
        <NuxtLink class="btn btn--primary" :to="{ path: '/dashboard' }">
          Sign In
        </NuxtLink>
      </div>
    </section>

    <section class="ai">
      <div class="section-heading">
        <p class="eyebrow">AI suggestion spotlight</p>
        <h2>Healthly’s copilot nudges you with context.</h2>
        <p>
          Suggestions blend data from hydration, meals, and rest so you get a
          single queue of priorities rather than juggling multiple apps.
        </p>
      </div>
      <div class="ai__grid">
        <article
          v-for="suggestion in aiSuggestions"
          :key="suggestion.title"
          class="ai-card"
        >
          <p class="ai-card__tag">{{ suggestion.tag }}</p>
          <h3>{{ suggestion.title }}</h3>
          <p>{{ suggestion.detail }}</p>
        </article>
      </div>
    </section>

    <section class="planning">
      <div class="section-heading">
        <p class="eyebrow">Separate planning lanes</p>
        <h2>Water, meals, movement, recovery—each gets focused space.</h2>
        <p>
          Build plans at the pace you prefer. Healthly’s dashboard keeps every
          lane aligned while letting you focus on one pillar at a time.
        </p>
      </div>
      <div class="planning__grid">
        <article
          v-for="plan in planningFocus"
          :key="plan.title"
          class="planning-card"
          :class="`planning-card--${plan.accent}`"
        >
          <p class="planning-card__label">{{ plan.title }}</p>
          <p class="planning-card__metric">{{ plan.metric }}</p>
          <p class="planning-card__goal">{{ plan.goal }}</p>
          <p class="planning-card__description">{{ plan.description }}</p>
        </article>
      </div>
    </section>

    <section class="trends">
      <div class="section-heading">
        <p class="eyebrow">Health trends</p>
        <h2>See exercise, sleep, and calm at a glance.</h2>
        <p>
          Visualize what is improving before you share data with a coach. These
          cards mirror the protected dashboard so the switch after sign-in is
          seamless.
        </p>
      </div>
      <div class="trends__grid">
        <article
          v-for="trend in healthTrends"
          :key="trend.title"
          class="trend-card"
        >
          <header>
            <p class="trend-card__title">{{ trend.title }}</p>
            <p class="trend-card__change">{{ trend.change }}</p>
          </header>
          <p class="trend-card__value">{{ trend.value }}</p>
          <p class="trend-card__description">{{ trend.description }}</p>
          <div class="trend-card__bar">
            <span></span>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped src="./index.css"></style>

