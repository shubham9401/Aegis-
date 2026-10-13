# Integration verification

## Evidence

- 15 Solidity contract tests passed.
- 13 SDK tests passed, including exact amount conversion, post-consent revocation and concurrent/repeated execution.
- 18 web tests passed after merging the latest `main` changes. The integration test deploys actual contracts to a private EVM chain and exercises the gateway with real EIP-712 signatures.
- Workspace TypeScript checks and web lint passed. The production frontend build currently stops in the Windows sandbox while SWC canonicalizes the workspace path (`Access is denied`); it needs a build outside that sandbox before claiming release readiness.
- Production dependency audit: zero reported advisories. Development dependencies still have advisories in Ganache/compiler/lint tooling; no forced major-version downgrade was applied.
- Browser: home and contract-mode permission sign-in screen rendered. Authenticated browser writes are not yet claimed tested.
- Monad read-only checks: current action bits, deployment/registry configuration and recorded agent ownership were verified. Agent account has test MON.

## What the integration test proves

A parent grant and narrowed child grant are deployed. A child signs a dietary request and receives the matching encrypted field. A passport request is denied. An agent signs a 650-token request against a 500-token automatic allowance. After the owner approves the exact transfer, the agent pays and the merchant receives tokens. A repeated payment is rejected. Revoking the parent blocks the child's next request. Tampering with the signed amount or audience is rejected, and the persisted queue is encrypted.

The test uses local test accounts. It does not exercise a physical authenticator or send transactions to Monad testnet.

## Remaining external acceptance

Run `npm run doctor` with Node 24 to inspect configuration without printing secrets. The current machine needs the agent's signing credential, merchant public address, server Kimi key and a mined owner-created permission ID. The registered agent's signer was not found in the searched Aegis folders; only the user's earlier deployer keystore was found. These are different accounts.

The operator must complete passkey authentication and the runbook's funded testnet rehearsal. Live Kimi, a Privy wallet integration, final hosting and submission recordings are not claimed complete. Hosting for this iteration is local only. The Envio indexer source is present, but no running GraphQL endpoint is configured on this laptop; user-held vault keys remain an optional extension.

## Operational limits

- One persistent Node process; no shared-storage or replica claims.
- Vault key remains server-held. Use sample data.
- EOA agent signatures are supported; contract-owned identities need an ERC-1271 adapter before use.
- Event browsing is paginated by block range; it is never the authorization source.
- A retried payment must reuse the printed request ID (`AEGIS_PAYMENT_REQUEST_ID`). A new ID is a new payment request. Confirm receipts after ambiguous network errors.
- No airline reservation is made; the demo transfers freely mintable aUSD-TEST.
