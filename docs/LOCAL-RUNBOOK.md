# Local acceptance runbook

## Runtime and configuration

Use Node 24+. Run `npm run doctor` to list missing configuration without printing secrets. Start from the repository root, not the original standalone contract folder. Run `npm run setup:local`; it preserves existing values. Restart/rebuild the web app after changing `NEXT_PUBLIC_ADAPTER`.

The web app reads Next.js environment files under `apps/web`; the connected agent loads root `.env.local` followed by `apps/web/.env.local`. Existing process environment takes precedence over those CLI files. `doctor` now checks this effective configuration, rather than treating the two files as isolated environments. The app origin, contract address, resource scope, agent token and planner identity must agree. The opaque resource scope is public metadata, not an encryption key. Use one persistent process and back up the private data directory and vault key securely. Do not rotate the vault key without a migration.

Required operator values:

- Web planner: set `KIMI_API_KEY` privately for live Kimi planning, or set `AEGIS_PLANNER_MODE=local` for an explicitly scripted proposal that needs no API credits. The local mode still exercises the real Monad contract and token payment; it is not an AI-planning claim.
- Web `AEGIS_MERCHANT_ADDRESS`: public test merchant recipient. The grant permanently fixes that recipient.
- Agent `AEGIS_AGENT_KEYSTORE_PATH`: encrypted JSON keystore outside Git, owned by the agent's current registry owner.
- Agent `AEGIS_AGENT_ADDRESS`: the matching public signer address.
- Agent `AEGIS_PERMISSION_ID`: numeric ID read from the grant receipt.
- Both `AEGIS_AGENT_ID`: the configured planner token identity (2088 only if its owner wallet is available).

Existing deployment does not need redeployment. Registry ownership cannot be bypassed with the user's deployer key. If agent 2088's signer is unavailable, create and register a new agent using the existing wallet/registration scripts, then grant it fresh permissions. No old grant is automatically reassigned.

## Visible demonstration

1. Start `npm run dev:web`; open localhost:3000. Create/sign in with a WebAuthn PRF passkey. Test cancellation and wrong-passkey selection too.
2. Fund the displayed passkey account with test MON. Fund the agent account with test MON separately. Faucets and signing ceremonies require the operator.
3. Save sample dietary/budget/passport facts in Vault. For the scenarios below, set the personal budget to USD 1000 and a future passport expiry. The personal budget is a separate constraint from the automatic contract allowance. Use fictitious data during recordings.
4. Policies: mint 2000 aUSD-TEST, approve exactly 2000, then deposit 2000. Each is a separate visible, passkey-signed transaction. Confirm the available balance.
5. Grant agent 2088 (or the newly registered ID) dietary + budget access, payments to the selected merchant, automatic allowance 500, and optionally delegation. Copy the confirmed permission ID.
6. Set the numeric permission ID in the agent environment. Run `npm run demo:web -- "Plan a vegetarian trip. Payment: USD 100.00 to <merchant address>"` (replace the placeholder with the grant's actual 0x address). Enter the agent keystore password only in its terminal. Verify the mined payment and merchant token balance. Kimi must return this exact amount and recipient; disagreement stops execution.
7. Request USD 650 with a new run. Automatic payment is blocked. Open Approvals, review the exact extra amount/recipient/deadline, and approve with a fresh passkey. Confirm the payment receipt; the remaining automatic allowance was not reset.
8. Repeat an extra request and reject it. Test expiry, wrong recipient, insufficient deposit, and cancellation of a mined approval. On-chain cancellation prevents later execution; a transfer already mined cannot be recalled.
9. Request another extra payment, then revoke the permission before deciding. The later payment must fail. The contract is authoritative even if the UI was stale.
10. Activity shows real event pages and app denial logs. Record the explorer links and demonstrate that private values do not appear in terminal logs or events.

The connected CLI, Policies and Approvals now share `/api/chain/payments`. Contract mode does not use the legacy `/api/approvals` transport; that remains for the labelled local simulation and compatibility. An old legacy queue entry is not migrated into the signed queue or treated as new signed consent. Paying the demo merchant is not a real travel booking.

The connected request must specify exactly one `Payment: USD <amount> to <merchant address>` instruction. Kimi is the default planner. If `AEGIS_PLANNER_MODE=local` is set explicitly, a scripted parser proposes the trip without an AI API call and is labelled `local demo`; the same contract authorization and testnet payment still apply. No provider failure silently falls back. The exact payment instruction is operator-entered, not a supplier quote or proof of the full natural-language intent. Approved budget and passport values are checked locally before submission and again after waiting for approval; all granted profile scopes are requested even if the planner omits them. Without granted/released facts those checks are unavailable. Dietary preferences can be retained as trip requirements, but this transfer has no meal-order or reservation capability. Vault plaintext is not sent to Kimi; the original user prompt is sent to Kimi only when Kimi mode is selected.

## Delegation rehearsal

Create a second agent wallet outside Git and register it using `contracts/scripts/register-agent.mjs` (see the contract package README for AGENT_* variables). Fund the signer with test MON. From the parent agent's environment:

```sh
npm run delegate --workspace @aegis/agent-demo -- <parentPermissionId> <childAgentId> 1 0
```

This grants dietary access only, no money and no further delegation. The CLI prints the child ID from the receipt. Configure a separate agent process with the child's keystore/address/permission ID. Run `npm run context --workspace @aegis/agent-demo -- profile:dietary-preference` (allow) and repeat with `profile:passport-validity` (deny), then revoke the parent and repeat dietary (deny). The gateway resolves each agent from its live grant; it does not trust the agent ID supplied by a caller. The automated local-chain test covers these same authorization boundaries.

## Operator acceptance still requires evidence

- Actual browser/device passkey PRF and testnet transaction signing.
- Current registered agent signer availability (an address is not a signing credential).
- Live Kimi request with a valid key/account balance.
- Testnet grant/deposit/approval/payment receipts and two-agent rehearsal.
- Final recorded video and submission fields, checked against the current event rules.

The Envio indexer source is present, but its GraphQL endpoint must be running and configured before claiming live indexing in a submission. Serverless storage and user-held vault keys remain separate extensions.

## Retry and recovery

The agent stores a journal next to the external keystore, in an `aegis-payment-journal` directory. Override with `AEGIS_AGENT_STATE_DIR` only to another private persistent directory outside the Git checkout. It contains the instruction fingerprint, exact action, request ID, deadline and transaction hash; not the raw prompt or released profile values. Back it up with the operator state.

Repeating the identical instruction with the same signer, contract and permission resumes the same default request ID. It does not create another payment. A confirmed transaction is reconciled against its receipt and the contract's consumed request state. For a genuinely new action, deliberately use a fresh nonzero `AEGIS_PAYMENT_REQUEST_ID`; changing the prompt or permission also changes the default fingerprint. Never assume a timeout means a transaction failed.

One run holds an exclusive journal lock. A hard process crash can leave a stale `.lock` file: inspect the PID, submitted transaction and contract state before removing it. Unresolved/reverted/consumed transactions are not automatically replaced with a new request. This is a single-operator-host recovery mechanism; it is not a distributed booking executor.

For a pending extra-payment retry, the recorded deadline and amount are retained automatically. Expired requests require a new deliberate request. Rejection and revocation stop the active agent loop. On-chain consent/replay consumption remains authoritative.

Run `npm run doctor -- --live-kimi` to perform one small, non-personal Kimi completion check. This can consume provider credits; ordinary `doctor` does not call the model. It reports availability without printing keys or provider content.
