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
  const key = config.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  const model =
    config.OPENROUTER_MODEL || process.env.OPENROUTER_MODEL || "gpt-4o-mini";
  if (!key) return null;

  const { body } = payload;
  const weight =
    typeof body.weight === "number"
      ? body.weight
      : typeof body.weightKg === "number"
      ? Math.round(body.weightKg * 2.2046226218 * 10) / 10
      : null;

  const systemPrompt = `You are a nutritionist giving advisory to a person on how much of what they should be eating. You will be given the following info about the user to help make your suggestions: Body Weight (lbs), Height (cm), Age, General Exercise Level, Goal Water Consumption, Water Consumed, Meal Plan Mode. Your job is to create json structured suggestions for the following: Calories, Protein, Carbs, Fat, Sugar, and Sodium. You are to return your results only and only in a key value json block. Example: {"calories":2200, "protein":120, "carbs":250, "fat":70, "sugar":30, "sodium":2300}`;

  const userInfo = {
    weight: weight ?? null,
    heightCm: body.heightCm ?? null,
    age: body.age ?? null,
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
      // Log a high-level summary of the request (do not print the API key)
      // so developers can see when OpenRouter is being called and with what
      // model and user info.
      // Mask any possibly large fields for readability.
      try {
        // shallow copy and mask heavy fields
        const infoForLog: any = {
          model,
          userInfo: {
            weight: userInfo.weight,
            heightCm: userInfo.heightCm,
            age: userInfo.age,
            exerciseLevel: userInfo.exerciseLevel,
            mealPlanMode: userInfo.mealPlanMode,
            waterGoal: userInfo.waterGoal,
          },
        };
        // eslint-disable-next-line no-console
        console.info("[OpenRouter] calling chat/completions", infoForLog);
      } catch (logErr) {
        // ignore logging errors
      }
    }

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        max_tokens: 400,
        temperature: 0.2,
      }),
    });

    if (process.dev) {
      // Log response status for visibility
      // eslint-disable-next-line no-console
      console.info("[OpenRouter] response status:", res.status, res.statusText);
    }

    if (!res.ok) {
      const bodyText = await res.text();
      if (process.dev) {
        // eslint-disable-next-line no-console
        console.error(
          "[OpenRouter] returned non-OK",
          res.status,
          res.statusText,
          bodyText
        );
      }
      return null;
    }

    const data = await res.json();
    if (process.dev) {
      try {
        // Log a truncated/version of the response to help debugging.
        const choicesSummary = Array.isArray(data?.choices)
          ? data.choices.map((c: any, i: number) => ({
              idx: i,
              message:
                typeof c?.message?.content === "string"
                  ? c.message.content.slice(0, 200)
                  : c.message?.content,
            }))
          : [];
        // eslint-disable-next-line no-console
        console.info("[OpenRouter] response summary", { choicesSummary });
      } catch (e) {
        // ignore
      }
    }
    // openrouter responses generally have choices[].message.content
    const content =
      (data?.choices && data.choices[0]?.message?.content) ||
      data?.choices?.[0]?.message ||
      data?.choices?.[0]?.text ||
      null;
    if (!content) {
      if (process.dev)
        console.warn("[OpenRouter] no content found in response");
      return null;
    }

    // content may be a string or an object
    const text =
      typeof content === "string" ? content : JSON.stringify(content);
    const parsed = safeParseJsonMaybe(text);
    if (!parsed) {
      if (process.dev) {
        // eslint-disable-next-line no-console
        console.warn("[OpenRouter] failed to parse JSON from model output", {
          text: text.slice ? text.slice(0, 1000) : text,
        });
      }
      return null;
    }

    if (process.dev) {
      try {
        // eslint-disable-next-line no-console
        console.info("[OpenRouter] parsed JSON", parsed);
      } catch (e) {}
    }

    // Validate the parsed object contains expected numeric keys
    const keys = ["calories", "protein", "carbs", "fat", "sugar", "sodium"];
    const output: any = {};
    for (const k of keys) {
      const v = parsed[k];
      output[k] = typeof v === "number" && !Number.isNaN(v) ? v : null;
    }

    // If any are null, consider the result incomplete — return null
    if (keys.some((k) => output[k] == null)) {
      if (process.dev)
        console.warn("[OpenRouter] returned incomplete macro goals", parsed);
      return null;
    }

    if (process.dev) {
      // eslint-disable-next-line no-console
      console.info("[OpenRouter] final baseline metrics", output);
    }

    return output as MacroGoals;
  } catch (err) {
    if (process.dev) console.error("OpenRouter call failed", err);
    return null;
  }
}

export type { MacroGoals };
