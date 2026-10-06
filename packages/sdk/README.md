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

`MemoryPermissionStore` is for local development. Replace it with the Monad-backed `PermissionStore` adapter once the team has agreed on the contract ABI and deployment address.

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
  agentId: "erc8004:monad:travel-agent-001",
  scope: "profile:dietary-preference",
});

const pending = await api.requestApproval({
  permissionId: "permission-from-the-current-check",
  requestId: crypto.randomUUID(),
  user: "0x1111111111111111111111111111111111111111",
  agentId: "erc8004:monad:travel-agent-001",
  action: "travel:book",
  amountMinor: "40000",
  currency: "USD",
  service: "demo-airline",
  deadline: Math.floor(Date.now() / 1000) + 300,
});

const decided = await api.waitForApproval(pending.request.approvalId);
if (decided.result.outcome !== "approved") {
  throw new Error("The user did not approve the booking");
}
```

The current web approval is explicitly a demo placeholder. Treat an `approved` result as authoritative only after Teammate 2 replaces it with a verified Mera/WebAuthn signature flow.

`MemoryPermissionStore` is only for local development. The Monad adapter will implement the same `PermissionStore` interface after the smart-contract ABI is agreed with Teammate 1.

## Delegated agents

`createDelegatedPermission(parent, child)` creates a child grant linked to its parent. It rejects scopes, actions, spending limits, services, approval thresholds, or an expiry that would give the child more authority than the parent. The SDK revalidates that relationship and every ancestor's active status on each request, so revoking or expiring a parent blocks its descendants on future checks.

The memory store and this behavior are a local prototype. A production Monad adapter must read the parent link and revocation state from the contract; a child permission should not be trusted just because an SDK caller constructed it.

## Gated data and actions

Use `AegisClient.readData()` instead of reading private context before checking permissions. Its callback runs only after an `allow` decision. `executeAction()` similarly runs an action only if allowed, or if the supplied approval adapter confirms a sensitive request. The CLI demo intentionally has no passkey adapter and fails closed for a booking that requires approval.

These SDK methods enforce ordering in the calling application; they are not cryptographic key management. The callback must be backed by a user-controlled vault/key holder that keeps secrets off-chain and releases only the requested field after checking the current permission. It should avoid handing agents reusable decryption keys. Revocation blocks future releases, not information an agent already received.
