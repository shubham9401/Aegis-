# Aegis

Aegis is a user-controlled trust and permission layer for AI agents. It lets users selectively share information and define which actions an agent may take. The hackathon demo will use a travel-planning agent to show allowed access, a blocked over-limit action, user approval, and revocation.

## Repository map

- `packages/sdk/` — Teammate 3's TypeScript permission-checking SDK.
- `apps/agent-demo/` — Teammate 3's sample AI travel agent and demo flow.
- `contracts/` — Teammate 1's Monad permission contract and ERC-8004 integration.
- `indexer/envio/` — Envio indexer for permission and revocation events.
- `docs/` — architecture, team plan, and working notes.

## Build status

The TypeScript workspace, permission engine, local permission adapter, and command-line travel-agent demo are working. The SDK now demonstrates narrowed agent-to-agent delegation, parent-revocation checks, permission-gated data reads, and action execution that fails closed when required approval is missing. The demo's data source is still an in-memory stand-in—not encrypted storage—and permissions are still local, not read from Monad.

## Run locally

```bash
npm install
npm run build
npm run demo
```

The demo shows the primary agent reading only granted fields, a helper agent searching under a narrower delegated permission, that helper being denied access to the travel budget, a booking held for passkey approval, and the helper being blocked after the parent permission is revoked.

Without `KIMI_API_KEY`, the demo uses a deterministic local planner. To enable Kimi, copy `.env.example` to `.env.local`, insert a newly generated Kimi Open Platform key, and run `npm run demo`. Never commit or share the key.

If Kimi is unavailable because of balance, authentication, or network problems, the demo reports the failure and continues with the labeled local planner. This fallback keeps the Aegis permission demonstration usable, but it does not qualify as a live Kimi bounty integration.

The Kimi planner is a planning component only; Aegis independently checks its requested data and actions. The SDK tests can be run with `npm test`.

## First integration decisions

Before connecting the SDK to the chain, agree on permission IDs, parent links, revocation lookup, public methods, and events with Teammate 1. Agree with Teammate 2 on how the app requests and returns passkey approval. The remaining privacy integration is a user-controlled encrypted vault/key-release adapter: the SDK gate demonstrates the required check-before-release order, but does not itself encrypt or manage keys.
