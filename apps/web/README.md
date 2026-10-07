# Aegis web app

The app provides Mera passkey account access, an encrypted context vault, SDK-backed local policies, signed action approvals, and an off-chain activity feed. Read [the teammate 2 audit](docs/TEAMMATE_2_AUDIT.md) for acceptance status and remaining integration work.

## Run locally

Use Node.js 24 or newer (Mera 0.2 requires it). Create `apps/web/.env.local` using `apps/web/.env.example` first. Next loads environment files from the web workspace, not from the repository root. Keep real keys out of Git. Generate a vault key and a separate agent token locally:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

From the repository root:

```bash
npm install
npm run dev:web
```

Open [localhost:3000](http://localhost:3000). Create a passkey once, then sign in with that credential. Mera derives the account from WebAuthn PRF; localStorage contains only credential metadata. Localhost passkeys do not work on the final domain. The provider must support PRF; errors explain unsupported authenticators. Fund the displayed account through the [Monad faucet](https://faucet.monad.xyz) before any future on-chain writes.

The configured `AEGIS_AGENT_ID` must match grants and agent requests. Every agent endpoint, including approval polling, requires its bearer token. The existing teammate 3 SDK omits that header when polling and needs the change described in the audit.

## Implemented security boundary

- Owner routes require a signed, single-use login challenge and an HttpOnly, SameSite cookie; supplied address headers are never authentication.
- Grant/revoke changes persist atomically in a local policy store. These are **not on-chain transactions**. Contract mode fails closed pending the agreed contract/SDK mapping.
- AES-256-GCM encrypts each vault field before filesystem storage and binds ciphertext to its owner and scope. The server holds the key; this is a trusted vault, not trustless privacy. Use sample facts until the full deployment has been reviewed.
- Context release uses the SDK's `readData()` check before decrypting one field. Revocation stops future releases observed by the gateway; it cannot erase disclosed data.
- Approval submission verifies the EIP-712 signature against the stored request and owner, rechecks the permission and expiry, and rejects repeated decisions. Approving uses a fresh passkey ceremony.
- Kimi planning runs server-side. Missing credentials/provider failures return explicit errors rather than a fabricated booking. The model proposes; it does not authorize or execute actions.
- Shared agent-token authentication is bound to one configured agent label. It does not prove ERC-8004 ownership.
- Activity currently contains bounded, sanitized app events. Contract events and payment execution are pending.

## Storage and deployment

Run one long-lived Node process with a persistent disk. `AEGIS_DATA_DIR` holds ciphertext and policy metadata; its default is `.aegis-data` inside the web working directory and is ignored by Git. If you override it, keep it outside tracked source. Protect and back up the directory and its vault key separately. Permissions, vault values, encrypted approval queues, and sanitized activity survive restarts. Sessions and rate limits are process-local; restarting invalidates sessions.

This storage backend is unsuitable for ephemeral/serverless deployments or multiple replicas. Select a shared transactional database before that deployment. Set `AEGIS_APP_ORIGIN` to the exact HTTPS origin behind a reverse proxy.

## Checks

```bash
npm run typecheck
npm run lint --workspace @aegis/web
npm run build --workspace @aegis/web
npm run test --workspace @aegis/web
```

Automated checks cannot validate a physical authenticator's PRF support. Rehearse onboarding, re-login, fresh approval, rejection, expiry, and sign-out on the actual demo device and final domain.
