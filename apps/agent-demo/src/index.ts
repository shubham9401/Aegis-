import {
  AegisClient,
  createDelegatedPermission,
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
      action: "travel:search",
      allowedServices: ["demo-airline"],
    },
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

const helperPermission = createDelegatedPermission(
  permission,
  {
    permissionId: "demo-permission-helper-001",
    agentId: "erc8004:monad:flight-search-helper-001",
    dataScopes: ["profile:dietary-preference"],
    actionRules: [
      {
        action: "travel:search",
        allowedServices: ["demo-airline"],
      },
    ],
    expiresAt: now + 3_600,
  },
  now,
);

const store = new MemoryPermissionStore([permission]);
store.delegatePermission(agentId, helperPermission);
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
  const result = await aegis.readData(request, async (approvedScope) => {
    // Demo stand-in for a user-controlled encrypted vault/key-release adapter.
    return privateContext[approvedScope];
  });
  console.log(`Data request (${scope}):`, result.decision);

  if (result.decision.outcome === "allow") {
    console.log(`Released context (${scope}):`, result.data);
  }
}

console.log("\nDelegated helper checks:");
const helperSearch: AgentRequest = {
  requestId: crypto.randomUUID(),
  kind: "action",
  user,
  agentId: helperPermission.agentId,
  requestedAt: now,
  action: "travel:search",
  service: "demo-airline",
};
const helperSearchResult = await aegis.executeAction(
  helperSearch,
  async () => "Search action executed",
);
console.log("Helper search:", helperSearchResult);

const helperBudgetRequest: AgentRequest = {
  requestId: crypto.randomUUID(),
  kind: "data",
  user,
  agentId: helperPermission.agentId,
  requestedAt: now,
  scope: "profile:travel-budget",
};
console.log("Helper asks for travel budget:", await aegis.check(helperBudgetRequest));

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
const bookingResult = await aegis.executeAction(
  actionRequest,
  async () => "Booking executed",
  async () => {
    console.log("Booking exceeds the no-prompt threshold; passkey approval is required.");
    // No passkey adapter is wired in this CLI demo, so fail closed.
    return false;
  },
);
console.log("Booking request:", bookingResult);

store.revokePermission(user, agentId, Math.floor(Date.now() / 1000));
console.log("Helper search after parent revocation:", await aegis.check(helperSearch));

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
