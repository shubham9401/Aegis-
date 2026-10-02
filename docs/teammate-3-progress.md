# Teammate 3 progress

## Ownership

- TypeScript SDK: `packages/sdk/`
- Sample AI travel agent: `apps/agent-demo/`
- Envio indexer: `indexer/envio/` (after the core path works)

## Status

- [ ] Confirm contract methods, permission fields, and events with Teammate 1.
- [ ] Confirm passkey approval handoff with Teammate 2.
- [x] Define SDK request and result types.
- [x] Implement deterministic permission evaluation with a local adapter.
- [ ] Replace the local adapter with a Monad contract adapter after the ABI is agreed.
- [x] Build the first command-line travel-agent permission demo.
- [x] Add a Kimi planner with schema validation and local fallback.
- [ ] Move the Kimi call behind the web app's server-side API route when Teammate 2's app exists.
- [ ] Run the Kimi planner with a newly generated, unexposed key stored only in `.env.local`.
- [ ] Add Envio and show indexed permission/revocation history.
- [ ] Write the SDK quick-start and demo instructions.

## Decisions and blockers

Record dated decisions, contract addresses, testnet links, and blockers here. Never record credentials or private keys.
