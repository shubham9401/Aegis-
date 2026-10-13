import "server-only";

import {
  ContractPermissionGate,
  type Address,
  type Bytes32,
  type ContractPermissionReader,
  type ContractPermissionSnapshot,
  type DataScope,
} from "@aegis/sdk";
import { createPublicClient, defineChain, getAddress, http } from "viem";

const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
});

const aegisReadAbi = [
  {
    type: "function",
    name: "getPermission",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{
      name: "",
      type: "tuple",
      components: [
        { name: "user", type: "address" },
        { name: "issuer", type: "address" },
        { name: "agent", type: "address" },
        { name: "paymentRecipient", type: "address" },
        { name: "agentId", type: "uint256" },
        { name: "parentId", type: "uint256" },
        { name: "rootId", type: "uint256" },
        { name: "scope", type: "bytes32" },
        { name: "actions", type: "uint256" },
        { name: "spendingLimit", type: "uint256" },
        { name: "spent", type: "uint256" },
        { name: "approvedSpent", type: "uint256" },
        { name: "expiresAt", type: "uint64" },
        { name: "depth", type: "uint8" },
        { name: "canDelegate", type: "bool" },
        { name: "revoked", type: "bool" },
      ],
    }],
  },
  {
    type: "function",
    name: "checkPermission",
    stateMutability: "view",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "actor", type: "address" },
      { name: "action", type: "uint256" },
      { name: "scope", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

export interface ContractContextCheck {
  permissionId: string;
  user: Address;
  agentId: string;
  dataScope: DataScope;
  authenticatedActor?: Address;
}

export async function checkContractContext(input: ContractContextCheck) {
  const permissionId = parsePositiveInteger(input.permissionId, "permissionId");
  const agentId = parseNonNegativeInteger(input.agentId, "agentId");
  const actor = input.authenticatedActor ?? requiredAddress("AEGIS_AGENT_ADDRESS");
  const contractAddress = requiredAddress("AEGIS_CONTRACT_ADDRESS");
  const expectedResourceScope = requiredBytes32("AEGIS_RESOURCE_SCOPE");
  const rpcUrl = process.env.MONAD_RPC_URL?.trim()
    || process.env.NEXT_PUBLIC_RPC_URL?.trim()
    || monadTestnet.rpcUrls.default.http[0];

  const client = createPublicClient({
    chain: monadTestnet,
    transport: http(rpcUrl, { batch: false, retryCount: 1, timeout: 15_000 }),
  });
  const chainId = await client.getChainId();
  if (chainId !== monadTestnet.id) {
    throw new Error(`Contract mode requires Monad testnet ${monadTestnet.id}; RPC returned ${chainId}`);
  }
  const bytecode = await client.getBytecode({ address: contractAddress });
  if (!bytecode || bytecode === "0x") {
    throw new Error("AEGIS_CONTRACT_ADDRESS has no bytecode on Monad testnet");
  }

  const reader: ContractPermissionReader = {
    async getPermission(id): Promise<ContractPermissionSnapshot> {
      const permission = await client.readContract({
        address: contractAddress,
        abi: aegisReadAbi,
        functionName: "getPermission",
        args: [id],
      });
      return {
        user: permission.user,
        agent: permission.agent,
        agentId: permission.agentId,
        scope: permission.scope,
      };
    },
    async checkPermission(id, checkedActor, action, scope) {
      return BigInt(await client.readContract({
        address: contractAddress,
        abi: aegisReadAbi,
        functionName: "checkPermission",
        args: [id, checkedActor, action, scope],
      }));
    },
  };

  return new ContractPermissionGate(reader).checkDataAccess({
    permissionId,
    user: input.user,
    agentId,
    actor,
    dataScope: input.dataScope,
    expectedResourceScope,
  });
}

function parsePositiveInteger(value: string, name: string): bigint {
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`${name} must be a positive integer`);
  return BigInt(value);
}

function parseNonNegativeInteger(value: string, name: string): bigint {
  if (!/^(0|[1-9]\d*)$/.test(value)) throw new Error(`${name} must be a non-negative integer`);
  return BigInt(value);
}

function requiredAddress(name: string): Address {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required in contract mode`);
  return getAddress(value) as Address;
}

function requiredBytes32(name: string): Bytes32 {
  const value = process.env[name]?.trim();
  if (!value || !/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error(`${name} must be a bytes32 hex value`);
  }
  return value as Bytes32;
}
