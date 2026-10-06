# Teammate 3 progress

## Ownership

- TypeScript SDK: `packages/sdk/`
- Sample AI travel agent: `apps/agent-demo/`
- Envio indexer: `indexer/envio/` (after the core path works)

## Status

- [ ] Confirm contract methods, permission fields, and events with Teammate 1.
- [x] Connect the SDK enforcement boundary to Teammate 2's web API and encrypted demo vault.
- [x] Add a connected agent-app demo that requests scoped context and waits for a dashboard approval.
- [ ] Replace Teammate 2's labeled mock approval with the real Mera passkey ceremony and server verification.
- [x] Define SDK request and result types.
- [x] Add developer-facing `checkPermission()`, context-release, approval-request, and approval-polling APIs.
- [x] Fail closed when a money-constrained action omits its amount.
- [x] Implement deterministic permission evaluation with a local adapter.
- [x] Create narrowed delegated permissions and recheck parent chains for revocation and expiry.
- [x] Gate local data reads and action execution on permission decisions; deny by default when passkey approval is unavailable.
- [x] Demonstrate a helper agent with fewer scopes/actions than its parent in the CLI demo.
- [ ] Replace the local adapter with a Monad contract adapter after the ABI is agreed.
- [x] Connect `readData()` to the web app's encrypted demo vault so denied requests never invoke decryption.
- [ ] Replace the server-held demo vault key with a user-controlled key-release mechanism.
- [ ] Add ERC-8004 identity verification and the real passkey approval adapter.
- [x] Build the first command-line travel-agent permission demo.
- [x] Demonstrate an explicit over-budget booking denial without executing the action.
- [x] Add a Kimi planner with schema validation and local fallback.
- [ ] Move the Kimi call behind the web app's server-side API route when Teammate 2's app exists.
- [ ] Run the Kimi planner with a newly generated, unexposed key stored only in `.env.local`.
- [ ] Add Envio and show indexed permission/revocation history.
- [x] Write the SDK and combined web-demo run instructions.

## Security boundary

The current delegation and revoke-cascade behavior is evaluated by the local SDK against `MemoryPermissionStore`; it is not yet enforced by a Monad contract. The web app encrypts demo values with AES-GCM and calls decryption only through `readData()`, but its key is still server held. Already released plaintext cannot be revoked. Approval creation now rechecks the action and permission ID, while approval signing remains an explicitly labeled mock until Mera is integrated.

## Decisions and blockers

Record dated decisions, contract addresses, testnet links, and blockers here. Never record credentials or private keys.
