# Connected-flow implementation update — 14 October 2026

Kimi is retained as the required connected planner for the project's bounty. These changes reuse the existing agreed contract ABI, SDK transport and signed payment request interface. No contract method or deployment was changed.

## Implemented

- Connected CLI dispatches to `runChainAgent`; contract-mode Policies and Approvals mount `ChainDashboard`. The dashboard reads the same signed `/api/chain/payments` queue as the CLI, including pending, approved, consumed and denied outcomes. The Overview pending count uses that queue too.
- Exposed mint, exact ERC-20 allowance, deposit, withdrawal, exact extra-payment approval, cancellation and paginated grant scanning. Copy buttons on account/contract addresses; blue styling; visibility-aware refresh without overlapping reads. A grant needs valid uint256 agent ID, positive payment limit, nonzero recipient and bounded expiry.
- Kimi proposals must agree with an explicit `Payment: USD <amount> to <wallet>` instruction. Changed model amounts/recipients are blocked before submission. Positive amounts, supported currencies, unique scopes and completed provider responses are validated. For K2.6, thinking is disabled for the short extraction request to avoid spending its small output budget on reasoning. No connected fallback.
- The agent reads all granted profile scopes, regardless of model omissions, plus the model's requested scopes. Denied requested reads stop the run. Released budgets/currencies and calendar expiry constrain execution locally and are refreshed after an approval wait. Private vault values are not added to the Kimi prompt. Dietary preferences are retained requirements, not falsely labelled supplier meal instructions.
- Persistent agent payment journal uses an exclusive run lock, atomic file replacement, stored transaction hash/deadline and a stable random request ID. Repeated identical instructions resume or reconcile; mismatched/corrupt journals fail closed. Prompt fingerprints stay in the private journal and are not used as public on-chain IDs. Contract replay protection is still the atomic authority.
- Configuration checker respects inherited environment, Next.js environment precedence and actual CLI env-file order. Optional `--live-kimi` checks one small completion and never displays secrets/provider content.
- Regression tests cover explicit instruction parsing, changed personal constraints, restart persistence, conflicting instructions, simultaneous run locks, corrupted journal rejection, environment precedence and the Kimi HTTP validation/failure boundary.

## Demonstrating a real external booking

Recommended next integration: Duffel Flights **test mode**. Demonstrate a provider offer, user-reviewed exact price/itinerary, Aegis permission/extra consent, provider-created order, booking reference and cancellation result. This is a real API integration with provider-side sandbox records; it is not a live flight ticket. Duffel's test mode is designed for repeatable booking rehearsal, and orders contain booking references.

The adapter is **not implemented** here: no supplier credentials, passenger inputs or chosen merchant settlement arrangement are configured. A supplier quote must bind offer ID, itinerary, exact currency/amount and expiry to consent; the current contract's payment consent does not encode a supplier offer. Do not bolt provider `createOrder` onto a token transfer and describe it as atomic or exactly-once booking. Define a durable external-operation state machine, provider-supported deduplication/reconciliation, ambiguous-timeout recovery, cancellation/refund and payment failure handling first. Real money requires live provider onboarding and funding.

Sources: [Duffel test mode](https://duffel.com/docs/api/overview/test-mode), [Duffel orders](https://duffel.com/docs/api/orders), [Kimi chat completion parameters](https://platform.kimi.ai/docs/api/chat).

## Verification and remaining boundaries

Validation: **54 tests passed** (15 contract, 13 SDK, 3 agent, 1 configuration, 22 web), workspace typecheck, web lint and production build passed. Windows sandbox restrictions on atomic temporary-file replacement and Next.js path canonicalization required rerunning the affected checks outside the sandbox; those reruns passed. Generated contract artifacts were restored unchanged after testing.

Automated checks and local EVM tests verify software behavior; mocks of the Kimi HTTP boundary do not constitute a live Kimi response. Current environment inspection found no usable Kimi key or encrypted registered-agent keystore. Live browser review reached the signed-out Policies gate without console errors; no physical passkey, authenticated contract UI, supplier order or live agent payment was completed.

Shared transactional storage, multi-instance sessions/rate limits, server-held vault key custody/rotation/recovery and provider execution remain production work. The journal improves payment recovery on one operator host; it does not make the filesystem-based web backend suitable for replicated/serverless deployments. Passport date checking does not authenticate a document or establish destination eligibility.

See [local runbook](../../../docs/LOCAL-RUNBOOK.md) for exact rehearsal and recovery commands. `PRODUCTION_READINESS_AUDIT.md` preserves the original pre-change audit; this update closes its integration-drift finding and adds local payment recovery and constraint use, without claiming full production readiness.
