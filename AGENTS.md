# Aegis project instructions

## Project goal
Aegis is a Monad-based trust and permission layer for AI agents. Users grant narrow, revocable permissions for data access and actions. Private user context stays encrypted off-chain; on-chain contracts store permission state and emit audit events.

## Team ownership
- Teammate 1 owns `contracts/` and the Monad/ERC-8004 integration.
- Teammate 2 owns the user app and Mera passkey experience.
- Teammate 3 owns `packages/sdk/`, `apps/agent-demo/`, and `indexer/envio/` if time allows.
- Coordinate shared interfaces before editing another teammate's area. Do not invent contract methods, ABI fields, addresses, or passkey APIs; ask for the agreed interface or leave a clearly marked TODO.

## Development rules
- Keep the hackathon MVP small: one demo agent, a small set of user-approved facts, one action limit, an approval flow, and revocation.
- Aegis checks requests at integration points. Do not claim it can make an agent forget information already disclosed.
- Never put secrets, API keys, private keys, or plaintext personal context in Git or on-chain. Use environment variables for local secrets and keep `.env*` files out of commits.
- Keep permission checks deterministic in the SDK/contract. The AI model may propose requests, but it must not decide whether they are authorized.
- Prefer small, reviewable changes. Explain changed files and commands to run after implementation.
