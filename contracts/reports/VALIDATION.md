# Validation record

Checked on 2026-10-02. This is local functional/adversarial testing, not a security audit.

## Contract suite

`npm test` passed **15/15 tests**, zero failures, on an in-memory Ganache EVM (chain 31337). The Solidity compiler runs before the suite. Tests cover:

1. Valid grants, agent ID zero, wrong signer/scope/action and unregistered agents.
2. Invalid scopes, action masks, expiry and payment recipients.
3. Delegation cannot expand actions, budget or expiry; unauthorized delegation fails.
4. Parent revocation blocks descendant reads, payments and delegation.
5. Direct issuer can revoke a child without revoking its parent.
6. Exact expiry boundary.
7. Current registry ownership mismatch blocks an ancestor and descendants.
8. Shared sibling/root budget with an actually submitted reverting transaction.
9. Child cap remains enforced while its parent still has allowance.
10. Wrong payment signer/recipient/amount, replay and data-call bypass.
11. Exact one-use extra payment consent, including rejection of a changed lower amount.
12. Approval cancellation, expiry, wrong child and parent revocation.
13. User withdrawal isolation and insufficient balance rollback.
14. Authorization-use event and replay checks, with no token movement for data use.
15. Maximum delegation depth and spending charged through every ancestor.

The test runtime used Node 22.17.1, Solidity 0.8.28, OpenZeppelin Contracts 5.4.0, ethers 6.15.0 and Ganache 7.9.2. The Ganache native uWS warning falls back to its JavaScript implementation.

## Other verification

- TypeScript integration examples: `npm run typecheck` passed with exit code 0.
- Contract-only acceptance flow: `npm run demo` passed with exit code 0; machine-readable result in `local-demo.json`.
- Monad testnet read-only preflight: chain 10143, published registry has code and advertises ERC-721. See `../deployments/monad-testnet.preflight.json` for block/time.

This record does not claim passkey UI, profile encryption, A2A messaging, real booking, source verification on an explorer or signed live deployment was tested.
