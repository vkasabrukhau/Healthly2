<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useHead } from "#imports";
import { useUser } from "#imports";
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
const weightData = ref<number[]>([]);
const sleepData = ref<number[]>([]);
const foodCompletion = ref<number[]>([]);
const waterCompletion = ref<number[]>([]);

const { user } = useUser();
const userId = computed(() => {
  const u = (user as any).value || {};
  return u?.id || u?.userId || u?.sub || u?.user_id || null;
});

function setRange(r: "week" | "month") {
  range.value = r;
  const days = r === "week" ? 7 : 30;
  labels.value = makeLabels(days);
  // attempt to fetch real data for the range; fall back to synthetic if unavailable
  fetchTrendData(days).catch(() => {
    // on any error, fall back to synthetic data so charts remain populated
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
  });
}

// Fetch actual trend data by querying existing per-day endpoints. This is
// intentionally conservative (one request per day/per-metric) to avoid
// modifying server APIs; later we can add a range endpoint to return series
// in a single request for improved perf.
async function fetchTrendData(days: number) {
  const uid = userId.value;
  if (!uid) throw new Error("no-user");

  // Build the date strings in order
  const dates = makeLabels(days);

  // For each date, fetch weight, sleep, food and water in parallel
  const promises = dates.map(async (dateStr) => {
    try {
      const [wResp, sResp, fResp, watResp] = await Promise.all([
        $fetch(`/api/weight/${encodeURIComponent(uid)}`, {
          params: { date: dateStr },
        }).catch(() => null),
        $fetch(`/api/sleep/${encodeURIComponent(uid)}`, {
          params: { date: dateStr },
        }).catch(() => null),
        $fetch(`/api/foods/${encodeURIComponent(uid)}`, {
          params: { date: dateStr },
        }).catch(() => null),
        $fetch(`/api/water/${encodeURIComponent(uid)}`, {
          params: { date: dateStr },
        }).catch(() => null),
      ]);

      const weightVal =
        wResp && (wResp as any).today != null
          ? Number((wResp as any).today)
          : wResp && (wResp as any).entry
          ? Number((wResp as any).entry.weight)
          : null;

      const sleepVal =
        sResp && (sResp as any).entry
          ? Number((sResp as any).entry.hours || 0)
          : 0;

      const foods =
        fResp && Array.isArray((fResp as any).items)
          ? (fResp as any).items
          : [];
      const totalCalories = foods.reduce(
        (sum: number, it: any) => sum + (Number(it.calories) || 0),
        0
      );

      const waterEntry =
        watResp && (watResp as any).entry ? (watResp as any).entry : null;

      return {
        date: dateStr,
        weight: weightVal,
        sleep: sleepVal,
        calories: totalCalories,
        water: waterEntry,
      };
    } catch (err) {
      return {
        date: dateStr,
        weight: null,
        sleep: 0,
        calories: 0,
        water: null,
      };
    }
  });

  const results = await Promise.all(promises);

  // Map results into series arrays (maintain same order as labels)
  weightData.value = results.map((r) => (r.weight != null ? r.weight : NaN));
  sleepData.value = results.map((r) => Number(r.sleep || 0));
  // Food completion uses a default daily calorie target (2200) if not available
  const defaultCalGoal = 2200;
  foodCompletion.value = results.map((r) =>
    Math.min(100, Math.round(((r.calories || 0) / defaultCalGoal) * 100))
  );
  waterCompletion.value = results.map((r) => {
    const w = r.water;
    if (!w || !w.goal) return 0;
    return Math.min(
      100,
      Math.round((Number(w.consumed || 0) / Number(w.goal || 1)) * 100)
    );
  });
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

// Re-fetch when user signs in or range changes
watch([userId, range], ([uid, r]) => {
  const days = r === "week" ? 7 : 30;
  if (!uid) return; // keep synthetic until signed in
  fetchTrendData(days).catch(() => {});
});

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

<style scoped src="./trends.css"></style>

