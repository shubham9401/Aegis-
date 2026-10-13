# Aegis Envio indexer

This HyperIndex project turns Aegis' public Monad events into queryable `Permission` and `AegisActivity` entities. It never indexes encrypted profile values or decryption material.

Requirements: Node.js 22+, pnpm, Docker Desktop/WSL on Windows, and an Envio API token kept in an uncommitted `.env` file as `ENVIO_API_TOKEN`.

```bash
pnpm install
pnpm codegen
pnpm typecheck
pnpm dev
```

The GraphQL/Hasura interface is available at `http://localhost:8080` during local development. `start_block` is intentionally conservative; replace `0` with the deployment block after confirming it from a reliable explorer or RPC to speed up the first sync.

The index is for dashboard history only. Authorization and decryption must continue to use live contract state because an indexer may lag.
