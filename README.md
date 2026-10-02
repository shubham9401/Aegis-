# Aegis

Aegis is a user-controlled trust and permission layer for AI agents. It lets users selectively share information and define which actions an agent may take. The hackathon demo will use a travel-planning agent to show allowed access, a blocked over-limit action, user approval, and revocation.

## Repository map

- `packages/sdk/` — Teammate 3's TypeScript permission-checking SDK.
- `apps/agent-demo/` — Teammate 3's sample AI travel agent and demo flow.
- `contracts/` — Teammate 1's Monad permission contract and ERC-8004 integration.
- `indexer/envio/` — Envio indexer for permission and revocation events.
- `docs/` — architecture, team plan, and working notes.

## Build status

Block 1 is complete: the TypeScript workspace, core SDK types, deterministic permission engine, local permission adapter, and command-line travel-agent demo are working. The Monad contract adapter, Kimi integration, passkey approval handoff, and Envio indexer remain to be built.

## Run locally

```bash
npm install
npm run build
npm run demo
```

The demo prints four decisions: allowed data access, an action requiring approval, an over-limit denial, and a denial after revocation.

Without `KIMI_API_KEY`, the demo uses a deterministic local planner. To enable Kimi, copy `.env.example` to `.env.local`, insert a newly generated Kimi Open Platform key, and run `npm run demo`. Never commit or share the key.

If Kimi is unavailable because of balance, authentication, or network problems, the demo reports the failure and continues with the labeled local planner. This fallback keeps the Aegis permission demonstration usable, but it does not qualify as a live Kimi bounty integration.

## First integration decisions

Before implementing the SDK, agree on the permission contract's public methods and event fields with Teammate 1. Agree with Teammate 2 on how the app requests and returns passkey approval. Record those interfaces in `docs/` so all three parts can integrate against the same contract.
