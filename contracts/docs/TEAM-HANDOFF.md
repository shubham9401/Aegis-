# Team handoff

The original division is workable with these changes:

1. Make narrowed A-to-B delegation and parent revocation core demo requirements.
2. Teammate 3 owns a trusted data gateway as well as the SDK. A caller-controlled SDK check cannot enforce privacy.
3. Teammate 1 owns payment execution and cumulative allowance accounting. A read-only permission check followed by an unrestricted wallet payment does not enforce spending.
4. Teammate 2's passkey approval must submit the exact user-authorized on-chain action. A login success flag is not an approval.

## Teammate 1 — complete locally in this package

- Contract grant/delegate/revoke/check/use/pay/approve methods and vault.
- Live ERC-8004 owner checks using the real configurable registry interface.
- ABI, TypeScript constants/examples, deployment script and integration guide.
- Tests for delegation expansion, shared budgets, identity changes, expiry, revocation, replay and owner approval.

Deployed: Aegis is live on Monad testnet at `0x37Ba78B771FC28Dc03387c8777997F751120664D`, using `aUSD-TEST` at `0xdDa9B63b3e2996A62933cea050A46ACb08E987db`. Use `deployments/monad-testnet.json` and the checked-in integration constants; do not use a local demo address.

## Teammate 2 — dashboard, user wallet and encrypted profile

- Use the chosen user wallet (Mera or another provider) to submit grant, revoke and exact approval transactions.
- Keep the wallet address consistent: the grant's `user`, vault depositor and approval sender must be the same account.
- Save the encrypted synthetic profile off-chain, keyed by BOTH user address and a random scope ID. Store keys separately from ciphertext and expose no direct agent database credentials.
- Show granted actions, derived effective status, automatic spending and extra owner-approved spending separately.
- Show exact token amount, recipient, agent, request ID, expiry and additional-spending warning before `approvePayment`.
- Show a grant as revoked only after its transaction is confirmed. A child can be effectively revoked even when its own stored `revoked` flag is false.
- Display raw token amounts using the configured token's decimals. The demo token has no real dollar value.

## Teammate 3 — SDK, trusted gateway and two-agent demo

- Wrap the ABI; `requestApproval` is an application workflow, not an existing contract method that can bypass consent.
- Register A and B in the ERC-8004 registry with separate signing accounts. This MVP uses `ownerOf(agentId)` as the authorized agent signer.
- Authenticate signed HTTP data requests; check user/scope ownership, nonce, audience, action and expiry; call the contract before decrypting each approved field.
- Use `pay` for automated demo payments. Do not send directly from an unrestricted wallet and claim the Aegis cap protected it.
- Demonstrate B can read dietary preference but cannot read itinerary; A cannot delegate rights it lacks; revoking A blocks B's next request.
- Demonstrate two agents consume the same parent budget and an extra payment requires explicit user approval.
- Optional Envio: index public permission/payment events. Keep plaintext profile values out of logs, events and indexing. Use the chain for authorization; the index is for display and may lag.

## Wallet / bounty decision

Mera is in the teammate plan; Privy was discussed earlier. This contract is wallet-provider independent. Pick a coherent integration before adding both. A Privy login alone does not satisfy the supplied Privy bounty requirement.

If Privy powers delegated agent transactions, constrain the server signer to the required contract methods. Never give it authority to call user-only grant/approval/withdraw methods using the user's identity. The present model expects A/B transactions from their separate registered owner wallets, while the user's wallet funds/authorizes the vault. Changing that model requires explicit contract/integration work.

## Shared acceptance demo

1. User grants A diet + destination + itinerary + PAY; automatic cap 500 test USD; one merchant; expiry.
2. A delegates diet + destination + PAY to B; cap 100; shorter expiry; no further delegation.
3. B's dietary request succeeds through the gateway; itinerary request is denied.
4. B's payment of 101 fails; payment of 80 succeeds. A has 420 automatic allowance remaining; B has 20.
5. User approves one extra payment of 650 for B. It succeeds once, with automatic allowances unchanged.
6. Replaying that payment fails.
7. User revokes A. B's next data request and next payment fail.

The contract-only portion already runs with `npm run demo`. Add passkey UI, encrypted data and real agent interactions to complete the integrated hackathon demo.
