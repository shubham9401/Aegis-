# Deploy to Monad testnet

Aegis and its demo payment token were deployed successfully to Monad testnet. You can still run the contract tests and local demo without a wallet. The public deployment manifest and ABI are available for teammates.

## Current deployment

- Aegis: `0x37Ba78B771FC28Dc03387c8777997F751120664D`
- Demo token: `0xdDa9B63b3e2996A62933cea050A46ACb08E987db` (`aUSD-TEST`, 6 decimals, no real value)
- ERC-8004 Identity Registry: `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- Token deployment transaction: `0x7c0caea655471bf125d236444fd781d6c8c35ef3082fa6857aeba185143522f9`
- Aegis deployment transaction: `0x7406590c984b3711380e1f5a378ec05b7e16b296b66878468ddef991247e13fb`

## 1. Prepare a dedicated testnet deployment account

Use a wallet you control and follow the wallet's official setup. Keep its seed/private key private; do not paste it into chat, a shared repository or frontend code. Fund its public address with test MON using [Monad's faucet](https://faucet.monad.xyz). Eligibility and limits are determined by the faucet.

For this package's CLI deployment, use an encrypted Ethereum JSON keystore, stored outside the package. A browser-wallet-only user can instead use the supplied Solidity source and compiled artifacts with a compatible wallet deployment tool, or ask for a browser signing deployment flow. Do not paste a raw key into `.env` for this script.

Agent A and agent B will need distinct signing accounts for the final demo, each registered in the ERC-8004 registry. The user's passkey account is separate and controls the user's grants/vault. The deployment account has no special admin power after deploying Aegis.

## 2. Install and configure

```powershell
npm.cmd ci --ignore-scripts
Copy-Item .env.example .env
```

Set the local `.env` values:

```text
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
IDENTITY_REGISTRY_ADDRESS=0x8004A818BFB912233c491871b3d84c89A494BD9e
DEPLOYER_KEYSTORE_PATH=C:/path/outside-this-package/testnet-deployer.keystore.json
DEPLOYER_ADDRESS=YOUR_PUBLIC_WALLET_ADDRESS
PAYMENT_TOKEN_ADDRESS=
```

Leave PAYMENT_TOKEN_ADDRESS blank to deploy MockUSD, a 6-decimal freely mintable test asset with no real value. If providing a token, use a trusted, standard ERC-20 without transfer fees or rebasing. The vault will use only this token permanently.

## 3. Check readiness without sending a transaction

```powershell
npm.cmd run preflight
```

The script verifies chain 10143, nonempty registry bytecode and ERC-721 support. If a public deployer address is supplied it reports its test MON balance. This is a read-only check; it needs no keystore password and broadcasts nothing. It records `deployments/monad-testnet.preflight.json`.

## 4. Deploy

```powershell
npm.cmd run deploy:testnet
```

Run in an interactive terminal. The keystore password prompt does not echo input. The script refuses other chain IDs, checks funds, deploys the optional demo token, then deploys Aegis. All broadcasts consume test MON. It records public addresses, transaction hashes, token decimals/symbol and compiler information in `deployments/monad-testnet.json`.

If deployment is interrupted, inspect the recorded transaction hashes before retrying. A pending recorded transaction stops automatic retries to prevent duplicate deployments. A successfully recorded token can be reused for the pending Aegis deployment.

The signed live deployment path completed successfully. Both receipts have status `1`, both addresses contain runtime bytecode, and the deployed Aegis immutables match the registry and token addresses above.

## 5. Share these files with the team

- `deployments/monad-testnet.json` (actual deployment addresses)
- `artifacts/AegisPermissions.abi.json`
- `integration/abi.ts` and `integration/constants.ts`
- `docs/INTEGRATION.md`

Never share `.env`, keystores or signing secrets. The ZIP delivered with this package excludes these and node_modules.

## 6. Fund the demo vault and register agents

- For MockUSD only, mint test units to the user's wallet. Anyone can mint this test asset; it is not USDC.
- User calls token `approve(aegisAddress, amount)`, then Aegis `deposit(amount)` from the SAME user account.
- A and B each call the real identity registry's `register(string agentURI)`. Their owner addresses must match the runtime signing accounts used for Aegis calls.
- User grants permission to A's returned agent ID. A creates B's child grant.
- For a 6-decimal demo token, 500 units = 500000000 base units. Use integer arithmetic (`parseUnits`), never floating-point amounts in contract calls.

## Verification metadata

Compiler: Solidity 0.8.28. Optimizer enabled, 200 runs, viaIR=true, EVM target shanghai. Bytecode, ABI and Solidity metadata are in `artifacts/AegisPermissions.json`. Compiled input with resolved source files is in `artifacts/standard-input.json` after compilation. Constructor arguments are the registry and payment token addresses in that order. Explorer source verification has not yet been performed. Deployment receipts and runtime configuration were verified directly through the Monad testnet RPC.

Sources: [network information](https://docs.monad.xyz/developer-essentials/testnet), [official registry deployment list](https://github.com/erc-8004/erc-8004-contracts#monad-testnet).
