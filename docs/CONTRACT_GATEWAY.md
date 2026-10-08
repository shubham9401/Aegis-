# Contract-backed context gateway

The web app has two permission modes:

- `demo`: local durable permissions for UI development and offline demos.
- `contract`: fail-closed Monad enforcement for protected context release.

Contract mode does not treat the local permission store, an indexer, or model
output as authority. For every context request, the gateway reads the current
grant from Monad and verifies all of the following before decrypting a field:

1. The permission ID exists and is positive.
2. The grant belongs to the requesting user.
3. The grant's numeric ERC-8004 ID matches the token-bound agent identity.
4. The snapshotted agent owner matches the configured agent actor.
5. The grant's opaque resource scope matches the vault's encryption binding.
6. `checkPermission` returns `Allowed` for the requested data action now.

Revocation, expiry, ancestor revocation, ERC-8004 ownership changes, action
limits, and scope mismatches therefore stop the next release. An earlier allow
result is never cached as permanent access.

## Required configuration

Deploy the current contract build first. The older deployment recorded in
`contracts/deployments/monad-testnet.json` predates the travel-budget and
passport-validity action bits and must not be used for the completed demo.

Set these server variables in `apps/web/.env.local`:

```dotenv
NEXT_PUBLIC_ADAPTER=contract
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
AEGIS_CONTRACT_ADDRESS=0xCurrentAegisDeployment
AEGIS_AGENT_ID=123
AEGIS_AGENT_ADDRESS=0xCurrentErc8004Owner
AEGIS_AGENT_KEYSTORE_PATH=C:\path\outside\the\repo\agent.json
AEGIS_RESOURCE_SCOPE=0xRandom64HexCharacters
```

`AEGIS_RESOURCE_SCOPE` is an opaque random identifier. Never put personal data
in it. Use the same value when creating the on-chain grant. In contract mode,
new vault entries are encrypted with this value in their authenticated-data
binding, so old demo-mode entries need to be saved again after switching modes.

The connected agent sends the numeric permission ID with each context request.
The SDK includes it automatically when `permissionId` is supplied to
`requestContext`.

In contract mode the connected demo loads the encrypted agent keystore from
outside the repository and asks for its password privately. Every context call
uses a fresh EIP-712 proof bound to permission ID, opaque scope, action, random
request ID, short deadline, gateway audience, chain ID, and Aegis contract.
The context gateway verifies the ERC-8004 owner's signature and persists
consumed request IDs before checking Monad, preventing replay. The existing
off-chain action-approval queue still uses its bearer transport credential;
the payment phase must replace that with `approvePayment` and `pay` calls.

The hackathon signer currently supports ERC-8004 identities owned by an EOA
stored as an encrypted JSON keystore. A smart-contract-owned identity needs an
ERC-1271 verification adapter before contract mode can accept its proofs.
