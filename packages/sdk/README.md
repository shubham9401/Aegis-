# @aegis/sdk

The Aegis SDK evaluates an AI agent's data and action requests against a user's permission. It returns one deterministic result:

- `allow` — the request is covered by an active permission.
- `deny` — the permission is missing, expired, revoked, or does not cover the request.
- `approval_required` — the request needs a sensitive-action approval.

## Quick start

```ts
import { AegisClient, MemoryPermissionStore } from "@aegis/sdk";

const store = new MemoryPermissionStore([permission]);
const aegis = new AegisClient({ store });

const decision = await aegis.checkPermission({
  requestId: crypto.randomUUID(),
  kind: "action",
  user: "0x1111111111111111111111111111111111111111",
  agentId: "erc8004:monad:travel-agent-001",
  requestedAt: Math.floor(Date.now() / 1000),
  action: "travel:book",
  amountMinor: 40_000n,
  currency: "USD",
  service: "demo-airline",
});
```

`MemoryPermissionStore` is for local development. The web gateway's contract adapter reads the deployed Monad grant and fails closed instead of falling back to this store.

## Connect an agent application

`AegisApiClient` calls the protected context and approval endpoints exposed by the Aegis web service. Keep the agent token on the server; never ship it in browser code.

```ts
import { AegisApiClient } from "@aegis/sdk";

const api = new AegisApiClient({
  baseUrl: process.env.AEGIS_WEB_URL!,
  agentToken: process.env.AEGIS_DEMO_AGENT_TOKEN!,
});

const context = await api.requestContext({
  user: "0x1111111111111111111111111111111111111111",
  agentId: "2088",
  scope: "profile:dietary-preference",
});

const pending = await api.requestApproval({
  permissionId: "permission-from-the-current-check",
  requestId: "0x<32-random-bytes>",
  user: "0x1111111111111111111111111111111111111111",
  agentId: "2088",
  action: "travel:book",
  amountMinor: "40000",
  currency: "USD",
  service: "0x2222222222222222222222222222222222222222",
  deadline: Math.floor(Date.now() / 1000) + 300,
});

const decided = await api.waitForApproval(pending.request.approvalId);
if (decided.result.outcome !== "approved") {
  throw new Error("The user did not approve the booking");
}
```

In contract mode, the user-facing app submits `approvePayment` with the Mera-derived account and the server verifies the resulting transaction and event before returning approval to the agent. The registered ERC-8004 owner then calls `pay`; the SDK never treats the local queue as payment authority.

## Delegated agents

`createDelegatedPermission(parent, child)` creates a child grant linked to its parent. It rejects scopes, actions, spending limits, services, approval thresholds, or an expiry that would give the child more authority than the parent. The SDK revalidates that relationship and every ancestor's active status on each request, so revoking or expiring a parent blocks its descendants on future checks.

The memory-store implementation remains useful for unit tests. The deployed contract independently enforces narrower child grants, bounded depth, ancestor revocation, shared allowance consumption, and current ERC-8004 ownership.

## Gated data and actions

Use `AegisClient.readData()` instead of reading private context before checking permissions. Its callback runs only after an `allow` decision. `executeAction()` similarly runs an action only if allowed, or if the supplied approval adapter confirms a sensitive request. The CLI demo intentionally has no passkey adapter and fails closed for a booking that requires approval.

These SDK methods enforce ordering in the calling application; they are not cryptographic key management. The callback must be backed by a user-controlled vault/key holder that keeps secrets off-chain and releases only the requested field after checking the current permission. It should avoid handing agents reusable decryption keys. Revocation blocks future releases, not information an agent already received.
