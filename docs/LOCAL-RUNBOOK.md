# Local acceptance runbook

## Runtime and configuration

Use Node 24+. Run `npm run doctor` to list missing configuration without printing secrets. Start from the repository root, not the original standalone contract folder. Run `npm run setup:local`; it preserves existing values. Restart/rebuild the web app after changing `NEXT_PUBLIC_ADAPTER`.

The web app reads `apps/web/.env.local`; the connected agent reads root `.env.local`. The app origin, contract address, resource scope, agent token and planner identity must agree. The opaque resource scope is public metadata, not an encryption key. Use one persistent process and back up the private data directory and vault key securely. Do not rotate the vault key without a migration.

Required operator values:

- Web `KIMI_API_KEY`: enter privately into the environment file; funded provider account needed. The key stays server-side.
- Web `AEGIS_MERCHANT_ADDRESS`: public test merchant recipient. The grant permanently fixes that recipient.
- Agent `AEGIS_AGENT_KEYSTORE_PATH`: encrypted JSON keystore outside Git, owned by the agent's current registry owner.
- Agent `AEGIS_AGENT_ADDRESS`: the matching public signer address.
- Agent `AEGIS_PERMISSION_ID`: numeric ID read from the grant receipt.
- Both `AEGIS_AGENT_ID`: the configured planner token identity (2088 only if its owner wallet is available).

Existing deployment does not need redeployment. Registry ownership cannot be bypassed with the user's deployer key. If agent 2088's signer is unavailable, create and register a new agent using the existing wallet/registration scripts, then grant it fresh permissions. No old grant is automatically reassigned.

## Visible demonstration

1. Start `npm run dev:web`; open localhost:3000. Create/sign in with a WebAuthn PRF passkey. Test cancellation and wrong-passkey selection too.
2. Fund the displayed passkey account with test MON. Fund the agent account with test MON separately. Faucets and signing ceremonies require the operator.
3. Save sample dietary/budget/passport facts in Vault. Use fictitious data during recordings.
4. Policies: mint 2000 aUSD-TEST, approve exactly 2000, then deposit 2000. Each is a separate visible, passkey-signed transaction. Confirm the available balance.
5. Grant agent 2088 (or the newly registered ID) dietary + budget access, payments to the selected merchant, automatic allowance 500, and optionally delegation. Copy the confirmed permission ID.
6. Set the numeric permission ID in the agent environment. Run `npm run demo:web -- "Plan a trip for USD 100 using service <merchant address>"`. Enter the agent keystore password only in its terminal. Verify the mined payment and merchant token balance.
7. Request USD 650 with a new run. Automatic payment is blocked. Open Approvals, review the exact extra amount/recipient/deadline, and approve with a fresh passkey. Confirm the payment receipt; the remaining automatic allowance was not reset.
8. Repeat an extra request and reject it. Test expiry, wrong recipient, insufficient deposit, and cancellation of a mined approval. On-chain cancellation prevents later execution; a transfer already mined cannot be recalled.
9. Request another extra payment, then revoke the permission before deciding. The later payment must fail. The contract is authoritative even if the UI was stale.
10. Activity shows real event pages and app denial logs. Record the explorer links and demonstrate that private values do not appear in terminal logs or events.

The connected Kimi request must specify amount and merchant address. No provider fallback masquerades as a live response. Paying the demo merchant is not a real travel booking.

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

When retrying an interrupted payment, set `AEGIS_PAYMENT_REQUEST_ID` to the printed request ID. Never assume a timeout means a transaction failed; inspect its receipt first. A new ID authorizes a new request.

For a pending extra-payment retry, preserve the printed `AEGIS_PAYMENT_DEADLINE` as well as the request ID, amount and recipient. Expired requests require a new deliberate request.
