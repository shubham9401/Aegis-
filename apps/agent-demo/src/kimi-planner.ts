import type { DataScope } from "@aegis/sdk";
import type { TravelPlan, TravelPlanner } from "./planner.js";

interface KimiPlannerOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

const allowedScopes = new Set<DataScope>([
  "profile:dietary-preference",
  "profile:travel-budget",
  "profile:passport-validity",
]);

export class KimiTravelPlanner implements TravelPlanner {
  readonly #apiKey: string;
  readonly #model: string;
  readonly #baseUrl: string;

  constructor({
    apiKey,
    model = "kimi-k2.6",
    baseUrl = "https://api.moonshot.ai/v1",
  }: KimiPlannerOptions) {
    this.#apiKey = apiKey;
    this.#model = model;
    this.#baseUrl = baseUrl.replace(/\/$/, "");
  }

  async plan(userRequest: string): Promise<TravelPlan> {
    const response = await fetch(`${this.#baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.#apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.#model,
        response_format: { type: "json_object" },
        max_completion_tokens: 800,
        messages: [
          {
            role: "system",
            content: [
              "You are the planning component of an AI travel agent.",
              "Return JSON only with keys summary, requestedDataScopes, and proposedAction.",
              "requestedDataScopes may contain only profile:dietary-preference, profile:travel-budget, or profile:passport-validity.",
              "proposedAction must contain action=travel:book, amountMinor as a decimal string, currency, and service.",
              "Use service=demo-airline and currency=USD for this hackathon demo.",
              "Do not claim authorization. A separate policy engine decides that.",
            ].join(" "),
          },
          { role: "user", content: userRequest },
        ],
      }),
    });

    const payload = (await response.json()) as ChatCompletionResponse;
    if (!response.ok) {
      throw new Error(payload.error?.message ?? `Kimi request failed with ${response.status}`);
    }

    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("Kimi returned no plan");

    return validatePlan(JSON.parse(content) as unknown);
  }
}

function validatePlan(value: unknown): TravelPlan {
  if (!isRecord(value)) throw new Error("Kimi plan is not an object");

  const scopes = value.requestedDataScopes;
  const action = value.proposedAction;
  if (
    typeof value.summary !== "string" ||
    !Array.isArray(scopes) ||
    !scopes.every((scope) => typeof scope === "string" && allowedScopes.has(scope as DataScope)) ||
    !isRecord(action) ||
    action.action !== "travel:book" ||
    typeof action.amountMinor !== "string" ||
    !/^\d+$/.test(action.amountMinor) ||
    typeof action.currency !== "string" ||
    typeof action.service !== "string"
  ) {
    throw new Error("Kimi returned a plan that does not match the Aegis schema");
  }

  return {
    summary: value.summary,
    requestedDataScopes: scopes as DataScope[],
    proposedAction: {
      action: "travel:book",
      amountMinor: action.amountMinor,
      currency: action.currency,
      service: action.service,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
