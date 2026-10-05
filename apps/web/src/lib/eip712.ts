// EIP-712 types for Aegis approvals
// Domain and type definitions for signing action approvals with passkeys

export const AEGIS_EIP712_DOMAIN = {
  name: "Aegis",
  version: "1",
  chainId: 10143, // Monad testnet
} as const;

export const ACTION_APPROVAL_TYPES = {
  ActionApproval: [
    { name: "permissionId", type: "string" },
    { name: "requestId", type: "string" },
    { name: "action", type: "string" },
    { name: "amountMinor", type: "uint256" },
    { name: "currency", type: "string" },
    { name: "service", type: "string" },
    { name: "nonce", type: "bytes32" },
    { name: "deadline", type: "uint64" },
  ],
} as const;

export interface ActionApprovalMessage {
  permissionId: string;
  requestId: string;
  action: string;
  amountMinor: bigint;
  currency: string;
  service: string;
  nonce: `0x${string}`;
  deadline: bigint;
}
