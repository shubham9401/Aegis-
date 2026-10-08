# ERC-8004 agent registration

Aegis uses a separate ERC-8004 identity for every demo agent. The registration
helper is deliberately separate from contract deployment so an agent owner can
use their own encrypted wallet without sharing a private key with the team.

## Configure an agent

Copy these settings from `.env.example` into `contracts/.env`:

```dotenv
AGENT_LABEL=travel-agent
AGENT_ADDRESS=0xYourPublicAgentWallet
AGENT_KEYSTORE_PATH=C:\path\outside\the\repo\travel-agent.json
AGENT_URI=https://example.com/.well-known/travel-agent.json
```

- Use only a public wallet address in `AGENT_ADDRESS`.
- Keep the encrypted JSON keystore outside the repository.
- Never paste a private key or keystore password into `.env`, Git, or chat.
- Use a distinct wallet and label for each agent in the A2A demo.
- The metadata URI must use HTTPS, IPFS, or an inline base64 JSON data URI.

## Verify before registering

From the `contracts` directory:

```bash
npm run agent:preflight
```

This checks the Monad testnet chain ID, confirms code exists at the configured
ERC-8004 registry, checks its ERC-721 interface, and prints the configured
agent wallet's public balance. It does not send a transaction.

## Register

Fund the public agent wallet with enough Monad testnet MON for gas, then run:

```bash
npm run agent:register
```

The command privately prompts for the encrypted keystore password. It records
the transaction hash before waiting for confirmation, so rerunning after a
terminal interruption recovers the receipt instead of registering a duplicate.
A successful registration creates
`deployments/agents/<agent-label>.json` containing only public registration
details, including the numeric ERC-8004 agent ID.

Repeat the process with a second wallet for the delegated agent. Revoking the
parent's Aegis permission will later invalidate the child's delegated access;
it does not delete either agent's ERC-8004 identity.
