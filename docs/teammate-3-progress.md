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
- [x] Create narrowed delegated permissions and recheck parent chains for revocation and expiry.
- [x] Gate local data reads and action execution on permission decisions; deny by default when passkey approval is unavailable.
- [x] Demonstrate a helper agent with fewer scopes/actions than its parent in the CLI demo.
- [ ] Replace the local adapter with a Monad contract adapter after the ABI is agreed.
- [ ] Connect the data-release callback to a user-controlled encrypted vault/key holder; the current demo callback is an in-memory placeholder.
- [ ] Add ERC-8004 identity verification and the real passkey approval adapter.
- [x] Build the first command-line travel-agent permission demo.
- [x] Add a Kimi planner with schema validation and local fallback.
- [ ] Move the Kimi call behind the web app's server-side API route when Teammate 2's app exists.
- [ ] Run the Kimi planner with a newly generated, unexposed key stored only in `.env.local`.
- [ ] Add Envio and show indexed permission/revocation history.
- [ ] Write the SDK quick-start and demo instructions.

## Security boundary

The current delegation and revoke-cascade behavior is evaluated by the local SDK against `MemoryPermissionStore`; it is not yet enforced by a Monad contract. `readData()` guarantees that its callback is not invoked after a denied SDK decision, but this prototype does not encrypt data or make already released plaintext revocable. Integrations must gate the actual vault/key-release and action-execution boundaries and recheck current permission state there.

## Decisions and blockers

Record dated decisions, contract addresses, testnet links, and blockers here. Never record credentials or private keys.
