import {
  AegisClient,
  MemoryPermissionStore,
  type AgentPermission,
  type AgentRequest,
  type DataScope,
} from "@aegis/sdk";
import { KimiTravelPlanner } from "./kimi-planner.js";
import { LocalTravelPlanner, type TravelPlanner } from "./planner.js";

const user = "0x1111111111111111111111111111111111111111" as const;
const agentId = "erc8004:monad:travel-agent-001";
const now = Math.floor(Date.now() / 1000);
const userRequest =
  process.argv.slice(2).join(" ") ||
  "Plan a vegetarian weekend trip and propose a booking under $500.";

const permission: AgentPermission = {
  permissionId: "demo-permission-001",
  user,
  agentId,
  dataScopes: ["profile:dietary-preference", "profile:travel-budget"],
  actionRules: [
    {
      action: "travel:book",
      maxAmountMinor: 50_000n,
      requireApprovalAboveMinor: 30_000n,
      currency: "USD",
      allowedServices: ["demo-airline"],
    },
  ],
  expiresAt: now + 86_400,
};

const privateContext: Partial<Record<DataScope, string>> = {
  "profile:dietary-preference": "vegetarian",
  "profile:travel-budget": "USD 500",
  "profile:passport-validity": "valid",
};

const store = new MemoryPermissionStore([permission]);
const aegis = new AegisClient({ store });
const planner = createPlanner();

console.log(`Planner: ${planner instanceof KimiTravelPlanner ? "Kimi" : "local demo"}`);
const plan = await planWithFallback(planner, userRequest);
console.log("Plan:", plan.summary);

for (const scope of plan.requestedDataScopes) {
  const request: AgentRequest = {
    requestId: crypto.randomUUID(),
    kind: "data",
    user,
    agentId,
    requestedAt: now,
    scope,
  };
  const decision = await aegis.check(request);
  console.log(`Data request (${scope}):`, decision);

  if (decision.outcome === "allow") {
    console.log(`Released context (${scope}):`, privateContext[scope]);
  }
}

const actionRequest: AgentRequest = {
  requestId: crypto.randomUUID(),
  kind: "action",
  user,
  agentId,
  requestedAt: now,
  action: plan.proposedAction.action,
  amountMinor: BigInt(plan.proposedAction.amountMinor),
  currency: plan.proposedAction.currency,
  service: plan.proposedAction.service,
};
const actionDecision = await aegis.check(actionRequest);
console.log("Booking request:", actionDecision);

function createPlanner(): TravelPlanner {
  const apiKey = process.env.KIMI_API_KEY;
  if (!apiKey) return new LocalTravelPlanner();

  return new KimiTravelPlanner({
    apiKey,
    ...(process.env.KIMI_MODEL ? { model: process.env.KIMI_MODEL } : {}),
  });
}

async function planWithFallback(
  selectedPlanner: TravelPlanner,
  request: string,
): Promise<Awaited<ReturnType<TravelPlanner["plan"]>>> {
  try {
    return await selectedPlanner.plan(request);
  } catch (error) {
    if (!(selectedPlanner instanceof KimiTravelPlanner)) throw error;

    const reason = error instanceof Error ? error.message : "unknown Kimi API error";
    console.error("Kimi planning failed; using the local demo planner.");
    console.error(`Kimi error: ${redactProviderIdentifiers(reason)}`);
    return new LocalTravelPlanner().plan(request);
  }
}

function redactProviderIdentifiers(message: string): string {
  return message
    .replace(/org-[a-zA-Z0-9]+/g, "org-[redacted]")
    .replace(/<ak-[^>]+>/g, "<api-key-id-redacted>");
}
