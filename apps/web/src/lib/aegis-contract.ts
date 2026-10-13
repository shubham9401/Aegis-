import type { Address, AgentPermission, DataScope } from "@aegis/sdk";
import { createPublicClient, defineChain, getAddress, http, zeroAddress, type Hex } from "viem";

export const MONAD_TESTNET_CHAIN_ID = 10143;
export const MOCK_USD_DECIMALS = 6;
export const SDK_MINOR_DECIMALS = 2;
export const TOKEN_TO_MINOR_DIVISOR = 10n ** BigInt(MOCK_USD_DECIMALS - SDK_MINOR_DECIMALS);

export const monadTestnet = defineChain({
  id: MONAD_TESTNET_CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
});

export const DATA_SCOPE_ACTIONS: Readonly<Record<DataScope, bigint>> = {
  "profile:dietary-preference": 1n,
  "profile:travel-budget": 16n,
  "profile:passport-validity": 32n,
};

export const CONTRACT_ACTIONS = {
  READ_DESTINATION: 2n,
  READ_ITINERARY: 4n,
  PAY: 8n,
} as const;

export const aegisContractAbi = [
  {
    type: "function", name: "nextPermissionId", stateMutability: "view", inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function", name: "getPermission", stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "tuple", components: [
      { name: "user", type: "address" }, { name: "issuer", type: "address" },
      { name: "agent", type: "address" }, { name: "paymentRecipient", type: "address" },
      { name: "agentId", type: "uint256" }, { name: "parentId", type: "uint256" },
      { name: "rootId", type: "uint256" }, { name: "scope", type: "bytes32" },
      { name: "actions", type: "uint256" }, { name: "spendingLimit", type: "uint256" },
      { name: "spent", type: "uint256" }, { name: "approvedSpent", type: "uint256" },
      { name: "expiresAt", type: "uint64" }, { name: "depth", type: "uint8" },
      { name: "canDelegate", type: "bool" }, { name: "revoked", type: "bool" },
    ] }],
  },
  {
    type: "function", name: "permissionStatus", stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }], outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function", name: "grantPermission", stateMutability: "nonpayable",
    inputs: [{ name: "params", type: "tuple", components: [
      { name: "agentId", type: "uint256" }, { name: "scope", type: "bytes32" },
      { name: "actions", type: "uint256" }, { name: "spendingLimit", type: "uint256" },
      { name: "expiresAt", type: "uint64" }, { name: "canDelegate", type: "bool" },
      { name: "paymentRecipient", type: "address" },
    ] }], outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function", name: "revokePermission", stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }], outputs: [],
  },
  {
    type: "function", name: "paymentToken", stateMutability: "view", inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function", name: "balances", stateMutability: "view",
    inputs: [{ name: "user", type: "address" }], outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function", name: "deposit", stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }], outputs: [],
  },
  {
    type: "function", name: "approvePayment", stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" }, { name: "requestId", type: "bytes32" },
      { name: "recipient", type: "address" }, { name: "amount", type: "uint256" },
      { name: "deadline", type: "uint64" },
    ], outputs: [],
  },
  {
    type: "function", name: "checkPayment", stateMutability: "view",
    inputs: [
      { name: "id", type: "uint256" }, { name: "actor", type: "address" },
      { name: "recipient", type: "address" }, { name: "amount", type: "uint256" },
    ], outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function", name: "requestKey", stateMutability: "pure",
    inputs: [{ name: "rootId", type: "uint256" }, { name: "requestId", type: "bytes32" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function", name: "paymentApprovals", stateMutability: "view",
    inputs: [{ name: "key", type: "bytes32" }],
    outputs: [
      { name: "permissionId", type: "uint256" }, { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" }, { name: "deadline", type: "uint64" },
    ],
  },
  {
    type: "function", name: "usedRequests", stateMutability: "view",
    inputs: [{ name: "key", type: "bytes32" }], outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "event", name: "PermissionGranted", anonymous: false,
    inputs: [
      { indexed: true, name: "permissionId", type: "uint256" },
      { indexed: true, name: "user", type: "address" },
      { indexed: true, name: "parentId", type: "uint256" },
      { indexed: false, name: "agentId", type: "uint256" },
      { indexed: false, name: "agent", type: "address" },
      { indexed: false, name: "scope", type: "bytes32" },
      { indexed: false, name: "actions", type: "uint256" },
      { indexed: false, name: "spendingLimit", type: "uint256" },
      { indexed: false, name: "expiresAt", type: "uint64" },
      { indexed: false, name: "canDelegate", type: "bool" },
      { indexed: false, name: "paymentRecipient", type: "address" },
    ],
  },
  {
    type: "event", name: "PaymentApproved", anonymous: false,
    inputs: [
      { indexed: true, name: "permissionId", type: "uint256" },
      { indexed: true, name: "requestId", type: "bytes32" },
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "recipient", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "deadline", type: "uint64" },
    ],
  },
] as const;

export const mockUsdAbi = [
  {
    type: "function", name: "mint", stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [],
  },
  {
    type: "function", name: "approve", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function", name: "balanceOf", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export interface ContractConfig {
  address: Address;
  resourceScope: Hex;
  chainId: typeof MONAD_TESTNET_CHAIN_ID;
  tokenDecimals: typeof MOCK_USD_DECIMALS;
}

export function getServerContractConfig(): ContractConfig {
  const address = process.env.AEGIS_CONTRACT_ADDRESS?.trim();
  const resourceScope = process.env.AEGIS_RESOURCE_SCOPE?.trim();
  if (!address) throw new Error("AEGIS_CONTRACT_ADDRESS is required in contract mode");
  if (!resourceScope || !/^0x[a-fA-F0-9]{64}$/.test(resourceScope)) {
    throw new Error("AEGIS_RESOURCE_SCOPE must be a bytes32 value in contract mode");
  }
  return {
    address: getAddress(address) as Address,
    resourceScope: resourceScope as Hex,
    chainId: MONAD_TESTNET_CHAIN_ID,
    tokenDecimals: MOCK_USD_DECIMALS,
  };
}

export function getContractPublicClient() {
  const rpcUrl = process.env.MONAD_RPC_URL?.trim()
    || process.env.NEXT_PUBLIC_RPC_URL?.trim()
    || monadTestnet.rpcUrls.default.http[0];
  return createPublicClient({
    chain: monadTestnet,
    transport: http(rpcUrl, { batch: false, retryCount: 1, timeout: 15_000 }),
  });
}

export function actionsForGrant(dataScopes: readonly DataScope[], action: "travel:search" | "travel:book"): bigint {
  let actions = dataScopes.reduce((mask, scope) => mask | DATA_SCOPE_ACTIONS[scope], 0n);
  if (action === "travel:search") actions |= CONTRACT_ACTIONS.READ_DESTINATION | CONTRACT_ACTIONS.READ_ITINERARY;
  if (action === "travel:book") actions |= CONTRACT_ACTIONS.PAY;
  return actions;
}

export function minorToTokenUnits(amountMinor: bigint): bigint {
  return amountMinor * TOKEN_TO_MINOR_DIVISOR;
}

export function tokenToMinorUnits(tokenUnits: bigint): bigint {
  return tokenUnits / TOKEN_TO_MINOR_DIVISOR;
}

export function contractRecordToPermission(
  permissionId: bigint,
  record: unknown,
  status: number,
): AgentPermission & { contractStatus: number; agentAddress: Address; canDelegate: boolean; paymentRecipient: Address } {
  const permission = record as unknown as {
    user: Address; agent: Address; paymentRecipient: Address; agentId: bigint; actions: bigint;
    spendingLimit: bigint; expiresAt: bigint; canDelegate: boolean; revoked: boolean;
  };
  const dataScopes = (Object.entries(DATA_SCOPE_ACTIONS) as Array<[DataScope, bigint]>)
    .filter(([, bit]) => (permission.actions & bit) !== 0n)
    .map(([scope]) => scope);
  const actionRules: Array<AgentPermission["actionRules"][number]> = [];
  if ((permission.actions & CONTRACT_ACTIONS.PAY) !== 0n) {
    const limit = tokenToMinorUnits(permission.spendingLimit);
    actionRules.push({
      action: "travel:book",
      maxAmountMinor: limit,
      requireApprovalAboveMinor: limit,
      currency: "USD",
      allowedServices: permission.paymentRecipient === zeroAddress ? [] : [permission.paymentRecipient],
    });
  } else if ((permission.actions & (CONTRACT_ACTIONS.READ_DESTINATION | CONTRACT_ACTIONS.READ_ITINERARY)) !== 0n) {
    actionRules.push({ action: "travel:search" });
  }
  return {
    permissionId: permissionId.toString(),
    user: permission.user,
    agentId: permission.agentId.toString(),
    dataScopes,
    actionRules,
    expiresAt: Number(permission.expiresAt),
    revokedAt: permission.revoked || status === 2 ? 1 : undefined,
    contractStatus: status,
    agentAddress: permission.agent,
    canDelegate: permission.canDelegate,
    paymentRecipient: permission.paymentRecipient,
  };
}
