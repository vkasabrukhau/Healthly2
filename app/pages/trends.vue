<script setup lang="ts">
import { ref, computed } from "vue";
import { useHead } from "#imports";
// Manually register the echarts components this page needs so the
// VChart component has the renderer, series and components available.
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { LineChart } from "echarts/charts";
import * as echartsComponents from "echarts/components";

// Register a base set of components plus whatever is exported by the
// components module. This keeps the page working across different
// echarts package versions where specific named exports may vary.
use([
  CanvasRenderer,
  LineChart,
  ...Object.values(echartsComponents as any),
] as any);

definePageMeta({
  middleware: [
    // cast the named middleware to the NavigationGuard type so TS accepts the string name
    "require-onboarding" as unknown as import("vue-router").NavigationGuard,
  ],
});

// Range control + synthetic demo data generator so charts feel alive in preview
const range = ref<"week" | "month">("week");

function makeLabels(days: number) {
  const out: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function jitter(base: number, variance = 1) {
  return Math.round((base + (Math.random() - 0.5) * variance) * 10) / 10;
}

const labels = ref<string[]>(makeLabels(7));
const weightData = ref<number[]>([
  176, 175.2, 175.0, 174.5, 174.8, 174.2, 173.9,
]);
const sleepData = ref<number[]>([7.2, 6.8, 7.5, 8.0, 6.9, 7.1, 7.6]);
const foodCompletion = ref<number[]>([78, 82, 90, 75, 88, 93, 85]);
const waterCompletion = ref<number[]>([60, 70, 55, 80, 65, 72, 68]);

function setRange(r: "week" | "month") {
  range.value = r;
  const days = r === "week" ? 7 : 30;
  labels.value = makeLabels(days);
  const baseWeight = 174.5 + (r === "month" ? 1.5 : 0);
  weightData.value = Array.from({ length: days }, (_, i) =>
    jitter(baseWeight - i * 0.02, 0.8)
  );
  sleepData.value = Array.from({ length: days }, () => jitter(7.2, 1.2));
  foodCompletion.value = Array.from({ length: days }, () =>
    Math.max(40, Math.min(100, Math.round(jitter(80, 25))))
  );
  waterCompletion.value = Array.from({ length: days }, () =>
    Math.max(20, Math.min(100, Math.round(jitter(70, 30))))
  );
}

function randomize() {
  weightData.value = weightData.value.map((v) => jitter(v, 0.6));
  sleepData.value = sleepData.value.map((v) => jitter(v, 0.6));
  foodCompletion.value = foodCompletion.value.map(() =>
    Math.max(30, Math.min(100, Math.round(Math.random() * 100)))
  );
  waterCompletion.value = waterCompletion.value.map(() =>
    Math.max(20, Math.min(100, Math.round(Math.random() * 100)))
  );
}

// start with week data
setRange("week");

type DotOptionConfig = {
  color: string;
  label: string;
  unit?: string;
  max?: number;
  symbolSize?: number;
  formatter?: (value: number) => string;
};

function buildDotOption(
  values: number[],
  { color, label, unit, max, symbolSize = 12, formatter }: DotOptionConfig
) {
  const formatValue = (value: number) => {
    if (formatter) {
      return formatter(value);
    }
    return unit ? `${value}${unit}` : `${value}`;
  };

  // Helper: convert hex color to rgba string with alpha
  const hexToRgba = (hex: string, alpha = 1) => {
    const h = hex.replace("#", "");
    const full =
      h.length === 3
        ? h
            .split("")
            .map((c) => c + c)
            .join("")
        : h;
    const bigint = parseInt(full, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  return {
    grid: { left: 45, right: 18, top: 30, bottom: 40 },
    xAxis: {
      type: "category",
      data: labels.value,
      axisLabel: {
        color: "rgba(255, 255, 255, 0.75)",
        formatter: (val: string) => {
          const d = new Date(val);
          if (isNaN(d.getTime())) return val;
          return `${d.getMonth() + 1}/${d.getDate()}`; // M/D
        },
        rotate: 0,
      },
      axisLine: { lineStyle: { color: "rgba(255, 255, 255, 0.08)" } },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      name: unit ?? "",
      max,
      axisLabel: { color: "rgba(255, 255, 255, 0.75)" },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: "rgba(255, 255, 255, 0.06)" } },
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "line" },
      padding: 10,
      borderColor: "rgba(255, 255, 255, 0.2)",
      formatter: (params: any) => {
        const p = params && params[0];
        if (!p) return "";
        return `${p.axisValueLabel}<br/>${label}: ${formatValue(
          p.data as number
        )}`;
      },
    },
    series: [
      {
        type: "line",
        data: values,
        smooth: true,
        showSymbol: true,
        symbol: "circle",
        symbolSize,
        lineStyle: { color, width: 2 },
        itemStyle: { color },
        areaStyle: {
          color: hexToRgba(color, 0.12),
        },
        emphasis: { scale: 1.05, itemStyle: { opacity: 1 } },
      },
    ],
  };
}

const weightOption = computed(() =>
  buildDotOption(weightData.value, {
    color: "#ff9f7f",
    label: "Body weight",
    unit: " lb",
  })
);

const sleepOption = computed(() =>
  buildDotOption(sleepData.value, {
    color: "#91c7ae",
    label: "Sleep",
    unit: " hrs",
  })
);

const foodOption = computed(() =>
  buildDotOption(foodCompletion.value, {
    color: "#ffc656",
    label: "Goal completion",
    max: 100,
    formatter: (value) => `${value}%`,
  })
);

const waterOption = computed(() =>
  buildDotOption(waterCompletion.value, {
    color: "#4facfe",
    label: "Hydration",
    max: 100,
    formatter: (value) => `${value}%`,
  })
);

useHead({ title: "Healthly | Trends" });
</script>

<template>
  <div class="page trends-page">
    <header class="intro">
      <div>
        <h1>Health trends</h1>
        <p class="card__sub">
          Track recent weight, sleep, and goal completion.
        </p>
      </div>
    </header>

    <section class="trends-grid">
      <article class="card chart-card">
        <header>
          <p class="card__eyebrow">Weight</p>
          <h2>Body weight</h2>
        </header>
        <ClientOnly>
          <VChart :option="weightOption" autoresize class="trend-chart" />
        </ClientOnly>
      </article>

      <article class="card chart-card">
        <header>
          <p class="card__eyebrow">Sleep</p>
          <h2>Sleep trend</h2>
        </header>
        <ClientOnly>
          <VChart :option="sleepOption" autoresize class="trend-chart" />
        </ClientOnly>
      </article>

      <article class="card chart-card">
        <header>
          <p class="card__eyebrow">Food</p>
          <h2>Food goal completion</h2>
        </header>
        <ClientOnly>
          <VChart :option="foodOption" autoresize class="trend-chart" />
        </ClientOnly>
      </article>

      <article class="card chart-card">
        <header>
          <p class="card__eyebrow">Hydration</p>
          <h2>Drinking goal completion</h2>
        </header>
        <ClientOnly>
          <VChart :option="waterOption" autoresize class="trend-chart" />
        </ClientOnly>
      </article>
    </section>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  padding: 64px clamp(1.25rem, 5vw, 5rem) 96px;
  display: flex;
  flex-direction: column;
  gap: 56px;
}
.trends-page .intro {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

/* meal plan control styles moved to dashboard page */

.trends-grid {
  margin-top: 1.25rem;
  /* Stack charts vertically and make each chart full-width */
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.trend-chart {
  width: 100%;
  height: 360px; /* increased height for full-width visuals */
}

.chart-card {
  width: 100%;
  min-height: 420px;
}

@media (max-width: 640px) {
  .trends-page .intro {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
