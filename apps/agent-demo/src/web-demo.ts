import { AegisApiClient, AegisApiError, type Address } from "@aegis/sdk";
import { createPlanner, plannerName, planWithFallback } from "./planner-factory.js";

const baseUrl = process.env.AEGIS_WEB_URL ?? "http://localhost:3000";
const agentToken = requiredEnv("AEGIS_DEMO_AGENT_TOKEN");
const user = requiredAddress("AEGIS_USER");
const agentId = process.env.AEGIS_AGENT_ID ?? "erc8004:monad:travel-agent-001";
const permissionId = requiredEnv("AEGIS_PERMISSION_ID");
const userRequest =
  process.argv.slice(2).join(" ") ||
  "Plan a vegetarian weekend trip and propose a booking under $500.";

const api = new AegisApiClient({ baseUrl, agentToken });
const planner = createPlanner();
const plan = await planWithFallback(planner, userRequest);

console.log(`Planner: ${plannerName(planner)}`);
console.log("Plan:", plan.summary);
console.log(`Aegis service: ${baseUrl}`);

for (const scope of plan.requestedDataScopes) {
  try {
    const released = await api.requestContext({ user, agentId, scope });
    console.log(`Released context (${scope}):`, released.value);
  } catch (error) {
    if (error instanceof AegisApiError) {
      console.log(`Context denied (${scope}):`, error.reason);
      continue;
    }
    throw error;
  }
}

const requestId = crypto.randomUUID();
try {
  const pending = await api.requestApproval({
    permissionId,
    requestId,
    user,
    agentId,
    action: plan.proposedAction.action,
    amountMinor: plan.proposedAction.amountMinor,
    currency: plan.proposedAction.currency,
    service: plan.proposedAction.service,
    deadline: Math.floor(Date.now() / 1_000) + 300,
    agentNote: `Travel plan: ${plan.summary}`,
  });

  console.log(`Approval requested: ${pending.request.approvalId}`);
  console.log("Open the Aegis Approvals page and approve or reject the request.");
  console.log("Current web approval is a demo placeholder until Mera verification is connected.");

  const decided = await api.waitForApproval(pending.request.approvalId, {
    intervalMs: 1_000,
    timeoutMs: 300_000,
  });

  if (decided.result.outcome === "approved") {
    console.log("Booking executed after Aegis approval:", {
      action: plan.proposedAction.action,
      amountMinor: plan.proposedAction.amountMinor,
      currency: plan.proposedAction.currency,
      service: plan.proposedAction.service,
    });
  } else {
    console.log("Booking not executed: user rejected the request.");
  }
} catch (error) {
  if (error instanceof AegisApiError) {
    console.error(`Aegis denied the booking request: ${error.reason}`);
    if (error.detail) console.error(error.detail);
    process.exitCode = 1;
  } else {
    throw error;
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the connected agent demo`);
  return value;
}

function requiredAddress(name: string): Address {
  const value = requiredEnv(name);
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${name} must be a valid EVM address`);
  }
  return value as Address;
}
