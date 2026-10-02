# @aegis/sdk

The Aegis SDK evaluates an AI agent's data and action requests against a user's permission. It returns one deterministic result:

- `allow` — the request is covered by an active permission.
- `deny` — the permission is missing, expired, revoked, or does not cover the request.
- `approval_required` — the request needs a sensitive-action approval.

`MemoryPermissionStore` is only for local development. The Monad adapter will implement the same `PermissionStore` interface after the smart-contract ABI is agreed with Teammate 1.
