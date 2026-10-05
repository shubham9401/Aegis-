# Integration contract v0.1

## Configuration

Network: Monad testnet, chain ID 10143. RPC: `https://testnet-rpc.monad.xyz` (disable JSON-RPC batching).

ERC-8004 registry: `0x8004A818BFB912233c491871b3d84c89A494BD9e`. This deployment was listed by the ERC-8004 project and checked for bytecode/ERC-721 support through the testnet RPC. It is not an Aegis contract address.

Aegis and payment-token addresses come from `deployments/monad-testnet.json` after deployment. That file does not exist before deployment. Use the ABI in `artifacts/AegisPermissions.abi.json` or `integration/abi.ts`.

## Data model

`GrantParams`: agentId, scope (random bytes32), actions (bitmask), spendingLimit (raw token units), expiresAt (Unix seconds), canDelegate, paymentRecipient (one fixed allowed recipient).

`Permission`: also includes user, issuer, agent owner snapshot, parentId, rootId, spent, approvedSpent, depth and revoked. Permission IDs start at 1; **agent IDs may start at 0**. Read the PermissionGranted receipt event to get a new permission ID; do not race another user by predicting `nextPermissionId` in a frontend.

Actions:

| Name | Value |
| --- | ---: |
| READ_DIETARY | 1 |
| READ_DESTINATION | 2 |
| READ_ITINERARY | 4 |
| PAY | 8 |

Combine actions using bitwise OR for grants. Requests must use exactly one action bit. Unknown bits are rejected. A data-only grant has spendingLimit=0 and paymentRecipient=zero address. A PAY grant must have an allowed recipient, even when its automatic limit is zero (manual-only payments).

Public actions, limits, wallet relationships and events reveal metadata. The profile values and encryption keys must never be put in scope IDs, transaction calldata, event fields or public agent URIs. Random scope IDs are identifiers, not proof of secrecy or authorization.

## Methods and who calls them

| Method | Caller / use |
| --- | --- |
| grantPermission(params) | User account creates a root grant for its own resources/funds |
| delegatePermission(parentId, agentId, actions, spendingLimit, expiresAt, canDelegate) | Parent's registered agent-owner account; parent must explicitly permit delegation |
| revokePermission(id) | Original user or direct issuer; cannot be undone |
| getPermission(id) | Raw stored fields; not effective authorization |
| permissionStatus(id) | Checks current status of the grant and every ancestor |
| checkPermission(id, actor, action, scope) | Public view; gateway must independently authenticate actor |
| usePermission(id, action, scope, requestId) | Registered agent-owner account; writes a data authorization-use receipt |
| deposit(amount) | User; first approve the payment token to the Aegis vault |
| withdraw(amount, recipient) | User can withdraw only its own available balance |
| checkPayment(id, actor, recipient, amount) | Preflight for automatic spending only; not a reservation |
| pay(id, recipient, amount, requestId) | Registered agent-owner account; rechecks state and transfers atomically |
| approvePayment(id, requestId, recipient, amount, deadline) | User authorizes one exact extra payment |
| cancelPaymentApproval(id, requestId) | User cancels a pending extra approval |

## Shared spending rules

An automatic payment increments `spent` for the leaf and every ancestor. It must fit every remaining allowance and the user's vault balance. Children do not reserve funds when created; siblings compete for the same remaining ancestor allowance, and mined transactions serialize consumption.

Separate root grants have separate automatic caps but use the same user's vault balance. Funds are not escrowed separately per grant. Only standard non-rebasing, non-fee ERC-20 tokens are supported; the demo uses MockUSD.

Manual approval authorizes **extra spending**. For example: automatic cap 500, automatic spent 80, manual extra payment 650 -> remaining automatic cap 420 and total paid 730. `approvedSpent` records the extra amount on the leaf and every ancestor. The UI MUST make this extra spending explicit. It is not a silent reset/increase of the automatic budget.

Approval is bound to permission ID, random request ID, recipient, exact amount and deadline, within this contract/chain. The grant and all ancestors must still be valid at payment time. Requests are one-use across an entire root tree; use random 32-byte request IDs. An existing approval reserves its request ID for that exact payload, and an expired/mismatched approval cannot fall back to an automatic payment. Cancel it or use a new request ID for a new automatic request.

`checkPayment` can report BudgetExceeded even when an exact manual approval exists, because it intentionally answers the automatic-spending question. For a pending manual payment, inspect `paymentApprovals(requestKey(rootId, requestId))` and simulate the exact `pay` call from the agent account. Execution still rechecks all conditions.

## Status and errors

| Status | Value |
| --- | ---: |
| Allowed | 0 |
| NotFound | 1 |
| Revoked | 2 |
| Expired | 3 |
| IdentityChanged | 4 |
| WrongAgent | 5 |
| InvalidAction | 6 |
| ActionNotAllowed | 7 |
| WrongScope | 8 |
| WrongRecipient | 9 |
| BudgetExceeded | 10 |
| InsufficientBalance | 11 |
| InvalidAmount | 12 |

Contract errors include `PermissionDenied(Status)`, `Unauthorized`, `DelegationNotAllowed`, `ScopeExpansion`, `DepthExceeded`, `InvalidGrant`, `InvalidRequestId`, `RequestAlreadyUsed`, `UnregisteredAgent` and `UnsupportedToken`. Decode them using the ABI. Failed transactions revert; they do not produce durable PermissionUsed/denial events. The gateway/UI may record sanitized denial logs off-chain.

## ERC-8004 registration and signer model

Use the actual identity registry's `register(string agentURI)` from A's account and separately from B's account. Parse the `Registered(uint256 indexed agentId, string agentURI, address indexed owner)` event. Agent URIs should contain public registration metadata, never user data. Check the current registry ABI before constructing registration calls.

Aegis binds a grant to both agentId and its current owner address, and verifies `ownerOf` on every protected operation. `agentWallet` is a payment-destination field and is not treated as automatic signing authority. ERC-721 approved operators are not supported as signers in v0.1. For a smart-contract-owned identity, that account must execute the Aegis transaction; an off-chain gateway must support ERC-1271 when authenticating its HTTP requests.

If a registered identity transfers away from the snapshotted owner, the grant and descendants fail. The registry interface has no monotonic ownership epoch: transfer away and back to the same owner can satisfy the check again. Revoke old grants when ownership changes if permanent invalidation is required. Revocation itself is permanent.

## Required data gateway behavior (teammate 3)

The SDK is an API client, not the security boundary. Agents must have no direct access to plaintext storage, storage decryption keys or broad third-party credentials.

1. The agent signs an EIP-712 request binding permissionId, scope, a single action, requestId, deadline and gateway audience. Use the suggested types in `integration/constants.ts`; domain binds chain and Aegis address.
2. Verify the signature (EOA recovery or ERC-1271), intended audience, short deadline and a fresh request ID. Atomically reject replay; do not trust an `actor` string supplied in the HTTP body.
3. Fetch the grant and verify the requested record belongs to BOTH `grant.user` and `grant.scope`. Never let a malicious user grant access to another user's guessed scope ID.
4. Check the current `checkPermission` result for the authenticated signer and exact field action. Fail closed on registry/RPC errors, wrong network, stale state or any nonzero status. Do not authorize from an Envio cache.
5. Optionally require a mined `usePermission` transaction for the audit trail. Match its contract, chain, actor, permissionId, action, scope via stored grant, and requestId to this signed request. Recheck live permission before releasing data; an old receipt is not permanent access.
6. Retrieve and decrypt only the matching field in the trusted gateway. Return only that field through the authenticated session. Do not return the per-user key, full profile or sensitive logs.
7. Keep access/audit logs off-chain sanitized. Expire private cache entries and prevent a later unauthorized read from retrieving previously cached plaintext.

The cutoff is the confirmed chain state observed by the gateway at its release check. Do not promise zero-latency revocation across network delays, in-flight responses or already-delivered data. The contract cannot enforce erasure of plaintext or recall completed payments.

## Events for the dashboard / Envio

- PermissionGranted: index user, permissionId and parentId; retain tree relationships.
- PermissionRevoked: recompute/mark descendants as effectively invalid. A single parent event covers all children; there is no event per descendant.
- PermissionUsed: action, actor, root, request ID, amount, recipient and manual-approval flag. A data event proves only a successful on-chain authorization use.
- PaymentApproved / PaymentApprovalCancelled: pending explicit consent.
- Deposited / Withdrawn: user ledger display.

Use `spent` + `approvedSpent` for total recorded token spending; show each component separately. The indexer is a display aid, not a source of authorization truth.
