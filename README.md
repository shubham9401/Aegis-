# Aegis

Aegis is a user-controlled trust and permission layer for AI agents. It lets users selectively share information and define which actions an agent may take. The hackathon demo will use a travel-planning agent to show allowed access, a blocked over-limit action, user approval, and revocation.

## Repository map

- `packages/sdk/` — Teammate 3's TypeScript permission-checking SDK.
- `apps/agent-demo/` — Teammate 3's sample AI travel agent and demo flow.
- `apps/web/` — dashboard, encrypted demo vault, permission APIs, and approval UI.
- `contracts/` — Teammate 1's Monad permission contract and ERC-8004 integration.
- `indexer/envio/` — Envio indexer for permission and revocation events.
- `docs/` — architecture, team plan, and working notes.

## Build status

The TypeScript workspace, permission engine, local permission adapter, command-line agent demo, web dashboard, and Solidity contract package are working locally. Aegis is deployed to Monad testnet at `0x37Ba78B771FC28Dc03387c8777997F751120664D`, with demo token `aUSD-TEST` at `0xdDa9B63b3e2996A62933cea050A46ACb08E987db`. The web context endpoint uses the SDK's gated read so decryption happens only inside the allowed callback. The app and SDK still need to replace their local permission adapter with the deployed contract; the vault uses a server-held demo key, and approval signatures remain a labeled mock until Mera is connected.

## Run locally

```bash
npm install
npm run build
npm test
npm run demo
npm run demo:contracts
npm run dev:web
```

The demo shows the primary agent reading only granted fields, a helper agent searching under a narrower delegated permission, that helper being denied access to the travel budget, a booking held for passkey approval, and the helper being blocked after the parent permission is revoked.

Without `KIMI_API_KEY`, the demo uses a deterministic local planner. To enable Kimi, copy `.env.example` to `.env.local`, insert a newly generated Kimi Open Platform key, and run `npm run demo`. Never commit or share the key.

If Kimi is unavailable because of balance, authentication, or network problems, the demo reports the failure and continues with the labeled local planner. This fallback keeps the Aegis permission demonstration usable, but it does not qualify as a live Kimi bounty integration.

The Kimi planner is a planning component only; Aegis independently checks its requested data and actions. The SDK tests can be run with `npm test`.

## First integration decisions

Before connecting the SDK to the chain, agree on permission IDs, parent links, revocation lookup, public methods, and events with Teammate 1. The web app now provides the integration boundary for Teammate 2, but the real Mera ceremony and server-side approval verification are still required. The current encrypted vault is intentionally labeled as a server-held-key demo; production key custody must remain user controlled.
