# Aegis — Teammate 1 contract package

Solidity permission grants, bounded agent delegation and a token payment vault for the Monad hackathon.

**Status:** contracts implemented and tested locally. **No Aegis deployment to Monad testnet yet.** A funded deployment wallet is required. `deployments/monad-testnet.preflight.json` records a real read-only network/registry check, not a deployment. The in-memory demo uses local test signers, not Mera or Privy.

## Start here

- [Team handoff and revised responsibilities](docs/TEAM-HANDOFF.md)
- [Contract integration and gateway enforcement](docs/INTEGRATION.md)
- [Wallet setup and Monad testnet deployment](docs/DEPLOYMENT.md)
- [Trust assumptions and limitations](docs/SECURITY.md)
- [Validation results](reports/VALIDATION.md)
- ABI: `artifacts/AegisPermissions.abi.json`
- TypeScript ABI: `integration/abi.ts`
- Contract: `contracts/AegisPermissions.sol`

## Run locally

Requires Node.js 22.17+ and npm. On Windows PowerShell, `npm.cmd` avoids shell execution-policy issues.

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run compile
npm.cmd test
npm.cmd run typecheck
npm.cmd run demo
```

`npm run demo` runs an in-memory EVM and writes `reports/local-demo.json`. It does not use or spend real funds. Ganache may report that its native uWS module is unavailable on Node 22; it falls back to JavaScript and the tests still run.

## What is implemented

- User-owned root permission grants with agent ID, resource scope, action mask, token budget, expiry, delegation flag and fixed payment recipient.
- Child grants can only narrow the parent's actions, expiry and allowance. Child scopes/recipients are inherited. Maximum four delegation edges.
- Every protected operation checks the entire ancestor chain for revocation, expiry and ERC-8004 identity ownership.
- Every automatic payment charges the child and all ancestors atomically. Siblings share the root cap.
- Exact, expiring, one-use owner approvals for **additional** payments outside the automatic allowance.
- Token deposits and user withdrawals; payments transfer from this vault. No arbitrary contract execution.
- Events for creation, authorization use, revocation, approval, payment use and vault balance changes.
- Immutable ERC-8004 registry and payment token. No administrator or upgrade mechanism.

## Deliberate MVP decisions

The payment asset is one standard ERC-20 chosen at deployment. The supplied `MockUSD` has 6 decimals and **no financial value**; it is not USDC. Native MON pays transaction gas, not the demo booking budget. Dollar-like values in the demo are test-token units.

For agent authentication, v0.1 accepts the **registered owner** of the ERC-8004 identity as its signer. NFT operators and the `agentWallet` payment destination are not automatically authorized. Registration alone does not establish trust in an agent's behavior.

Passkeys and wallet providers plug into the user's signer. This contract does not perform WebAuthn verification itself. `approvePayment` must be submitted by the user account after an exact approval screen; an agent cannot call it on the user's behalf under broad delegated access.

Off-chain encrypted data is outside the contract. A trusted gateway must authenticate a request, check its current permission and only then decrypt the allowed field. Calling a view function from a frontend is insufficient enforcement. See the integration guide.

## Sources checked during implementation

- [ERC-8004 specification](https://eips.ethereum.org/EIPS/eip-8004)
- [Registry deployment list](https://github.com/erc-8004/erc-8004-contracts#monad-testnet)
- [Monad testnet network information](https://docs.monad.xyz/developer-essentials/testnet)
- [Monad faucet](https://faucet.monad.xyz)

This is hackathon code with local adversarial tests, not a production security audit. Use test tokens only.
