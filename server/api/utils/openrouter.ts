import { useRuntimeConfig } from "#imports";

type MacroGoals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar: number;
  sodium: number;
};

function safeParseJsonMaybe(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch (e) {
    // Try to extract JSON block from text
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch (err) {
        return null;
      }
    }
    return null;
  }
}

export async function generateMacroGoalsForOnboarding(payload: {
  userId: string;
  body: {
    firstName?: string;
    lastName?: string;
    gender?: string;
    age?: number;
    dob?: string;
    exerciseLevel?: string;
    exerciseFrequency?: string;
    mealPlanMode?: string;
    heightCm?: number | null;
    weight?: number | null; // pounds
    weightKg?: number | null;
    waterGoal?: number | null;
  };
}): Promise<MacroGoals | null> {
  const config = useRuntimeConfig();
  const key =
    config.GENAI_API_KEY ||
    config.OPENROUTER_API_KEY ||
    process.env.GENAI_API_KEY ||
    process.env.OPENROUTER_API_KEY;
  const model =
    config.GENAI_MODEL ||
    config.OPENROUTER_MODEL ||
    process.env.GENAI_MODEL ||
    process.env.OPENROUTER_MODEL ||
    "gemini-1.0";
  if (!key) return null;

  const { body } = payload;
  const weight =
    typeof body.weight === "number"
      ? body.weight
      : typeof body.weightKg === "number"
      ? Math.round(body.weightKg * 2.2046226218 * 10) / 10
      : null;

  const systemPrompt = `You are a nutritionist giving advisory to a person on how much of what they should be eating. You will be given the following info about the user to help make your suggestions: Body Weight (lbs), Height (cm), Age, Gender, General Exercise Level, Goal Water Consumption, Water Consumed, Meal Plan Mode. Your job is to create json structured suggestions for the following: Calories, Protein, Carbs, Fat, Sugar, and Sodium. You are to return your results only and only in a key value json block. Example: {"calories":2200, "protein":120, "carbs":250, "fat":70, "sugar":30, "sodium":2300}`;

  const userInfo = {
    weight: weight ?? null,
    heightCm: body.heightCm ?? null,
    age: body.age ?? null,
    gender: (body as any).gender ?? null,
    exerciseLevel: body.exerciseLevel ?? null,
    waterGoal: body.waterGoal ?? null,
    waterConsumed: null,
    mealPlanMode: body.mealPlanMode ?? null,
  };

  const userContent = `User info: ${JSON.stringify(
    userInfo
  )}\nRespond with a single JSON object only.`;

  try {
    if (process.dev) {
      const infoForLog: any = {
        model,
        userInfo: {
          weight: userInfo.weight,
          heightCm: userInfo.heightCm,
          age: userInfo.age,
          gender: userInfo.gender ?? null,
          exerciseLevel: userInfo.exerciseLevel,
          mealPlanMode: userInfo.mealPlanMode,
          waterGoal: userInfo.waterGoal,
        },
      };
      // eslint-disable-next-line no-console
      console.info("[GenAI] generating baseline with model", infoForLog);
    }

    // Compose a single prompt string for Gemini-style API
    const prompt = `${systemPrompt}\n\n${userContent}`;

    const apiUrl = `https://generativelanguage.googleapis.com/v1/models/${model}:generateText`;
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        prompt: { text: prompt },
        temperature: 0.2,
        maxOutputTokens: 400,
      }),
    });

    if (process.dev) {
      // eslint-disable-next-line no-console
      console.info(
        "[GenAI] baseline response status:",
        res.status,
        res.statusText
      );
    }

    if (!res.ok) {
      const bodyText = await res.text();
      if (process.dev) {
        // eslint-disable-next-line no-console
        console.error(
          "[GenAI] returned non-OK",
          res.status,
          res.statusText,
          bodyText
        );
      }
      return null;
    }

    const data = await res.json();
    // Try several candidate fields for the model output for robustness
    const candidateText =
      data?.candidates?.[0]?.output ||
      data?.candidates?.[0]?.content ||
      data?.candidates?.[0]?.text ||
      data?.output ||
      data?.response ||
      null;

    const text =
      typeof candidateText === "string"
        ? candidateText
        : JSON.stringify(candidateText);
    const parsed = safeParseJsonMaybe(text);
    if (!parsed) {
      if (process.dev) {
        // eslint-disable-next-line no-console
        console.warn("[GenAI] failed to parse JSON from model output", {
          text: text.slice ? text.slice(0, 1000) : text,
        });
      }
      return null;
    }

    if (process.dev) {
      // eslint-disable-next-line no-console
      console.info("[GenAI] parsed JSON", parsed);
    }

    const keys = ["calories", "protein", "carbs", "fat", "sugar", "sodium"];
    const output: any = {};
    for (const k of keys) {
      const v = parsed[k];
      output[k] = typeof v === "number" && !Number.isNaN(v) ? v : null;
    }

    if (keys.some((k) => output[k] == null)) {
      if (process.dev)
        console.warn("[GenAI] returned incomplete macro goals", parsed);
      return null;
    }

    if (process.dev) {
      // eslint-disable-next-line no-console
      console.info("[GenAI] final baseline metrics", output);
    }

    return output as MacroGoals;
  } catch (err) {
    if (process.dev) console.error("GenAI call failed", err);
    return null;
  }
}

export type { MacroGoals };

// Generate day-specific metrics based on baseline and today's planned activities
export async function generateDayMetricsForActivities(payload: {
  userId: string;
  body: {
    weight?: number | null;
    heightCm?: number | null;
    age?: number | null;
    exerciseLevel?: string | null;
    waterGoal?: number | null;
    mealPlanMode?: string | null;
    baseline?: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      sugar: number;
      sodium: number;
    } | null;
    activities?: Array<any>;
  };
}): Promise<MacroGoals | null> {
  const config = useRuntimeConfig();
  const key =
    config.GENAI_API_KEY ||
    config.OPENROUTER_API_KEY ||
    process.env.GENAI_API_KEY ||
    process.env.OPENROUTER_API_KEY;
  const model =
    config.GENAI_MODEL ||
    config.OPENROUTER_MODEL ||
    process.env.GENAI_MODEL ||
    process.env.OPENROUTER_MODEL ||
    "gemini-1.0";
  if (!key) return null;

  const { body } = payload;
  const userInfo2 = {
    weight: body.weight ?? null,
    heightCm: body.heightCm ?? null,
    age: body.age ?? null,
    exerciseLevel: body.exerciseLevel ?? null,
    waterGoal: body.waterGoal ?? null,
    mealPlanMode: body.mealPlanMode ?? null,
    baseline: body.baseline ?? null,
    activities: body.activities ?? [],
  };

  const systemPrompt2 = `You are a nutritionist giving advisory to a person on how much of what they should be eating. You will be given the following info about the user to help make your suggestions: Body Weight, Height, Age, Gender, General Exercise Level, Goal Water Consumption, Water Consumed, Meal Plan Mode, baseline suggestions for: Calories, Protein, Carbs, Fat, Sugar, and Sodium. You will also be given the planned physical activities the user has input into the program. All of this will be structured in a json block. Based on this outline, provide updated suggestions for Calories, Protein, Carbs, Fat, Sugar, and Sodium. Return only a single JSON object with numeric values for these keys.`;

  const userContent2 = `User info: ${JSON.stringify(
    userInfo2
  )}\nRespond with a single JSON object only.`;

  try {
    if (process.dev) {
      try {
        const infoForLog: any = {
          model,
          userInfo: {
            weight: userInfo2.weight,
            heightCm: userInfo2.heightCm,
            age: userInfo2.age,
            exerciseLevel: userInfo2.exerciseLevel,
            mealPlanMode: userInfo2.mealPlanMode,
            baseline: userInfo2.baseline,
            activities: Array.isArray(userInfo2.activities)
              ? userInfo2.activities.length
              : 0,
          },
        };
        // eslint-disable-next-line no-console
        console.info(
          "[GenAI] calling generateDayMetricsForActivities",
          infoForLog
        );
      } catch (e) {}
    }

    const prompt = `${systemPrompt2}\n\n${userContent2}`;
    const apiUrl = `https://generativelanguage.googleapis.com/v1/models/${model}:generateText`;
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        prompt: { text: prompt },
        temperature: 0.2,
        maxOutputTokens: 400,
      }),
    });

    if (process.dev) {
      // eslint-disable-next-line no-console
      console.info(
        "[GenAI] day-metrics response status:",
        res.status,
        res.statusText
      );
    }

    if (!res.ok) {
      const bodyText = await res.text();
      if (process.dev) {
        // eslint-disable-next-line no-console
        console.error(
          "[GenAI] returned non-OK for day-metrics",
          res.status,
          res.statusText,
          bodyText
        );
      }
      return null;
    }

    const data = await res.json();
    const candidateText =
      data?.candidates?.[0]?.output ||
      data?.candidates?.[0]?.content ||
      data?.candidates?.[0]?.text ||
      data?.output ||
      data?.response ||
      null;
    if (!candidateText) {
      if (process.dev)
        console.warn("[GenAI] no content in day-metrics response");
      return null;
    }

    const text =
      typeof candidateText === "string"
        ? candidateText
        : JSON.stringify(candidateText);
    const parsed = safeParseJsonMaybe(text);
    if (!parsed) {
      if (process.dev)
        console.warn("[GenAI] failed to parse day-metrics JSON", {
          text: text.slice ? text.slice(0, 1000) : text,
        });
      return null;
    }

    if (process.dev) {
      // eslint-disable-next-line no-console
      console.info("[GenAI] parsed day-metrics", parsed);
    }

    // Validate keys
    const keys = ["calories", "protein", "carbs", "fat", "sugar", "sodium"];
    const output: any = {};
    for (const k of keys) {
      const v = parsed[k];
      output[k] = typeof v === "number" && !Number.isNaN(v) ? v : null;
    }
    if (keys.some((k) => output[k] == null)) {
      if (process.dev) console.warn("[GenAI] day-metrics incomplete", parsed);
      return null;
    }

    if (process.dev) {
      // eslint-disable-next-line no-console
      console.info("[GenAI] final day metrics", output);
    }

    return output as MacroGoals;
  } catch (err) {
    if (process.dev) console.error("GenAI day-metrics call failed", err);
    return null;
  }
}
