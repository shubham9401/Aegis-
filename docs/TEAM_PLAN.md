# Aegis team plan

## Roles

### Teammate 1 — Smart contract and Monad
- Implement the permission grant, check, expiry, and revoke flow.
- Define contract methods/events and share the ABI/address as soon as available.
- Integrate the chosen ERC-8004 agent identity check.

### Teammate 2 — User app and passkey experience
- Build the permission dashboard and approval/revocation screens.
- Integrate Mera for passkey-based account access and approvals.
- Coordinate the app-to-SDK approval interface with Teammate 3.

### Teammate 3 — SDK and AI-agent demo
- Build a TypeScript SDK that checks requests against the agreed contract interface.
- Build a travel-agent demo that requests only approved context and proposes a booking action.
- Add Kimi as the agent model if API access is available; keep authorization decisions deterministic in Aegis.
- Add Envio indexing and a developer quick-start if the core demo is stable.

## Seven-day milestones

1. Agree on the MVP, contract interface, SDK request shape, and passkey approval flow.
2. Build the contract, app, and SDK/agent in parallel using those shared interfaces.
3. Deploy the contract and connect the app and SDK.
4. Complete the end-to-end travel-agent flow.
5. Add real ERC-8004 and Mera integration; add Envio if the core flow is stable.
6. Fix integration issues, document setup, and rehearse.
7. Feature freeze and final demo rehearsal.

## MVP acceptance flow

- User grants one agent access to one or two sample facts and sets a spending limit.
- Agent identity is checked.
- SDK allows a permitted request and blocks an over-limit action.
- User approves the sensitive action with a passkey.
- User revokes permission and a later request is denied.
- No plaintext personal context or secret key is written to the chain.
