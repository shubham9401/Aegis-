// Kimi proposes structured actions; only the SDK decides authorization.
import { NextRequest } from "next/server";
import { z } from "zod";
import { agentPlanRequestSchema, amountMinorSchema, dataScopeSchema } from "@/lib/validation";
import { apiError, parseBody } from "@/lib/utils";
import { requireAgent, requireUser } from "@/lib/server-auth";
import { CURRENCIES } from "@/lib/profile-fields";

const planSchema = z.object({
  summary: z.string().min(1).max(2000),
  requestedDataScopes: z.array(dataScopeSchema).max(3).refine(scopes => new Set(scopes).size === scopes.length),
  proposedAction: z.object({
    action: z.literal("travel:book"),
    amountMinor: amountMinorSchema.refine(amount => BigInt(amount) > 0n),
    currency: z.enum(CURRENCIES),
    service: z.string().trim().min(1).max(256),
  }).strict(),
}).strict();

export async function POST(request: NextRequest) {
  // Agent integrations and signed-in users may invoke the planner.
  const authorization = request.headers.has("authorization")
    ? await requireAgent(request) : await requireUser(request);
  if (authorization instanceof Response) return authorization;
  const parsed = await parseBody(request, agentPlanRequestSchema);
  if (parsed instanceof Response) return parsed;
  const apiKey = process.env.KIMI_API_KEY?.trim();
  if (!apiKey) return apiError(503, "PLANNER_UNAVAILABLE", "Configure the server KIMI_API_KEY to generate a travel plan");

  try {
    const model = process.env.KIMI_MODEL?.trim() || "kimi-k2.6";
    const response = await fetch("https://api.moonshot.ai/v1/chat/completions", {
      method: "POST", signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        ...(model === "kimi-k2.6" ? { thinking: { type: "disabled" } } : {}),
        response_format: { type: "json_object" }, max_completion_tokens: 800,
        messages: [{ role: "system", content: [
          "You propose a travel booking; a separate deterministic policy engine decides authorization.",
          "Return JSON keys summary, requestedDataScopes, proposedAction.",
          "Scopes may only be profile:dietary-preference, profile:travel-budget, profile:passport-validity.",
          "proposedAction contains action=travel:book, amountMinor as a positive integer decimal string in cents, currency USD/EUR/GBP/INR and service.",
          "When the user includes Payment: USD <amount> to <wallet>, use that exact amount and wallet as service.",
          "Use only the user's specified amount, currency and service. Never fabricate a price or booking provider.",
          "If any booking fields are missing, return {error:'MISSING_BOOKING_DETAILS'} instead.",
          "Do not claim to have booked, paid, or obtained authorization.",
        ].join(" ") }, { role: "user", content: parsed.userRequest }],
      }),
    });
    if (!response.ok) return apiError(502, "PLANNER_PROVIDER_ERROR", "The planning provider could not process the request");
    const payload = await response.json() as { choices?: Array<{ finish_reason?: string; message?: { content?: string } }> };
    if (payload.choices?.[0]?.finish_reason !== "stop") throw new Error("INCOMPLETE_PLAN");
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("INVALID_PLAN");
    const raw: unknown = JSON.parse(content);
    if (typeof raw === "object" && raw !== null && "error" in raw) {
      return apiError(400, "MISSING_BOOKING_DETAILS", "Specify a booking amount, currency, and service");
    }
    const plan = planSchema.parse(raw);
    return Response.json({ plan, planner: "kimi" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Provider response bodies can contain credentials or private requests; do not log them.
    return apiError(502, "PLANNER_FAILED", "Planning failed or returned an invalid plan. Retry with explicit booking details");
  }
}
