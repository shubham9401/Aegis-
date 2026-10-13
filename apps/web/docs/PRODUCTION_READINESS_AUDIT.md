# Production readiness audit — 14 October 2026

**Follow-up:** implementation work after this audit is documented in [IMPLEMENTATION_UPDATE.md](./IMPLEMENTATION_UPDATE.md). The connected queue/UI drift is now addressed, released budgets/calendar expiry constrain local execution, and payment retry state is journaled. The findings below describe the original audited checkout; production/provider and live-acceptance boundaries still apply.

Audited checkout: `teammate1/complete-aegis-integration`, commit `10b1e08`. This is a source review, automated verification, configuration inspection, and read-only testnet inspection. It is not an independent smart-contract security audit or a completed live acceptance test. No payments, registrations, passkey creations, or paid model requests were performed.

## Verdict

Aegis is a functioning permission/payment prototype with real cryptographic and contract enforcement paths. It is not a complete production travel product. The connected example can transfer test tokens; it cannot reserve a flight/hotel or prove delivery by a merchant. A successful build does not establish production readiness.

## Earlier outstanding work: current status

| Earlier item | Current implementation | Evidence / remaining boundary |
| --- | --- | --- |
| On-chain grant and revoke | Implemented | Browser Mera signing in `src/contexts/AuthContext.tsx`, policies UI, Solidity grant/revoke. Real-device testnet receipts still require acceptance. |
| Contract activity | Implemented | `src/app/api/chain/events/route.ts` and `src/components/ChainEvents.tsx`; optional Envio integration is separate and requires a running endpoint. |
| ERC-8004 caller verification | Implemented for scoped contract reads/payments | Typed data verified against the grant signer, and contract checks current registry ownership throughout the ancestor chain. Planning/legacy approval transport still uses the configured shared bearer token. Registry ownership does not prove service quality or full ERC-8004 reputation/validation support. |
| Authenticated SDK approval polling | Fixed | `packages/sdk/src/http-client.ts:getApproval()` passes authenticated=true. |
| Single-use execution consent | Implemented for contract payments | Solidity `pay()` consumes an exact root/request ID atomically and deletes consent. Local SDK execution tracking is only per SDK instance and does not survive restart. |
| Real booking executor | Missing | `apps/agent-demo/src/agent-proof.ts:pay()` submits a token transfer. No inventory, supplier quotation, reservation, ticket, cancellation, or refund adapter is present. |
| Physical passkey / live provider acceptance | Still unverified in this audit | Actual PRF-capable device, final domain, funded signers, provider account, and real receipts are required. |

## Findings and required production work

### 1. Production blocker: payments are demo assets, not real bookings

The deployment is Monad **testnet**, chain 10143. The payment token is `aUSD-TEST`, with six decimals. `contracts/contracts/test/MockUSD.sol` exposes unrestricted `mint()`: it has no dollar backing or production monetary value. USD amounts in this example are test units, not live merchant prices. The contract fixes its payment token at construction; changing an environment variable alone cannot turn this deployment into a real-asset product.

For real travel use, integrate a real supplier quote/reservation API, bind quote ID, exact price, currency, recipient and expiry to consent, and implement idempotent execution, receipt reconciliation, ambiguous-timeout recovery, cancellation and refunds. Token transfer and an external reservation are separate operations and can fail independently.

### 2. Functional gap: released vault context does not personalize the planner

`apps/agent-demo/src/web-demo.ts` calls `api.plan()` before releasing context. It then obtains approved values, logs only their lengths, and discards them. `chain-agent.ts` also requests fields without feeding their values into planning. Consequently saving dietary preferences, a budget or expiry does not currently change the generated plan.

Connect approved context to the planning/provider workflow deliberately. Keep deterministic authorization outside the model. Do not send private context to an LLM provider without the relevant disclosure and permission boundary.

### 3. Production blocker: no trusted quote or deterministic user-intent binding

The Kimi endpoint validates a JSON schema and instructs the model not to fabricate booking details. It does not obtain supplier quotations or deterministically prove that model-selected amounts match the user's request. A policy limit constrains maximum authority; it does not establish that an action is the booking the user intended. Real prices must come from a trusted quote source and be bound to the consent/executor, rather than relying on a system prompt.

### 4. Current configuration is not ready for a fresh connected rehearsal

`npm run doctor` was run both inside and outside the sandbox. It reports missing/mismatched contract mode, contract address, opaque resource scope, origin, agent token, vault encryption key, Kimi key, merchant address, granted permission ID and encrypted agent keystore. It checks the project's environment files; it does not inspect an already-running process's inherited environment. Presence of a key would not establish a funded provider account or access to a registered signing wallet.

Resolve configuration privately, then run the acceptance runbook. This audit did not generate credentials or alter deployment configuration.

### 5. Production blocker for replicated/serverless hosting: local state and key custody

`src/lib/local-store.ts` uses filesystem JSON read/replace. Sessions and rate limits in `src/lib/server-auth.ts` are process-local. This requires one persistent Node process. Multiple replicas can disagree on sessions and race on queues/replay records; ephemeral storage can lose encrypted records.

Before a scalable deployment, use transactional shared storage, atomic uniqueness/consumption, appropriate distributed session/rate-limit handling, backups, and restore rehearsal. Define key custody, rotation/migration and recovery. The vault uses a server-held AES-GCM key; the server can decrypt it. It is not end-to-end encryption or a TEE-attested vault. A trusted-server product may adopt that model explicitly, but it must be operated accordingly.

### 6. Integration drift: multiple dashboard/payment paths

The active CLI command is `web-demo.ts`, using `/api/approvals`. A second implementation (`runChainAgent`, `/api/chain/payments`, `ChainDashboard`) exists. `runChainAgent()` and `ChainDashboard` have no active app/CLI imports in this checkout. The latter has token funding, withdrawal, cancellation and paginated state controls that are not exposed by the active policies page. The runbook's funding instructions therefore do not fully match that page.

Select and wire one canonical payment queue/dashboard/executor path, expose its lifecycle controls, and test it through the UI. Do not count unused components as completed user flows.

### 7. Demo paths and factual verification remain intentionally limited

- `npm run demo` uses local policies, seeded permissions and a local planner with a `demo-airline` proposal.
- `planner-factory.ts` falls back to that local planner outside the connected contract path. The web Kimi endpoint fails explicitly when credentials/provider output are unavailable.
- Passport checking validates the entered expiry date, not the document or destination entry eligibility. Dietary choices and budget are user declarations, not verified external facts.
- Local SDK replay tracking is an in-memory `Set`; real financial/external execution needs durable idempotency, not that adapter.
- Independent contract/security review, final HTTPS/passkey-domain rehearsal, monitoring and recovery acceptance are still required before real funds or sensitive documents.

## Why Kimi is present

`src/app/api/agent/plan/route.ts` calls the Kimi/Moonshot chat-completions endpoint to turn a natural-language request into structured proposed action fields. It is a planner, not the permission engine, identity verifier, encryptor, booking provider or payment processor.

The connected example currently calls that endpoint, so Kimi is an operational dependency of that example. The Aegis permission layer itself does not require Kimi: another model/provider or an external agent supplying structured requests can use the same deterministic checks. A structured form can also remove the need for a model to extract an already-known amount and recipient.

Current provider requests contain the user prompt; the connected demo does not feed released vault fields back into Kimi. Avoid describing this as context-aware travel planning until finding 2 is addressed.

## Verification performed

- Full `npm test`: **49 passed** (15 contract, 13 SDK, 21 web), zero failures. Tests include real local EVM contracts, signed requests, exact-payment consent, replay denial and parent revocation.
- Workspace typecheck: passed.
- Web lint: passed.
- Web production build: passed.
- `npm audit --omit=dev`: zero reported production dependency advisories. This does not certify application security.
- Read-only Monad RPC: chain 10143; published Aegis address has 6,978 bytes of runtime code; `ALL_ACTIONS=63`; registry/token getters match the deployment manifest; registry owner for agent 2088 matches the recorded address. This checks existence/configuration, not a full reproducible deployed-bytecode/source verification or signer availability.
- No live airline/hotel integration, paid Kimi response, physical authenticator ceremony or testnet payment acceptance was verified.

## Recommended order

1. Decide whether the real product is a general agent-permission platform or a travel-booking application; name the first real external action/provider.
2. Reconcile the active UI/queue/CLI path and privately complete operator configuration; capture an end-to-end testnet rehearsal.
3. Implement trusted quotes and the real provider executor, plus durable idempotency/reconciliation and meaningful context use.
4. Prepare shared storage, key management/recovery, production deployment and security review; then choose and verify a real network/token if real payments are required.

References: [ERC-8004 specification](https://eips.ethereum.org/EIPS/eip-8004), [Kimi chat-completions API](https://platform.kimi.ai/docs/api/chat), project `docs/LOCAL-RUNBOOK.md`, `docs/IMPLEMENTATION-DECISIONS.md`, and `contracts/docs/SECURITY.md`.
