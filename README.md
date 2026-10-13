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

The TypeScript workspace, SDK, web dashboard, encrypted demo vault, agent demo, and Solidity contracts work together. Aegis is deployed to Monad testnet at `0xeDB8F11c9b6F67ba1D51a4cEdc5151D41e4Bfdb3`, with test token `aUSD-TEST` at `0xdDa9B63b3e2996A62933cea050A46ACb08E987db`. In contract mode, Mera passkey accounts grant and revoke permissions, record exact one-use payment approvals, and fund the test vault. The encrypted context gateway checks the live contract before each release, and the registered ERC-8004 agent owner executes approved payments through `AegisPermissions.pay`. The remaining production limitation is the server-held demo vault key; it is explicitly not a claim that already released data can be revoked.

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

### Connected agent demo

To prove that a separate agent application can integrate Aegis, first start the web app and use its dashboard to store the demo context and grant the travel agent a permission. Copy that permission ID into `.env.local`, along with the matching user, agent token, and values documented in `.env.example`. Then run:

```bash
npm run demo:web
```

The connected demo signs scoped context requests with the registered agent wallet, requests an amount above the permission's automatic cap, and waits for the user in the Approvals dashboard. In contract mode, the passkey account records consent with `approvePayment`, and the agent executes the exact payment through the Aegis vault. Plaintext context values are deliberately omitted from terminal logs.

Without `KIMI_API_KEY`, the demo uses a deterministic local planner. To enable Kimi, copy `.env.example` to `.env.local`, insert a newly generated Kimi Open Platform key, and run `npm run demo`. Never commit or share the key.

If Kimi is unavailable because of balance, authentication, or network problems, the demo reports the failure and continues with the labeled local planner. This fallback keeps the Aegis permission demonstration usable, but it does not qualify as a live Kimi bounty integration.

The Kimi planner is a planning component only; Aegis independently checks its requested data and actions. The SDK tests can be run with `npm test`.

## Security boundary

The contract is the authorization source in contract mode; the local queue only transports pending approval requests. Payment consent is exact and one-use: permission ID, request ID, token amount, recipient, and deadline must match. The current encrypted vault is intentionally labeled as a server-held-key demo; production key custody must remain user controlled.
