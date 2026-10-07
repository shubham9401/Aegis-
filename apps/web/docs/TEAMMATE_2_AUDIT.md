# Teammate 2 audit — 8 October 2026

Scope: `D:/Coding/Aegis/docs/AEGIS.md`, repo team plan, app implementation, SDK integration, and teammate 1's deployed contract handoff. Changes are confined to the user-app ownership area; dependency installation may update the shared npm lockfile. No contracts, SDK, or agent implementation was changed.

## Acceptance status

| Deliverable | Status after fixes | Remaining acceptance work |
| --- | --- | --- |
| D1: app shell and wiring | Implemented | Clean-clone rehearsal with Node 24+, not the root's older Node 20 floor |
| D2: Mera passkey sign-in | Real implementation replaces simulated address/session | Test PRF on actual browser/device and final HTTPS domain; confirm account funding |
| D3: grant/view/revoke | Authenticated, exact integer amounts, durable local policy state | On-chain adapter blocked by incompatible contract/SDK models; no transaction is claimed |
| D4: approvals | Fresh Mera ceremony, real EIP-712 signature verification, owner session, expiry and stale-grant checks | SDK polling authentication, one-use action consumption, verifier/executor handoff with T3 |
| D5: encrypted data | AES-GCM ciphertext on persistent local disk, bound to owner/scope; SDK gates decryption | Shared transactional storage before serverless/replicas; optional client-derived vault keys remain Tier 1 |
| D6: routes | Protected owner/agent routes, validated requests, reason codes, bounded input/queues, live Kimi route | Live provider test needs key and balance; planner sharing and API use with T3 |
| D7: activity | Durable, bounded off-chain feed of app decisions, refreshed every five seconds | Contract event feed after adapter agreement |

## Fixed findings

1. **Forged owner identity.** Previously an arbitrary `X-Aegis-User` header let a caller overwrite another user's vault or grants, and approve/reject requests. Owner operations now use a single-use signed login challenge and HttpOnly cookie. Cross-origin writes and mismatched owners are rejected.
2. **Simulated passkeys.** Sign-in previously always used `0x111…111` and restored an address from localStorage. The app now creates/uses actual Mera PRF credentials, derives the EOA, and ends signing sessions on sign-out. Only credential metadata is stored locally.
3. **Invalid approvals accepted.** A fixed fake 65-byte signature previously passed. The server now verifies the exact stored EIP-712 action and owner, checks current permission ID/state and deadline, and prevents repeated decisions. The browser signs via a fresh passkey ceremony.
4. **Unauthenticated approval polling and metadata.** Approval lists, individual agent polls, and activity are protected. Agent tokens are bound to one configured agent label; rate limiting bounds authenticated request volume.
5. **Non-durable application state.** A process restart lost saved values, grants, consent records, and activity. Vault ciphertext, encrypted approval queues, policies, and sanitized activity now persist with atomic filesystem replacement. Corrupt state fails closed rather than silently resetting. Sessions are invalidated on restart. This is a single-process backend.
6. **Ciphertext substitution and Unicode.** Vault encryption authenticates the owner/scope binding and decrypts UTF-8 after concatenating bytes. A ciphertext copied into another field or owner cannot decrypt successfully.
7. **Money rounding and misleading defaults.** Browser floating-point multiplication was replaced with decimal-string-to-bigint cents. No fake agent identity or default demo airline is prefilled. Approval fields show the complete structured payload and actual policy limit.
8. **Fabricated planner output.** The web planner no longer substitutes a hardcoded $400 demo-airline booking when Kimi is missing or fails. It returns a clear error; valid plans must come from the live provider and still require policy evaluation.
9. **Invisible failures and overclaims.** Screens report API errors instead of silently showing empty lists, preserve reason codes, disable expired approvals, and describe current local policy/server-held-key boundaries.

## Blocking contract/SDK mismatch — ask teammates 1 and 3

The brief's historical claim that no ABI/address exists is outdated. `contracts/deployments/monad-testnet.json` records Aegis `0x37Ba78B771FC28Dc03387c8777997F751120664D` on chain 10143, plus a **demo** 6-decimal payment token. This audit read the checked-in deployment; it has not independently verified current chain state.

| App / SDK | Deployed contract handoff | Decision required |
| --- | --- | --- |
| Agent label string | ERC-8004 token ID and owner snapshot | Registered agent ID and authenticated signer mapping |
| Dietary / travel-budget / passport scopes | READ_DIETARY / READ_DESTINATION / READ_ITINERARY bits plus random bytes32 resource scope | Which fields survive; how owner/resource/field are bound |
| `travel:search`, `travel:book` | Data-use bits and PAY | Actual action mapping and enforcement route |
| Two-decimal USD policy amount | Raw payment-token units; deployed test token has 6 decimals | Currency/decimals and real recipient, not a fabricated service map |
| Approval above a threshold, within maximum | Automatic allowance plus explicit **extra spending** approval | Consent semantics; cannot silently map one onto the other |
| One permission per `(user, agent)` | Numeric permission IDs, multiple grants, delegation tree | Selection, enumeration, replacement and cascading state |
| Off-chain proposed EIP-712 ActionApproval | On-chain `approvePayment` transaction bound to contract/request/recipient | Whether both approvals are needed and how execution consumes consent |

Do not solve this by renaming fields or mapping passport/budget to itinerary/destination without team agreement. The repo prohibits inventing contract mappings/APIs. After agreement: build the browser-signed adapter from verified ABI, parse grant receipt IDs, explicitly bound gas on every write, wait for receipts, refresh effective statuses, and merge verified contract events with denial logs. Deposits/withdrawals/payments require exact token units, owner vault balance, recipient and spending disclosures.

## Teammate 3 handoff

- `packages/sdk/src/http-client.ts`: `getApproval()` passes `authenticated=false`; change it to send its configured bearer token. The secured route intentionally rejects anonymous polling.
- SDK `executeAction()` trusts a boolean callback and does not recheck after waiting for user approval. Add current-state evaluation at execution plus one-use approval consumption and exact request binding.
- The SDK has no shared typed-data verifier/domain or durable execution replay guard. Agree the current `apps/web/src/lib/eip712.ts` schema and signature/result format before implementing a real executor. It is an off-chain consent proof, not a contract payment authorization.
- `apps/agent-demo/src/web-demo.ts` still runs its own planner and prints released plaintext and “Booking executed” without an airline/payment execution. Move planning to `/api/agent/plan`, remove private-value logging, and integrate the actual intended service executor. Keep authorization outside the model.
- Replace shared bearer-token labels with signed agent requests and live ERC-8004 ownership verification; use teammate 1's integration guide. Fail closed on network/registry errors.
- T3's progress file and top-level README still describe old mock approvals and need their owner's update after this handoff.

## Deployment and rehearsal remaining

1. Decide contract model versus brief, final domain, PRF-capable demo browser/device, and local persistent process versus hosted transactional store.
2. Configure server-only vault key, random agent token, actual agent label, and Kimi credentials outside Git. No credential value was copied into this report.
3. Test physical passkey creation/sign-in, fresh approval/rejection/expiry/sign-out on final domain. Fund the derived account for future contract writes.
4. Rehearse allow → ungranted-scope deny → sensitive consent → over-limit deny → revoke → later deny. Re-test using real contract state once integrated.
5. Record demo video/screenshots and complete submission artifacts; verify deadline timezone and platform rules separately. This audit did not verify submission rules.

## Validation

Validated with Node 24.18.0:

- `npm run typecheck`: all workspaces passed. Initially the contract's declared ethers dependency was missing locally; installing the declared repository dependencies resolved it without source changes.
- `npm run lint --workspace @aegis/web`: passed.
- `npm run build --workspace @aegis/web`: passed, with no build warnings after excluding runtime private data from output tracing.
- `npm test`: 15 contract tests + 5 SDK policy tests + 3 HTTP-client tests passed.
- `npm test --workspace @aegis/web`: 13 tests passed, including the authenticated route flow, invalid owner proofs/replay/origin, signature tampering, denial/revocation, encrypted persistence, Unicode, validation and integer precision.
- `git diff --check`: passed.

Windows sandbox restrictions initially blocked Next's path resolution and atomic file renames in tests; reruns outside the sandbox passed. Ganache used its JavaScript fallback because the bundled native uWS binary does not target Node 24; this did not prevent the contract tests from passing.

Physical WebAuthn, live Kimi, actual chain transactions, and real booking execution require separate integration acceptance; passing compilation does not prove them. The API flow tests use real EOA signatures to exercise the server boundary, not a simulated physical passkey ceremony.

## Dependency audit

`npm audit --workspace @aegis/web --omit=dev --json` reported **zero web production advisories**. The full repository audit reported **15 advisories: 1 low, 2 moderate, 11 high, 1 critical**, including inherited contract/Ganache tooling and the web lint dependency chain.

- The web ESLint dependency chain reaches `braces`; its [reviewed stack-exhaustion advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists no patched version at audit time. npm proposes a major ESLint-config downgrade, which is not an appropriate automatic fix for this Next 16 app. Keep CI/lint glob input under repository control and review the upstream fix when available.
- Teammate 1 owns the pinned ethers, solc, and Ganache dependencies. Review the reported ws/tmp/secp256k1/elliptic/lodash/bn.js advisories there before production use; the [critical elliptic advisory](https://github.com/advisories/GHSA-vjh7-7g9h-fjfh) is present in Ganache's bundled tooling tree. No broad `npm audit fix --force` was applied because it proposes incompatible package downgrades and changes another owner's dependencies.

These results describe the registry audit at this date and do not replace review of the deployed runtime or its exposure paths.
