# Security model and boundaries

## Enforced on-chain

- Only the user may create root grants for its own vault ledger or approve extra payments.
- Only a grant's snapshotted registry owner, while still the current owner, may use/delegate it.
- Every ancestor must remain live and owned by the same snapshotted owner.
- Children cannot expand actions, scope, recipient, expiry or immediate parent remaining allowance at creation. Maximum depth is four edges; no cycles can be created.
- An automatic payment checks and increments every ancestor's budget in the same transaction as the transfer.
- Request IDs are consumed once per root tree; owner approvals bind exact payment details and expire.
- No public arbitrary-call, delegatecall or ERC-20 allowance endpoint permits escaping payment enforcement.
- OpenZeppelin SafeERC20 and ReentrancyGuard protect token interactions. Failed transfers revert accounting.

## Trusted components

- Correct ERC-8004 registry implementation and its upgrade administrators. The constructor fixes the registry address, not its implementation code.
- The single standard payment token. Fee-on-transfer deposits are rejected; rebasing or malicious tokens are unsupported. Use the provided no-value test asset for this demo.
- User and agent signing accounts. Compromising an agent owner key permits that owner's remaining authorized actions.
- The off-chain gateway, its key-management system, its signature verification and its fresh RPC view. This prototype does not cryptographically force a malicious gateway operator to obey an on-chain rule.
- The frontend that shows exact approval terms. Passkey login alone does not constitute transaction-specific consent.

## Scope limits

- Personal data encryption/decryption, A2A transport, real travel booking and passkey UI are not implemented in this contract package.
- Registration identifies a registry owner; it does not prove model integrity or benign behavior. ERC-8004 is a draft; pin/review its interface before later changes.
- Revocation is prospective. Existing plaintext, shared keys, in-flight responses and completed token transfers cannot be recalled.
- A registry ownership transfer away and back can restore the snapshot match. Revoke the old grant for permanent invalidation.
- Data-read events attest an authorization operation, not the content or occurrence of an actual off-chain delivery. A malicious agent can emit an allowed use without making a corresponding gateway request.
- Grant scopes and action categories are public metadata; hashes of low-entropy personal values are not a privacy solution.
- Manual approvals are extra spending outside the automatic cap. Funds are checked at execution, not reserved on approval.
- Separate root grants have separate caps. Repeated grants can authorize more total spending; the UI must explain overlapping grants.
- Payments are direct ERC-20 transfers to one allowed recipient. There is no arbitrary contract-call adapter, multi-token conversion, fiat charge enforcement, refunds or booking/payment atomic settlement.
- The local mock registry is for tests only. The deployment script refuses to replace a missing real registry with a mock.

## Production work beyond this hackathon

Independent audit; property/fuzz testing; a robust gateway with authenticated replay protection; account recovery; reliable RPC freshness and revocation semantics; registry-upgrade monitoring; secret rotation; real provider adapters; and careful review of wallet delegations. Do not use this prototype for real funds or real passport/medical data.
