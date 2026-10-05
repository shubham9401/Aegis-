# Aegis web app

The dashboard lets a user manage demo permissions, store encrypted sample context, review approval requests, and inspect activity. Its API routes use `@aegis/sdk` for permission decisions.

## Run locally

From the repository root, create `.env.local` with development-only values:

```bash
VAULT_SERVER_KEY=<32 random bytes encoded as base64>
AEGIS_DEMO_AGENT_TOKEN=<random development token>
KIMI_API_KEY=<optional Kimi key>
```

Never commit `.env.local`. Then run:

```bash
npm install
npm run dev:web
```

Open [http://localhost:3000](http://localhost:3000).

## Current security boundary

- Permissions and revocations use the in-memory demo adapter, not Monad yet.
- Vault values are AES-GCM encrypted, but the demo key is server held.
- Context decryption is called only through `AegisClient.readData()`.
- Approval creation rechecks that Aegis returned `approval_required` for the same permission.
- The approval UI uses a labeled mock signature; it is not a real Mera passkey ceremony yet.

## Checks

```bash
npm run typecheck
npm run lint --workspace @aegis/web
npm run build --workspace @aegis/web
```
