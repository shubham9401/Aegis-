# @aegis/sdk

The Aegis SDK evaluates an AI agent's data and action requests against a user's permission. It returns one deterministic result:

- `allow` — the request is covered by an active permission.
- `deny` — the permission is missing, expired, revoked, or does not cover the request.
- `approval_required` — the request needs a sensitive-action approval.

`MemoryPermissionStore` is only for local development. The Monad adapter will implement the same `PermissionStore` interface after the smart-contract ABI is agreed with Teammate 1.

## Delegated agents

`createDelegatedPermission(parent, child)` creates a child grant linked to its parent. It rejects scopes, actions, spending limits, services, approval thresholds, or an expiry that would give the child more authority than the parent. The SDK revalidates that relationship and every ancestor's active status on each request, so revoking or expiring a parent blocks its descendants on future checks.

The memory store and this behavior are a local prototype. A production Monad adapter must read the parent link and revocation state from the contract; a child permission should not be trusted just because an SDK caller constructed it.

## Gated data and actions

Use `AegisClient.readData()` instead of reading private context before checking permissions. Its callback runs only after an `allow` decision. `executeAction()` similarly runs an action only if allowed, or if the supplied approval adapter confirms a sensitive request. The CLI demo intentionally has no passkey adapter and fails closed for a booking that requires approval.

These SDK methods enforce ordering in the calling application; they are not cryptographic key management. The callback must be backed by a user-controlled vault/key holder that keeps secrets off-chain and releases only the requested field after checking the current permission. It should avoid handing agents reusable decryption keys. Revocation blocks future releases, not information an agent already received.
