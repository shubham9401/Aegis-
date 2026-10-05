import assert from "node:assert/strict";
import test from "node:test";
import { AegisApiClient, AegisApiError } from "../dist/index.js";

const user = "0x1111111111111111111111111111111111111111";

test("agent API client authenticates context and approval requests", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.includes("/api/context/")) {
      return Response.json({ scope: "profile:dietary-preference", value: "vegetarian" });
    }
    return Response.json({
      request: {
        approvalId: "approval-1",
        permissionId: "permission-1",
        requestId: "00000000-0000-4000-8000-000000000000",
        user,
        agentId: "agent-1",
        action: "travel:book",
        amountMinor: "40000",
        currency: "USD",
        service: "demo-airline",
        requestedAt: 100,
        deadline: Math.floor(Date.now() / 1_000) + 60,
      },
      result: { approvalId: "approval-1", outcome: "pending" },
    });
  };
  const client = new AegisApiClient({
    baseUrl: "http://localhost:3000/",
    agentToken: "demo-token",
    fetchImpl,
  });

  const context = await client.requestContext({
    user,
    agentId: "agent-1",
    scope: "profile:dietary-preference",
  });
  assert.equal(context.value, "vegetarian");

  await client.requestApproval({
    permissionId: "permission-1",
    requestId: "00000000-0000-4000-8000-000000000000",
    user,
    agentId: "agent-1",
    action: "travel:book",
    amountMinor: "40000",
    currency: "USD",
    service: "demo-airline",
    deadline: Math.floor(Date.now() / 1_000) + 60,
  });

  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(new Headers(call.init.headers).get("authorization"), "Bearer demo-token");
  }
});

test("agent API client polls until the user decides", async () => {
  let polls = 0;
  const fetchImpl = async () => {
    polls += 1;
    return Response.json({
      request: {
        approvalId: "approval-1",
        permissionId: "permission-1",
        requestId: "00000000-0000-4000-8000-000000000000",
        user,
        agentId: "agent-1",
        action: "travel:book",
        amountMinor: "40000",
        currency: "USD",
        service: "demo-airline",
        requestedAt: 100,
        deadline: Math.floor(Date.now() / 1_000) + 60,
      },
      result: polls === 1
        ? { approvalId: "approval-1", outcome: "pending" }
        : {
            approvalId: "approval-1",
            outcome: "approved",
            signer: user,
            signature: `0x${"ab".repeat(65)}`,
            nonce: `0x${"cd".repeat(32)}`,
            signedAt: 150,
          },
    });
  };
  const client = new AegisApiClient({
    baseUrl: "http://localhost:3000",
    agentToken: "demo-token",
    fetchImpl,
  });

  const approval = await client.waitForApproval("approval-1", {
    intervalMs: 0,
    timeoutMs: 1_000,
  });
  assert.equal(approval.result.outcome, "approved");
  assert.equal(polls, 2);
});

test("agent API client exposes machine-readable API errors", async () => {
  const client = new AegisApiClient({
    baseUrl: "http://localhost:3000",
    agentToken: "demo-token",
    fetchImpl: async () => Response.json(
      { error: "AMOUNT_EXCEEDS_LIMIT", detail: "The booking is over the configured limit" },
      { status: 403 },
    ),
  });

  await assert.rejects(
    () => client.requestContext({
      user,
      agentId: "agent-1",
      scope: "profile:dietary-preference",
    }),
    (error) => {
      assert.ok(error instanceof AegisApiError);
      assert.equal(error.status, 403);
      assert.equal(error.reason, "AMOUNT_EXCEEDS_LIMIT");
      return true;
    },
  );
});
