// POST /api/agent/plan — Runs the Kimi planner server-side
// Key stays server-side only. Falls back to local planner with label.

import { NextRequest } from "next/server";
import { agentPlanRequestSchema } from "@/lib/validation";
import { parseBody } from "@/lib/utils";
import type { DataScope } from "@aegis/sdk";

interface TravelPlan {
  summary: string;
  requestedDataScopes: DataScope[];
  proposedAction: {
    action: string;
    amountMinor: string;
    currency: string;
    service: string;
  };
}

const allowedScopes = new Set<DataScope>([
  "profile:dietary-preference",
  "profile:travel-budget",
  "profile:passport-validity",
]);

export async function POST(request: NextRequest) {
  const parsed = await parseBody(request, agentPlanRequestSchema);
  if (parsed instanceof Response) return parsed;

  const apiKey = process.env.KIMI_API_KEY;
  const model = process.env.KIMI_MODEL ?? "kimi-k2.6";

  let plan: TravelPlan;
  let planner: "kimi" | "local";

  if (apiKey) {
    try {
      plan = await callKimi(apiKey, model, parsed.userRequest);
      planner = "kimi";
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown Kimi API error";
      console.error(`Kimi planning failed; using the local demo planner.`);
      console.error(`Kimi error: ${redactProviderIdentifiers(reason)}`);
      plan = localPlan(parsed.userRequest);
      planner = "local";
    }
  } else {
    plan = localPlan(parsed.userRequest);
    planner = "local";
  }

  return Response.json({
    plan,
    planner,
    note: planner === "local" ? "Using local demo planner (Kimi API key not configured or failed)" : undefined,
  });
}

async function callKimi(apiKey: string, model: string, userRequest: string): Promise<TravelPlan> {
  const baseUrl = "https://api.moonshot.ai/v1";
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
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

  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Kimi request failed with ${response.status}`);
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Kimi returned no plan");

  return validatePlan(JSON.parse(content) as unknown);
}

function localPlan(userRequest: string): TravelPlan {
  return {
    summary: `Local demo plan for: ${userRequest}`,
    requestedDataScopes: ["profile:dietary-preference", "profile:travel-budget"],
    proposedAction: {
      action: "travel:book",
      amountMinor: "40000",
      currency: "USD",
      service: "demo-airline",
    },
  };
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

function redactProviderIdentifiers(message: string): string {
  return message
    .replace(/org-[a-zA-Z0-9]+/g, "org-[redacted]")
    .replace(/<ak-[^>]+>/g, "<api-key-id-redacted>");
}
