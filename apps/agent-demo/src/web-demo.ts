import { AegisApiClient, AegisApiError, type Address, type Bytes32 } from "@aegis/sdk";
import { hexlify, randomBytes } from "ethers";
import { createPlanner, plannerName, planWithFallback } from "./planner-factory.js";
import { createAgentRuntime } from "./agent-proof.js";

const baseUrl = process.env.AEGIS_WEB_URL ?? "http://localhost:3000";
const agentToken = requiredEnv("AEGIS_DEMO_AGENT_TOKEN");
const user = requiredAddress("AEGIS_USER");
const agentId = process.env.AEGIS_AGENT_ID ?? "erc8004:monad:travel-agent-001";
const permissionId = requiredEnv("AEGIS_PERMISSION_ID");
const userRequest =
  process.argv.slice(2).join(" ") ||
  "Plan a vegetarian weekend trip and propose a booking under $500.";

const contractMode = process.env.NEXT_PUBLIC_ADAPTER === "contract";
const agentRuntime = contractMode ? await createAgentRuntime() : undefined;
const api = new AegisApiClient({
  baseUrl,
  agentToken,
  ...(agentRuntime ? { contextProofProvider: agentRuntime.contextProofProvider } : {}),
});
const planner = createPlanner();
const plan = await planWithFallback(planner, userRequest);

console.log(`Planner: ${plannerName(planner)}`);
console.log("Plan:", plan.summary);
console.log(`Aegis service: ${baseUrl}`);

for (const scope of plan.requestedDataScopes) {
  try {
    const released = await api.requestContext({ user, agentId, scope, permissionId });
    console.log(`Protected context released (${scope}); value kept out of logs (${released.value.length} characters).`);
  } catch (error) {
    if (error instanceof AegisApiError) {
      console.log(`Context denied (${scope}):`, error.reason);
      continue;
    }
    throw error;
  }
}

const requestId = contractMode ? hexlify(randomBytes(32)) as Bytes32 : crypto.randomUUID();
const paymentPolicy = agentRuntime ? await agentRuntime.paymentPolicy(permissionId) : undefined;
const paymentRecipient = paymentPolicy?.recipient ?? plan.proposedAction.service;
// Contract mode deliberately exceeds the automatic cap so the one-use approval path is exercised.
const paymentAmountMinor = paymentPolicy
  ? (paymentPolicy.spendingLimitMinor + 10_000n).toString()
  : plan.proposedAction.amountMinor;
try {
  const pending = await api.requestApproval({
    permissionId,
    requestId,
    user,
    agentId,
    action: plan.proposedAction.action,
    amountMinor: paymentAmountMinor,
    currency: plan.proposedAction.currency,
    service: paymentRecipient,
    deadline: Math.floor(Date.now() / 1_000) + 300,
    agentNote: `Travel plan: ${plan.summary}`,
  });

  console.log(`Approval requested: ${pending.request.approvalId}`);
  console.log("Open the Aegis Approvals page and approve or reject the request.");
  console.log("Approve with the Mera passkey in Aegis. The server verifies the signed decision before returning it.");

  const decided = await api.waitForApproval(pending.request.approvalId, {
    intervalMs: 1_000,
    timeoutMs: 300_000,
  });

  if (decided.result.outcome === "approved") {
    const paymentTxHash = agentRuntime
      ? await agentRuntime.pay({
          permissionId,
          requestId: requestId as Bytes32,
          recipient: paymentRecipient as Address,
          amountMinor: paymentAmountMinor,
        })
      : undefined;
    console.log(agentRuntime ? "Booking payment executed through the Aegis vault:" : "Demo booking approved:", {
      action: plan.proposedAction.action,
      amountMinor: paymentAmountMinor,
      currency: plan.proposedAction.currency,
      service: paymentRecipient,
      ...(paymentTxHash ? { transactionHash: paymentTxHash } : {}),
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
