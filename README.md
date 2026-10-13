# Aegis

Aegis limits what an agent can read and which test-token payments it can make. It combines Mera passkey owner transactions, live ERC-8004 identity checks, a Monad permission contract, and a trusted encrypted data gateway.

## Current implementation

- Monad testnet (10143): `0xeDB8F11c9b6F67ba1D51a4cEdc5151D41e4Bfdb3`.
- Demo token: `0xdDa9B63b3e2996A62933cea050A46ACb08E987db`, aUSD-TEST, six decimals, no real value.
- Recorded agent: 2088, owner `0x5d4a8bd54999A12183AAD386537d71F71668ea2B`.
- Contract-mode dashboard grants/revokes permissions, reads effective status, funds the vault, signs exact extra-payment approvals, and cancels them.
- Connected agent authenticates scoped reads and submits actual `pay` transactions. It makes no airline reservation.
- Delegated requests authenticate the grant's agent signer; parent revocation prevents later child access and payments.
- Activity includes contract events and sanitized gateway logs. The Envio indexer is configured, but requires a running endpoint to populate its feed.

The implementation is tested with local EVM contracts. Physical passkeys, funded testnet writes, and live Kimi require the operator acceptance steps in [the runbook](docs/LOCAL-RUNBOOK.md). Do not equate a successful build with a completed public demonstration.

## Run on this laptop

Use Node 24 or later. In PowerShell, use `npm.cmd` if script execution policy blocks `npm`.

```sh
npm ci
npm run setup:local
npm run build
npm run dev:web
```

`setup:local` adds missing entries to ignored `.env.local` files and generates separate random vault/auth secrets. It never overwrites an existing value. Set the server Kimi key privately, the approved merchant address, and the agent keystore path before the connected demonstration. Never put keys in chat, screenshots, commits, or public environment variables.

Open http://localhost:3000, create/sign in with a PRF-capable passkey, save sample facts, mint demo tokens, approve a deposit, deposit, and grant a permission. The passkey account needs test MON for transactions. Copy the mined numeric permission ID to root `.env.local` as `AEGIS_PERMISSION_ID`.

```sh
npm run demo:web -- "Plan a trip for USD 650 using service 0xYOUR_APPROVED_MERCHANT_ADDRESS"
```

The connected demo signs scoped context requests with the registered agent wallet, requests an amount above the permission's automatic cap, and waits for the user in the Approvals dashboard. In contract mode, the passkey account records consent with `approvePayment`, and the agent executes the exact payment through the Aegis vault. Plaintext context values are deliberately omitted from terminal logs.

The connected agent uses the web server's Kimi route. It fails clearly if Kimi is unavailable. The separate `npm run demo` command is a labelled local policy simulation and may use its local planner fallback.

## Verify

```sh
npm run typecheck
npm test
npm run lint --workspace @aegis/web
npm run build
npm audit --omit=dev
```

`npm test` includes contracts, SDK, and web tests. The new chain integration test deploys contracts to a private local chain and exercises delegated data release, signed exact-payment approval, token transfer, replay prevention, and parent revocation. No test spends testnet funds or uses real user keys.

## Security boundary

The contract is the authorization source in contract mode; the local queue only transports pending approval requests. Payment consent is exact and one-use: permission ID, request ID, token amount, recipient, and deadline must match. The current encrypted vault is intentionally labeled as a server-held-key demo; production key custody must remain user controlled.

## Layout

- `contracts/`: Solidity, deployment manifests, generated ABI and registration tools.
- `packages/sdk/`: context client, signed payment transport, precise amount conversion, and local policy adapter.
- `apps/web/`: Mera sessions, contract dashboard, encrypted queue/vault and verified event feed.
- `apps/agent-demo/`: encrypted-keystore agent executor and delegation CLI.
- `docs/`: contract decisions, runbook and acceptance notes.

The vault uses AES-256-GCM with a server-held key. The initial backend requires one persistent Node process. It must not be hosted on ephemeral storage or multiple replicas without transactional storage. Agents receive only approved plaintext fields, never the vault key. Revocation does not erase previously delivered information or reverse completed payments. On-chain addresses, limits, action bits and events are public metadata.

Automatic allowance and separately approved extra spending are different ledgers. The UI displays them separately. Each `pay` transaction checks the live ancestor chain and consumes a root-scoped request ID atomically. The local policy adapter is a simulation; its in-process replay guard is not a durable financial executor.
