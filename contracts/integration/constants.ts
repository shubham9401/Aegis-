/** All amounts are integer payment-token units. aUSD-TEST uses 6 decimals; no real value. */
export const ACTION = { READ_DIETARY: 1n, READ_DESTINATION: 2n, READ_ITINERARY: 4n, PAY: 8n } as const;
export const STATUS = {
  Allowed: 0n, NotFound: 1n, Revoked: 2n, Expired: 3n, IdentityChanged: 4n,
  WrongAgent: 5n, InvalidAction: 6n, ActionNotAllowed: 7n, WrongScope: 8n,
  WrongRecipient: 9n, BudgetExceeded: 10n, InsufficientBalance: 11n, InvalidAmount: 12n,
} as const;
export const MONAD_TESTNET = {
  chainId: 10143, rpcUrl: 'https://testnet-rpc.monad.xyz',
  identityRegistry: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
  aegisPermissions: '0x37Ba78B771FC28Dc03387c8777997F751120664D',
  paymentToken: '0xdDa9B63b3e2996A62933cea050A46ACb08E987db',
  paymentTokenSymbol: 'aUSD-TEST',
  paymentTokenDecimals: 6,
} as const;

export interface GrantParams {
  agentId: bigint;
  scope: `0x${string}`;
  actions: bigint;
  spendingLimit: bigint;
  expiresAt: bigint;
  canDelegate: boolean;
  paymentRecipient: `0x${string}`;
}

/** Reference shape for teammate 3's gateway. Sign these exact fields using EIP-712. */
export const DATA_REQUEST_TYPES = {
  DataRequest: [
    { name: 'permissionId', type: 'uint256' },
    { name: 'scope', type: 'bytes32' },
    { name: 'action', type: 'uint256' },
    { name: 'requestId', type: 'bytes32' },
    { name: 'deadline', type: 'uint64' },
    { name: 'audience', type: 'string' },
  ],
};
// EIP-712 domain: name='AegisDataGateway', version='1', chainId=10143,
// verifyingContract=<deployed Aegis address>. audience identifies the intended gateway.
// Gateway must verify signer (EOA or ERC-1271), deadline, audience, nonce/replay, scope
// ownership, and current checkPermission status immediately before releasing each field.
