# Teammate 3 progress

## Ownership

- TypeScript SDK: `packages/sdk/`
- Sample AI travel agent: `apps/agent-demo/`
- Envio indexer: `indexer/envio/` (after the core path works)

## Status

- [x] Confirm contract methods, permission fields, and events with Teammate 1.
- [x] Connect the SDK enforcement boundary to Teammate 2's web API and encrypted demo vault.
- [x] Add a connected agent-app demo that requests scoped context and waits for a dashboard approval.
- [x] Replace the labeled mock approval with a real Mera passkey ceremony and server-side EIP-712 verification.
- [x] Define SDK request and result types.
- [x] Add developer-facing `checkPermission()`, context-release, approval-request, and approval-polling APIs.
- [x] Fail closed when a money-constrained action omits its amount.
- [x] Implement deterministic permission evaluation with a local adapter.
- [x] Create narrowed delegated permissions and recheck parent chains for revocation and expiry.
- [x] Gate local data reads and action execution on permission decisions; deny by default when passkey approval is unavailable.
- [x] Demonstrate a helper agent with fewer scopes/actions than its parent in the CLI demo.
- [x] Add a Monad contract adapter for live permission reads and fail closed in contract mode.
- [x] Connect `readData()` to the web app's encrypted demo vault so denied requests never invoke decryption.
- [ ] Replace the server-held demo vault key with a user-controlled key-release mechanism.
- [x] Add ERC-8004 identity verification and the real passkey approval adapter.
- [x] Record exact one-use payment approvals on Monad and execute them through `pay` with the registered agent wallet.
- [x] Keep released plaintext out of connected-demo logs.
- [x] Build the first command-line travel-agent permission demo.
- [x] Demonstrate an explicit over-budget booking denial without executing the action.
- [x] Add a Kimi planner with schema validation and local fallback.
- [x] Keep the Kimi key and call in the server-side agent process rather than browser code.
- [ ] Run the Kimi planner with a newly generated, unexposed key stored only in `.env.local`.
- [x] Add an Envio HyperIndex project for permission, revocation, approval, and use events.
- [ ] Run/deploy Envio with a private API token and point the dashboard activity feed at its GraphQL endpoint.
- [x] Write the SDK and combined web-demo run instructions.

## Security boundary

The deployed contract enforces grant, delegation, ancestor revocation, replay protection, spending, and exact one-use payment approval. The web app encrypts demo values with AES-GCM and calls decryption only after a fresh signed agent request and live contract check, but its encryption key is still server held. Already released plaintext cannot be revoked. The local approval queue is transport only; the agent receives approval only after the server verifies the matching Monad transaction and state.

## Decisions and blockers

Record dated decisions, contract addresses, testnet links, and blockers here. Never record credentials or private keys.
