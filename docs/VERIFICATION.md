# Integration verification

## Evidence

- 15 Solidity contract tests passed.
- 13 SDK tests passed, including exact amount conversion, post-consent revocation and concurrent/repeated execution.
- 18 web tests passed after merging the latest `main` changes. The integration test deploys actual contracts to a private EVM chain and exercises the gateway with real EIP-712 signatures.
- Workspace TypeScript checks and web lint passed. The production frontend build currently stops in the Windows sandbox while SWC canonicalizes the workspace path (`Access is denied`); it needs a build outside that sandbox before claiming release readiness.
- Production dependency audit: zero reported advisories. Development dependencies still have advisories in Ganache/compiler/lint tooling; no forced major-version downgrade was applied.
- Browser: the operator used a physical passkey for sign-in, token funding, permission grants, extra payment approval and revocation; the resulting contract state was independently checked on Monad.
- Monad read-only checks: current action bits, deployment/registry configuration and recorded agent ownership were verified. Agent account has test MON.

## What the integration test proves

A parent grant and narrowed child grant are deployed. A child signs a dietary request and receives the matching encrypted field. A passport request is denied. An agent signs a 650-token request against a 500-token automatic allowance. After the owner approves the exact transfer, the agent pays and the merchant receives tokens. A repeated payment is rejected. Revoking the parent blocks the child's next request. Tampering with the signed amount or audience is rejected, and the persisted queue is encrypted.

The test uses local test accounts. It does not exercise a physical authenticator or send transactions to Monad testnet.

## Monad testnet rehearsal (14 October 2026)

The user created a Mera passkey account, funded it with test MON, minted and deposited aUSD-TEST, and granted permission 1 to registered agent 2088. The encrypted agent keystore was verified locally and remains outside Git. `npm run doctor` passed with live RPC checks. The selected merchant is `0x792e485C5A756Dc2e22AF9Cda70c10fC3754b8b6`.

- Automatic USD 100.00 test-token payment: transaction `0xdacd1dc921619dd345ae0cb1c3521d40b4b2e35379c41c6153214b09af330d3e`, successful receipt in block 70809186.
- Extra USD 650.00 payment: the user approved the exact request with a passkey, and the one-use approval was checked on-chain before transaction `0xc8bd6d6e5e4bfde744b49ff8e16bcb55e9c5285a1bc4e53232fe983cbc04367f` succeeded in block 70810227.
- Independent post-payment reads: 100 aUSD-TEST automatic spent, 650 aUSD-TEST approved spent, 250 aUSD-TEST left in the user's Aegis vault, and 750 aUSD-TEST at the merchant. The second request ID is consumed; a replay simulation reverts with `RequestAlreadyUsed`. A payment to the unapproved user address returns status 9 (`WrongRecipient`).
- A separate read-only permission 2 allowed dietary access before the owner revoked it with a passkey. The same on-chain check then returned status 2 (`Revoked`); payment permission 1 remained active.

The first extra-payment attempt exposed a gateway polling failure after the approval was mined. The connected agent now resumes from the contract's exact one-use approval and rechecks released private constraints before paying. Its build and three focused tests pass. The planner for this rehearsal was explicitly `local`, so this verifies the agent gateway and Monad payment flow, not Kimi-generated planning. No airline reservation was made.

Live two-agent delegation still needs a testnet demonstration. Live Kimi, a Privy wallet integration, final hosting and submission recordings are not claimed complete. Hosting for this iteration is local only. The Envio indexer source is present, but no running GraphQL endpoint is configured on this laptop; user-held vault keys remain an optional extension.

## Operational limits

- One persistent Node process; no shared-storage or replica claims.
- Vault key remains server-held. Use sample data.
- EOA agent signatures are supported; contract-owned identities need an ERC-1271 adapter before use.
- Event browsing is paginated by block range; it is never the authorization source.
- A retried payment must reuse the printed request ID (`AEGIS_PAYMENT_REQUEST_ID`). A new ID is a new payment request. Confirm receipts after ambiguous network errors.
- No airline reservation is made; the demo transfers freely mintable aUSD-TEST.
